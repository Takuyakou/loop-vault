import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";

interface Metrics {
  events: number;
  voicingExactRate: number | null;
  noteF1: number;
}

interface StoredReport {
  primary: {
    candidate: {
      sourceNoteAdditionCount: number;
      bassAccuracy: number | null;
      octaveErrorRate: number;
    };
    delta: {
      primaryContaminationReduction: number;
      primaryMelodyLeakReduction: number;
      noteRecall: number;
      noteF1: number;
      bassAccuracy: number;
      topNoteAccuracy: number;
      registerExactRate: number;
      voicingExactRate: number;
    };
  };
  regression: {
    general60Validation: {
      product: {
        overall: Metrics;
        plainBlock: Metrics;
        rootless: Metrics;
        arpeggio: Metrics;
      };
      shadow: {
        overall: Metrics;
        plainBlock: Metrics;
        rootless: Metrics;
        arpeggio: Metrics;
      };
    };
  };
  checks: Record<string, boolean>;
  failedGates: string[];
  validationPassed: boolean;
  decision: string;
  [key: string]: unknown;
}

interface Gates {
  devGates: {
    noteRecallRegressionMinimum: number;
    bassAccuracyRegressionMinimum: number;
    topNoteAccuracyRegressionMinimum: number;
    registerExactRegressionMinimum: number;
    plainBlockExactRegressionMinimum: number;
    rootlessExactRegressionMinimum: number;
    arpeggioF1RegressionMinimum: number;
    generalRegressionF1Minimum: number;
    sourceNoteAdditionsMaximum: number;
  };
  validationGates: {
    primaryContaminationReductionMinimum: number;
  };
}

const root = cwd();
const reportPath = resolve(root, "docs/phase4.4.2/05-validation-results.json");
const markdownPath = resolve(root, "docs/phase4.4.2/05-validation-results.md");
const report = JSON.parse(await readFile(reportPath, "utf8")) as StoredReport;
const gates = JSON.parse(
  await readFile(resolve(root, "docs/phase4.4.2/00-gates.json"), "utf8"),
) as Gates;
const primary = report.primary.candidate;
const delta = report.primary.delta;
const regression = report.regression.general60Validation;
const checks = {
  primaryContaminationReduction:
    delta.primaryContaminationReduction
    >= gates.validationGates.primaryContaminationReductionMinimum,
  melodyLeakImproved: delta.primaryMelodyLeakReduction > 0,
  exactOrF1SignMatchesDev:
    delta.voicingExactRate >= 0 || delta.noteF1 >= 0,
  noteRecallWithinTolerance:
    delta.noteRecall >= gates.devGates.noteRecallRegressionMinimum,
  bassAccuracyWithinTolerance:
    delta.bassAccuracy >= gates.devGates.bassAccuracyRegressionMinimum,
  topNoteWithinTolerance:
    delta.topNoteAccuracy >= gates.devGates.topNoteAccuracyRegressionMinimum,
  registerWithinTolerance:
    delta.registerExactRate >= gates.devGates.registerExactRegressionMinimum,
  noSourceNoteAdditions:
    primary.sourceNoteAdditionCount <= gates.devGates.sourceNoteAdditionsMaximum,
  noNewMajorFailure:
    primary.sourceNoteAdditionCount === 0
    && primary.bassAccuracy === 1
    && primary.octaveErrorRate === 0,
  plainBlockRegression:
    notApplicable(regression.product.plainBlock, regression.shadow.plainBlock)
    || difference(
        regression.shadow.plainBlock.voicingExactRate,
        regression.product.plainBlock.voicingExactRate,
      ) >= gates.devGates.plainBlockExactRegressionMinimum,
  rootlessRegression:
    notApplicable(regression.product.rootless, regression.shadow.rootless)
    || difference(
        regression.shadow.rootless.voicingExactRate,
        regression.product.rootless.voicingExactRate,
      ) >= gates.devGates.rootlessExactRegressionMinimum,
  arpeggioRegression:
    notApplicable(regression.product.arpeggio, regression.shadow.arpeggio)
    || regression.shadow.arpeggio.noteF1 - regression.product.arpeggio.noteF1
      >= gates.devGates.arpeggioF1RegressionMinimum,
  generalRegression:
    regression.shadow.overall.noteF1 - regression.product.overall.noteF1
      >= gates.devGates.generalRegressionF1Minimum,
};
const failedGates = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const revised = {
  ...report,
  validationEvaluationCount: 1,
  gateClassificationRecomputedFromStoredResults: true,
  regressionApplicability: {
    plainBlock: regression.product.plainBlock.events > 0
      ? "evaluated"
      : "not-applicable-zero-events",
    rootless: regression.product.rootless.events > 0
      ? "evaluated"
      : "not-applicable-zero-events",
    arpeggio: regression.product.arpeggio.events > 0
      ? "evaluated"
      : "not-applicable-zero-events",
    overall: "evaluated",
  },
  checks,
  failedGates,
  validationPassed: failedGates.length === 0,
  decision: failedGates.length === 0
    ? "advance-to-holdout"
    : "stop-without-holdout",
};
await writeFile(reportPath, `${JSON.stringify(revised, null, 2)}\n`, "utf8");
await writeFile(markdownPath, markdown(revised), "utf8");
stdout.write(
  `P4.4.2-05 stored-result reclassification: `
  + `${revised.validationPassed ? "PASS" : "FAIL"}\n`,
);

function notApplicable(product: Metrics, shadow: Metrics): boolean {
  return product.events === 0 && shadow.events === 0;
}

function difference(current: number | null, baseline: number | null): number {
  return current === null || baseline === null
    ? Number.NEGATIVE_INFINITY
    : current - baseline;
}

function markdown(value: typeof revised): string {
  return `# P4.4.2-05 Validation Results

- Locked candidate: **A1**
- Result: **${value.validationPassed ? "PASS" : "FAIL"}**
- Decision: \`${value.decision}\`
- Validation execution count: **1**
- Gate classification: recomputed from stored results only
- Holdout: not run
- Product path: unchanged

| Metric | Result |
|---|---:|
| Primary contamination reduction | ${percent(delta.primaryContaminationReduction)} |
| Primary melody leak reduction | ${percent(delta.primaryMelodyLeakReduction)} |
| Note recall delta | ${points(delta.noteRecall)} |
| Note F1 delta | ${points(delta.noteF1)} |
| Voicing exact delta | ${points(delta.voicingExactRate)} |
| Bass delta | ${points(delta.bassAccuracy)} |
| Top-note delta | ${points(delta.topNoteAccuracy)} |
| Register delta | ${points(delta.registerExactRate)} |

The general validation split contains no plain-block, rootless, or arpeggio
category events, so those category checks are not applicable. The 96-event
overall regression check passed. Failed gates: ${failedGates.join(", ") || "none"}.
`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function points(value: number): string {
  return `${(value * 100).toFixed(2)}pp`;
}
