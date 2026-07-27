import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { MelodyContaminationFilterOptions } from "../src/domain/voicing";
import { evaluateGeneralRegression } from "./phase44/generalRegression";
import {
  aggregatePhase44Rows,
  evaluatePhase44Split,
  loadPhase44Manifest,
  type Phase44Aggregate,
} from "./phase44/targetedCorpus";

const targetedDir = resolve(cwd(), ".local-evaluation/voicing-melody-contamination-gold-v1");
const generalDir = resolve(cwd(), ".local-evaluation/voicing-gold-v1");
const outputJson = resolve(cwd(), "docs/phase4.4/05-dev-results.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4/05-dev-results.md");
const manifest = await loadPhase44Manifest(targetedDir);
const configurations = grid();
const candidates = [];

for (const options of configurations) {
  const rows = await evaluatePhase44Split(
    targetedDir,
    manifest,
    "dev",
    ["B", "S"],
    { shadowFilterOptions: options },
  );
  const baseline = aggregatePhase44Rows(rows.filter((row) => row.condition === "B"));
  const shadow = aggregatePhase44Rows(rows.filter((row) => row.condition === "S"));
  candidates.push({
    options,
    baseline,
    shadow,
    delta: deltaMetrics(shadow, baseline),
    dedicatedGates: dedicatedGates(shadow, baseline),
  });
}

const dedicatedPassing = candidates.filter(
  (candidate) => Object.values(candidate.dedicatedGates).every(Boolean),
);
if (dedicatedPassing.length === 0) {
  const diagnosticOutput = resolve(
    cwd(),
    ".local-evaluation/phase4.4/05-dev-grid-diagnostic.json",
  );
  await mkdir(dirname(diagnosticOutput), { recursive: true });
  await writeFile(
    diagnosticOutput,
    `${JSON.stringify({ schemaVersion: 1, candidates }, null, 2)}\n`,
    "utf8",
  );
  stdout.write(`${JSON.stringify(candidates.map((candidate) => ({
    options: candidate.options,
    delta: candidate.delta,
    failedGates: Object.entries(candidate.dedicatedGates)
      .filter(([, passed]) => !passed)
      .map(([gate]) => gate),
  })), null, 2)}\n`);
  throw new Error("No pre-registered configuration passed the dedicated dev gates");
}
dedicatedPassing.sort(compareCandidates);
const selected = dedicatedPassing[0]!;
const general = await evaluateGeneralRegression(generalDir, "dev", selected.options);
const generalGates = {
  f1RegressionWithinLimit:
    difference(general.shadow.overall.noteF1, general.product.overall.noteF1) >= -0.0025,
  plainBlockExactNonRegression:
    difference(
      general.shadow.plainBlock.voicingExactRate,
      general.product.plainBlock.voicingExactRate,
    ) >= 0,
  sourceNoteAdditionsZero: general.shadow.overall.sourceNoteAdditionCount === 0,
};
const passed = Object.values(generalGates).every(Boolean);
const report = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  productPathChanged: false,
  dedicatedHoldoutStatus: "not-evaluated",
  searchSpace: {
    roleConfidence: [0.45, 0.55, 0.65],
    concurrentNonMelodyPitches: [3, 4],
    concurrentSupportBeats: [0.1, 0.2],
    candidateCount: configurations.length,
  },
  candidateResults: candidates,
  selected,
  generalRegression: general,
  generalGates,
  passed,
  frozenOptions: selected.options,
};

await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4 dev tuning: ${passed ? "PASS" : "FAIL"}\n`);
stdout.write(`${JSON.stringify({
  selected: report.selected,
  general: report.generalRegression,
  generalGates,
}, null, 2)}\n`);

function grid(): MelodyContaminationFilterOptions[] {
  return [0.45, 0.55, 0.65].flatMap((minimumRoleConfidence) =>
    [3, 4].flatMap((minimumConcurrentNonMelodyPitches) =>
      [0.1, 0.2].map((minimumConcurrentSupportBeats) => ({
        minimumRoleConfidence,
        minimumConcurrentNonMelodyPitches,
        minimumConcurrentSupportBeats,
      }))));
}

function dedicatedGates(current: Phase44Aggregate, baseline: Phase44Aggregate) {
  const contaminationReduction = reduction(
    current.melodyContaminationEventCount,
    baseline.melodyContaminationEventCount,
  );
  const leakImprovement = improvement(current.melodyLeakRate, baseline.melodyLeakRate);
  return {
    contaminationReductionAtLeastHalf: contaminationReduction >= 0.5,
    melodyLeakImprovementAtLeastHalf: leakImprovement >= 0.5,
    exactOrUsableGainAtLeastThreePoints:
      difference(current.voicingExactRate, baseline.voicingExactRate) >= 0.03
      || difference(
        current.sourceVoicingUsableRate,
        baseline.sourceVoicingUsableRate,
      ) >= 0.03,
    recallRegressionWithinHalfPoint:
      difference(current.noteRecall, baseline.noteRecall) >= -0.005,
    bassNonRegression:
      difference(current.bassNoteAccuracy, baseline.bassNoteAccuracy) >= 0,
    topRegressionWithinHalfPoint:
      difference(current.topNoteAccuracy, baseline.topNoteAccuracy) >= -0.005,
    registerRegressionWithinHalfPoint:
      difference(current.registerExactRate, baseline.registerExactRate) >= -0.005,
    sourceNoteAdditionsZero: current.sourceNoteAdditionCount === 0,
  };
}

function compareCandidates(
  left: (typeof candidates)[number],
  right: (typeof candidates)[number],
): number {
  return right.delta.melodyContaminationReduction
    - left.delta.melodyContaminationReduction
    || right.shadow.noteF1 - left.shadow.noteF1
    || (right.shadow.voicingExactRate ?? 0) - (left.shadow.voicingExactRate ?? 0)
    || right.options.minimumRoleConfidence - left.options.minimumRoleConfidence
    || right.options.minimumConcurrentNonMelodyPitches
      - left.options.minimumConcurrentNonMelodyPitches
    || right.options.minimumConcurrentSupportBeats
      - left.options.minimumConcurrentSupportBeats;
}

function deltaMetrics(current: Phase44Aggregate, baseline: Phase44Aggregate) {
  return {
    voicingExactRate: difference(current.voicingExactRate, baseline.voicingExactRate),
    notePrecision: difference(current.notePrecision, baseline.notePrecision),
    noteRecall: difference(current.noteRecall, baseline.noteRecall),
    noteF1: difference(current.noteF1, baseline.noteF1),
    melodyLeakRate: difference(current.melodyLeakRate, baseline.melodyLeakRate),
    melodyContaminationEventCount:
      current.melodyContaminationEventCount - baseline.melodyContaminationEventCount,
    melodyContaminationReduction: reduction(
      current.melodyContaminationEventCount,
      baseline.melodyContaminationEventCount,
    ),
    melodyLeakImprovement: improvement(current.melodyLeakRate, baseline.melodyLeakRate),
    sourceVoicingUsableRate: difference(
      current.sourceVoicingUsableRate,
      baseline.sourceVoicingUsableRate,
    ),
    bassNoteAccuracy: difference(current.bassNoteAccuracy, baseline.bassNoteAccuracy),
    topNoteAccuracy: difference(current.topNoteAccuracy, baseline.topNoteAccuracy),
    registerExactRate: difference(current.registerExactRate, baseline.registerExactRate),
  };
}

function markdown(report: typeof report): string {
  const baseline = report.selected.baseline;
  const shadow = report.selected.shadow;
  const general = report.generalRegression;
  return `# Phase 4.4 Dev Results

事前登録した12設定を専用devだけで比較した。validation / holdoutは参照していない。

## 固定設定

\`\`\`json
${JSON.stringify(report.frozenOptions, null, 2)}
\`\`\`

| 専用dev | Product | Shadow | Delta |
|---|---:|---:|---:|
${row("Contamination events", baseline.melodyContaminationEventCount, shadow.melodyContaminationEventCount, report.selected.delta.melodyContaminationEventCount, false)}
${row("Melody leak", baseline.melodyLeakRate, shadow.melodyLeakRate, report.selected.delta.melodyLeakRate)}
${row("Exact", baseline.voicingExactRate, shadow.voicingExactRate, report.selected.delta.voicingExactRate)}
${row("Precision", baseline.notePrecision, shadow.notePrecision, report.selected.delta.notePrecision)}
${row("Recall", baseline.noteRecall, shadow.noteRecall, report.selected.delta.noteRecall)}
${row("F1", baseline.noteF1, shadow.noteF1, report.selected.delta.noteF1)}
${row("Usable", baseline.sourceVoicingUsableRate, shadow.sourceVoicingUsableRate, report.selected.delta.sourceVoicingUsableRate)}
${row("Bass", baseline.bassNoteAccuracy, shadow.bassNoteAccuracy, report.selected.delta.bassNoteAccuracy)}
${row("Top", baseline.topNoteAccuracy, shadow.topNoteAccuracy, report.selected.delta.topNoteAccuracy)}
${row("Register", baseline.registerExactRate, shadow.registerExactRate, report.selected.delta.registerExactRate)}

- contamination reduction: ${(report.selected.delta.melodyContaminationReduction * 100).toFixed(2)}%
- melody leak improvement: ${(report.selected.delta.melodyLeakImprovement * 100).toFixed(2)}%

## 既存60 MIDI dev

| Metric | Product | Shadow | Delta |
|---|---:|---:|---:|
${row("F1", general.product.overall.noteF1, general.shadow.overall.noteF1, difference(general.shadow.overall.noteF1, general.product.overall.noteF1))}
${row("Plain block Exact", general.product.plainBlock.voicingExactRate, general.shadow.plainBlock.voicingExactRate, difference(general.shadow.plainBlock.voicingExactRate, general.product.plainBlock.voicingExactRate))}
${row("Rootless Exact", general.product.rootless.voicingExactRate, general.shadow.rootless.voicingExactRate, difference(general.shadow.rootless.voicingExactRate, general.product.rootless.voicingExactRate))}
${row("Arpeggio Exact", general.product.arpeggio.voicingExactRate, general.shadow.arpeggio.voicingExactRate, difference(general.shadow.arpeggio.voicingExactRate, general.product.arpeggio.voicingExactRate))}

## Gate

- dedicated gates: PASS
- general F1 regression <= 0.25pt: ${report.generalGates.f1RegressionWithinLimit}
- plain block non-regression: ${report.generalGates.plainBlockExactNonRegression}
- sourceにないnote追加0: ${report.generalGates.sourceNoteAdditionsZero}
- overall: ${report.passed ? "PASS" : "FAIL"}
- chord label / Timeline: 製品経路未接続のため不変
- 専用holdout: not-evaluated

この結果で設定をfreezeする。validation後の変更は禁止。
`;
}

function row(
  label: string,
  before: number | null,
  after: number | null,
  delta: number | null,
  asPercent = true,
): string {
  const format = (value: number | null) => value === null
    ? "n/a"
    : asPercent
      ? `${(value * 100).toFixed(2)}%`
      : String(value);
  return `| ${label} | ${format(before)} | ${format(after)} | ${format(delta)} |`;
}

function reduction(current: number, baseline: number): number {
  return baseline === 0 ? (current === 0 ? 0 : Number.NEGATIVE_INFINITY) : (baseline - current) / baseline;
}

function improvement(current: number | null, baseline: number | null): number {
  return current === null || baseline === null || baseline === 0
    ? 0
    : (baseline - current) / baseline;
}

function difference(current: number | null, baseline: number | null): number {
  return current === null || baseline === null
    ? Number.NEGATIVE_INFINITY
    : Number((current - baseline).toFixed(6));
}
