import type { EditKind } from "./edits";

/**
 * Local edit metrics for the correction workspace (spec v2.5 §13): one row per import.
 * Counts and times only — never a song title, file name, path, note sequence or chord name.
 */

export const METRICS_SCHEMA_VERSION = 1;
export const EDIT_KINDS: readonly EditKind[] = ["exclude", "restore", "add", "delete", "pitch", "merge", "merge-all", "split", "boundary", "name", "reviewed", "tempo", "segment"];

export interface CorrectionMetricsRecord {
  schemaVersion: typeof METRICS_SCHEMA_VERSION;
  /** ISO time the row was written. */
  at: string;
  bars: number;
  cards: number;
  reviewAtStart: number;
  /** Review marks at the last save; null when nothing was saved. */
  reviewAtLastSave: number | null;
  reviewedCards: number;
  /** Operations in the history by kind (undone ones subtracted). */
  edits: Record<EditKind, number>;
  undos: number;
  savedRanges: number;
  secondsToFirstSave: number | null;
  secondsToLastSave: number | null;
  /** Left (another MIDI, another screen, closed) without any save. */
  leftWithoutSave: boolean;
  /** P10.2 §12: times 「最初からやり直す」 was used (written only when used). */
  restarts?: number;
  /** P10.2 addendum 2 §3: saves by kind — a chosen range, the whole song, by section (written when something was saved). */
  savesByKind?: Record<SaveKind, number>;
}

export type SaveKind = "range" | "whole" | "section";

export interface CorrectionMetricsSession {
  startedAtMs: number;
  bars: number;
  cards: number;
  reviewAtStart: number;
  saves: { atMs: number; reviewMarks: number; kind?: SaveKind }[];
  undos: number;
  restarts?: number;
}

export function buildMetricsRecord(session: CorrectionMetricsSession, now: { ms: number; iso: string }, state: {
  reviewedCards: number;
  edits: Partial<Record<EditKind, number>>;
}): CorrectionMetricsRecord {
  const first = session.saves[0];
  const last = session.saves[session.saves.length - 1];
  const seconds = (atMs: number) => Math.round((atMs - session.startedAtMs) / 100) / 10;
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    at: now.iso,
    bars: session.bars,
    cards: session.cards,
    reviewAtStart: session.reviewAtStart,
    reviewAtLastSave: last ? last.reviewMarks : null,
    reviewedCards: state.reviewedCards,
    edits: Object.fromEntries(EDIT_KINDS.map((kind) => [kind, state.edits[kind] ?? 0])) as Record<EditKind, number>,
    undos: session.undos,
    savedRanges: session.saves.length,
    secondsToFirstSave: first ? seconds(first.atMs) : null,
    secondsToLastSave: last ? seconds(last.atMs) : null,
    leftWithoutSave: session.saves.length === 0,
    ...(session.restarts ? { restarts: session.restarts } : {}),
    ...(session.saves.length ? { savesByKind: { range: 0, whole: 0, section: 0, ...countKinds(session.saves) } } : {}),
  };
}

function countKinds(saves: CorrectionMetricsSession["saves"]): Partial<Record<SaveKind, number>> {
  const counts: Partial<Record<SaveKind, number>> = {};
  for (const save of saves) counts[save.kind ?? "range"] = (counts[save.kind ?? "range"] ?? 0) + 1;
  return counts;
}

export const totalEdits = (record: Pick<CorrectionMetricsRecord, "edits">) => EDIT_KINDS.reduce((sum, kind) => sum + (record.edits[kind] ?? 0), 0);

export interface MetricsSummary {
  count: number;
  /** Over the last 20 rows; null when there is nothing to average. */
  recentAverageEdits: number | null;
  recentAverageSecondsToFirstSave: number | null;
}

/** Settings: how many rows, and the averages over the last 20. */
export function summarizeMetrics(records: readonly CorrectionMetricsRecord[]): MetricsSummary {
  const recent = records.slice(-20);
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
  return {
    count: records.length,
    recentAverageEdits: average(recent.map(totalEdits)),
    recentAverageSecondsToFirstSave: average(recent.flatMap((record) => record.secondsToFirstSave === null ? [] : [record.secondsToFirstSave])),
  };
}

/** One JSON object per line; broken or foreign lines are skipped. */
export function parseMetricsJsonl(text: string): CorrectionMetricsRecord[] {
  return text.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const value = JSON.parse(line) as Partial<CorrectionMetricsRecord>;
      return value && value.schemaVersion === METRICS_SCHEMA_VERSION && typeof value.edits === "object" ? [value as CorrectionMetricsRecord] : [];
    } catch {
      return [];
    }
  });
}
