import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { CandidateFunnelRow } from "./phase45/candidateFunnel";
import {
  classifyTop3Miss,
  summarizeMissTaxonomy,
  type TaxonomyContext,
} from "./phase45/missTaxonomy";

interface FunnelReport {
  corpusVersion: string;
  analyzerMode: string;
  split: string;
  missRows: CandidateFunnelRow[];
}

interface Manifest {
  files: Array<{
    fileId: string;
    scenarioId: string;
    scenarioSlug: string;
    variant: "clean" | "stress";
  }>;
}

const funnel = JSON.parse(
  await readFile(resolve(cwd(), "docs/phase4.5/02-candidate-recall-funnel.json"), "utf8"),
) as FunnelReport;
const manifest = JSON.parse(
  await readFile(
    resolve(cwd(), "test/loop-vault-voicing-gold-corpus-v1/manifest.json"),
    "utf8",
  ),
) as Manifest;
const contextByFile = new Map<string, TaxonomyContext>(
  manifest.files.map((file) => [file.fileId, {
    scenarioId: file.scenarioId,
    scenarioSlug: file.scenarioSlug,
    variant: file.variant,
  }]),
);
const rows = funnel.missRows.map((row) =>
  classifyTop3Miss(row, contextByFile.get(row.fileId) ?? {
    scenarioId: "unknown",
    scenarioSlug: "unknown",
    variant: "clean",
  }));
const summary = summarizeMissTaxonomy(rows);
const primaryTotal = Object.values(summary.primaryCounts)
  .reduce((sum, value) => sum + value, 0);
if (primaryTotal !== summary.missCount) {
  throw new Error(`Taxonomy invariant failed: ${primaryTotal} != ${summary.missCount}`);
}

const report = {
  schemaVersion: 1,
  phase: "4.5-03",
  corpusVersion: funnel.corpusVersion,
  analyzerMode: funnel.analyzerMode,
  split: funnel.split,
  metrics: summary,
  gates: {
    allocationEditableShareMinimum: 0.5,
    allocationEditableSharePass: summary.allocationEditableShare >= 0.5,
    ambiguousOrAnnotationMaximum: 0.2,
    ambiguousOrAnnotationPass: summary.ambiguousOrAnnotationShare <= 0.2,
    primaryCountInvariantPass: primaryTotal === summary.missCount,
  },
  byScenario: aggregate(rows, (row) => row.scenarioId),
  byVariant: aggregate(rows, (row) => row.variant),
  byExpectedLabel: aggregate(rows, (row) => row.expected),
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.5/03-top3-miss-taxonomy.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.5/03-top3-miss-taxonomy.md"),
  `# Phase 4.5-03 D3 Top-3 Miss Taxonomy

Top-3 misses: ${summary.missCount}. The primary category is the first pipeline loss. Musical label differences are secondary and may overlap.

## Primary category

${table(summary.primaryCounts)}

Primary total: ${primaryTotal} / ${summary.missCount}.

## Secondary musical differences

${table(summary.secondaryCounts)}

## Decision input

- allocation-editable misses: ${summary.allocationEditableCount} (${percent(summary.allocationEditableShare)}; frozen minimum 50%)
- ambiguous or annotation-contract issues: ${summary.ambiguousOrAnnotationCount} (${percent(summary.ambiguousOrAnnotationShare)}; frozen maximum 20%)
- allocation-editable gate: ${report.gates.allocationEditableSharePass ? "PASS" : "FAIL"}
- ambiguity/annotation gate: ${report.gates.ambiguousOrAnnotationPass ? "PASS" : "FAIL"}

The JSON artifact contains clean/stress, scenario, root, candidate-presence and rank breakdowns for every miss.
`,
  "utf8",
);
stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);

function aggregate<T>(
  rows: readonly T[],
  key: (row: T) => string,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])));
}

function table(counts: Record<string, number>): string {
  return [
    "| Category | Count |",
    "|---|---:|",
    ...Object.entries(counts).map(([category, count]) => `| ${category} | ${count} |`),
  ].join("\n");
}

function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}
