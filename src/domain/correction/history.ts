import type { CorrectionModel } from "./correctionModel";
import type { EditResult } from "./edits";

/**
 * One undo history for the whole workspace (spec v2.3 §7.4): note edits and card
 * edits alike. Each entry is a model snapshot plus what was done. Playback,
 * scrolling and selection never enter it. 「直した回数」 is the number of entries.
 */

export const HISTORY_LIMIT = 200;

interface Entry {
  model: CorrectionModel;
  label: string;
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
  const past = [...history.past, { model: history.present, label: result.label }];
  return { present: result.model, past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), future: [] };
}

export function undo(history: CorrectionHistory): CorrectionHistory {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;
  return { present: entry.model, past: history.past.slice(0, -1), future: [...history.future, { model: history.present, label: entry.label }] };
}

export function redo(history: CorrectionHistory): CorrectionHistory {
  const entry = history.future[history.future.length - 1];
  if (!entry) return history;
  return { present: entry.model, past: [...history.past, { model: history.present, label: entry.label }], future: history.future.slice(0, -1) };
}

export function editCount(history: CorrectionHistory): number {
  return history.past.length;
}

export function lastEditLabel(history: CorrectionHistory): string | undefined {
  return history.past[history.past.length - 1]?.label;
}
