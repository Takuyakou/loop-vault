import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { buildCoverageCandidates, harmonicActiveBars } from "../src/domain/midi/coverageCandidates";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import { analyzeMidiWithRankingScores } from "../src/domain/midi/legacy";
import { groupedReachableOccurrences } from "../src/domain/midi/occurrence";
import { parseMidi } from "../src/domain/midi/parser";

/**
 * Checks the coverage selector against the gate frozen in P4.1-00.
 *
 * Reads the gate file rather than restating its numbers, so a threshold cannot
 * drift between the record and the check.
 */
const midiPath = resolve(cwd(), optionValue("--midi") ?? "");
const gatePath = resolve(cwd(), "docs/phase4.1/00-coverage-gates.json");
const baselinePath = resolve(cwd(), "docs/phase4.1/00-suran-baseline.json");
const outputDir = resolve(cwd(), "docs/phase4.1");
const outputName = optionValue("--output") ?? "coverage-selection.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (!midiPath || midiPath === cwd()) {
  throw new Error("Usage: vite-node scripts/evaluate-coverage-selection.ts --midi <path> [--output <name>]");
}

const gate = JSON.parse(await readFile(gatePath, "utf8")) as {
  gates: Array<{ id: string; metric: string; rule: string; value: number; baseline: number }>;
  guardrails: Array<{ id: string; metric?: string; rule: string; value?: number; toleranceLoss?: number; baseline?: number }>;
};
const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
  sections: { ranges: Array<{ id: string; startBar: number; endBar: number }> };
  focusRange: { from: number; to: number };
};

const bytes = new Uint8Array(await readFile(midiPath));
const internal = analyzeMidiWithRankingScores(bytes);
const song = parseMidi(bytes);
const totalBars = internal.analysis.totalBars;

const start = performance.now();
const result = buildCoverageCandidates(
  internal.analysis.fullTimeline, song, totalBars, internal.timelineRankingScores,
);
const runtimeMs = Number((performance.now() - start).toFixed(1));

const active = harmonicActiveBars(song, totalBars);
const activeSet = new Set(active);
const uncovered = new Set(result.uncoveredBars);

function sectionRecall(blocks: ReadonlyArray<{ startBar: number; endBar: number }>): number {
  const sections = baseline.sections.ranges;
  if (sections.length === 0) return 0;
  const hit = sections.filter((section) => blocks.some(
    (block) => block.startBar <= section.endBar && block.endBar >= section.startBar,
  )).length;
  return Number((hit / sections.length).toFixed(6));
}

const visible = result.candidates.slice(0, 10);
const focusBars = active.filter(
  (bar) => bar >= baseline.focusRange.from && bar <= baseline.focusRange.to,
);
const focusCovered = focusBars.filter((bar) => !uncovered.has(bar));

const reachable = groupedReachableOccurrences(
  result.patterns,
  result.candidates.map((candidate) => candidate.id),
);
const groupedCovered = new Set<number>();
for (const occurrence of reachable) {
  for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) {
    if (activeSet.has(bar)) groupedCovered.add(bar);
  }
}

const scores = result.candidates.map((candidate) => candidate.selectionScore ?? 0);
const repeated = buildCoverageCandidates(
  internal.analysis.fullTimeline, song, totalBars, internal.timelineRankingScores,
);

const measured: Record<string, number> = {
  selectedCoverageAtAllVisible: result.coverage,
  selectedCoverageAt10: result.coverageAtVisible,
  sectionRecallAtAllVisible: sectionRecall(result.candidates),
  sectionRecallAt10: sectionRecall(visible),
  longestUncoveredHarmonicRun: result.longestUncoveredRun,
  "focusRange.coveredBySelected": focusCovered.length,
  groupedVisibleCoverage: Number((groupedCovered.size / Math.max(1, active.length)).toFixed(6)),
  minimumSelectedCandidateScore: scores.length ? Number(Math.min(...scores).toFixed(6)) : 0,
  runtimeMs,
};

const gateResults = gate.gates.map((rule) => {
  const value = measured[rule.metric] ?? 0;
  const pass = rule.rule === "atLeast" ? value >= rule.value
    : rule.rule === "lessThan" ? value < rule.value
      : false;
  return { id: rule.id, metric: rule.metric, required: rule.value, baseline: rule.baseline, measured: value, verdict: pass ? "PASS" : "FAIL" };
});

const guardrailResults = gate.guardrails.map((rule) => {
  if (rule.rule === "noSevereRegression" && rule.metric && rule.baseline !== undefined) {
    const value = measured[rule.metric] ?? 0;
    const floor = rule.baseline - (rule.toleranceLoss ?? 0);
    return { id: rule.id, measured: value, floor: Number(floor.toFixed(6)), verdict: value >= floor ? "PASS" : "FAIL" };
  }
  if (rule.rule === "max" && rule.metric) {
    const value = measured[rule.metric] ?? 0;
    return { id: rule.id, measured: value, limit: rule.value, verdict: value <= (rule.value ?? Infinity) ? "PASS" : "FAIL" };
  }
  if (rule.rule === "identicalOutputOnRepeatRun") {
    const identical = JSON.stringify(repeated.candidates) === JSON.stringify(result.candidates);
    return { id: rule.id, verdict: identical ? "PASS" : "FAIL" };
  }
  return { id: rule.id, verdict: "not-evaluated" as const };
});

const failing = [...gateResults, ...guardrailResults].filter((entry) => entry.verdict === "FAIL");

const report = {
  schemaVersion: 1,
  stage: "P4.1-02",
  source: { fingerprint: fingerprintMidiBytes(bytes), byteLength: bytes.length },
  selector: "coverage",
  candidateCount: result.candidates.length,
  stoppedBecause: result.stoppedBecause,
  measured,
  gates: gateResults,
  guardrails: guardrailResults,
  verdict: failing.length === 0 ? "PASS" : "FAIL",
  selectedBlocks: result.candidates.map((candidate) => ({
    id: candidate.id,
    startBar: candidate.startBar,
    endBar: candidate.endBar,
    lengthBars: candidate.lengthBars,
    selectionScore: candidate.selectionScore ?? null,
  })),
  uncoveredBars: result.uncoveredBars,
  // Sanity: chord detection must be untouched by a selection change.
  rankingSelectorCandidateCount: analyzeMidi(bytes).blockCandidates.length,
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
stdout.write(`candidates ${result.candidates.length} (${result.stoppedBecause}), runtime ${runtimeMs} ms\n\n`);
for (const entry of gateResults) {
  const shown = entry.metric.includes("Coverage") || entry.metric.includes("Recall")
    ? `${pct(entry.measured)} (baseline ${pct(entry.baseline)}, need ${pct(entry.required)})`
    : `${entry.measured} (baseline ${entry.baseline}, need ${entry.required})`;
  stdout.write(`  ${entry.verdict === "PASS" ? " ok " : "FAIL"}  ${entry.id.padEnd(32)} ${shown}\n`);
}
for (const entry of guardrailResults) {
  stdout.write(`  ${entry.verdict === "PASS" ? " ok " : entry.verdict === "FAIL" ? "FAIL" : " -- "}  ${entry.id}\n`);
}
stdout.write(`\nverdict: ${report.verdict}\n`);
