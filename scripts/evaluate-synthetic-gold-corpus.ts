import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { defaultAnalyzerMode } from "../src/domain/midi/analysis";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";
import {
  evaluateFile, loadCorpus, meanOf, sumOf, VISIBLE_CARD_LIMIT,
  type FileEvaluation, type LossStage,
} from "./syntheticGoldCorpus";

/**
 * Synthetic Gold Corpus v1 driver.
 *
 * Runs one split across several analyzer modes and writes an aggregate JSON plus
 * a failure ledger. Nothing here changes product behaviour: the modes are the
 * ones already selectable, and the corpus and its labels are read only.
 *
 * `--split holdout` is intended to be run once, after the metrics and the report
 * structure are fixed. The gates and the gold labels are not adjusted to it.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusRoot = resolve(cwd(), optionValue("--corpus") ?? ".local-evaluation/synthetic-gold-v1");
const split = optionValue("--split") ?? "dev";
const outputPath = resolve(cwd(), optionValue("--output") ?? `docs/phase4.1.1/synthetic-${split}.json`);
const failuresPath = optionValue("--failures")
  ? resolve(cwd(), optionValue("--failures") as string)
  : undefined;
const requestedModes = (optionValue("--modes") ?? "phase4-v1,phase4.1-v1,current").split(",");

const modes: Array<{ id: string; mode: MidiAnalyzerMode }> = [];
for (const requested of requestedModes) {
  const mode = (requested === "current" ? defaultAnalyzerMode : requested) as MidiAnalyzerMode;
  if (modes.some((entry) => entry.mode === mode)) {
    // `current` resolving to a mode already listed is recorded rather than run
    // twice: a duplicated column would suggest two independent measurements.
    continue;
  }
  modes.push({ id: requested === "current" ? `current (${mode})` : requested, mode });
}

const corpus = loadCorpus(corpusRoot);
const files = corpus.splits[split];
if (!files) throw new Error(`unknown split: ${split}`);

const scenarioOf = new Map<string, { scenarioIndex: number; variantIndex: number }>();
corpus.scenarios.forEach((scenario, scenarioIndex) => {
  scenario.variants.forEach((variant, variantIndex) => {
    scenarioOf.set(variant.fileName, { scenarioIndex, variantIndex });
  });
});

interface ModeResult {
  id: string;
  mode: MidiAnalyzerMode;
  files: FileEvaluation[];
}

const results: ModeResult[] = [];

for (const { id, mode } of modes) {
  const evaluations: FileEvaluation[] = [];
  for (const fileName of files) {
    const position = scenarioOf.get(fileName);
    if (!position) throw new Error(`file not in manifest: ${fileName}`);
    const scenario = corpus.scenarios[position.scenarioIndex];
    const variant = scenario.variants[position.variantIndex];
    const bytes = new Uint8Array(await readFile(resolve(corpusRoot, "midi", fileName)));
    evaluations.push(evaluateFile(bytes, scenario, variant, mode));
  }
  results.push({ id, mode, files: evaluations });
}

function aggregate(evaluations: readonly FileEvaluation[]) {
  const stageCounts = new Map<LossStage, number>();
  const kindCounts = new Map<string, number>();
  for (const evaluation of evaluations) {
    for (const failure of evaluation.failures) {
      stageCounts.set(failure.stage, (stageCounts.get(failure.stage) ?? 0) + 1);
      kindCounts.set(failure.kind, (kindCounts.get(failure.kind) ?? 0) + 1);
    }
  }
  const timelines = evaluations.map((evaluation) => evaluation.timeline);
  const generations = evaluations.map((evaluation) => evaluation.generation);
  const selections = evaluations.map((evaluation) => evaluation.selection);
  const patternUis = evaluations.map((evaluation) => evaluation.patternUi);

  return {
    files: evaluations.length,
    filesWithoutFailure: evaluations.filter((evaluation) => evaluation.failures.length === 0).length,
    timeline: {
      rootAccuracy: meanOf(timelines, "rootAccuracy"),
      rootAccuracyAgainstAnyAcceptable: meanOf(timelines, "rootAccuracyAgainstAnyAcceptable"),
      triadAccuracy: meanOf(timelines, "triadAccuracy"),
      seventhAccuracy: meanOf(timelines, "seventhAccuracy"),
      slashBassAccuracy: meanOf(timelines, "slashBassAccuracy"),
      canonicalExact: meanOf(timelines, "canonicalExact"),
      acceptableAlternativeMatch: meanOf(timelines, "acceptableAlternativeMatch"),
      boundaryMatchWithinTolerance: meanOf(timelines, "boundaryMatchWithinTolerance"),
      averageStartBoundaryErrorBeats: meanOf(timelines, "averageStartBoundaryErrorBeats"),
      averageEndBoundaryErrorBeats: meanOf(timelines, "averageEndBoundaryErrorBeats"),
      goldLabelUnparseable: sumOf(timelines, "goldLabelUnparseable"),
      goldNoChordEvents: sumOf(timelines, "goldNoChordEvents"),
      goldRepeatOnsets: sumOf(timelines, "goldRepeatOnsets"),
    },
    generation: {
      mustShowBlockRecall: meanOf(generations, "mustShowBlockRecall"),
      progressionBlockRecall: meanOf(generations, "progressionBlockRecall"),
      vampBlockRecall: meanOf(generations, "vampBlockRecall"),
      fragmentFalsePromotionRate: meanOf(generations, "fragmentFalsePromotionRate"),
      candidateGenerationLoss: sumOf(generations, "candidateGenerationLoss"),
      classificationAgreement: meanOf(generations, "classificationAgreement"),
    },
    selection: {
      mustShowSelectedRecall: meanOf(selections, "mustShowSelectedRecall"),
      meanSelectedCount: meanOf(selections, "selectedCount"),
      stoppedBecause: Object.fromEntries(
        selections.reduce((counts, selection) => {
          const key = selection.stoppedBecause ?? "ranking-selector";
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return counts;
        }, new Map<string, number>()),
      ),
      mustShowTop3Recall: meanOf(selections, "mustShowTop3Recall"),
      mustShowTop10Recall: meanOf(selections, "mustShowTop10Recall"),
      top3SingleChordCount: sumOf(selections, "top3SingleChordCount"),
      top10SingleChordRate: meanOf(selections, "top10SingleChordRate"),
      top3ProgressionCount: sumOf(selections, "top3ProgressionCount"),
      top10ProgressionRate: meanOf(selections, "top10ProgressionRate"),
      progressionCandidateCoverage: meanOf(selections, "progressionCandidateCoverage"),
      allCandidateCoverage: meanOf(selections, "allCandidateCoverage"),
      longestUncoveredHarmonicRun: Math.max(
        0,
        ...selections.map((selection) => selection.longestUncoveredHarmonicRun),
      ),
      minimumSelectedCandidateScore: Math.min(
        ...selections.map((selection) => selection.minimumSelectedCandidateScore ?? 1),
      ),
      twoBarFragmentsInTop3: sumOf(selections, "twoBarFragmentsInTop3"),
      filesWithVampAheadOfProgression: selections.filter(
        (selection) => selection.vampAheadOfProgression,
      ).length,
    },
    patternUi: {
      visiblePatternDuplicateCount: sumOf(patternUis, "visiblePatternDuplicateCount"),
      visiblePatternDuplicateRate: meanOf(patternUis, "visiblePatternDuplicateRate"),
      visibleSlotWasteCount: sumOf(patternUis, "visibleSlotWasteCount"),
      expectedCardCountMatch: meanOf(patternUis, "expectedCardCountMatch"),
      mergePolicyRespected: meanOf(patternUis, "mergePolicyRespected"),
      occurrenceRecall: meanOf(patternUis, "occurrenceRecall"),
      occurrenceReachability: meanOf(patternUis, "occurrenceReachability"),
      perOccurrenceAbsoluteChordRetention: meanOf(patternUis, "perOccurrenceAbsoluteChordRetention"),
      perOccurrenceVoicingRetention: meanOf(patternUis, "perOccurrenceVoicingRetention"),
    },
    runtime: {
      maxMs: Math.max(...evaluations.map((evaluation) => evaluation.runtimeMs)),
      meanMs: meanOf(
        evaluations.map((evaluation) => ({ runtimeMs: evaluation.runtimeMs })),
        "runtimeMs",
      ),
    },
    failuresByStage: Object.fromEntries([...stageCounts].sort((left, right) => right[1] - left[1])),
    failuresByKind: Object.fromEntries([...kindCounts].sort((left, right) => right[1] - left[1])),
  };
}

/**
 * clean / stress pairs.
 *
 * The generator intends these to differ only in surface encoding, so anything
 * that changes between them is a robustness defect rather than a modelling
 * choice. Reporting the delta separates "we cannot hear this chord" from "we
 * cannot hear this chord when the notes arrive fragmented".
 */
function metamorphicPairs(evaluations: readonly FileEvaluation[]) {
  const byScenario = new Map<string, { clean?: FileEvaluation; stress?: FileEvaluation }>();
  for (const evaluation of evaluations) {
    const entry = byScenario.get(evaluation.scenarioId) ?? {};
    if (evaluation.variant === "clean") entry.clean = evaluation;
    else entry.stress = evaluation;
    byScenario.set(evaluation.scenarioId, entry);
  }
  return [...byScenario]
    .filter(([, entry]) => entry.clean && entry.stress)
    .map(([scenarioId, entry]) => {
      const clean = entry.clean as FileEvaluation;
      const stress = entry.stress as FileEvaluation;
      return {
        scenarioId,
        title: clean.title,
        stressFeatures: clean.stressFeatures,
        timelineDelta: {
          canonicalExact: Number((stress.timeline.canonicalExact - clean.timeline.canonicalExact).toFixed(6)),
          rootAccuracy: Number((stress.timeline.rootAccuracy - clean.timeline.rootAccuracy).toFixed(6)),
          boundaryMatch: Number((stress.timeline.boundaryMatchWithinTolerance
            - clean.timeline.boundaryMatchWithinTolerance).toFixed(6)),
        },
        blockRecallDelta: Number((stress.generation.mustShowBlockRecall
          - clean.generation.mustShowBlockRecall).toFixed(6)),
        selectionDelta: {
          mustShowTop3Recall: Number((stress.selection.mustShowTop3Recall
            - clean.selection.mustShowTop3Recall).toFixed(6)),
          top3ProgressionCount: stress.selection.top3ProgressionCount
            - clean.selection.top3ProgressionCount,
        },
        groupingDelta: {
          mergePolicyRespected: Number((stress.patternUi.mergePolicyRespected
            - clean.patternUi.mergePolicyRespected).toFixed(6)),
          occurrenceRecall: Number((stress.patternUi.occurrenceRecall
            - clean.patternUi.occurrenceRecall).toFixed(6)),
        },
        stressOnlyFailureKinds: stress.failures
          .map((failure) => failure.kind)
          .filter((kind) => !clean.failures.some((failure) => failure.kind === kind)),
      };
    });
}

const report = {
  schemaVersion: 1,
  stage: "P4.1.1 synthetic gold corpus diagnostic",
  split,
  corpus: {
    format: "loop-vault-synthetic-gold-corpus-v1",
    generatorVersion: corpus.generatorVersion,
    ppq: corpus.ppq,
    limitations: corpus.limitations,
    files: files.length,
    // Content fingerprints only; no absolute path and no MIDI bytes.
    scenarios: [...new Set(files.map((file) => scenarioOf.get(file)))].length,
  },
  visibleCardLimit: VISIBLE_CARD_LIMIT,
  // Recorded so a deduplicated column cannot be mistaken for an untested mode.
  currentDefaultAnalyzerMode: defaultAnalyzerMode,
  requestedModes,
  modes: results.map((result) => ({
    id: result.id,
    mode: result.mode,
    summary: aggregate(result.files),
    metamorphic: metamorphicPairs(result.files),
    files: result.files,
  })),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (failuresPath) {
  const lines: string[] = [];
  for (const result of results) {
    for (const evaluation of result.files) {
      for (const failure of evaluation.failures) {
        lines.push(JSON.stringify({
          split,
          mode: result.mode,
          scenarioId: evaluation.scenarioId,
          title: evaluation.title,
          variant: evaluation.variant,
          fingerprint: evaluation.fingerprint,
          stage: failure.stage,
          kind: failure.kind,
          detail: failure.detail,
        }));
      }
    }
  }
  await mkdir(resolve(failuresPath, ".."), { recursive: true });
  if (lines.length > 0) await appendFile(failuresPath, `${lines.join("\n")}\n`, "utf8");
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
stdout.write(`split ${split}: ${files.length} files, modes ${results.map((r) => r.mode).join(", ")}\n\n`);
for (const result of results) {
  const summary = aggregate(result.files);
  stdout.write(`=== ${result.id} ===\n`);
  stdout.write(`clean files ${summary.filesWithoutFailure}/${summary.files}\n`);
  stdout.write(
    `timeline  root ${pct(summary.timeline.rootAccuracy)}`
    + `/${pct(summary.timeline.rootAccuracyAgainstAnyAcceptable)}alt  triad ${pct(summary.timeline.triadAccuracy)}`
    + `  7th ${pct(summary.timeline.seventhAccuracy)}  bass ${pct(summary.timeline.slashBassAccuracy)}`
    + `  exact ${pct(summary.timeline.canonicalExact)}  alt ${pct(summary.timeline.acceptableAlternativeMatch)}`
    + `  boundary ${pct(summary.timeline.boundaryMatchWithinTolerance)}\n`,
  );
  stdout.write(
    `generation  mustShow ${pct(summary.generation.mustShowBlockRecall)}`
    + `  loss ${summary.generation.candidateGenerationLoss}`
    + `  classAgreement ${pct(summary.generation.classificationAgreement)}\n`,
  );
  stdout.write(
    `selection  selRecall ${pct(summary.selection.mustShowSelectedRecall)}`
    + `  meanSel ${summary.selection.meanSelectedCount}`
    + `  top3 ${pct(summary.selection.mustShowTop3Recall)}`
    + `  top10 ${pct(summary.selection.mustShowTop10Recall)}`
    + `  top3Prog ${summary.selection.top3ProgressionCount}`
    + `  top3Vamp ${summary.selection.top3SingleChordCount}`
    + `  2barFrag ${summary.selection.twoBarFragmentsInTop3}`
    + `  allCov ${pct(summary.selection.allCandidateCoverage)}`
    + `  progCov ${pct(summary.selection.progressionCandidateCoverage)}\n`,
  );
  stdout.write(
    `patternUi  dup ${summary.patternUi.visiblePatternDuplicateCount}`
    + `  cardCount ${pct(summary.patternUi.expectedCardCountMatch)}`
    + `  merge ${pct(summary.patternUi.mergePolicyRespected)}`
    + `  occRecall ${pct(summary.patternUi.occurrenceRecall)}`
    + `  occReach ${pct(summary.patternUi.occurrenceReachability)}`
    + `  chords ${pct(summary.patternUi.perOccurrenceAbsoluteChordRetention)}`
    + `  voicing ${pct(summary.patternUi.perOccurrenceVoicingRetention)}\n`,
  );
  stdout.write(`failures by stage: ${JSON.stringify(summary.failuresByStage)}\n`);
  stdout.write(`runtime max ${summary.runtime.maxMs} ms\n\n`);
}
