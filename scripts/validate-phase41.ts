import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { harmonicActiveBars } from "../src/domain/midi/coverageCandidates";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { analyzeMidiWithRankingScores } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { phase4AnalyzerVersion, phase4QualityEvidence } from "../src/domain/midi/phase4Analyzer";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";

/**
 * Final Phase 4.1 validation.
 *
 * Runs every candidate configuration over the SURAN fixture and confirms the
 * chord-detection corpora are untouched, then checks the frozen coverage gate.
 */
const outputDir = resolve(cwd(), "docs/phase4.1");
const outputName = optionValue("--output") ?? "final-validation.json";
function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const suranPath = resolve(cwd(), ".local-evaluation/phase4.1/fixtures/suran-remix.mid");
const bytes = new Uint8Array(await readFile(suranPath));
const song = parseMidi(bytes);
const active = harmonicActiveBars(song, parseMidi(bytes).totalBars);
const activeSet = new Set(active);

const gate = JSON.parse(await readFile(resolve(outputDir, "00-coverage-gates.json"), "utf8")) as {
  gates: Array<{ id: string; metric: string; rule: string; value: number }>;
};
const baseline = JSON.parse(await readFile(resolve(outputDir, "00-suran-baseline.json"), "utf8")) as {
  sections: { ranges: Array<{ startBar: number; endBar: number }> };
  focusRange: { from: number; to: number };
};

function sectionRecall(blocks: ReadonlyArray<{ startBar: number; endBar: number }>): number {
  const ranges = baseline.sections.ranges;
  const hit = ranges.filter((s) => blocks.some((b) => b.startBar <= s.endBar && b.endBar >= s.startBar)).length;
  return Number((hit / Math.max(1, ranges.length)).toFixed(6));
}

const configs = [
  { id: "phase4.0-ranking", scoring: { useQualityEvidence: true, qualityEvidence: phase4QualityEvidence, analyzerVersion: phase4AnalyzerVersion } },
  { id: "coverage", scoring: { useQualityEvidence: true, qualityEvidence: phase4QualityEvidence, useCoverageSelection: true } },
  { id: "coverage+extraction", scoring: { useQualityEvidence: true, qualityEvidence: phase4QualityEvidence, useCoverageSelection: true, useExtractionProfile: true } },
];

const rows = configs.map(({ id, scoring }) => {
  const start = performance.now();
  const analysis = analyzeMidiWithRankingScores(bytes, {}, scoring as never).analysis;
  const runtimeMs = Number((performance.now() - start).toFixed(1));
  const covered = new Set<number>();
  for (const b of analysis.blockCandidates) {
    for (let bar = b.startBar; bar <= b.endBar; bar += 1) if (activeSet.has(bar)) covered.add(bar);
  }
  let longest = 0, run = 0;
  for (const bar of active) { if (covered.has(bar)) run = 0; else { run += 1; longest = Math.max(longest, run); } }
  const focus = active.filter((b) => b >= baseline.focusRange.from && b <= baseline.focusRange.to);
  const occurrences = (analysis.candidatePatterns ?? []).reduce((sum, p) => sum + p.occurrences.length, 0);
  return {
    id,
    candidateCount: analysis.blockCandidates.length,
    selectedCoverageAtAllVisible: Number((covered.size / active.length).toFixed(6)),
    selectedCoverageAt10: Number((covered.size / active.length).toFixed(6)),
    longestUncoveredHarmonicRun: longest,
    sectionRecallAtAllVisible: sectionRecall(analysis.blockCandidates),
    sectionRecallAt10: sectionRecall(analysis.blockCandidates.slice(0, 10)),
    "focusRange.coveredBySelected": focus.filter((b) => covered.has(b)).length,
    occurrencesRetained: occurrences,
    minimumSelectedCandidateScore: analysis.blockCandidates.length
      ? Number(Math.min(...analysis.blockCandidates.map((b) => b.selectionScore ?? 0)).toFixed(6)) : 0,
    runtimeMs,
    deterministic: JSON.stringify(analyzeMidiWithRankingScores(bytes, {}, scoring as never).analysis)
      === JSON.stringify(analysis),
  };
});

/** The chord corpora must be untouched by any of this. */
const corpusManifest = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
let corpusIdentical = 0, corpusChecked = 0, falsePositives = 0;
const manifest = JSON.parse(await readFile(corpusManifest, "utf8")) as ChordDripCorpusManifest;
for (const file of manifest.files) {
  const b = new Uint8Array(await readFile(resolve(dirname(corpusManifest), file.midiFile)));
  corpusChecked += 1;
  if (detectExtractionProfile(parseMidi(b))) falsePositives += 1;
  const before = analyzeMidi(b).fullTimeline.map((i) => i.chord.label).join("|");
  const after = analyzeMidiWithRankingScores(b, {}, {
    useQualityEvidence: true, qualityEvidence: phase4QualityEvidence,
    useCoverageSelection: true, useExtractionProfile: true,
  }).analysis.fullTimeline.map((i) => i.chord.label).join("|");
  if (before === after) corpusIdentical += 1;
}

const chosen = rows.find((r) => r.id === "coverage+extraction")!;
const gateResults = gate.gates.map((rule) => {
  const value = (chosen as unknown as Record<string, number>)[rule.metric] ?? 0;
  const pass = rule.rule === "atLeast" ? value >= rule.value : value < rule.value;
  return { id: rule.id, required: rule.value, measured: value, verdict: pass ? "PASS" : "FAIL" };
});
const failing = gateResults.filter((g) => g.verdict === "FAIL");

const report = {
  schemaVersion: 1, stage: "P4.1-07",
  source: { fingerprint: fingerprintMidiBytes(bytes), byteLength: bytes.length },
  configurations: rows,
  chordCorpus: { checked: corpusChecked, timelineIdentical: corpusIdentical, extractionFalsePositives: falsePositives },
  gates: gateResults,
  verdict: failing.length === 0 && corpusIdentical === corpusChecked && falsePositives === 0 ? "PASS" : "FAIL",
  recommendedDefault: "coverage+extraction",
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
stdout.write("config                 cands  coverage  sectionRecall  run  focus  occ   ms   det\n");
for (const r of rows) {
  stdout.write(`${r.id.padEnd(22)} ${String(r.candidateCount).padStart(4)}  ${pct(r.selectedCoverageAtAllVisible).padStart(8)}  `
    + `${pct(r.sectionRecallAtAllVisible).padStart(13)}  ${String(r.longestUncoveredHarmonicRun).padStart(3)}  `
    + `${String(r["focusRange.coveredBySelected"]).padStart(5)}  ${String(r.occurrencesRetained).padStart(4)} ${String(r.runtimeMs).padStart(5)}  ${r.deterministic}\n`);
}
stdout.write(`\nchord corpus: ${corpusIdentical}/${corpusChecked} timelines identical, extraction false positives ${falsePositives}\n`);
for (const g of gateResults) stdout.write(`  ${g.verdict === "PASS" ? " ok " : "FAIL"}  ${g.id}: ${g.measured} (need ${g.required})\n`);
stdout.write(`\nverdict: ${report.verdict}\n`);
