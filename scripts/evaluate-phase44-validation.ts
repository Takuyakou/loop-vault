import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { MelodyContaminationFilterOptions } from "../src/domain/voicing";
import { evaluateGeneralRegression } from "./phase44/generalRegression";
import {
  aggregatePhase44Rows,
  evaluatePhase44Split,
  loadPhase44Manifest,
  type Phase44Aggregate,
  type Phase44EventEvaluation,
} from "./phase44/targetedCorpus";

const targetedDir = resolve(cwd(), ".local-evaluation/voicing-melody-contamination-gold-v1");
const generalDir = resolve(cwd(), ".local-evaluation/voicing-gold-v1");
const devReportPath = resolve(cwd(), "docs/phase4.4/05-dev-results.json");
const outputJson = resolve(cwd(), "docs/phase4.4/06-validation-results.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4/06-validation-results.md");
const devReport = JSON.parse(await readFile(devReportPath, "utf8")) as {
  passed: boolean;
  frozenOptions: MelodyContaminationFilterOptions;
  selected: {
    delta: {
      voicingExactRate: number;
      sourceVoicingUsableRate: number;
    };
  };
};

if (!devReport.passed) {
  throw new Error("P4.4-05 Dev Gate did not pass");
}

const manifest = await loadPhase44Manifest(targetedDir);
const rows = await evaluatePhase44Split(
  targetedDir,
  manifest,
  "validation",
  ["B", "S"],
  { shadowFilterOptions: devReport.frozenOptions },
);
const baselineRows = rows.filter((row) => row.condition === "B");
const shadowRows = rows.filter((row) => row.condition === "S");
const baseline = aggregatePhase44Rows(baselineRows);
const shadow = aggregatePhase44Rows(shadowRows);
const delta = deltaMetrics(shadow, baseline);
const majorFailures = findMajorFailures(baselineRows, shadowRows);
const generalRegression = await evaluateGeneralRegression(
  generalDir,
  "validation",
  devReport.frozenOptions,
);
const gates = {
  contaminationReductionAtLeastQuarter:
    delta.melodyContaminationReduction >= 0.25,
  melodyLeakImproves: delta.melodyLeakRate < 0,
  exactSignMatchesDev:
    sameImprovementDirection(
      delta.voicingExactRate,
      devReport.selected.delta.voicingExactRate,
    ),
  usableSignMatchesDev:
    sameImprovementDirection(
      delta.sourceVoicingUsableRate,
      devReport.selected.delta.sourceVoicingUsableRate,
    ),
  recallRegressionWithinHalfPoint: delta.noteRecall >= -0.005,
  bassNonRegression: delta.bassNoteAccuracy >= 0,
  topRegressionWithinHalfPoint: delta.topNoteAccuracy >= -0.005,
  registerRegressionWithinHalfPoint: delta.registerExactRate >= -0.005,
  noNewMajorFailure: majorFailures.length === 0,
  sourceNoteAdditionsZero: shadow.sourceNoteAdditionCount === 0,
  generalF1RegressionWithinQuarterPoint:
    difference(
      generalRegression.shadow.overall.noteF1,
      generalRegression.product.overall.noteF1,
    ) >= -0.0025,
};
const passed = Object.values(gates).every(Boolean);
const report = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  productPathChanged: false,
  evaluationPolicy: {
    split: "validation",
    run: "single-frozen-evaluation",
    thresholdChangesAfterRun: "prohibited",
    dedicatedHoldoutStatus: passed ? "eligible-not-evaluated" : "blocked-not-evaluated",
  },
  frozenOptions: devReport.frozenOptions,
  baseline,
  shadow,
  delta,
  majorFailures,
  generalRegression,
  gates,
  passed,
};

await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4 frozen validation: ${passed ? "PASS" : "FAIL"}\n`);
stdout.write(`${JSON.stringify({
  frozenOptions: report.frozenOptions,
  baseline,
  shadow,
  delta,
  majorFailures,
  gates,
}, null, 2)}\n`);

function findMajorFailures(
  baselineRows: readonly Phase44EventEvaluation[],
  shadowRows: readonly Phase44EventEvaluation[],
) {
  const baselineByEvent = new Map(
    baselineRows.map((row) => [`${row.fileId}/${row.eventId}`, row]),
  );
  return shadowRows.flatMap((shadowRow) => {
    const key = `${shadowRow.fileId}/${shadowRow.eventId}`;
    const baselineRow = baselineByEvent.get(key);
    if (!baselineRow) throw new Error(`Missing baseline row for ${key}`);
    const regressions = [
      baselineRow.exact && !shadowRow.exact ? "exact" : undefined,
      baselineRow.status === "usable" && shadowRow.status !== "usable"
        ? "usable"
        : undefined,
      baselineRow.bassNoteCorrect && !shadowRow.bassNoteCorrect ? "bass" : undefined,
      baselineRow.topNoteCorrect && !shadowRow.topNoteCorrect ? "top" : undefined,
      baselineRow.registerExact && !shadowRow.registerExact ? "register" : undefined,
    ].filter((value): value is string => value !== undefined);
    return regressions.length === 0
      ? []
      : [{
          key,
          regressions,
          before: baselineRow.predictedNotes,
          after: shadowRow.predictedNotes,
        }];
  });
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
  return `# Phase 4.4 Validation Freeze

P4.4-05で固定した設定を専用Validationへ一度だけ適用した。結果確認後の閾値変更は禁止。

## 固定設定

\`\`\`json
${JSON.stringify(report.frozenOptions, null, 2)}
\`\`\`

| 専用Validation | Product | Shadow | Delta |
|---|---:|---:|---:|
${row("Contamination events", report.baseline.melodyContaminationEventCount, report.shadow.melodyContaminationEventCount, report.delta.melodyContaminationEventCount, false)}
${row("Melody leak", report.baseline.melodyLeakRate, report.shadow.melodyLeakRate, report.delta.melodyLeakRate)}
${row("Exact", report.baseline.voicingExactRate, report.shadow.voicingExactRate, report.delta.voicingExactRate)}
${row("Precision", report.baseline.notePrecision, report.shadow.notePrecision, report.delta.notePrecision)}
${row("Recall", report.baseline.noteRecall, report.shadow.noteRecall, report.delta.noteRecall)}
${row("F1", report.baseline.noteF1, report.shadow.noteF1, report.delta.noteF1)}
${row("Usable", report.baseline.sourceVoicingUsableRate, report.shadow.sourceVoicingUsableRate, report.delta.sourceVoicingUsableRate)}
${row("Bass", report.baseline.bassNoteAccuracy, report.shadow.bassNoteAccuracy, report.delta.bassNoteAccuracy)}
${row("Top", report.baseline.topNoteAccuracy, report.shadow.topNoteAccuracy, report.delta.topNoteAccuracy)}
${row("Register", report.baseline.registerExactRate, report.shadow.registerExactRate, report.delta.registerExactRate)}

- contamination reduction: ${(report.delta.melodyContaminationReduction * 100).toFixed(2)}%
- new major failures: ${report.majorFailures.length}
- dedicated holdout: ${report.evaluationPolicy.dedicatedHoldoutStatus}

## Gate

${Object.entries(report.gates).map(([name, passed]) => `- ${name}: ${passed}`).join("\n")}

- overall: ${report.passed ? "PASS" : "FAIL"}
- chord label / Timeline: 製品経路未接続のため不変
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

function sameImprovementDirection(validation: number, dev: number): boolean {
  if (dev > 0) return validation > 0;
  if (dev < 0) return validation < 0;
  return validation >= 0;
}

function reduction(current: number, baseline: number): number {
  return baseline === 0
    ? current === 0 ? 0 : Number.NEGATIVE_INFINITY
    : (baseline - current) / baseline;
}

function difference(current: number | null, baseline: number | null): number {
  return current === null || baseline === null
    ? Number.NEGATIVE_INFINITY
    : Number((current - baseline).toFixed(6));
}
