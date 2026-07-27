import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  evaluatePhase44Split,
  groupedPhase44Report,
  loadPhase44Manifest,
  type Phase44Aggregate,
  type Phase44EventEvaluation,
} from "./phase44/targetedCorpus";

const corpusDir = resolve(cwd(), ".local-evaluation/voicing-melody-contamination-gold-v1");
const outputJson = resolve(cwd(), "docs/phase4.4/02-oracle-a-plus.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4/02-oracle-a-plus.md");
const detailsOutput = resolve(cwd(), ".local-evaluation/phase4.4/02-oracle-a-plus-events.json");
const exactGainMinimum = 0.05;
const usableGainMinimum = 0.05;
const manifest = await loadPhase44Manifest(corpusDir);
const splitResults: Record<string, unknown> = {};
const allRows: Phase44EventEvaluation[] = [];

for (const split of ["dev", "validation"] as const) {
  const rows = await evaluatePhase44Split(corpusDir, manifest, split, ["A", "A+", "B"]);
  allRows.push(...rows);
  const grouped = groupedPhase44Report(rows) as Record<
    "A" | "A+" | "B",
    { overall: Phase44Aggregate }
  >;
  const exactGain = delta(
    grouped["A+"].overall.voicingExactRate,
    grouped.A.overall.voicingExactRate,
  );
  const usableGain = delta(
    grouped["A+"].overall.sourceVoicingUsableRate,
    grouped.A.overall.sourceVoicingUsableRate,
  );
  splitResults[split] = {
    metrics: grouped,
    deltas: {
      "A+-A": metricDelta(grouped["A+"].overall, grouped.A.overall),
      "B-A": metricDelta(grouped.B.overall, grouped.A.overall),
    },
    noteFilteringPriority:
      (exactGain ?? Number.NEGATIVE_INFINITY) >= exactGainMinimum
      || (usableGain ?? Number.NEGATIVE_INFINITY) >= usableGainMinimum,
  };
}

const dev = splitResults.dev as { noteFilteringPriority: boolean };
const report = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  dedicatedHoldoutStatus: "not-evaluated",
  oracleContract: {
    A: "Gold boundary + Gold per-voice role + current extraction",
    "A+": "Gold boundary + Gold per-note selection + current extraction",
    B: "Gold boundary + Product per-voice role + current extraction",
    directGoldVoicingReturn: false,
  },
  preRegisteredThresholds: {
    exactGainMinimum,
    usableGainMinimum,
  },
  splits: splitResults,
  decisionSignal: dev.noteFilteringPriority
    ? "event-local-note-filtering"
    : "role-evidence",
};

await mkdir(dirname(outputJson), { recursive: true });
await mkdir(dirname(detailsOutput), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(
  detailsOutput,
  `${JSON.stringify({ schemaVersion: 1, rows: allRows }, null, 2)}\n`,
  "utf8",
);
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4 Oracle A+: decision signal = ${report.decisionSignal}\n`);
stdout.write(`${JSON.stringify(report.splits, null, 2)}\n`);

function metricDelta(current: Phase44Aggregate, baseline: Phase44Aggregate) {
  return {
    voicingExactRate: delta(current.voicingExactRate, baseline.voicingExactRate),
    notePrecision: delta(current.notePrecision, baseline.notePrecision),
    noteRecall: delta(current.noteRecall, baseline.noteRecall),
    noteF1: delta(current.noteF1, baseline.noteF1),
    melodyLeakRate: delta(current.melodyLeakRate, baseline.melodyLeakRate),
    melodyContaminationEventCount:
      current.melodyContaminationEventCount - baseline.melodyContaminationEventCount,
    sourceVoicingUsableRate: delta(
      current.sourceVoicingUsableRate,
      baseline.sourceVoicingUsableRate,
    ),
    generatedFallbackRate: delta(current.generatedFallbackRate, baseline.generatedFallbackRate),
    bassNoteAccuracy: delta(current.bassNoteAccuracy, baseline.bassNoteAccuracy),
    topNoteAccuracy: delta(current.topNoteAccuracy, baseline.topNoteAccuracy),
    registerExactRate: delta(current.registerExactRate, baseline.registerExactRate),
  };
}

function markdown(report: typeof report): string {
  const dev = report.splits.dev as SplitResult;
  const validation = report.splits.validation as SplitResult;
  return `# Phase 4.4 Oracle A+

A+はGold voicingを返さない。Gold per-note roleでsource noteを選別し、その後は現行の
simultaneous / aggregate / register / compatibility / usable経路を使用した。

## 事前閾値

- A+ Exact gain >= 5pt、またはUsable gain >= 5pt: event-local note filteringを優先
- 閾値はA+結果を見る前に\`00-gates.json\`で固定済み

| Split / Condition | Exact | Precision | Recall | F1 | Melody leak | Usable |
|---|---:|---:|---:|---:|---:|---:|
${row("dev A", dev.metrics.A.overall)}
${row("dev A+", dev.metrics["A+"].overall)}
${row("dev B", dev.metrics.B.overall)}
${row("validation A", validation.metrics.A.overall)}
${row("validation A+", validation.metrics["A+"].overall)}
${row("validation B", validation.metrics.B.overall)}

## 差分

| Split | A+−A Exact | A+−A Usable | A+−A Melody leak | B−A Exact | B−A Usable |
|---|---:|---:|---:|---:|---:|
${deltaRow("dev", dev)}
${deltaRow("validation", validation)}

## 判断Signal

\`${report.decisionSignal}\`

このStageは理論上限の測定だけであり、製品コードは変更していない。専用holdoutは
not-evaluated。
`;
}

interface SplitResult {
  metrics: Record<"A" | "A+" | "B", { overall: Phase44Aggregate }>;
  deltas: {
    "A+-A": ReturnType<typeof metricDelta>;
    "B-A": ReturnType<typeof metricDelta>;
  };
}

function row(label: string, metric: Phase44Aggregate): string {
  return `| ${label} | ${percent(metric.voicingExactRate)} | ${percent(metric.notePrecision)} | `
    + `${percent(metric.noteRecall)} | ${percent(metric.noteF1)} | `
    + `${percent(metric.melodyLeakRate)} | ${percent(metric.sourceVoicingUsableRate)} |`;
}

function deltaRow(label: string, result: SplitResult): string {
  return `| ${label} | ${points(result.deltas["A+-A"].voicingExactRate)} | `
    + `${points(result.deltas["A+-A"].sourceVoicingUsableRate)} | `
    + `${points(result.deltas["A+-A"].melodyLeakRate)} | `
    + `${points(result.deltas["B-A"].voicingExactRate)} | `
    + `${points(result.deltas["B-A"].sourceVoicingUsableRate)} |`;
}

function delta(current: number | null, baseline: number | null): number | null {
  return current === null || baseline === null
    ? null
    : Number((current - baseline).toFixed(6));
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}

function points(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}pt`;
}
