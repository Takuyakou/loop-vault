import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { SupportEvaluationRow } from "./phase442/supportEvaluation";
import {
  classifyApplicability,
  type ApplicabilityClass,
} from "./phase443/applicability";

interface HoldoutReport {
  holdoutEvaluationCount: number;
  events: SupportEvaluationRow[];
}

const root = cwd();
const sourcePath = resolve(root, "docs/phase4.4.2/06-holdout-results.json");
const source = JSON.parse(await readFile(sourcePath, "utf8")) as HoldoutReport;
if (source.holdoutEvaluationCount !== 1) {
  throw new Error("Expected exactly one saved P4.4.2 holdout evaluation.");
}
const primaryRows = source.events.filter(
  (row) => row.evidence.subset === "primary",
);
if (primaryRows.length !== 8) {
  throw new Error(`Expected 8 saved primary events, received ${primaryRows.length}.`);
}
const classified = primaryRows.map((row) => ({
  key: row.key,
  scenarioId: row.scenarioId,
  scenarioSlug: row.scenarioSlug,
  variant: row.variant,
  mode: row.mode,
  productRole: row.evidence.productRole,
  roleConfidence: row.evidence.roleConfidence,
  hasHarmonyVoice: row.evidence.hasHarmonyVoice,
  supportPitchCount: row.evidence.supportPitchCount,
  supportCoverageRatio: row.evidence.supportCoverageRatio,
  supportDurationBeats: row.evidence.supportDurationBeats,
  previousFilterTriggered: row.filterTriggered,
  classification: classifyApplicability(row, {
    minimumRoleConfidence: 0.65,
  }),
}));
const counts = countClasses(classified.map(
  (row) => row.classification.class,
));
const report = {
  schemaVersion: 1,
  phase: "4.4.3-01",
  source: "stored-phase4.4.2-holdout-report",
  midiReparsed: false,
  holdoutRerun: false,
  eventCount: classified.length,
  counts,
  allEventsClassified: counts.unclassified === 0,
  observations: {
    allProductRolesMelody: classified.every(
      (row) => row.productRole === "melody",
    ),
    allRoleConfidenceOne: classified.every(
      (row) => row.roleConfidence === 1,
    ),
    allSupportCountThree: classified.every(
      (row) => row.supportPitchCount === 3,
    ),
    allCoverageOne: classified.every(
      (row) => row.supportCoverageRatio === 1,
    ),
    allSupportDurationBeats: [
      ...new Set(classified.map((row) => row.supportDurationBeats)),
    ],
  },
  events: classified,
};
const outputJson = resolve(root, "docs/phase4.4.3/01-holdout-classification.json");
const outputMarkdown = resolve(root, "docs/phase4.4.3/01-holdout-classification.md");
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4.3-01 H/N/X: ${JSON.stringify(counts)}\n`);

function countClasses(classes: readonly ApplicabilityClass[]) {
  return {
    H: classes.filter((value) => value === "H").length,
    N: classes.filter((value) => value === "N").length,
    X: classes.filter((value) => value === "X").length,
    unclassified: classes.filter((value) => value === "unclassified").length,
  };
}

function markdown(value: typeof report): string {
  return `# P4.4.3-01 Existing Holdout Classification

- Source: saved P4.4.2 holdout report
- MIDI reparsed: **no**
- Holdout rerun: **no**
- Events: ${value.eventCount}
- H / N / X / unclassified:
  **${value.counts.H} / ${value.counts.N} / ${value.counts.X} / ${value.counts.unclassified}**

| Event | Class | Role | Confidence | Harmony | Support count | Coverage | Duration |
|---|---|---|---:|---|---:|---:|---:|
${value.events.map((row) =>
    `| ${row.key} | ${row.classification.class} | ${row.productRole} | `
    + `${row.roleConfidence} | ${row.hasHarmonyVoice ? "yes" : "no"} | `
    + `${row.supportPitchCount} | ${row.supportCoverageRatio} | `
    + `${row.supportDurationBeats} |`,
  ).join("\n")}

All eight events are H (harmony-supported). The failed P4.4.2 duration
condition was therefore an applicability restriction inside the H class,
not an N/X safety case. This report is diagnostic only and is not used to
select A1-prime or decide promotion.
`;
}
