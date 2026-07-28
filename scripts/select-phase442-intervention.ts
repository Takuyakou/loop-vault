import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";

interface MetricSet {
  voicingExactRate: number;
  noteF1: number;
  sourceNoteAdditionCount: number;
}

interface CandidateReport {
  options: { id: string };
  delta: {
    primaryContaminationReduction: number;
    primaryMelodyLeakReduction: number;
    noteRecall: number;
    bassAccuracy: number;
    topNoteAccuracy: number;
    registerExactRate: number;
    voicingExactRate: number;
    statusOnlyChangeRate: number;
  };
  primary: {
    sourceNoteAdditionCount: number;
  };
  regression: {
    general60Dev: {
      product: {
        overall: MetricSet;
        plainBlock: MetricSet;
        rootless: MetricSet;
        arpeggio: MetricSet;
      };
      shadow: {
        overall: MetricSet;
        plainBlock: MetricSet;
        rootless: MetricSet;
        arpeggio: MetricSet;
      };
    };
    chordLabelsExact: boolean;
    timelineExact: boolean;
  };
}

interface HypothesisReport {
  hypothesis: string;
  candidates: CandidateReport[];
}

interface Gates {
  devSelectionOrder: string[];
  devGates: {
    primaryContaminationReductionMinimum: number;
    primaryMelodyLeakReductionMinimum: number;
    noteRecallRegressionMinimum: number;
    bassAccuracyRegressionMinimum: number;
    topNoteAccuracyRegressionMinimum: number;
    registerExactRegressionMinimum: number;
    plainBlockExactRegressionMinimum: number;
    rootlessExactRegressionMinimum: number;
    arpeggioF1RegressionMinimum: number;
    generalRegressionF1Minimum: number;
    sourceNoteAdditionsMaximum: number;
    chordLabelsExact: boolean;
    timelineExact: boolean;
  };
}

const root = cwd();
const [gates, relative, duration] = await Promise.all([
  readJson<Gates>("docs/phase4.4.2/00-gates.json"),
  readJson<HypothesisReport>(
    "docs/phase4.4.2/02-relative-support-shadow.json",
  ),
  readJson<HypothesisReport>(
    "docs/phase4.4.2/03-count-duration-shadow.json",
  ),
]);
const evaluated = [
  ...relative.candidates.map((candidate) => evaluateCandidate(
    relative.hypothesis,
    candidate,
    gates,
  )),
  ...duration.candidates.map((candidate) => evaluateCandidate(
    duration.hypothesis,
    candidate,
    gates,
  )),
];
const passing = evaluated.filter((candidate) => candidate.passed);
const selected = [...passing].sort(compareCandidates)[0] ?? null;
const report = {
  schemaVersion: 1,
  phase: "4.4.2-04",
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  productPathChanged: false,
  validationStatus: "not-run",
  holdoutStatus: "not-run",
  gatesLocked: true,
  candidates: evaluated,
  selectionOrder: gates.devSelectionOrder,
  tieBreaker: "stable candidate id ascending after registered metrics",
  selected: selected === null
    ? null
    : {
        id: selected.id,
        hypothesis: selected.hypothesis,
        options: selected.options,
      },
  decision: selected === null
    ? "stop-without-promotion"
    : "advance-selected-candidate-to-validation",
};
const outputJson = resolve(root, "docs/phase4.4.2/04-intervention-lock.json");
const outputMarkdown = resolve(root, "docs/phase4.4.2/04-intervention-lock.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4.2-04 selected: ${report.selected?.id ?? "none"}\n`);
stdout.write(`${JSON.stringify(evaluated.map((candidate) => ({
  id: candidate.id,
  passed: candidate.passed,
  failedGates: candidate.failedGates,
  ranking: candidate.ranking,
})), null, 2)}\n`);

function evaluateCandidate(
  hypothesis: string,
  candidate: CandidateReport,
  gates: Gates,
) {
  const regression = candidate.regression.general60Dev;
  const values = {
    primaryContaminationReduction:
      candidate.delta.primaryContaminationReduction,
    primaryMelodyLeakReduction: candidate.delta.primaryMelodyLeakReduction,
    noteRecall: candidate.delta.noteRecall,
    bassAccuracy: candidate.delta.bassAccuracy,
    topNoteAccuracy: candidate.delta.topNoteAccuracy,
    registerExactRate: candidate.delta.registerExactRate,
    plainBlockExact: difference(
      regression.shadow.plainBlock.voicingExactRate,
      regression.product.plainBlock.voicingExactRate,
    ),
    rootlessExact: difference(
      regression.shadow.rootless.voicingExactRate,
      regression.product.rootless.voicingExactRate,
    ),
    arpeggioF1: difference(
      regression.shadow.arpeggio.noteF1,
      regression.product.arpeggio.noteF1,
    ),
    generalRegressionF1: difference(
      regression.shadow.overall.noteF1,
      regression.product.overall.noteF1,
    ),
    sourceNoteAdditions: candidate.primary.sourceNoteAdditionCount
      + regression.shadow.overall.sourceNoteAdditionCount,
    chordLabelsExact: candidate.regression.chordLabelsExact,
    timelineExact: candidate.regression.timelineExact,
  };
  const checks = {
    primaryContaminationReduction:
      values.primaryContaminationReduction
      >= gates.devGates.primaryContaminationReductionMinimum,
    primaryMelodyLeakReduction:
      values.primaryMelodyLeakReduction
      >= gates.devGates.primaryMelodyLeakReductionMinimum,
    noteRecall:
      values.noteRecall >= gates.devGates.noteRecallRegressionMinimum,
    bassAccuracy:
      values.bassAccuracy >= gates.devGates.bassAccuracyRegressionMinimum,
    topNoteAccuracy:
      values.topNoteAccuracy
      >= gates.devGates.topNoteAccuracyRegressionMinimum,
    registerExactRate:
      values.registerExactRate
      >= gates.devGates.registerExactRegressionMinimum,
    plainBlockExact:
      values.plainBlockExact
      >= gates.devGates.plainBlockExactRegressionMinimum,
    rootlessExact:
      values.rootlessExact >= gates.devGates.rootlessExactRegressionMinimum,
    arpeggioF1:
      values.arpeggioF1 >= gates.devGates.arpeggioF1RegressionMinimum,
    generalRegressionF1:
      values.generalRegressionF1
      >= gates.devGates.generalRegressionF1Minimum,
    sourceNoteAdditions:
      values.sourceNoteAdditions
      <= gates.devGates.sourceNoteAdditionsMaximum,
    chordLabelsExact:
      values.chordLabelsExact === gates.devGates.chordLabelsExact,
    timelineExact:
      values.timelineExact === gates.devGates.timelineExact,
  };
  const failedGates = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    id: candidate.options.id,
    hypothesis,
    options: candidate.options,
    values,
    checks,
    passed: failedGates.length === 0,
    failedGates,
    ranking: [
      candidate.delta.primaryContaminationReduction,
      candidate.delta.primaryMelodyLeakReduction,
      candidate.delta.noteRecall,
      candidate.delta.bassAccuracy,
      candidate.delta.voicingExactRate,
      values.generalRegressionF1,
      candidate.delta.statusOnlyChangeRate,
    ],
  };
}

function compareCandidates(
  left: ReturnType<typeof evaluateCandidate>,
  right: ReturnType<typeof evaluateCandidate>,
): number {
  for (let index = 0; index < left.ranking.length; index += 1) {
    const delta = right.ranking[index]! - left.ranking[index]!;
    if (Math.abs(delta) > Number.EPSILON) return delta;
  }
  return left.id.localeCompare(right.id);
}

function markdown(reportValue: typeof report): string {
  return `# P4.4.2-04 Intervention Lock

- Selected candidate: **${reportValue.selected?.id ?? "none"}**
- Decision: \`${reportValue.decision}\`
- Validation: not run
- Holdout: not run
- Product path: unchanged

| Candidate | Hypothesis | Dev Gate | Failed gates | Contamination reduction | Leak reduction | Recall delta | General F1 delta |
|---|---|---|---|---:|---:|---:|---:|
${reportValue.candidates.map((candidate) =>
    `| ${candidate.id} | ${candidate.hypothesis} | `
    + `${candidate.passed ? "PASS" : "FAIL"} | `
    + `${candidate.failedGates.join(", ") || "-"} | `
    + `${percent(candidate.values.primaryContaminationReduction)} | `
    + `${percent(candidate.values.primaryMelodyLeakReduction)} | `
    + `${points(candidate.values.noteRecall)} | `
    + `${points(candidate.values.generalRegressionF1)} |`,
  ).join("\n")}

The registered lexicographic order is used without changing thresholds.
Candidate ID ascending is used only as a deterministic final tie-breaker.
`;
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, relativePath), "utf8")) as T;
}

function difference(current: number, baseline: number): number {
  return Number((current - baseline).toFixed(6));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function points(value: number): string {
  return `${(value * 100).toFixed(2)}pp`;
}
