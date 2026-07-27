import type { CandidateChordEvent } from "./candidateBlock";
import type {
  CaptureEditHistoryEntry,
  DraftSnapshot,
  ManualCandidateDraft,
  ManualRepairOperation,
} from "./manualDraft";

export const MAX_CAPTURE_EDIT_HISTORY = 64;

export function captureDraftSnapshot(draft: ManualCandidateDraft): DraftSnapshot {
  return {
    selectedRange: { ...draft.selectedRange },
    events: draft.events.map(cloneEvent),
    originalEvents: draft.originalEvents.map(cloneEvent),
    repairOperations: draft.repairOperations.map(cloneOperation),
    isDirty: draft.isDirty,
    snapMode: draft.snapMode,
    lengthBars: draft.lengthBars,
    warnings: [...draft.warnings],
  };
}

export function recordCaptureDraftChange(
  before: ManualCandidateDraft,
  after: ManualCandidateDraft,
  operation: ManualRepairOperation,
  label: string = captureOperationLabel(operation),
): ManualCandidateDraft {
  const branch = before.history.slice(0, before.historyIndex + 1);
  const previousIdParts = branch[branch.length - 1]?.id.split("-") ?? [];
  const sequence = branch.length === 0
    ? before.repairOperations.length
    : Number(previousIdParts[previousIdParts.length - 1]) + 1;
  const entry: CaptureEditHistoryEntry = {
    id: `${before.draftId}-history-${Number.isFinite(sequence) ? sequence : branch.length}`,
    label,
    operation: cloneOperation(operation),
    before: captureDraftSnapshot(before),
    after: captureDraftSnapshot(after),
    // Ordering comes from the array. Reusing the Draft timestamp keeps the
    // domain deterministic and avoids reaching for the clock.
    createdAt: before.createdAt,
  };
  const history = [...branch, entry].slice(-MAX_CAPTURE_EDIT_HISTORY);

  return {
    ...after,
    history,
    historyIndex: history.length - 1,
  };
}

export function canUndoCaptureDraft(draft: ManualCandidateDraft): boolean {
  return draft.historyIndex >= 0;
}

export function canRedoCaptureDraft(draft: ManualCandidateDraft): boolean {
  return draft.historyIndex < draft.history.length - 1;
}

export function undoCaptureDraft(draft: ManualCandidateDraft): ManualCandidateDraft {
  if (!canUndoCaptureDraft(draft)) return draft;
  const entry = draft.history[draft.historyIndex];
  if (entry === undefined) return draft;
  return restoreSnapshot(draft, entry.before, draft.historyIndex - 1);
}

export function redoCaptureDraft(draft: ManualCandidateDraft): ManualCandidateDraft {
  if (!canRedoCaptureDraft(draft)) return draft;
  const nextIndex = draft.historyIndex + 1;
  const entry = draft.history[nextIndex];
  if (entry === undefined) return draft;
  return restoreSnapshot(draft, entry.after, nextIndex);
}

/**
 * `-1` means the state before the first retained operation. Other values point
 * to the state after that history entry.
 */
export function jumpCaptureDraftHistory(
  draft: ManualCandidateDraft,
  historyIndex: number,
): ManualCandidateDraft {
  const clamped = Math.max(-1, Math.min(historyIndex, draft.history.length - 1));
  if (clamped === draft.historyIndex) return draft;
  if (clamped < 0) {
    const first = draft.history[0];
    return first === undefined ? draft : restoreSnapshot(draft, first.before, -1);
  }
  const entry = draft.history[clamped];
  return entry === undefined ? draft : restoreSnapshot(draft, entry.after, clamped);
}

export function captureOperationLabel(operation: ManualRepairOperation): string {
  switch (operation.type) {
    case "create-from-range": return "Create from range";
    case "edit-progression": return "Edit progression";
    case "extend-start": return "Extend range start";
    case "extend-end": return "Extend range end";
    case "trim-start": return "Trim range start";
    case "trim-end": return "Trim range end";
    case "reselect-range": return "Reselect range";
    case "add-chord": return "Add chord";
    case "delete-chord": return "Delete chord";
    case "replace-chord": return "Replace chord";
    case "move-event": return "Move chord";
    case "resize-event": return "Resize chord";
    case "split-event": return "Split chord";
    case "merge-events": return "Merge chords";
    case "change-snap": return "Change snap mode";
    case "undo": return "Undo";
    case "redo": return "Redo";
  }
}

function restoreSnapshot(
  draft: ManualCandidateDraft,
  snapshot: DraftSnapshot,
  historyIndex: number,
): ManualCandidateDraft {
  return {
    ...draft,
    selectedRange: { ...snapshot.selectedRange },
    events: snapshot.events.map(cloneEvent),
    originalEvents: snapshot.originalEvents.map(cloneEvent),
    repairOperations: snapshot.repairOperations.map(cloneOperation),
    isDirty: snapshot.isDirty,
    snapMode: snapshot.snapMode,
    lengthBars: snapshot.lengthBars,
    warnings: [...snapshot.warnings],
    historyIndex,
  };
}

function cloneEvent(event: CandidateChordEvent): CandidateChordEvent {
  return {
    ...event,
    chord: { ...event.chord, tensions: [...event.chord.tensions] },
    warnings: [...event.warnings],
    source: {
      ...event.source,
      chord: {
        ...event.source.chord,
        tensions: [...event.source.chord.tensions],
      },
      alternatives: event.source.alternatives.map((alternative) => ({
        ...alternative,
        chord: {
          ...alternative.chord,
          tensions: [...alternative.chord.tensions],
        },
      })),
      warnings: [...event.source.warnings],
    },
  };
}

function cloneOperation(operation: ManualRepairOperation): ManualRepairOperation {
  if (operation.type === "merge-events") {
    return { ...operation, eventIds: [...operation.eventIds] };
  }
  return { ...operation };
}
