import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { normaliseEvidence, scoreBlockQuality } from "../src/domain/midi/blockQuality";
import { recoverRawMatchScore } from "../src/domain/midi/candidateBlock";
import { harmonicActiveBars } from "../src/domain/midi/coverageCandidates";
import { selectOccurrencesByCoverage } from "../src/domain/midi/coverageSelector";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { analyzeMidiWithRankingScores } from "../src/domain/midi/legacy";
import { buildOccurrences, groupIntoPatterns, groupedReachableOccurrences, scoreOccurrences } from "../src/domain/midi/occurrence";
import { parseMidi } from "../src/domain/midi/parser";
import { segmentSections } from "../src/domain/midi/sections";
import { beatsPerBar } from "../src/domain/midi/timing";

/**
 * Compares the three selectors on the same input.
 *
 * Section awareness is only worth enabling if it beats plain coverage; a stage
 * that shows it does not is a result, not a failure.
 */
const midiPath = resolve(cwd(), optionValue("--midi") ?? "");
const outputDir = resolve(cwd(), "docs/phase4.1");
const outputName = optionValue("--output") ?? "selector-comparison.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
if (!midiPath || midiPath === cwd()) throw new Error("Usage: --midi <path>");

const bytes = new Uint8Array(await readFile(midiPath));
const internal = analyzeMidiWithRankingScores(bytes);
const analysis = internal.analysis;
const song = parseMidi(bytes);
const meter = beatsPerBar(analysis.timeSignature);
const totalBars = analysis.totalBars;

const active = harmonicActiveBars(song, totalBars);
const activeSet = new Set(active);
const rawMatchScores = internal.timelineRankingScores.map(recoverRawMatchScore);
const occurrences = scoreOccurrences(
  buildOccurrences(analysis.fullTimeline, totalBars, { beatsPerBar: meter, rawMatchScores }),
  { beatsPerBar: meter, rawMatchScores, normaliseEvidence: normaliseEvidence(rawMatchScores), scoreBlockQuality },
);
const patterns = groupIntoPatterns(occurrences);
const sections = segmentSections(song, analysis.fullTimeline);

const baseline = JSON.parse(await readFile(
  resolve(cwd(), "docs/phase4.1/00-suran-baseline.json"), "utf8")) as {
  sections: { ranges: Array<{ startBar: number; endBar: number }> };
  focusRange: { from: number; to: number };
};

function sectionRecall(blocks: ReadonlyArray<{ startBar: number; endBar: number }>): number {
  const ranges = baseline.sections.ranges;
  const hit = ranges.filter((section) => blocks.some(
    (block) => block.startBar <= section.endBar && block.endBar >= section.startBar,
  )).length;
  return Number((hit / Math.max(1, ranges.length)).toFixed(6));
}

function measure(label: string, useSections: boolean) {
  const start = performance.now();
  const result = selectOccurrencesByCoverage(occurrences, {
    harmonicActiveBars: active,
    ...(useSections ? { sections } : {}),
  });
  const runtimeMs = Number((performance.now() - start).toFixed(1));

  const reachable = groupedReachableOccurrences(patterns, result.selected.map((o) => o.id));
  const grouped = new Set<number>();
  for (const occurrence of reachable) {
    for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) {
      if (activeSet.has(bar)) grouped.add(bar);
    }
  }
  const uncovered = new Set(result.uncoveredBars);
  const focus = active.filter(
    (bar) => bar >= baseline.focusRange.from && bar <= baseline.focusRange.to,
  );
  const scores = result.selected.map((occurrence) => occurrence.score);

  return {
    selector: label,
    candidateCount: result.selected.length,
    selectedCoverageAtAllVisible: result.coverage,
    selectedCoverageAt10: result.coverageAtVisible,
    longestUncoveredHarmonicRun: result.longestUncoveredRun,
    sectionRecallAtAllVisible: sectionRecall(result.selected),
    sectionRecallAt10: sectionRecall(result.visible),
    focusRangeCovered: focus.filter((bar) => !uncovered.has(bar)).length,
    focusRangeBars: focus.length,
    groupedVisibleCoverage: Number((grouped.size / Math.max(1, active.length)).toFixed(6)),
    occurrenceRecall: Number((reachable.length / Math.max(1, occurrences.length)).toFixed(6)),
    minimumSelectedCandidateScore: scores.length ? Number(Math.min(...scores).toFixed(6)) : 0,
    runtimeMs,
    stoppedBecause: result.stoppedBecause,
  };
}

/** Ranking selector as shipped, for reference. */
const ranking = analyzeMidi(bytes).blockCandidates;
const rankingCovered = new Set<number>();
for (const block of ranking) {
  for (let bar = block.startBar; bar <= block.endBar; bar += 1) {
    if (activeSet.has(bar)) rankingCovered.add(bar);
  }
}
const rankingFocus = active.filter(
  (bar) => bar >= baseline.focusRange.from && bar <= baseline.focusRange.to && rankingCovered.has(bar),
);

const rows = [
  {
    selector: "phase4.0-ranking",
    candidateCount: ranking.length,
    selectedCoverageAtAllVisible: Number((rankingCovered.size / active.length).toFixed(6)),
    selectedCoverageAt10: Number((rankingCovered.size / active.length).toFixed(6)),
    longestUncoveredHarmonicRun: (() => {
      let longest = 0, run = 0;
      for (const bar of active) {
        if (rankingCovered.has(bar)) run = 0; else { run += 1; longest = Math.max(longest, run); }
      }
      return longest;
    })(),
    sectionRecallAtAllVisible: sectionRecall(ranking),
    sectionRecallAt10: sectionRecall(ranking.slice(0, 10)),
    focusRangeCovered: rankingFocus.length,
    focusRangeBars: active.filter((b) => b >= baseline.focusRange.from && b <= baseline.focusRange.to).length,
    groupedVisibleCoverage: Number((rankingCovered.size / active.length).toFixed(6)),
    occurrenceRecall: Number((ranking.length / Math.max(1, occurrences.length)).toFixed(6)),
    minimumSelectedCandidateScore: ranking.length
      ? Number(Math.min(...ranking.map((b) => b.selectionScore ?? 0)).toFixed(6)) : 0,
    runtimeMs: 0,
    stoppedBecause: "ranking-limit",
  },
  measure("coverage-only", false),
  measure("section-aware-coverage", true),
];

const coverageOnly = rows[1];
const sectionAware = rows[2];
const improves = sectionAware.selectedCoverageAtAllVisible >= coverageOnly.selectedCoverageAtAllVisible
  && sectionAware.sectionRecallAtAllVisible > coverageOnly.sectionRecallAtAllVisible
  && sectionAware.longestUncoveredHarmonicRun <= coverageOnly.longestUncoveredHarmonicRun
  && sectionAware.minimumSelectedCandidateScore >= coverageOnly.minimumSelectedCandidateScore;

const report = {
  schemaVersion: 1,
  stage: "P4.1-04",
  source: { fingerprint: fingerprintMidiBytes(bytes), byteLength: bytes.length },
  rows,
  sectionAwareImprovesOverCoverageOnly: improves,
  recommendedSelector: improves ? "section-aware-coverage" : "coverage-only",
  reasoning: improves
    ? "section awareness raised section recall without costing coverage or quality"
    : "section awareness did not improve on coverage-only; coverage-only is adopted and the section signal stays available but unused",
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
stdout.write("selector                  cands  coverage  sectionRecall  longestRun  focus  minScore\n");
for (const row of rows) {
  stdout.write(`${row.selector.padEnd(25)} ${String(row.candidateCount).padStart(4)}  `
    + `${pct(row.selectedCoverageAtAllVisible).padStart(8)}  ${pct(row.sectionRecallAtAllVisible).padStart(13)}  `
    + `${String(row.longestUncoveredHarmonicRun).padStart(10)}  ${String(row.focusRangeCovered).padStart(2)}/${row.focusRangeBars}  `
    + `${row.minimumSelectedCandidateScore.toFixed(4)}\n`);
}
stdout.write(`\nsection-aware improves: ${improves}\nrecommended: ${report.recommendedSelector}\n`);
