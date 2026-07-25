import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";

/**
 * Rolls the three split reports and the penalty probe into one summary.
 *
 * Kept separate from the evaluation driver so the summary can be rebuilt without
 * re-running any split — in particular without re-running holdout, which is
 * meant to be executed once.
 */

const outputDir = resolve(cwd(), "docs/phase4.1.1");

async function readJson(name: string) {
  return JSON.parse(await readFile(resolve(outputDir, name), "utf8"));
}

const splits = {
  dev: await readJson("synthetic-dev.json"),
  validation: await readJson("synthetic-validation.json"),
  holdout: await readJson("synthetic-holdout.json"),
};
const probe = await readJson("quality-evidence-penalty-probe.json");
const failureLines = (await readFile(resolve(outputDir, "synthetic-failure-cases.jsonl"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const byStage = new Map<string, number>();
const byCluster = new Map<string, number>();
for (const failure of failureLines) {
  byStage.set(failure.stage, (byStage.get(failure.stage) ?? 0) + 1);
  const cluster = `${failure.stage} / ${failure.kind}`;
  byCluster.set(cluster, (byCluster.get(cluster) ?? 0) + 1);
}

const perSplit = Object.fromEntries(
  Object.entries(splits).map(([name, report]) => [
    name,
    Object.fromEntries(report.modes.map((mode: { id: string; summary: unknown }) => [mode.id, mode.summary])),
  ]),
);

const summary = {
  schemaVersion: 1,
  stage: "P4.1.1 synthetic gold corpus diagnostic",
  createdOn: "2026-07-25",
  productCodeChanged: false,
  baseCommit: "309b23d",
  currentDefaultAnalyzerMode: splits.dev.currentDefaultAnalyzerMode,
  corpus: splits.dev.corpus,
  corpusIntegrity: {
    filesInManifest: 48,
    sha256Verified: 48,
    mismatches: 0,
    splits: { dev: 32, validation: 8, holdout: 8 },
  },
  conclusion: {
    primaryLossStage: "selection-objective",
    // Every figure below is read from the split reports, not restated by hand.
    evidence: {
      mustShowBlockRecall: {
        dev: perSplit.dev["phase4.1-v1"].generation.mustShowBlockRecall,
        validation: perSplit.validation["phase4.1-v1"].generation.mustShowBlockRecall,
        holdout: perSplit.holdout["phase4.1-v1"].generation.mustShowBlockRecall,
      },
      mustShowSelectedRecall: {
        dev: perSplit.dev["phase4.1-v1"].selection.mustShowSelectedRecall,
        validation: perSplit.validation["phase4.1-v1"].selection.mustShowSelectedRecall,
        holdout: perSplit.holdout["phase4.1-v1"].selection.mustShowSelectedRecall,
      },
      allCandidateCoverage: {
        dev: perSplit.dev["phase4.1-v1"].selection.allCandidateCoverage,
        validation: perSplit.validation["phase4.1-v1"].selection.allCandidateCoverage,
        holdout: perSplit.holdout["phase4.1-v1"].selection.allCandidateCoverage,
      },
      meanSelectedCount: {
        dev: perSplit.dev["phase4.1-v1"].selection.meanSelectedCount,
        validation: perSplit.validation["phase4.1-v1"].selection.meanSelectedCount,
        holdout: perSplit.holdout["phase4.1-v1"].selection.meanSelectedCount,
      },
    },
    statement: "Expected blocks are generated and then never selected. Coverage saturates while usefulness does not: on validation, allCandidateCoverage is 100% and occurrenceRecall is 0%.",
  },
  failures: {
    total: failureLines.length,
    byStage: Object.fromEntries([...byStage].sort((left, right) => right[1] - left[1])),
    topClusters: [...byCluster]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([cluster, count]) => ({ cluster, count })),
  },
  perSplit,
  qualityEvidencePenaltyProbe: {
    split: probe.split,
    promotedPenalty: probe.promotedPenalty,
    rows: probe.rows.map((row: Record<string, unknown>) => ({
      penalty: row.penalty,
      rootAccuracy: row.rootAccuracy,
      triadAccuracy: row.triadAccuracy,
      seventhAccuracy: row.seventhAccuracy,
      canonicalExact: row.canonicalExact,
    })),
    // The frozen Phase 4.0 record for the real corpus, quoted so the conflict is
    // visible in one place.
    chordDripTuneCorpus: {
      source: "docs/phase4.0/05d-quality-evidence-tune.json",
      scope: "full",
      presenceThreshold: 0.02,
      penalty008: { root: 0.596939, triad: 0.598639 },
      penalty012: { root: 0.489796, triad: 0.529762 },
      note: "The two corpora move in opposite directions at penalty 0.12: synthetic root +4.7pp, Chord Drip root -10.7pp. No single scalar satisfies both.",
    },
  },
  realWorldCrossChecks: {
    endless: {
      fingerprint: "sha256-c153f78e536b23f467196f5ab128a2142f27d68961addbab5f0f293a305fb94b",
      byteLength: 25966,
      source: "docs/phase4.1.1/00-endless-phase4.1-v1.json",
      note: "Top three cards share one pattern; top3ProgressionCount 0 in both modes.",
    },
    suranRemix: {
      fingerprint: "sha256-2790e82d09b52a58efe8806e79d7379f6ec15091930197073ff9095dcee5ea10",
      byteLength: 33055,
      source: "docs/phase4.1.1/00-suran-phase4.1-v1.json",
    },
    chapter3Seed: {
      source: "docs/phase4.0/09-chapter3-seed-evaluation.json",
      phase4: { root: 0.9875, triad: 0.9875, quality: 0.985, canonicalExact: 0.977444 },
    },
    chordDripCorpus: { source: "docs/phase4.0/05d-quality-evidence-tune.json" },
  },
  limitations: [
    "Gold by construction, not an independent transcription.",
    "32 of 48 files are 8 to 32 bars, so the repeat amplification that drives the one-chord failure on a 154-bar song does not reproduce: top3SingleChordCount is 0 on every split.",
    "Difficulty is far below the real corpora: synthetic dev canonicalExact 86.52% against Chord Drip 29.6%.",
    "Stress variants cover an enumerated list of transforms, not the failure modes of real AI-extracted MIDI.",
    "One generator produced both the audio and the labels, so its conventions are in the gold too: the N.C. and repeated-onset conventions required harness corrections.",
    "Holdout is 8 files; the six generation losses all come from one scenario and cannot estimate a rate.",
    "boundaryMatchWithinTolerance cannot see over-merged events; eventCountRatio is proposed to cover that gap.",
  ],
  priorities: [
    { rank: "P1", target: "selection stop condition and objective", failures: 164, files: ["src/domain/midi/coverageSelector.ts"] },
    { rank: "P2", target: "one display slot per pattern", failures: 46, files: ["src/domain/midi/coverageCandidates.ts", "src/components/OccurrenceList.tsx"] },
    { rank: "P3", target: "window length and partial windows", failures: 49, files: ["src/domain/midi/coverageSelector.ts"] },
    { rank: "P4", target: "generation window length set (14/18/20 bars)", failures: 4, files: ["src/domain/midi/occurrence.ts"] },
    { rank: "P5", target: "separate root selection from the quality penalty", failures: 28, files: ["src/domain/midi/qualityEvidence.ts", "src/domain/midi/legacy.ts"] },
    { rank: "P6", target: "event over-merge and over-split", failures: 2, files: ["src/domain/midi/merge.ts", "src/domain/midi/segmentation.ts"] },
  ],
  doNotChange: [
    "scoreBlockQuality repeat / loopFitness weights (Phase 4.0 vamp rescue depends on them)",
    "canonical identity contract in chordIdentity.ts (mergePolicyRespected is 100% on every split)",
    "phase4QualityEvidence.penalty as a standalone bump (Chord Drip root -10.7pp at 0.12)",
    "the Pattern / Occurrence grouping model (occurrenceReachability, mergePolicyRespected and voicing retention are all 100%)",
    "attachSourceVoicing (100% on every split)",
    "gold labels and boundaryToleranceBeats",
    "timeline smoothing of consecutive identical chords (boundary 100% assumes it)",
    "the Phase 4.1 coverage gates: add usefulness gates rather than relaxing coverage",
  ],
};

await mkdir(outputDir, { recursive: true });
await writeFile(
  resolve(outputDir, "synthetic-corpus-diagnostic-report.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

stdout.write(`failures ${failureLines.length}\n`);
for (const [stage, count] of [...byStage].sort((left, right) => right[1] - left[1])) {
  stdout.write(`  ${stage.padEnd(26)} ${count}\n`);
}
