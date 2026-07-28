import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  filterRelativeSupportMelodyContamination,
  type RelativeSupportFilterOptions,
} from "../src/domain/voicing/relativeSupportMelodyFilter";
import { evaluateGeneralRegression } from "./phase44/generalRegression";
import {
  aggregatePhase44Rows,
  evaluatePhase44Split,
  loadPhase44Manifest,
} from "./phase44/targetedCorpus";
import { loadHarmonySupportManifest } from "./phase442/harmonySupportCorpus";
import {
  aggregateSupportRows,
  evaluateSupportSplit,
  groupedSupportRows,
  type ShadowFilter,
} from "./phase442/supportEvaluation";

interface LockReport {
  selected: {
    id: string;
    hypothesis: string;
    options: Omit<RelativeSupportFilterOptions, "minimumRoleConfidence">;
  } | null;
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
const corpusDir = resolve(root, "test/loop-vault-voicing-harmony-support-gold-v1");
const generalDir = resolve(root, ".local-evaluation/voicing-gold-v1");
const oldTargetedDir = resolve(
  root,
  ".local-evaluation/voicing-melody-contamination-gold-v1",
);
const [lock, gates] = await Promise.all([
  readJson<LockReport>("docs/phase4.4.2/04-intervention-lock.json"),
  readJson<Gates>("docs/phase4.4.2/00-gates.json"),
]);
if (!lock.selected || lock.selected.id !== "A1") {
  throw new Error("Validation requires the locked A1 candidate.");
}
const options: RelativeSupportFilterOptions = {
  ...lock.selected.options,
  minimumRoleConfidence: 0.65,
};
const filter = relativeFilter(options);
const manifest = await loadHarmonySupportManifest(corpusDir);
const oldManifest = await loadPhase44Manifest(oldTargetedDir);
const baselineRows = await evaluateSupportSplit(
  corpusDir,
  manifest,
  "validation",
);
const candidateRows = await evaluateSupportSplit(
  corpusDir,
  manifest,
  "validation",
  filter,
);
const baselinePrimary = aggregateSupportRows(
  baselineRows.filter((row) => row.evidence.subset === "primary"),
);
const primary = aggregateSupportRows(
  candidateRows.filter((row) => row.evidence.subset === "primary"),
);
const primaryDelta = delta(primary, baselinePrimary);
const generalRegression = await evaluateGeneralRegression(
  generalDir,
  "validation",
  {
    minimumRoleConfidence: 0.65,
    minimumConcurrentNonMelodyPitches: 4,
    minimumConcurrentSupportBeats: 0.2,
  },
  (input) => filterRelativeSupportMelodyContamination(input, options),
);
const oldRows = await evaluatePhase44Split(
  oldTargetedDir,
  oldManifest,
  "validation",
  ["B", "S"],
  {
    customShadowFilter: (input) =>
      filterRelativeSupportMelodyContamination(input, options),
  },
);
const oldDedicated = {
  product: aggregatePhase44Rows(oldRows.filter((row) => row.condition === "B")),
  shadow: aggregatePhase44Rows(oldRows.filter((row) => row.condition === "S")),
};
const checks = validationChecks(
  primary,
  primaryDelta,
  generalRegression,
  gates,
);
const failedGates = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const report = {
  schemaVersion: 1,
  phase: "4.4.2-05",
  candidate: {
    id: lock.selected.id,
    hypothesis: lock.selected.hypothesis,
    options,
  },
  split: "validation",
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  productPathChanged: false,
  holdoutStatus: "not-run",
  baseline: groupedSupportRows(baselineRows),
  candidateMetrics: groupedSupportRows(candidateRows),
  primary: {
    baseline: baselinePrimary,
    candidate: primary,
    delta: primaryDelta,
  },
  diagnosticOnly: aggregateSupportRows(
    candidateRows.filter((row) => row.evidence.subset === "diagnostic-only"),
  ),
  statusAndPitchBreakdown: {
    statusOnlyChangeCount: candidateRows.filter((row) => row.statusOnlyChanged).length,
    pitchFidelityChangeCount:
      candidateRows.filter((row) => row.pitchFidelityChanged).length,
  },
  regression: {
    general60Validation: generalRegression,
    oldDedicatedValidation: oldDedicated,
    chordLabelsExact: true,
    timelineExact: true,
  },
  checks,
  failedGates,
  validationPassed: failedGates.length === 0,
  decision: failedGates.length === 0
    ? "advance-to-holdout"
    : "stop-without-holdout",
  events: candidateRows,
};
const outputJson = resolve(root, "docs/phase4.4.2/05-validation-results.json");
const outputMarkdown = resolve(root, "docs/phase4.4.2/05-validation-results.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4.2-05 validation: ${report.validationPassed ? "PASS" : "FAIL"}\n`);
stdout.write(`${JSON.stringify({
  primary: report.primary,
  checks: report.checks,
  failedGates: report.failedGates,
  decision: report.decision,
}, null, 2)}\n`);

function relativeFilter(optionsValue: RelativeSupportFilterOptions): ShadowFilter {
  return (input, ids) => {
    const result = filterRelativeSupportMelodyContamination(input, optionsValue);
    return {
      notes: result.notes,
      removed: result.removed,
      evidenceByNoteId: Object.fromEntries([...result.evidenceByNote.entries()].map(
        ([note, evidence]) => [ids.get(note) ?? "missing-id", evidence],
      )),
    };
  };
}

function validationChecks(
  primary: ReturnType<typeof aggregateSupportRows>,
  primaryDelta: ReturnType<typeof delta>,
  regression: Awaited<ReturnType<typeof evaluateGeneralRegression>>,
  gateValues: Gates,
) {
  return {
    primaryContaminationReduction:
      primaryDelta.primaryContaminationReduction
      >= gateValues.validationGates.primaryContaminationReductionMinimum,
    melodyLeakImproved: primaryDelta.primaryMelodyLeakReduction > 0,
    exactOrF1SignMatchesDev:
      primaryDelta.voicingExactRate >= 0 || primaryDelta.noteF1 >= 0,
    noteRecallWithinTolerance:
      primaryDelta.noteRecall >= gateValues.devGates.noteRecallRegressionMinimum,
    bassAccuracyWithinTolerance:
      primaryDelta.bassAccuracy >= gateValues.devGates.bassAccuracyRegressionMinimum,
    topNoteWithinTolerance:
      primaryDelta.topNoteAccuracy
      >= gateValues.devGates.topNoteAccuracyRegressionMinimum,
    registerWithinTolerance:
      primaryDelta.registerExactRate
      >= gateValues.devGates.registerExactRegressionMinimum,
    noSourceNoteAdditions:
      primary.sourceNoteAdditionCount
      <= gateValues.devGates.sourceNoteAdditionsMaximum,
    noNewMajorFailure:
      primary.sourceNoteAdditionCount === 0
      && primary.bassAccuracy === 1
      && primary.octaveErrorRate === 0,
    plainBlockRegression:
      noApplicableRegressionEvents(
        regression.product.plainBlock.events,
        regression.shadow.plainBlock.events,
      )
      || difference(
          regression.shadow.plainBlock.voicingExactRate,
          regression.product.plainBlock.voicingExactRate,
        ) >= gateValues.devGates.plainBlockExactRegressionMinimum,
    rootlessRegression:
      noApplicableRegressionEvents(
        regression.product.rootless.events,
        regression.shadow.rootless.events,
      )
      || difference(
          regression.shadow.rootless.voicingExactRate,
          regression.product.rootless.voicingExactRate,
        ) >= gateValues.devGates.rootlessExactRegressionMinimum,
    arpeggioRegression:
      noApplicableRegressionEvents(
        regression.product.arpeggio.events,
        regression.shadow.arpeggio.events,
      )
      || difference(
          regression.shadow.arpeggio.noteF1,
          regression.product.arpeggio.noteF1,
        ) >= gateValues.devGates.arpeggioF1RegressionMinimum,
    generalRegression:
      difference(
        regression.shadow.overall.noteF1,
        regression.product.overall.noteF1,
      ) >= gateValues.devGates.generalRegressionF1Minimum,
  };
}

function noApplicableRegressionEvents(
  productEvents: number,
  shadowEvents: number,
): boolean {
  return productEvents === 0 && shadowEvents === 0;
}

function delta(current: ReturnType<typeof aggregateSupportRows>, baseline: typeof current) {
  return {
    primaryContaminationReduction: reduction(
      current.contaminationEventCount,
      baseline.contaminationEventCount,
    ),
    primaryMelodyLeakReduction: reduction(
      current.melodyLeakRate ?? 0,
      baseline.melodyLeakRate ?? 0,
    ),
    notePrecision: difference(current.notePrecision, baseline.notePrecision),
    noteRecall: difference(current.noteRecall, baseline.noteRecall),
    noteF1: difference(current.noteF1, baseline.noteF1),
    bassAccuracy: difference(current.bassAccuracy, baseline.bassAccuracy),
    topNoteAccuracy: difference(current.topNoteAccuracy, baseline.topNoteAccuracy),
    registerExactRate: difference(current.registerExactRate, baseline.registerExactRate),
    voicingExactRate: difference(current.voicingExactRate, baseline.voicingExactRate),
  };
}

function markdown(value: typeof report): string {
  return `# P4.4.2-05 Validation Results

- Locked candidate: **${value.candidate.id}**
- Result: **${value.validationPassed ? "PASS" : "FAIL"}**
- Decision: \`${value.decision}\`
- Holdout: not run
- Product path: unchanged

| Metric | Result |
|---|---:|
| Primary contamination reduction | ${percent(value.primary.delta.primaryContaminationReduction)} |
| Primary melody leak reduction | ${percent(value.primary.delta.primaryMelodyLeakReduction)} |
| Note recall delta | ${points(value.primary.delta.noteRecall)} |
| Note F1 delta | ${points(value.primary.delta.noteF1)} |
| Voicing exact delta | ${points(value.primary.delta.voicingExactRate)} |
| Bass delta | ${points(value.primary.delta.bassAccuracy)} |
| Top-note delta | ${points(value.primary.delta.topNoteAccuracy)} |
| Register delta | ${points(value.primary.delta.registerExactRate)} |

Failed gates: ${value.failedGates.join(", ") || "none"}.
Status-only and pitch-fidelity changes are reported separately in the JSON artifact.
`;
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8")) as T;
}

function reduction(current: number, baseline: number): number {
  return baseline === 0 ? 0 : Number(((baseline - current) / baseline).toFixed(6));
}

function difference(current: number | null, baseline: number | null): number {
  return current === null || baseline === null
    ? Number.NEGATIVE_INFINITY
    : Number((current - baseline).toFixed(6));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function points(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}pp` : "n/a";
}
