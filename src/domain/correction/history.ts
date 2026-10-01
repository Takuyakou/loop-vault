import type { CorrectionModel } from "./correctionModel";
import type { EditKind, EditResult } from "./edits";

/**
 * One undo history for the whole workspace (spec v2.3 §7.4): note edits and card
 * edits alike. Each entry is a model snapshot plus what was done. Playback,
 * scrolling and selection never enter it. 「直した回数」 is the number of entries.
 */

export const HISTORY_LIMIT = 200;

interface Entry {
  model: CorrectionModel;
  label: string;
  kind?: EditKind;
}

export interface CorrectionHistory {
  present: CorrectionModel;
  past: Entry[];
  future: Entry[];
}

export function startHistory(model: CorrectionModel): CorrectionHistory {
  return { present: model, past: [], future: [] };
}

export function commitEdit(history: CorrectionHistory, result: EditResult): CorrectionHistory {
  if (!result.changed) return history;
  const past = [...history.past, { model: history.present, label: result.label, ...(result.kind ? { kind: result.kind } : {}) }];
  return { present: result.model, past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), future: [] };
}

export function undo(history: CorrectionHistory): CorrectionHistory {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;
  return { present: entry.model, past: history.past.slice(0, -1), future: [...history.future, { ...entry, model: history.present }] };
}

export function redo(history: CorrectionHistory): CorrectionHistory {
  const entry = history.future[history.future.length - 1];
  if (!entry) return history;
  return { present: entry.model, past: [...history.past, { ...entry, model: history.present }], future: history.future.slice(0, -1) };
}

export function editCount(history: CorrectionHistory): number {
  return history.past.length;
}

/** Operations in the history by kind; undone ones are not counted (spec v2.5 §13). */
export function editKindCounts(history: CorrectionHistory): Partial<Record<EditKind, number>> {
  const counts: Partial<Record<EditKind, number>> = {};
  for (const entry of history.past) if (entry.kind) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  return counts;
}

export function lastEditLabel(history: CorrectionHistory): string | undefined {
  return history.past[history.past.length - 1]?.label;
}
