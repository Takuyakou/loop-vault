import {
  cloneChord,
  cloneSlot,
  positionFromStartBeat,
  slotStartBeat,
} from "./editableProgression";
import { operationSnapshots, recordEditOperation } from "./editHistory";
import type {
  DeleteChordOperation,
  EditableChordSlot,
  EditableProgression,
  InsertChordOperation,
  MergeChordOperation,
  SplitChordOperation,
} from "./types";
import {
  preservesProgressionSpan,
  slotsAreAdjacent,
  validateEditableProgression,
} from "./validation";

const MIN_SPLIT_DURATION = 0.5;

export function insertEditableChordAfter(
  editable: EditableProgression,
  afterSlotId = editable.selectedSlotId,
): EditableProgression {
  if (!afterSlotId) return editable;
  const ordered = [...editable.slots]
    .sort((left, right) => slotStartBeat(left, editable.beatsPerBar) - slotStartBeat(right, editable.beatsPerBar))
    .map(cloneSlot);
  const index = ordered.findIndex((slot) => slot.id === afterSlotId);
  const anchor = ordered[index];
  if (!anchor) return editable;

  const durationBeats = anchor.position.durationBeats;
  const insertionStartBeat = slotStartBeat(anchor, editable.beatsPerBar) + durationBeats;
  const insertedPosition = positionFromStartBeat(insertionStartBeat, editable.beatsPerBar);
  const inserted: EditableChordSlot = {
    id: `${anchor.id}:insert:${editable.historyIndex}`,
    position: { ...insertedPosition, durationBeats },
    originalChord: cloneChord(anchor.currentChord),
    currentChord: cloneChord(anchor.currentChord),
    alternatives: [],
    warnings: [],
    edited: true,
    editSource: "insert",
  };
  const shifted = ordered.slice(index + 1).map((slot) => {
    const position = positionFromStartBeat(
      slotStartBeat(slot, editable.beatsPerBar) + durationBeats,
      editable.beatsPerBar,
    );
    return { ...slot, position: { ...position, durationBeats: slot.position.durationBeats } };
  });
  const slots = [...ordered.slice(0, index + 1), inserted, ...shifted];
  if (validateEditableProgression({ slots, beatsPerBar: editable.beatsPerBar }).length > 0) {
    return editable;
  }
  const next = { slots, selectedSlotId: inserted.id };
  const operation: InsertChordOperation = {
    type: "insert",
    slotId: inserted.id,
    afterSlotId,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function canSplitEditableChord(
  editable: EditableProgression,
  slotId: string,
): boolean {
  const slot = editable.slots.find((candidate) => candidate.id === slotId);
  return Boolean(slot && slot.position.durationBeats >= MIN_SPLIT_DURATION * 2);
}

export function splitEditableChord(
  editable: EditableProgression,
  slotId: string,
): EditableProgression {
  const index = editable.slots.findIndex((slot) => slot.id === slotId);
  const slot = editable.slots[index];
  if (!slot || !canSplitEditableChord(editable, slotId)) {
    return editable;
  }
  const durationBeats = slot.position.durationBeats / 2;
  const rightPosition = positionFromStartBeat(
    slotStartBeat(slot, editable.beatsPerBar) + durationBeats,
    editable.beatsPerBar,
  );
  const suffix = editable.historyIndex;
  const left: EditableChordSlot = {
    ...cloneSlot(slot),
    id: `${slot.id}:left:${suffix}`,
    position: { ...slot.position, durationBeats },
    edited: true,
    editSource: "split",
  };
  const right: EditableChordSlot = {
    ...cloneSlot(slot),
    id: `${slot.id}:right:${suffix}`,
    position: { ...rightPosition, durationBeats },
    edited: true,
    editSource: "split",
  };
  const slots = [
    ...editable.slots.slice(0, index).map(cloneSlot),
    left,
    right,
    ...editable.slots.slice(index + 1).map(cloneSlot),
  ];
  if (!validStructuralChange(editable.slots, slots, editable.beatsPerBar)) {
    return editable;
  }
  const next = { slots, selectedSlotId: left.id };
  const operation: SplitChordOperation = {
    type: "split",
    slotId,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function canMergeEditableChords(
  editable: EditableProgression,
  firstSlotId: string,
  secondSlotId: string,
): boolean {
  const ordered = [...editable.slots].sort(
    (left, right) => slotStartBeat(left, editable.beatsPerBar) - slotStartBeat(right, editable.beatsPerBar),
  );
  const firstIndex = ordered.findIndex((slot) => slot.id === firstSlotId);
  const secondIndex = ordered.findIndex((slot) => slot.id === secondSlotId);
  return firstIndex >= 0
    && secondIndex === firstIndex + 1
    && slotsAreAdjacent(ordered[firstIndex]!, ordered[secondIndex]!, editable.beatsPerBar);
}

export function mergeEditableChords(
  editable: EditableProgression,
  firstSlotId: string,
  secondSlotId: string,
  keep: "first" | "second" = "first",
): EditableProgression {
  if (!canMergeEditableChords(editable, firstSlotId, secondSlotId)) {
    return editable;
  }
  const ordered = [...editable.slots]
    .sort((left, right) => slotStartBeat(left, editable.beatsPerBar) - slotStartBeat(right, editable.beatsPerBar))
    .map(cloneSlot);
  const firstIndex = ordered.findIndex((slot) => slot.id === firstSlotId);
  const first = ordered[firstIndex]!;
  const second = ordered[firstIndex + 1]!;
  const kept = keep === "first" ? first : second;
  const merged: EditableChordSlot = {
    ...cloneSlot(kept),
    id: `${first.id}+${second.id}`,
    position: {
      ...first.position,
      durationBeats: first.position.durationBeats + second.position.durationBeats,
    },
    originalChord: cloneChord(kept.originalChord),
    currentChord: cloneChord(kept.currentChord),
    warnings: [...new Set([...first.warnings, ...second.warnings])],
    edited: true,
    editSource: "merge",
  };
  const slots = [
    ...ordered.slice(0, firstIndex),
    merged,
    ...ordered.slice(firstIndex + 2),
  ];
  if (!validStructuralChange(editable.slots, slots, editable.beatsPerBar)) {
    return editable;
  }
  const next = { slots, selectedSlotId: merged.id };
  const operation: MergeChordOperation = {
    type: "merge",
    slotIds: [firstSlotId, secondSlotId],
    keptSlotId: kept.id,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function deleteEditableChord(
  editable: EditableProgression,
  slotId: string,
): EditableProgression {
  if (editable.slots.length <= 1) {
    return editable;
  }
  const ordered = [...editable.slots]
    .sort((left, right) => slotStartBeat(left, editable.beatsPerBar) - slotStartBeat(right, editable.beatsPerBar))
    .map(cloneSlot);
  const index = ordered.findIndex((slot) => slot.id === slotId);
  const removed = ordered[index];
  if (!removed) {
    return editable;
  }
  const slots = ordered.filter((slot) => slot.id !== slotId);
  const continuationIndex = index === 0 ? 0 : index - 1;
  const continuation = slots[continuationIndex];
  const nextSelection = slots[index] ?? slots[index - 1];
  if (!continuation) {
    return editable;
  }
  if (index === 0) {
    continuation.position = {
      ...removed.position,
      durationBeats: removed.position.durationBeats + continuation.position.durationBeats,
    };
  } else {
    continuation.position = {
      ...continuation.position,
      durationBeats: continuation.position.durationBeats + removed.position.durationBeats,
    };
  }
  continuation.edited = true;
  continuation.editSource = "delete";
  if (!validStructuralChange(editable.slots, slots, editable.beatsPerBar)) {
    return editable;
  }
  const next = { slots, selectedSlotId: nextSelection?.id };
  const operation: DeleteChordOperation = {
    type: "delete",
    slotId,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

function validStructuralChange(
  before: readonly EditableChordSlot[],
  after: readonly EditableChordSlot[],
  beatsPerBar: number,
): boolean {
  return validateEditableProgression({ slots: after, beatsPerBar }).length === 0
    && preservesProgressionSpan(before, after, beatsPerBar);
}

