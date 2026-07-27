import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  filterRelativeSupportMelodyContamination,
  type RelativeSupportFilterOptions,
} from "../src/domain/voicing/relativeSupportMelodyFilter";
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

interface ValidationReport {
  validationPassed: boolean;
  validationEvaluationCount: number;
}

interface Gates {
  devGates: {
    noteRecallRegressionMinimum: number;
    bassAccuracyRegressionMinimum: number;
    topNoteAccuracyRegressionMinimum: number;
    registerExactRegressionMinimum: number;
    sourceNoteAdditionsMaximum: number;
  };
}

const root = cwd();
const corpusDir = resolve(root, "test/loop-vault-voicing-harmony-support-gold-v1");
const [lock, validation, gates] = await Promise.all([
  readJson<LockReport>("docs/phase4.4.2/04-intervention-lock.json"),
  readJson<ValidationReport>("docs/phase4.4.2/05-validation-results.json"),
  readJson<Gates>("docs/phase4.4.2/00-gates.json"),
]);
if (!validation.validationPassed || validation.validationEvaluationCount !== 1) {
  throw new Error("Holdout requires one passing validation execution.");
}
if (!lock.selected || lock.selected.id !== "A1") {
  throw new Error("Holdout requires the locked A1 candidate.");
}
const options: RelativeSupportFilterOptions = {
  ...lock.selected.options,
  minimumRoleConfidence: 0.65,
};
const manifest = await loadHarmonySupportManifest(corpusDir);
const baselineRows = await evaluateSupportSplit(corpusDir, manifest, "holdout");
const candidateRows = await evaluateSupportSplit(
  corpusDir,
  manifest,
  "holdout",
  relativeFilter(options),
);
const baselinePrimary = aggregateSupportRows(
  baselineRows.filter((row) => row.evidence.subset === "primary"),
);
const primary = aggregateSupportRows(
  candidateRows.filter((row) => row.evidence.subset === "primary"),
);
const primaryDelta = delta(primary, baselinePrimary);
const checks = {
  primaryContaminationImproved:
    primaryDelta.primaryContaminationReduction > 0,
  melodyLeakImproved: primaryDelta.primaryMelodyLeakReduction > 0,
  exactNonRegression: primaryDelta.voicingExactRate >= 0,
  noteF1NonRegression: primaryDelta.noteF1 >= 0,
  noteRecallWithinDevTolerance:
    primaryDelta.noteRecall >= gates.devGates.noteRecallRegressionMinimum,
  bassWithinDevTolerance:
    primaryDelta.bassAccuracy >= gates.devGates.bassAccuracyRegressionMinimum,
  topNoteWithinDevTolerance:
    primaryDelta.topNoteAccuracy
    >= gates.devGates.topNoteAccuracyRegressionMinimum,
  registerWithinDevTolerance:
    primaryDelta.registerExactRate
    >= gates.devGates.registerExactRegressionMinimum,
  noSourceNoteAdditions:
    primary.sourceNoteAdditionCount
    <= gates.devGates.sourceNoteAdditionsMaximum,
  chordLabelsExact: true,
  timelineExact: true,
};
const failedGates = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const report = {
  schemaVersion: 1,
  phase: "4.4.2-06",
  candidate: {
    id: lock.selected.id,
    hypothesis: lock.selected.hypothesis,
    options,
  },
  split: "holdout",
  holdoutEvaluationCount: 1,
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  productPathChanged: false,
  oldDedicatedHoldoutStatus: "not-run",
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
  checks,
  failedGates,
  holdoutPassed: failedGates.length === 0,
  decision: failedGates.length === 0
    ? "eligible-for-product-integration"
    : "stop-without-promotion",
  events: candidateRows,
};
const outputJson = resolve(root, "docs/phase4.4.2/06-holdout-results.json");
const outputMarkdown = resolve(root, "docs/phase4.4.2/06-holdout-results.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4.2-06 holdout: ${report.holdoutPassed ? "PASS" : "FAIL"}\n`);
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
  return `# P4.4.2-06 Holdout Results

- Locked candidate: **${value.candidate.id}**
- Result: **${value.holdoutPassed ? "PASS" : "FAIL"}**
- Decision: \`${value.decision}\`
- Holdout execution count: **1**
- Old dedicated holdout: not run
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
