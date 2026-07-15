import type { ChordSymbol } from "../types";
import { cloneChord, cloneSlot } from "./editableProgression";
import { operationSnapshots, recordEditOperation } from "./editHistory";
import type {
  EditableProgression,
  ProgressionEditSource,
  ReplaceChordOperation,
} from "./types";

type ReplacementSource = Extract<
  ProgressionEditSource,
  "manual-label" | "alternative" | "structure-editor"
>;

export function replaceEditableChord(
  editable: EditableProgression,
  slotId: string,
  chord: ChordSymbol,
  editSource: ReplacementSource,
): EditableProgression {
  const slot = editable.slots.find((candidate) => candidate.id === slotId);
  if (!slot || chordsEqual(slot.currentChord, chord)) {
    return editable;
  }

  const slots = editable.slots.map((candidate) => {
    if (candidate.id !== slotId) {
      return cloneSlot(candidate);
    }
    const currentChord = cloneChord(chord);
    return {
      ...cloneSlot(candidate),
      currentChord,
      edited: !chordsEqual(candidate.originalChord, currentChord),
      editSource,
    };
  });
  const next = { slots, selectedSlotId: slotId };
  const operation: ReplaceChordOperation = {
    type: "replace",
    slotIds: [slotId],
    editSource,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function resetEditableChord(
  editable: EditableProgression,
  slotId: string,
): EditableProgression {
  const slot = editable.slots.find((candidate) => candidate.id === slotId);
  if (!slot || (!slot.edited && chordsEqual(slot.currentChord, slot.originalChord))) {
    return editable;
  }
  const slots = editable.slots.map((candidate) =>
    candidate.id === slotId
      ? {
          ...cloneSlot(candidate),
          currentChord: cloneChord(candidate.originalChord),
          edited: false,
          editSource: "reset" as const,
        }
      : cloneSlot(candidate),
  );
  const next = { slots, selectedSlotId: slotId };
  const operation: ReplaceChordOperation = {
    type: "replace",
    slotIds: [slotId],
    editSource: "reset",
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function resetAllEditableChords(editable: EditableProgression): EditableProgression {
  const changed = editable.slots.filter(
    (slot) => slot.edited || !chordsEqual(slot.currentChord, slot.originalChord),
  );
  if (changed.length === 0) {
    return editable;
  }
  const slots = editable.slots.map((slot) => ({
    ...cloneSlot(slot),
    currentChord: cloneChord(slot.originalChord),
    edited: false,
    editSource: "reset" as const,
  }));
  const next = { slots, selectedSlotId: editable.selectedSlotId };
  const operation: ReplaceChordOperation = {
    type: "replace",
    slotIds: changed.map((slot) => slot.id),
    editSource: "reset",
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function chordsEqual(left: ChordSymbol, right: ChordSymbol): boolean {
  return left.root === right.root
    && left.quality === right.quality
    && left.bass === right.bass
    && left.tensions.length === right.tensions.length
    && left.tensions.every((tension, index) => tension === right.tensions[index]);
}

