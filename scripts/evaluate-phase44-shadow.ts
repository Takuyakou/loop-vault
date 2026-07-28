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
const outputJson = resolve(cwd(), "docs/phase4.4/04-shadow-report.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4/04-shadow-report.md");
const detailsOutput = resolve(cwd(), ".local-evaluation/phase4.4/04-shadow-events.json");
const filterOptions = {
  minimumRoleConfidence: 0.55,
  minimumConcurrentNonMelodyPitches: 3,
  minimumConcurrentSupportBeats: 0.1,
};
const manifest = await loadPhase44Manifest(corpusDir);
const rows = await evaluatePhase44Split(
  corpusDir,
  manifest,
  "dev",
  ["B", "S"],
  { shadowFilterOptions: filterOptions },
);
const grouped = groupedPhase44Report(rows) as Record<
  "B" | "S",
  { overall: Phase44Aggregate }
>;
const comparisons = compareEvents(rows);
const report = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  productPathChanged: false,
  dedicatedHoldoutStatus: "not-evaluated",
  split: "dev",
  filterOptions,
  baseline: grouped.B,
  shadow: grouped.S,
  delta: metricDelta(grouped.S.overall, grouped.B.overall),
  comparison: {
    eventCount: comparisons.length,
    changedEvents: comparisons.filter((row) => row.changed).length,
    exactImproved: comparisons.filter((row) => row.exactBefore === false && row.exactAfter).length,
    exactRegressed: comparisons.filter((row) => row.exactBefore && row.exactAfter === false).length,
    totalNotesAdded: sum(comparisons.map((row) => row.notesAdded.length)),
    totalNotesRemoved: sum(comparisons.map((row) => row.notesRemoved.length)),
    filterRemovalCount: sum(comparisons.map((row) => row.filteredNoteCount)),
  },
};

await mkdir(dirname(outputJson), { recursive: true });
await mkdir(dirname(detailsOutput), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(
  detailsOutput,
  `${JSON.stringify({ schemaVersion: 1, comparisons }, null, 2)}\n`,
  "utf8",
);
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4 shadow: ${report.comparison.changedEvents} changed events, product unchanged.\n`);
stdout.write(`${JSON.stringify({
  baseline: report.baseline.overall,
  shadow: report.shadow.overall,
  delta: report.delta,
  comparison: report.comparison,
}, null, 2)}\n`);

function compareEvents(rowsToCompare: readonly Phase44EventEvaluation[]) {
  const baseline = rowsToCompare.filter((row) => row.condition === "B");
  const shadow = rowsToCompare.filter((row) => row.condition === "S");
  return baseline.map((before) => {
    const after = shadow.find(
      (candidate) => candidate.fileId === before.fileId && candidate.eventId === before.eventId,
    );
    if (!after) throw new Error(`Missing shadow row ${before.fileId}/${before.eventId}`);
    return {
      fileId: before.fileId,
      eventId: before.eventId,
      scenarioId: before.scenarioId,
      variant: before.variant,
      changed: before.predictedNotes.join(",") !== after.predictedNotes.join(","),
      exactBefore: before.exact,
      exactAfter: after.exact,
      precisionBefore: before.precision,
      precisionAfter: after.precision,
      recallBefore: before.recall,
      recallAfter: after.recall,
      usableBefore: before.status === "usable",
      usableAfter: after.status === "usable",
      notesAdded: after.predictedNotes.filter((note) => !before.predictedNotes.includes(note)),
      notesRemoved: before.predictedNotes.filter((note) => !after.predictedNotes.includes(note)),
      filteredNoteCount: after.filteredNoteCount,
      filterReasons: after.filterReasons,
    };
  });
}

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
    bassNoteAccuracy: delta(current.bassNoteAccuracy, baseline.bassNoteAccuracy),
    topNoteAccuracy: delta(current.topNoteAccuracy, baseline.topNoteAccuracy),
    registerExactRate: delta(current.registerExactRate, baseline.registerExactRate),
    sourceNoteAdditionCount: current.sourceNoteAdditionCount - baseline.sourceNoteAdditionCount,
  };
}

function markdown(report: typeof report): string {
  return `# Phase 4.4 Shadow Report

製品出力は変更していない。ShadowだけがProduct Voice roleに対してevent-local filterを
適用し、その後に現行extractVoicingを呼んだ。

## 初期設定

- role confidence >= ${report.filterOptions.minimumRoleConfidence}
- monophonic Voice
- concurrent non-melody pitches >= ${report.filterOptions.minimumConcurrentNonMelodyPitches}
- concurrent support >= ${report.filterOptions.minimumConcurrentSupportBeats} beat

| Metric | Product | Shadow | Delta |
|---|---:|---:|---:|
${metricRow("Exact", report.baseline.overall.voicingExactRate, report.shadow.overall.voicingExactRate, report.delta.voicingExactRate)}
${metricRow("Precision", report.baseline.overall.notePrecision, report.shadow.overall.notePrecision, report.delta.notePrecision)}
${metricRow("Recall", report.baseline.overall.noteRecall, report.shadow.overall.noteRecall, report.delta.noteRecall)}
${metricRow("F1", report.baseline.overall.noteF1, report.shadow.overall.noteF1, report.delta.noteF1)}
${metricRow("Melody leak", report.baseline.overall.melodyLeakRate, report.shadow.overall.melodyLeakRate, report.delta.melodyLeakRate)}
${metricRow("Usable", report.baseline.overall.sourceVoicingUsableRate, report.shadow.overall.sourceVoicingUsableRate, report.delta.sourceVoicingUsableRate)}

## 変更

- changed events: ${report.comparison.changedEvents}
- exact improved / regressed: ${report.comparison.exactImproved} / ${report.comparison.exactRegressed}
- output notes added / removed: ${report.comparison.totalNotesAdded} / ${report.comparison.totalNotesRemoved}
- sourceに存在しないnote追加: ${report.delta.sourceNoteAdditionCount}
- 専用holdout: not-evaluated

個別の削除理由とevent差分はGit管理外の
\`.local-evaluation/phase4.4/04-shadow-events.json\`へ保存した。
`;
}

function metricRow(
  label: string,
  before: number | null,
  after: number | null,
  difference: number | null,
): string {
  return `| ${label} | ${percent(before)} | ${percent(after)} | ${points(difference)} |`;
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

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
