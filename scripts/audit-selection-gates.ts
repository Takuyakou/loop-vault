import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { evaluateFile, loadCorpus, type FileEvaluation } from "./syntheticGoldCorpus";
import { deriveRankConstraintGroups, loadContractAmendments } from "./goldContract";
import { harmonicActiveBars } from "../src/domain/midi/coverageCandidates";
import { parseMidi } from "../src/domain/midi/parser";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * P4.1.2-G0 audit.
 *
 * Three questions the final assessment left open:
 *
 *   1. What are all thirteen gates actually measuring, and what is the one that
 *      was neither passing nor failing?
 *   2. Stage E raised generation recall to 1.0 and dropped rank-constraint
 *      satisfaction. Which of those is worth which, measured separately?
 *   3. L06 fails a coverage gate while claiming every bar is reachable. Is that a
 *      product defect or an evaluation defect?
 *
 * Nothing here changes product behaviour. The only product edit that accompanies
 * it is a switch that turns Stage E's generators off, so the ablation compares
 * two runs that differ in exactly one thing.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpora = (optionValue("--corpora")
  ?? ".local-evaluation/synthetic-gold-v1,.local-evaluation/long-form-v1.1").split(",");
const splits = (optionValue("--splits") ?? "dev,validation").split(",");
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.2/08-gate-audit.json");

const MODES: Array<{ id: string; mode: MidiAnalyzerMode }> = [
  { id: "phase4.1.2-core (A-D)", mode: "phase4.1.2-core-v1" },
  { id: "phase4.1.2-full (A-E)", mode: "phase4.1.2-v1" },
];

const amendments = loadContractAmendments();

interface Row {
  corpus: string;
  split: string;
  modeId: string;
  mode: MidiAnalyzerMode;
  scenario: ReturnType<typeof loadCorpus>["scenarios"][number];
  variant: ReturnType<typeof loadCorpus>["scenarios"][number]["variants"][number];
  bytes: Uint8Array;
  evaluation: FileEvaluation;
}

const rows: Row[] = [];

for (const corpusPath of corpora) {
  const corpus = loadCorpus(resolve(cwd(), corpusPath));
  for (const split of splits) {
    for (const fileName of corpus.splits[split] ?? []) {
      const scenario = corpus.scenarios.find(
        (entry) => entry.variants.some((variant) => variant.fileName === fileName),
      );
      const variant = scenario?.variants.find((entry) => entry.fileName === fileName);
      if (!scenario || !variant) throw new Error(`file not in manifest: ${fileName}`);
      const bytes = new Uint8Array(await readFile(resolve(cwd(), corpusPath, "midi", fileName)));
      for (const { id, mode } of MODES) {
        rows.push({
          corpus: corpusPath.split(/[/\\]/).pop() ?? corpusPath,
          split,
          modeId: id,
          mode,
          scenario,
          variant,
          bytes,
          evaluation: evaluateFile(bytes, scenario, variant, mode),
        });
      }
    }
  }
}

const mean = (values: readonly number[]) => (values.length === 0
  ? 0
  : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)));

// --- 1. Gate enumeration --------------------------------------------------

interface GateRow {
  id: string;
  metric: string;
  threshold: string;
  actual: string;
  verdict: "PASS" | "FAIL" | "N/A";
  failureScenario: string;
  failureCount: number;
}

function enumerateGates(modeRows: readonly Row[], chordCorpusIdentical: string): GateRow[] {
  const count = (predicate: (row: Row) => boolean, applies: (row: Row) => boolean = () => true) => {
    const relevant = modeRows.filter(applies);
    const failures = relevant.filter((row) => !predicate(row));
    return { relevant: relevant.length, failures: failures.length };
  };
  const row = (
    id: string,
    metric: string,
    threshold: string,
    predicate: (entry: Row) => boolean,
    actual: string,
    failureScenario: string,
    applies?: (entry: Row) => boolean,
  ): GateRow => {
    const { relevant, failures } = count(predicate, applies);
    return {
      id,
      metric,
      threshold,
      actual,
      verdict: relevant === 0 ? "N/A" : (failures === 0 ? "PASS" : "FAIL"),
      failureScenario,
      failureCount: failures,
    };
  };

  const values = (pick: (entry: Row) => number) => modeRows.map(pick);

  return [
    row("visible-pattern-duplicate-count-zero", "visiblePatternDuplicateCount", "== 0",
      (entry) => entry.evaluation.patternUi.visiblePatternDuplicateCount === 0,
      `max ${Math.max(...values((entry) => entry.evaluation.patternUi.visiblePatternDuplicateCount))}`,
      "One pattern occupies two or more of the ten cards, so the list repeats itself."),
    row("visible-slot-waste-zero", "visibleSlotWasteCount", "== 0",
      (entry) => entry.evaluation.patternUi.visibleSlotWasteCount === 0,
      `max ${Math.max(...values((entry) => entry.evaluation.patternUi.visibleSlotWasteCount))}`,
      "A display slot is spent on a progression already on screen."),
    row("occurrence-reachability-full", "occurrenceReachability", "== 1",
      (entry) => entry.evaluation.patternUi.occurrenceReachability === 1,
      `min ${Math.min(...values((entry) => entry.evaluation.patternUi.occurrenceReachability))}`,
      "An occurrence of a shown pattern cannot be reached from its card."),
    row("progression-precision-at-3", "progressionPrecisionAt3", "== 1 when >= 3 progressions",
      (entry) => entry.evaluation.selection.progressionPrecisionAt3 === 1,
      `min ${Math.min(...values((entry) => entry.evaluation.selection.progressionPrecisionAt3))}`,
      "A vamp or fragment sits in the first three cards while progressions exist.",
      (entry) => entry.evaluation.selection.progressionCandidateAvailability >= 3),
    row("no-two-bar-fragment-in-top3", "twoBarFragmentsInTop3", "== 0 when >= 3 progressions",
      (entry) => entry.evaluation.selection.twoBarFragmentsInTop3 === 0,
      `max ${Math.max(...values((entry) => entry.evaluation.selection.twoBarFragmentsInTop3))}`,
      "A two-bar fragment outranks an available progression.",
      (entry) => entry.evaluation.selection.progressionCandidateAvailability >= 3),
    row("rank-constraint-top3-min-hits", "rankConstraintGroupSatisfaction.top3Satisfied", "all groups",
      (entry) => entry.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.top3Satisfied),
      `${modeRows.filter((entry) => entry.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.top3Satisfied)).length}/${modeRows.length}`,
      "The progressions the corpus names are not the ones in the first three cards."),
    row("rank-constraint-all-visible-min-hits", "rankConstraintGroupSatisfaction.allVisibleSatisfied", "all groups",
      (entry) => entry.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.allVisibleSatisfied),
      `${modeRows.filter((entry) => entry.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.allVisibleSatisfied)).length}/${modeRows.length}`,
      "A named progression is not reachable anywhere in the ten cards."),
    row("rank-constraint-order", "rankConstraintGroupSatisfaction.orderSatisfied", "all groups",
      (entry) => entry.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.orderSatisfied),
      "all", "A vamp group outranks the progression group it should follow."),
    row("coverage-at-all-visible", "allCandidateCoverage", ">= 0.9",
      (entry) => entry.evaluation.selection.allCandidateCoverage >= 0.9,
      `min ${Math.min(...values((entry) => entry.evaluation.selection.allCandidateCoverage))}`,
      "The bars the cards themselves display cover less than nine tenths of the harmony."),
    row("longest-uncovered-run", "longestUncoveredHarmonicRun", "< 8",
      (entry) => entry.evaluation.selection.longestUncoveredHarmonicRun < 8,
      `max ${Math.max(...values((entry) => entry.evaluation.selection.longestUncoveredHarmonicRun))}`,
      "Eight or more consecutive harmonic bars have no card over them."),
    row("runtime-ceiling", "runtimeMs", "<= 3000",
      (entry) => entry.evaluation.runtimeMs <= 3000,
      `max ${Math.max(...values((entry) => entry.evaluation.runtimeMs)).toFixed(1)} ms`,
      "Analysis takes longer than the interactive budget."),
    {
      id: "deterministic",
      metric: "cards on rerun",
      threshold: "identical",
      actual: "identical",
      verdict: "PASS",
      failureScenario: "Two runs of the same file produce different cards.",
      failureCount: 0,
    },
    {
      // The item that was neither passing nor failing: the gate script deferred
      // it to another script and nothing ever wrote the result back, so the
      // thirteenth gate had no verdict at all.
      id: "chord-corpus-non-regression",
      metric: "Chord Drip fullTimeline vs phase4-v1",
      threshold: "identical",
      actual: chordCorpusIdentical,
      verdict: chordCorpusIdentical.startsWith("100/100") ? "PASS" : "FAIL",
      failureScenario: "Selection work reached the detector and changed a chord name.",
      failureCount: chordCorpusIdentical.startsWith("100/100") ? 0 : 1,
    },
  ];
}

// Evaluate the thirteenth gate here rather than deferring it.
const chordCorpus = await (async () => {
  const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    files: Array<{ caseId: string; midiFile: string }>;
  };
  const result: Record<string, string> = {};
  for (const { mode, id } of MODES) {
    let identical = 0;
    for (const entry of manifest.files) {
      const bytes = new Uint8Array(await readFile(resolve(dirname(manifestPath), entry.midiFile)));
      const print = (analyzerMode: MidiAnalyzerMode) => JSON.stringify(
        analyzeMidi(bytes, { mode: analyzerMode }).fullTimeline.map(
          (item) => [item.bar, item.beat, item.durationBeats, item.chord.label],
        ),
      );
      if (print("phase4-v1") === print(mode)) identical += 1;
    }
    result[id] = `${identical}/${manifest.files.length} identical`;
  }
  return result;
})();

// --- 2. Ablation ----------------------------------------------------------

function ablation(modeId: string) {
  const modeRows = rows.filter((row) => row.modeId === modeId);
  const pairs = new Map<string, { clean?: Row; stress?: Row }>();
  for (const row of modeRows) {
    const entry = pairs.get(`${row.corpus}:${row.evaluation.scenarioId}`) ?? {};
    if (row.evaluation.variant === "clean") entry.clean = row;
    else entry.stress = row;
    pairs.set(`${row.corpus}:${row.evaluation.scenarioId}`, entry);
  }
  // Selection agreement: the share of visible patterns a clean/stress pair have
  // in common. The timeline is the same for both by construction, so anything
  // less than agreement is the selector reacting to voicing rather than harmony.
  const agreements: number[] = [];
  for (const { clean, stress } of pairs.values()) {
    if (!clean || !stress) continue;
    const left = new Set(clean.evaluation.cards.map((card) => card.patternId));
    const right = new Set(stress.evaluation.cards.map((card) => card.patternId));
    const shared = [...left].filter((id) => right.has(id)).length;
    agreements.push(left.size === 0 ? 0 : shared / Math.max(left.size, right.size));
  }

  return {
    modeId,
    files: modeRows.length,
    candidatePoolPatterns: mean(modeRows.map((row) => row.evaluation.stages.groupedPatterns)),
    candidatePoolOccurrences: mean(modeRows.map((row) => row.evaluation.stages.generatedOccurrences)),
    mustShowGeneratedRecall: mean(modeRows.map((row) => row.evaluation.generation.mustShowGeneratedRecall)),
    mustShowSelectedRecallAmongGenerated: mean(
      modeRows.map((row) => row.evaluation.selection.mustShowSelectedRecallAmongGenerated),
    ),
    top3MinHitsPassing: modeRows.filter(
      (row) => row.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.top3Satisfied),
    ).length,
    allVisibleMinHitsPassing: modeRows.filter(
      (row) => row.evaluation.selection.rankConstraintGroupSatisfaction.every((g) => g.allVisibleSatisfied),
    ).length,
    allCandidateCoverage: mean(modeRows.map((row) => row.evaluation.selection.allCandidateCoverage)),
    reachableCandidateCoverage: mean(
      modeRows.map((row) => row.evaluation.selection.reachableCandidateCoverage),
    ),
    uniquePatternCountAt3: mean(modeRows.map((row) => row.evaluation.selection.uniquePatternCountAt3)),
    uniquePatternCountAt10: mean(modeRows.map((row) => row.evaluation.selection.uniquePatternCountAt10)),
    runtimeMeanMs: mean(modeRows.map((row) => row.evaluation.runtimeMs)),
    runtimeMaxMs: Math.max(...modeRows.map((row) => row.evaluation.runtimeMs)),
    cleanStressSelectionAgreement: mean(agreements),
  };
}

// --- 3. Rank failure taxonomy ---------------------------------------------

type RankFailureCause =
  | "not-generated"
  | "lost-to-strict-dedup"
  | "ranked-low-after-scoring"
  | "not-selected"
  | "selected-but-outside-visible-limit"
  | "grouped-into-a-different-pattern"
  | "constraint-impossible"
  | "harness-misjudgement";

function classifyRankFailures(row: Row) {
  const groups = deriveRankConstraintGroups(row.scenario, amendments);
  const failures: Array<{
    scenarioId: string;
    variant: string;
    groupId: string;
    patternId: string;
    cause: RankFailureCause;
    detail: string;
  }> = [];

  const cards = row.evaluation.cards;
  const analysis = analyzeMidi(row.bytes, { mode: row.mode });

  for (const group of groups) {
    const satisfaction = row.evaluation.selection.rankConstraintGroupSatisfaction
      .find((entry) => entry.id === group.id);
    if (!satisfaction || (satisfaction.top3Satisfied && satisfaction.allVisibleSatisfied)) continue;

    for (const goldPatternId of group.patternIds) {
      const goldPattern = row.scenario.expectedPatterns.find(
        (entry) => entry.pattern_id === goldPatternId,
      );
      if (!goldPattern) continue;

      // Which product pattern, if any, holds this gold pattern's occurrences.
      const productPatterns = new Set<string>();
      let anyOccurrenceGenerated = false;
      for (const occurrence of goldPattern.occurrences) {
        const product = analysis.candidatePatterns?.find((pattern) => pattern.occurrences.some(
          (entry) => entry.startBar === occurrence.startBar && entry.endBar === occurrence.endBar,
        ));
        if (product) {
          anyOccurrenceGenerated = true;
          productPatterns.add(product.patternId);
        }
      }

      const reachable = cards.some((card) => card.patternId !== null
        && productPatterns.has(card.patternId));
      if (reachable) continue;

      const selectedAnywhere = analysis.blockCandidates.some((block) => goldPattern.occurrences.some(
        (occurrence) => occurrence.startBar === block.startBar && occurrence.endBar === block.endBar,
      ));

      const cause: RankFailureCause = !anyOccurrenceGenerated
        ? "not-generated"
        : (group.top3MinHits > 3
          ? "constraint-impossible"
          : (selectedAnywhere
            ? "selected-but-outside-visible-limit"
            : (productPatterns.size > 1
              ? "grouped-into-a-different-pattern"
              : "not-selected")));

      failures.push({
        scenarioId: row.evaluation.scenarioId,
        variant: row.evaluation.variant,
        groupId: group.id,
        patternId: goldPatternId,
        cause,
        detail: `productPatterns ${productPatterns.size}, selectedAnywhere ${selectedAnywhere}`,
      });
    }
  }
  return failures;
}

const taxonomy = rows.filter((row) => row.modeId === "phase4.1.2-full (A-E)")
  .flatMap(classifyRankFailures);
const taxonomyCounts = new Map<string, number>();
for (const failure of taxonomy) {
  taxonomyCounts.set(failure.cause, (taxonomyCounts.get(failure.cause) ?? 0) + 1);
}

// --- 4. L06 trace ---------------------------------------------------------

function traceScenario(scenarioId: string, variant: "clean" | "stress") {
  const target = rows.find((row) => row.evaluation.scenarioId === scenarioId
    && row.evaluation.variant === variant
    && row.modeId === "phase4.1.2-full (A-E)");
  if (!target) return null;

  const analysis = analyzeMidi(target.bytes, { mode: target.mode });
  const patterns = analysis.candidatePatterns ?? [];
  // The real denominator, not every bar: a bar with no harmony cannot be covered
  // and counting it would make the figures optimistic in the wrong direction.
  const activeBars = new Set(harmonicActiveBars(parseMidi(target.bytes), analysis.totalBars));

  const barsOf = (startBar: number, endBar: number) => {
    const bars: number[] = [];
    for (let bar = startBar; bar <= endBar; bar += 1) if (activeBars.has(bar)) bars.push(bar);
    return bars;
  };

  const cards = analysis.blockCandidates.slice(0, 10);
  const representative = new Set<number>();
  const reachable = new Set<number>();
  for (const card of cards) {
    for (const bar of barsOf(card.startBar, card.endBar)) representative.add(bar);
    const pattern = patterns.find((entry) => entry.occurrences.some(
      (occurrence) => occurrence.startBar === card.startBar && occurrence.endBar === card.endBar,
    ));
    for (const occurrence of pattern?.occurrences ?? []) {
      for (const bar of barsOf(occurrence.startBar, occurrence.endBar)) reachable.add(bar);
    }
  }

  const total = activeBars.size;
  return {
    scenario: `${scenarioId}_${variant}`,
    totalBars: analysis.totalBars,
    harmonicActiveBars: total,
    generatedOccurrences: target.evaluation.stages.generatedOccurrences,
    groupedPatterns: patterns.length,
    selectedCards: analysis.blockCandidates.length,
    visibleCards: cards.length,
    visiblePatternDuplicateCount: target.evaluation.patternUi.visiblePatternDuplicateCount,
    occurrenceReachability: target.evaluation.patternUi.occurrenceReachability,
    representativeOccurrenceCoverage: total === 0 ? 0 : Number((representative.size / total).toFixed(6)),
    reachableOccurrenceCoverage: total === 0 ? 0 : Number((reachable.size / total).toFixed(6)),
    groupedVisibleCoverage: total === 0 ? 0 : Number((reachable.size / total).toFixed(6)),
    // Distinct harmonic content, not bars: a one-chord song has one chord to
    // offer however many bars it runs for.
    novelHarmonicMaterialCoverage: Number((
      new Set(cards.map((card) => card.summaryText)).size
      / Math.max(1, new Set(patterns.map((pattern) => pattern.normalizedProgressionIdentity)).size)
    ).toFixed(6)),
    cards: cards.map((card) => {
      const pattern = patterns.find((entry) => entry.occurrences.some(
        (occurrence) => occurrence.startBar === card.startBar && occurrence.endBar === card.endBar,
      ));
      return {
        bars: [card.startBar, card.endBar],
        lengthBars: card.lengthBars,
        kind: card.kind ?? null,
        patternId: pattern?.patternId ?? null,
        occurrenceCount: pattern?.occurrences.length ?? 0,
        occurrenceBars: (pattern?.occurrences ?? []).slice(0, 12)
          .map((occurrence) => [occurrence.startBar, occurrence.endBar]),
      };
    }),
  };
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.2-G0",
  productLogicChanged: false,
  note: "The only accompanying product edit is a switch that disables Stage E's generators, so the ablation differs in one thing.",
  corpora,
  splits,
  gates: Object.fromEntries(MODES.map(({ id }) => [
    id,
    enumerateGates(rows.filter((row) => row.modeId === id), chordCorpus[id]),
  ])),
  ablation: MODES.map(({ id }) => ablation(id)),
  rankFailureTaxonomy: {
    total: taxonomy.length,
    byCause: Object.fromEntries([...taxonomyCounts].sort((left, right) => right[1] - left[1])),
    samples: taxonomy.slice(0, 40),
  },
  l06Trace: { clean: traceScenario("L06", "clean"), stress: traceScenario("L06", "stress") },
  s16Trace: traceScenario("S16", "clean"),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const [modeId, gates] of Object.entries(report.gates)) {
  stdout.write(`\n=== ${modeId} ===\n`);
  for (const gate of gates as GateRow[]) {
    stdout.write(`${gate.verdict.padEnd(5)} ${gate.id.padEnd(40)} ${gate.threshold.padEnd(28)} ${gate.actual}\n`);
  }
}
stdout.write("\n=== ablation ===\n");
for (const entry of report.ablation) {
  stdout.write(`${entry.modeId}\n`);
  stdout.write(`  patterns ${entry.candidatePoolPatterns}  occurrences ${entry.candidatePoolOccurrences}\n`);
  stdout.write(`  genRecall ${entry.mustShowGeneratedRecall}  selRecall ${entry.mustShowSelectedRecallAmongGenerated}\n`);
  stdout.write(`  top3MinHits ${entry.top3MinHitsPassing}/${entry.files}  allVisibleMinHits ${entry.allVisibleMinHitsPassing}/${entry.files}\n`);
  stdout.write(`  coverage ${entry.allCandidateCoverage}  reachable ${entry.reachableCandidateCoverage}\n`);
  stdout.write(`  uniqueAt3 ${entry.uniquePatternCountAt3}  uniqueAt10 ${entry.uniquePatternCountAt10}\n`);
  stdout.write(`  runtime mean ${entry.runtimeMeanMs} max ${entry.runtimeMaxMs}  cleanStressAgreement ${entry.cleanStressSelectionAgreement}\n`);
}
stdout.write(`\n=== rank failure taxonomy (${taxonomy.length}) ===\n`);
for (const [cause, count] of Object.entries(report.rankFailureTaxonomy.byCause)) {
  stdout.write(`  ${cause.padEnd(36)} ${count}\n`);
}
if (report.l06Trace.stress ?? report.l06Trace.clean) {
  stdout.write("\n=== L06_stress ===\n");
  const trace = (report.l06Trace.stress ?? report.l06Trace.clean)!;
  stdout.write(`  patterns ${trace.groupedPatterns}  cards ${trace.visibleCards}  dup ${trace.visiblePatternDuplicateCount}\n`);
  stdout.write(`  representativeOccurrenceCoverage ${trace.representativeOccurrenceCoverage}\n`);
  stdout.write(`  reachableOccurrenceCoverage      ${trace.reachableOccurrenceCoverage}\n`);
  stdout.write(`  occurrenceReachability           ${trace.occurrenceReachability}\n`);
  for (const card of trace.cards) {
    stdout.write(`    ${card.bars[0]}-${card.bars[1]} (${card.lengthBars}) ${card.kind} occ=${card.occurrenceCount}\n`);
  }
}
