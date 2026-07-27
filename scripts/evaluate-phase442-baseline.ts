import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  evaluateProductBaseline,
  groupedProductBaseline,
  loadHarmonySupportManifest,
  verifyHarmonySupportCorpus,
  type HarmonySupportManifest,
} from "./phase442/harmonySupportCorpus";

const corpusDir = resolve(
  cwd(),
  "test/loop-vault-voicing-harmony-support-gold-v1",
);
const outputDir = resolve(cwd(), "docs/phase4.4.2");
const manifest = await loadHarmonySupportManifest(corpusDir);
const integrity = await verifyHarmonySupportCorpus(corpusDir, manifest);
if (!integrity.valid) throw new Error("P4.4.2 corpus integrity failed");

const splitRows = Object.fromEntries(await Promise.all(
  (["dev", "validation", "holdout"] as const).map(async (split) => [
    split,
    await evaluateProductBaseline(corpusDir, manifest, split),
  ]),
));
const report = {
  schemaVersion: 1,
  phase: "4.4.2-00",
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  productPathChanged: false,
  improvementEvaluation: {
    dev: "not-run",
    validation: "not-run",
    holdout: "not-run",
  },
  integrity,
  baseline: Object.fromEntries(
    Object.entries(splitRows).map(([split, rows]) => [
      split,
      groupedProductBaseline(rows, manifest),
    ]),
  ),
};
const gates = preregisteredGates();

await write("00-corpus-integrity.md", integrityMarkdown(integrity));
await write("00-baseline.md", baselineMarkdown(report, manifest));
await write("00-baseline.json", `${JSON.stringify(report, null, 2)}\n`);
await write("00-gates.json", `${JSON.stringify(gates, null, 2)}\n`);
stdout.write("P4.4.2-00 corpus integrity and baseline: PASS\n");
stdout.write(`${JSON.stringify({
  integrity,
  dev: report.baseline.dev.overall,
  validation: report.baseline.validation.overall,
  holdout: report.baseline.holdout.overall,
}, null, 2)}\n`);

async function write(name: string, content: string): Promise<void> {
  const path = resolve(outputDir, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function preregisteredGates() {
  return {
    schemaVersion: 1,
    phase: "4.4.2",
    registeredBeforeDevEvaluation: true,
    hypotheses: {
      relativeSupport: [
        {
          id: "A1",
          minimumCoverageRatio: 0.25,
          minimumSupportPitchCount: 1,
          minimumSupportBeats: 0.2,
        },
        {
          id: "A2",
          minimumCoverageRatio: 0.5,
          minimumSupportPitchCount: 1,
          minimumSupportBeats: 0.2,
        },
        {
          id: "A3",
          minimumCoverageRatio: 0.75,
          minimumSupportPitchCount: 1,
          minimumSupportBeats: 0.2,
        },
      ],
      countDuration: [
        {
          id: "B1",
          minimumSupportPitchCount: 1,
          minimumSupportMass: 0.2,
        },
        {
          id: "B2",
          minimumSupportPitchCount: 1,
          minimumSupportMass: 0.4,
        },
        {
          id: "B3",
          minimumSupportPitchCount: 1,
          minimumSupportMass: 0.6,
        },
      ],
    },
    devSelectionOrder: [
      "primaryMelodyContaminationReduction",
      "primaryMelodyLeakReduction",
      "noteRecall",
      "bassAccuracy",
      "voicingExactRate",
      "generalRegressionF1",
      "statusOnlyImprovement",
    ],
    devGates: {
      primaryContaminationReductionMinimum: 0.5,
      primaryMelodyLeakReductionMinimum: 0.5,
      noteRecallRegressionMinimum: -0.005,
      bassAccuracyRegressionMinimum: 0,
      topNoteAccuracyRegressionMinimum: -0.005,
      registerExactRegressionMinimum: -0.005,
      plainBlockExactRegressionMinimum: 0,
      rootlessExactRegressionMinimum: -0.005,
      arpeggioF1RegressionMinimum: -0.005,
      generalRegressionF1Minimum: -0.0025,
      sourceNoteAdditionsMaximum: 0,
      chordLabelsExact: true,
      timelineExact: true,
    },
    validationGates: {
      primaryContaminationReductionMinimum: 0.25,
      melodyLeakMustImprove: true,
      exactOrF1SignMustMatchDev: true,
      noNewMajorFailure: true,
      regressionCorpusMustPass: true,
    },
    holdoutGates: {
      primaryContaminationMustImprove: true,
      melodyLeakMustImprove: true,
      exactAndF1NonRegression: true,
      safetyMetricsWithinDevTolerance: true,
      sourceNoteAdditionsMaximum: 0,
      chordLabelsExact: true,
      timelineExact: true,
    },
    stopConditions: {
      bothHypothesesMissDevGate: "stop-without-promotion",
      validationFailure: "stop-without-holdout",
      holdoutFailure: "stop-without-promotion",
      gateRelaxation: "prohibited",
    },
  };
}

function integrityMarkdown(integrity: typeof report.integrity): string {
  return `# P4.4.2-00 Corpus Integrity

- corpusVersion: \`${integrity.corpusVersion}\`
- valid: **${integrity.valid}**
- files / events / notes: ${integrity.fileCount} / ${integrity.eventCount} / ${integrity.noteCount}
- scenarios / clean-stress pairs: ${integrity.scenarioCount} / ${integrity.cleanStressPairCount}
- split: ${JSON.stringify(integrity.splitCounts)}
- SHA-256 / byteLength: ${integrity.shaMatches} / ${integrity.byteLengthMatches}
- Gold track role / per-note role: ${integrity.goldTrackRoleCount} / ${integrity.goldPerNoteRoleCount}
- Gold voicing / excluded distractor: ${integrity.goldVoicingCount} / ${integrity.excludedDistractorCount}
- support count / duration metadata: ${integrity.supportCountMetadata} / ${integrity.supportDurationMetadata}
- split overlap: ${integrity.splitOverlap.length}
- bad clean/stress pair: ${integrity.badPairs.length}
- MIDIは\`test/*\`の既存ignore配下にあり、Gitへ追加しない
`;
}

function baselineMarkdown(
  baselineReport: typeof report,
  corpusManifest: HarmonySupportManifest,
): string {
  return `# P4.4.2-00 Product Baseline

## Scope

- corpus: \`${corpusManifest.corpusVersion}\`
- Product analyzer: \`phase4-v1\`
- 改善案評価: dev / validation / holdoutすべて未実行
- このStageはProduct baselineだけを測定した

| Split | Events | Contamination | Leak | Exact | Precision | Recall | F1 | Usable | Review | Fallback | Bass | Top | Register |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${(["dev", "validation", "holdout"] as const).map((split) => {
    const metric = baselineReport.baseline[split].overall;
    return `| ${split} | ${metric.events} | ${metric.melodyContaminationEventCount} | `
      + `${percent(metric.melodyLeakRate)} | ${percent(metric.voicingExactRate)} | `
      + `${percent(metric.notePrecision)} | ${percent(metric.noteRecall)} | `
      + `${percent(metric.noteF1)} | ${percent(metric.sourceVoicingUsableRate)} | `
      + `${percent(metric.reviewRate)} | ${percent(metric.generatedFallbackRate)} | `
      + `${percent(metric.bassNoteAccuracy)} | ${percent(metric.topNoteAccuracy)} | `
      + `${percent(metric.registerExactRate)} |`;
  }).join("\n")}

詳細なclean/stress、support count、support duration、texture、subset別指標はJSONへ保存した。

## Safety

- finalPitchSetChangedRate / statusOnlyChangeRate / confidence delta / winner duration deltaはProduct単独baselineのため0
- sourceに存在しないnote追加は各splitで${(["dev", "validation", "holdout"] as const)
    .map((split) => baselineReport.baseline[split].overall.sourceNoteAdditionCount)
    .join(" / ")}
- Analyzer / Timeline / chord label / schema / fileVersionは変更していない
- 旧専用Holdoutの改善評価は実行していない
`;
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}
