import { cloneSnapshot, snapshotOf } from "./editableProgression";
import type {
  EditableProgression,
  ProgressionEditOperation,
} from "./types";

export const MAX_EDIT_HISTORY = 100;

export function recordEditOperation(
  editable: EditableProgression,
  operation: ProgressionEditOperation,
): EditableProgression {
  const branch = editable.history.slice(0, editable.historyIndex);
  const history = [...branch, cloneOperation(operation)].slice(-MAX_EDIT_HISTORY);
  const after = cloneSnapshot(operation.after);
  return {
    ...editable,
    ...after,
    history,
    historyIndex: history.length,
  };
}

export function undoProgressionEdit(editable: EditableProgression): EditableProgression {
  if (!canUndoProgressionEdit(editable)) {
    return editable;
  }
  const operation = editable.history[editable.historyIndex - 1];
  if (!operation) {
    return editable;
  }
  return {
    ...editable,
    ...cloneSnapshot(operation.before),
    historyIndex: editable.historyIndex - 1,
  };
}

export function redoProgressionEdit(editable: EditableProgression): EditableProgression {
  if (!canRedoProgressionEdit(editable)) {
    return editable;
  }
  const operation = editable.history[editable.historyIndex];
  if (!operation) {
    return editable;
  }
  return {
    ...editable,
    ...cloneSnapshot(operation.after),
    historyIndex: editable.historyIndex + 1,
  };
}

export function canUndoProgressionEdit(editable: EditableProgression): boolean {
  return editable.historyIndex > 0;
}

export function canRedoProgressionEdit(editable: EditableProgression): boolean {
  return editable.historyIndex < editable.history.length;
}

export function operationSnapshots(
  editable: EditableProgression,
  next: Pick<EditableProgression, "slots" | "selectedSlotId">,
) {
  return {
    before: snapshotOf(editable),
    after: cloneSnapshot({
      slots: next.slots,
      ...(next.selectedSlotId ? { selectedSlotId: next.selectedSlotId } : {}),
    }),
  };
}

function cloneOperation(operation: ProgressionEditOperation): ProgressionEditOperation {
  return {
    ...operation,
    before: cloneSnapshot(operation.before),
    after: cloneSnapshot(operation.after),
  };
}

