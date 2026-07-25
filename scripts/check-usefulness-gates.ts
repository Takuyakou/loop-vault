import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { evaluateFile, loadCorpus, VISIBLE_CARD_LIMIT, type FileEvaluation } from "./syntheticGoldCorpus";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * P4.1.2-A2 Hard Gate check.
 *
 * The Phase 4.1 gates measured which bars the candidate list reached. They could
 * not see whether the cards differed from each other, so a list of three
 * positions of one vamp passed every one of them. These gates ask the other
 * question, and they are frozen here before any of B through E is written so a
 * later result cannot quietly move the bar.
 *
 * Coverage gates are carried over unchanged rather than relaxed.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpora = (optionValue("--corpora")
  ?? ".local-evaluation/synthetic-gold-v1,.local-evaluation/long-form-v1.1").split(",");
const splits = (optionValue("--splits") ?? "dev,validation").split(",");
const modes = (optionValue("--modes") ?? "phase4.1-v1").split(",") as MidiAnalyzerMode[];
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.2/02-usefulness-gate-check.json");
const runtimeCeilingMs = Number(optionValue("--runtime-ceiling") ?? 3000);
const checkDeterminism = optionValue("--no-determinism") === undefined;

export interface GateResult {
  id: string;
  description: string;
  verdict: "pass" | "fail" | "not-evaluated";
  detail: string;
  /** Files that violate this gate, so a failure is actionable rather than a number. */
  offenders?: string[];
}

interface Row {
  corpus: string;
  split: string;
  mode: MidiAnalyzerMode;
  evaluation: FileEvaluation;
}

const rows: Row[] = [];

for (const corpusPath of corpora) {
  const corpus = loadCorpus(resolve(cwd(), corpusPath));
  const located = new Map<string, { scenarioIndex: number; variantIndex: number }>();
  corpus.scenarios.forEach((scenario, scenarioIndex) => {
    scenario.variants.forEach((variant, variantIndex) => {
      located.set(variant.fileName, { scenarioIndex, variantIndex });
    });
  });

  for (const split of splits) {
    const files = corpus.splits[split];
    if (!files) continue;
    for (const mode of modes) {
      for (const fileName of files) {
        const position = located.get(fileName);
        if (!position) throw new Error(`file not in manifest: ${fileName}`);
        const scenario = corpus.scenarios[position.scenarioIndex];
        const variant = scenario.variants[position.variantIndex];
        const bytes = new Uint8Array(await readFile(resolve(cwd(), corpusPath, "midi", fileName)));
        rows.push({
          corpus: corpusPath.split(/[/\\]/).pop() ?? corpusPath,
          split,
          mode,
          evaluation: evaluateFile(bytes, scenario, variant, mode),
        });
      }
    }
  }
}

const label = (row: Row) => `${row.corpus}:${row.evaluation.scenarioId}_${row.evaluation.variant}:${row.mode}`;

function gate(
  id: string,
  description: string,
  predicate: (row: Row) => boolean,
  applies: (row: Row) => boolean = () => true,
): GateResult {
  const relevant = rows.filter(applies);
  const offenders = relevant.filter((row) => !predicate(row)).map(label);
  return {
    id,
    description,
    verdict: relevant.length === 0 ? "not-evaluated" : (offenders.length === 0 ? "pass" : "fail"),
    detail: `${relevant.length - offenders.length}/${relevant.length} files`,
    ...(offenders.length > 0 ? { offenders: offenders.slice(0, 12) } : {}),
  };
}

const gates: GateResult[] = [
  gate(
    "visible-pattern-duplicate-count-zero",
    "No pattern occupies more than one visible card.",
    (row) => row.evaluation.patternUi.visiblePatternDuplicateCount === 0,
  ),
  gate(
    "visible-slot-waste-zero",
    "No visible slot is spent on a pattern already shown.",
    (row) => row.evaluation.patternUi.visibleSlotWasteCount === 0,
  ),
  gate(
    "occurrence-reachability-full",
    "Every occurrence of a displayed pattern is reachable from its card.",
    (row) => row.evaluation.patternUi.occurrenceReachability === 1,
  ),
  gate(
    "progression-precision-at-3",
    "With three or more progression patterns available, all of the first three cards are progressions.",
    (row) => row.evaluation.selection.progressionPrecisionAt3 === 1,
    (row) => row.evaluation.selection.progressionCandidateAvailability >= 3,
  ),
  gate(
    "no-two-bar-fragment-in-top3",
    "With three or more progression patterns available, no two-bar fragment sits in the first three cards.",
    (row) => row.evaluation.selection.twoBarFragmentsInTop3 === 0,
    (row) => row.evaluation.selection.progressionCandidateAvailability >= 3,
  ),
  gate(
    "rank-constraint-top3-min-hits",
    "Every priority group meets its top3MinHits.",
    (row) => row.evaluation.selection.rankConstraintGroupSatisfaction.every((entry) => entry.top3Satisfied),
  ),
  gate(
    "rank-constraint-all-visible-min-hits",
    "Every priority group meets its allVisibleMinHits.",
    (row) => row.evaluation.selection.rankConstraintGroupSatisfaction.every((entry) => entry.allVisibleSatisfied),
  ),
  gate(
    "rank-constraint-order",
    "A group marked afterGroup does not outrank the group it follows.",
    (row) => row.evaluation.selection.rankConstraintGroupSatisfaction.every((entry) => entry.orderSatisfied),
  ),
  // Carried over from Phase 4.1 unchanged. Coverage is not relaxed to buy
  // usefulness: both have to hold at once.
  gate(
    "coverage-at-all-visible",
    "allCandidateCoverage stays at or above 90% (Phase 4.1 gate, unchanged).",
    (row) => row.evaluation.selection.allCandidateCoverage >= 0.9,
  ),
  gate(
    "longest-uncovered-run",
    "The longest uncovered harmonic run stays under eight bars (Phase 4.1 gate, unchanged).",
    (row) => row.evaluation.selection.longestUncoveredHarmonicRun < 8,
  ),
  gate(
    "runtime-ceiling",
    `Every file analyses in under ${runtimeCeilingMs} ms.`,
    (row) => row.evaluation.runtimeMs <= runtimeCeilingMs,
  ),
];

if (checkDeterminism) {
  // Re-evaluating one file per corpus is enough to catch nondeterminism in the
  // selector, which is where ordering could drift.
  const probes = new Map<string, Row>();
  for (const row of rows) if (!probes.has(row.corpus)) probes.set(row.corpus, row);
  const mismatches: string[] = [];
  for (const [corpusName, row] of probes) {
    const corpusPath = corpora.find((path) => path.endsWith(corpusName)) ?? corpora[0];
    const corpus = loadCorpus(resolve(cwd(), corpusPath));
    const scenario = corpus.scenarios.find((entry) => entry.scenarioId === row.evaluation.scenarioId);
    const variant = scenario?.variants.find((entry) => entry.variant === row.evaluation.variant);
    if (!scenario || !variant) continue;
    const bytes = new Uint8Array(await readFile(resolve(cwd(), corpusPath, "midi", variant.fileName)));
    const again = evaluateFile(bytes, scenario, variant, row.mode);
    if (JSON.stringify(again.cards) !== JSON.stringify(row.evaluation.cards)) mismatches.push(label(row));
  }
  gates.push({
    id: "deterministic",
    description: "Re-running the same file produces the same cards.",
    verdict: mismatches.length === 0 ? "pass" : "fail",
    detail: `${probes.size - mismatches.length}/${probes.size} probes stable`,
    ...(mismatches.length > 0 ? { offenders: mismatches } : {}),
  });
}

gates.push({
  id: "chord-corpus-non-regression",
  description: "Chord Drip and Chapter 3 Seed do not regress.",
  verdict: "not-evaluated",
  detail: "checked by scripts/evaluate-midi-analysis.ts and evaluate-chapter3-seed.ts outside this script",
});

const summary = (pick: (evaluation: FileEvaluation) => number) => {
  const values = rows.map((row) => pick(row.evaluation));
  return {
    min: Number(Math.min(...values).toFixed(6)),
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)),
    max: Number(Math.max(...values).toFixed(6)),
  };
};

const report = {
  schemaVersion: 1,
  stage: "P4.1.2-A2",
  corpora,
  splits,
  modes,
  visibleCardLimit: VISIBLE_CARD_LIMIT,
  fileEvaluations: rows.length,
  gates,
  verdict: gates.some((entry) => entry.verdict === "fail") ? "FAIL" : "PASS",
  metrics: {
    mustShowGeneratedRecall: summary((evaluation) => evaluation.generation.mustShowGeneratedRecall),
    mustShowSelectedRecallAmongGenerated: summary(
      (evaluation) => evaluation.selection.mustShowSelectedRecallAmongGenerated,
    ),
    visiblePatternDuplicateCount: summary(
      (evaluation) => evaluation.patternUi.visiblePatternDuplicateCount,
    ),
    visibleSlotWasteCount: summary((evaluation) => evaluation.patternUi.visibleSlotWasteCount),
    uniquePatternCountAt3: summary((evaluation) => evaluation.selection.uniquePatternCountAt3),
    uniquePatternCountAt10: summary((evaluation) => evaluation.selection.uniquePatternCountAt10),
    progressionPrecisionAt3: summary((evaluation) => evaluation.selection.progressionPrecisionAt3),
    twoBarFragmentsInTop3: summary((evaluation) => evaluation.selection.twoBarFragmentsInTop3),
    occurrenceReachability: summary((evaluation) => evaluation.patternUi.occurrenceReachability),
    eventCountRatio: summary((evaluation) => evaluation.patternUi.eventCountRatio),
    boundaryPrecision: summary((evaluation) => evaluation.segmentation.boundaryPrecision),
    boundaryRecall: summary((evaluation) => evaluation.segmentation.boundaryRecall),
    segmentIoU: summary((evaluation) => evaluation.segmentation.segmentIoU),
    allCandidateCoverage: summary((evaluation) => evaluation.selection.allCandidateCoverage),
    progressionCandidateCoverage: summary(
      (evaluation) => evaluation.selection.progressionCandidateCoverage,
    ),
    runtimeMs: summary((evaluation) => evaluation.runtimeMs),
  },
  files: rows.map((row) => ({
    corpus: row.corpus,
    split: row.split,
    mode: row.mode,
    scenarioId: row.evaluation.scenarioId,
    variant: row.evaluation.variant,
    fingerprint: row.evaluation.fingerprint,
    visiblePatternDuplicateCount: row.evaluation.patternUi.visiblePatternDuplicateCount,
    occurrenceReachability: row.evaluation.patternUi.occurrenceReachability,
    progressionPrecisionAt3: row.evaluation.selection.progressionPrecisionAt3,
    twoBarFragmentsInTop3: row.evaluation.selection.twoBarFragmentsInTop3,
    progressionCandidateAvailability: row.evaluation.selection.progressionCandidateAvailability,
    mustShowGeneratedRecall: row.evaluation.generation.mustShowGeneratedRecall,
    mustShowSelectedRecallAmongGenerated: row.evaluation.selection.mustShowSelectedRecallAmongGenerated,
    allCandidateCoverage: row.evaluation.selection.allCandidateCoverage,
    eventCountRatio: row.evaluation.patternUi.eventCountRatio,
    rankConstraintGroupSatisfaction: row.evaluation.selection.rankConstraintGroupSatisfaction,
    runtimeMs: row.evaluation.runtimeMs,
  })),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`${report.verdict}  (${rows.length} file evaluations)\n\n`);
for (const entry of gates) {
  const mark = entry.verdict === "pass" ? "PASS" : (entry.verdict === "fail" ? "FAIL" : "----");
  stdout.write(`${mark}  ${entry.id.padEnd(40)} ${entry.detail}\n`);
  if (entry.offenders) stdout.write(`      ${entry.offenders.join(", ")}\n`);
}
stdout.write("\n");
for (const [name, value] of Object.entries(report.metrics)) {
  stdout.write(`${name.padEnd(38)} min ${String(value.min).padStart(9)}  mean ${String(value.mean).padStart(9)}  max ${String(value.max).padStart(9)}\n`);
}
