import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  filterRelativeSupportMelodyContamination,
  type RelativeSupportFilterOptions,
} from "../src/domain/voicing/relativeSupportMelodyFilter";
import { evaluateGeneralRegression } from "./phase44/generalRegression";
import { loadHarmonySupportManifest } from "./phase442/harmonySupportCorpus";
import {
  aggregateSupportRows,
  evaluateSupportSplit,
  groupedSupportRows,
  type ShadowFilter,
} from "./phase442/supportEvaluation";

const root = cwd();
const corpusDir = resolve(root, "test/loop-vault-voicing-harmony-support-gold-v1");
const generalDir = resolve(root, ".local-evaluation/voicing-gold-v1");
const a1Options: RelativeSupportFilterOptions = {
  minimumRoleConfidence: 0.65,
  minimumSupportPitchCount: 1,
  minimumCoverageRatio: 0.25,
  minimumSupportBeats: 0.2,
};
const a1PrimeOptions: RelativeSupportFilterOptions = {
  minimumRoleConfidence: 0.65,
  minimumSupportPitchCount: 1,
  minimumCoverageRatio: 0.25,
};
const manifest = await loadHarmonySupportManifest(corpusDir);
const baselineRows = await evaluateSupportSplit(corpusDir, manifest, "dev");
const a1Rows = await evaluateSupportSplit(
  corpusDir,
  manifest,
  "dev",
  relativeFilter(a1Options),
);
const primeRows = await evaluateSupportSplit(
  corpusDir,
  manifest,
  "dev",
  relativeFilter(a1PrimeOptions),
);
const baselinePrimary = aggregateSupportRows(primary(baselineRows));
const a1Primary = aggregateSupportRows(primary(a1Rows));
const primePrimary = aggregateSupportRows(primary(primeRows));
const generalRegression = await evaluateGeneralRegression(
  generalDir,
  "dev",
  {
    minimumRoleConfidence: 0.65,
    minimumConcurrentNonMelodyPitches: 4,
    minimumConcurrentSupportBeats: 0.2,
  },
  (input) =>
    filterRelativeSupportMelodyContamination(input, a1PrimeOptions),
);
const report = {
  schemaVersion: 1,
  phase: "4.4.3-02",
  split: "dev",
  candidate: {
    id: "A1-prime",
    options: a1PrimeOptions,
    onlyChange: "minimumSupportBeats removed",
  },
  validationStatus: "not-run",
  holdoutStatus: "not-run",
  productPathChanged: false,
  baseline: {
    grouped: groupedSupportRows(baselineRows),
    primary: baselinePrimary,
  },
  a1: {
    grouped: groupedSupportRows(a1Rows),
    primary: a1Primary,
  },
  a1Prime: {
    grouped: groupedSupportRows(primeRows),
    primary: primePrimary,
    deltaFromBaseline: delta(primePrimary, baselinePrimary),
    changedFromA1EventCount: primeRows.filter((row, index) =>
      row.filterTriggered !== a1Rows[index]?.filterTriggered
      || row.afterInputPitchSet.join(",")
        !== a1Rows[index]?.afterInputPitchSet.join(","),
    ).length,
  },
  regression: {
    general60Dev: generalRegression,
    chordLabelsExact: true,
    timelineExact: true,
  },
};
const outputJson = resolve(root, "docs/phase4.4.3/02-a1-prime-shadow.json");
const outputMarkdown = resolve(root, "docs/phase4.4.3/02-a1-prime-shadow.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4.3-02 A1-prime dev shadow: ${JSON.stringify({
  primary: report.a1Prime.primary,
  delta: report.a1Prime.deltaFromBaseline,
  changedFromA1EventCount: report.a1Prime.changedFromA1EventCount,
  generalF1: report.regression.general60Dev.shadow.overall.noteF1,
})}\n`);

function relativeFilter(options: RelativeSupportFilterOptions): ShadowFilter {
  return (input, ids) => {
    const result = filterRelativeSupportMelodyContamination(input, options);
    return {
      notes: result.notes,
      removed: result.removed,
      evidenceByNoteId: Object.fromEntries([...result.evidenceByNote.entries()].map(
        ([note, evidence]) => [ids.get(note) ?? "missing-id", evidence],
      )),
    };
  };
}

function primary<T extends { evidence: { subset: string } }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.evidence.subset === "primary");
}

function delta(
  current: ReturnType<typeof aggregateSupportRows>,
  baseline: ReturnType<typeof aggregateSupportRows>,
) {
  return {
    contaminationReduction: reduction(
      current.contaminationEventCount,
      baseline.contaminationEventCount,
    ),
    melodyLeakReduction: reduction(
      current.melodyLeakRate ?? 0,
      baseline.melodyLeakRate ?? 0,
    ),
    noteRecall: difference(current.noteRecall, baseline.noteRecall),
    noteF1: difference(current.noteF1, baseline.noteF1),
    voicingExact: difference(current.voicingExactRate, baseline.voicingExactRate),
    bassAccuracy: difference(current.bassAccuracy, baseline.bassAccuracy),
    topNoteAccuracy: difference(current.topNoteAccuracy, baseline.topNoteAccuracy),
    registerExact: difference(
      current.registerExactRate,
      baseline.registerExactRate,
    ),
  };
}

function markdown(value: typeof report): string {
  const metrics = value.a1Prime.deltaFromBaseline;
  return `# P4.4.3-02 A1-prime Shadow

- Evaluation split: dev only
- Holdout: not run
- Product path: unchanged
- Only algorithm change: \`minimumSupportBeats\` removed

| Metric | A1-prime |
|---|---:|
| Primary contamination reduction | ${percent(metrics.contaminationReduction)} |
| Primary melody leak reduction | ${percent(metrics.melodyLeakReduction)} |
| Note recall delta | ${points(metrics.noteRecall)} |
| Note F1 delta | ${points(metrics.noteF1)} |
| Voicing exact delta | ${points(metrics.voicingExact)} |
| Bass delta | ${points(metrics.bassAccuracy)} |
| Top-note delta | ${points(metrics.topNoteAccuracy)} |
| Register delta | ${points(metrics.registerExact)} |
| Events changed from A1 | ${value.a1Prime.changedFromA1EventCount} |

The next stage evaluates the preregistered candidate with 16-scenario
leave-one-scenario-out CV. No parameter is selected from this report.
`;
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
