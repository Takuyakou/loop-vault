import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  filterCountDurationMelodyContamination,
  type CountDurationFilterOptions,
} from "../src/domain/voicing/countDurationMelodyFilter";
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

const corpusDir = resolve(cwd(), "test/loop-vault-voicing-harmony-support-gold-v1");
const generalDir = resolve(cwd(), ".local-evaluation/voicing-gold-v1");
const oldTargetedDir = resolve(
  cwd(),
  ".local-evaluation/voicing-melody-contamination-gold-v1",
);
const gates = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.4.2/00-gates.json"), "utf8"),
) as {
  hypotheses: {
    countDuration: ((Omit<CountDurationFilterOptions, "minimumRoleConfidence">) & {
      id: string;
    })[];
  };
};
const manifest = await loadHarmonySupportManifest(corpusDir);
const oldManifest = await loadPhase44Manifest(oldTargetedDir);
const baselineRows = await evaluateSupportSplit(corpusDir, manifest, "dev");
const baselinePrimary = aggregateSupportRows(
  baselineRows.filter((row) => row.evidence.subset === "primary"),
);
const candidateResults = [];

for (const registered of gates.hypotheses.countDuration) {
  const options = {
    ...registered,
    minimumRoleConfidence: 0.65,
  };
  const filter = countDurationFilter(options);
  const rows = await evaluateSupportSplit(corpusDir, manifest, "dev", filter);
  const primary = aggregateSupportRows(
    rows.filter((row) => row.evidence.subset === "primary"),
  );
  const generalRegression = await evaluateGeneralRegression(
    generalDir,
    "dev",
    {
      minimumRoleConfidence: 0.65,
      minimumConcurrentNonMelodyPitches: 4,
      minimumConcurrentSupportBeats: 0.2,
    },
    (input) => filterCountDurationMelodyContamination(input, options),
  );
  const oldRows = await evaluatePhase44Split(
    oldTargetedDir,
    oldManifest,
    "dev",
    ["B", "S"],
    {
      customShadowFilter: (input) =>
        filterCountDurationMelodyContamination(input, options),
    },
  );
  candidateResults.push({
    options,
    events: rows,
    metrics: groupedSupportRows(rows),
    primaryBaseline: baselinePrimary,
    primary,
    delta: delta(primary, baselinePrimary),
    regression: {
      general60Dev: generalRegression,
      oldDedicatedDev: {
        product: aggregatePhase44Rows(oldRows.filter((row) => row.condition === "B")),
        shadow: aggregatePhase44Rows(oldRows.filter((row) => row.condition === "S")),
      },
      chordLabelsExact: true,
      timelineExact: true,
    },
  });
}

const report = {
  schemaVersion: 1,
  phase: "4.4.2-03",
  hypothesis: "B-count-duration",
  split: "dev",
  analyzerMode: "phase4-v1",
  fileVersion: 1,
  productPathChanged: false,
  validationStatus: "not-run",
  holdoutStatus: "not-run",
  candidates: candidateResults,
};
const outputJson = resolve(cwd(), "docs/phase4.4.2/03-count-duration-shadow.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4.2/03-count-duration-shadow.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write("P4.4.2-03 Hypothesis B shadow: PASS\n");
stdout.write(`${JSON.stringify(candidateResults.map((candidate) => ({
  id: candidate.options.id,
  delta: candidate.delta,
  primary: candidate.primary,
  generalF1: candidate.regression.general60Dev.shadow.overall.noteF1,
})), null, 2)}\n`);

function countDurationFilter(options: CountDurationFilterOptions): ShadowFilter {
  return (input, ids) => {
    const result = filterCountDurationMelodyContamination(input, options);
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
    noteRecall: difference(current.noteRecall, baseline.noteRecall),
    bassAccuracy: difference(current.bassAccuracy, baseline.bassAccuracy),
    topNoteAccuracy: difference(current.topNoteAccuracy, baseline.topNoteAccuracy),
    registerExactRate: difference(current.registerExactRate, baseline.registerExactRate),
    voicingExactRate: difference(current.voicingExactRate, baseline.voicingExactRate),
    statusOnlyChangeRate: current.statusOnlyChangeRate,
  };
}

function markdown(value: typeof report): string {
  return `# P4.4.2-03 Hypothesis B: Count x Duration

- Evaluated B1/B2/B3 independently on the dev split.
- Gold labels are used only for subset assignment and metrics.
- Bass-role repair and product-path integration are intentionally excluded.
- Validation and holdout were not run.

| ID | Minimum mass | Contamination reduction | Leak reduction | Recall delta | Bass delta | Exact delta | General F1 |
|---|---:|---:|---:|---:|---:|---:|---:|
${value.candidates.map((candidate) =>
    `| ${candidate.options.id} | ${candidate.options.minimumSupportMass} | `
    + `${percent(candidate.delta.primaryContaminationReduction)} | `
    + `${percent(candidate.delta.primaryMelodyLeakReduction)} | `
    + `${points(candidate.delta.noteRecall)} | `
    + `${points(candidate.delta.bassAccuracy)} | `
    + `${points(candidate.delta.voicingExactRate)} | `
    + `${percent(candidate.regression.general60Dev.shadow.overall.noteF1)} |`,
  ).join("\n")}

Detailed event, support-count, duration, texture, subset, and regression metrics are in the JSON report.
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

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}

function points(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}pp` : "n/a";
}
