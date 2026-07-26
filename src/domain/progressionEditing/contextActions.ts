import { cloneChord, cloneSlot, positionFromStartBeat, slotStartBeat } from "./editableProgression";
import { operationSnapshots, recordEditOperation } from "./editHistory";
import type {
  DeleteChordOperation,
  EditableChordSlot,
  EditableProgression,
  ReplaceChordOperation,
} from "./types";
import { validateEditableProgression } from "./validation";

export type DeleteChordMode =
  | "extend-previous"
  | "extend-next"
  | "close-gap"
  | "replace-no-chord";

export type ChordContextAction =
  | "delete-extend-previous"
  | "delete-extend-next"
  | "delete-close-gap"
  | "replace-no-chord"
  | "split"
  | "merge-keep-left"
  | "merge-keep-right"
  | "cut-range-here";

export function canDeleteEditableChordWithMode(
  editable: EditableProgression,
  slotId: string,
  mode: DeleteChordMode,
): boolean {
  const ordered = orderedSlots(editable);
  const index = ordered.findIndex((slot) => slot.id === slotId);
  if (index < 0) return false;
  if (mode === "replace-no-chord") return ordered[index]?.currentChord.label !== "N.C.";
  if (ordered.length <= 1) return false;
  if (mode === "extend-previous") return index > 0;
  if (mode === "extend-next") return index < ordered.length - 1;
  return true;
}

export function deleteEditableChordWithMode(
  editable: EditableProgression,
  slotId: string,
  mode: DeleteChordMode,
): EditableProgression {
  if (!canDeleteEditableChordWithMode(editable, slotId, mode)) return editable;
  if (mode === "replace-no-chord") return replaceEditableChordWithNoChord(editable, slotId);

  const ordered = orderedSlots(editable);
  const index = ordered.findIndex((slot) => slot.id === slotId);
  const removed = ordered[index]!;
  const duration = removed.position.durationBeats;
  const slots = ordered.filter((slot) => slot.id !== slotId);

  if (mode === "extend-previous") {
    const previous = slots[index - 1]!;
    previous.position.durationBeats += duration;
    previous.edited = true;
    previous.editSource = "delete";
  } else if (mode === "extend-next") {
    const next = slots[index]!;
    next.position = {
      ...removed.position,
      durationBeats: next.position.durationBeats + duration,
    };
    next.edited = true;
    next.editSource = "delete";
  } else {
    for (let cursor = index; cursor < slots.length; cursor += 1) {
      const slot = slots[cursor]!;
      const shifted = slotStartBeat(slot, editable.beatsPerBar) - duration;
      slot.position = {
        ...positionFromStartBeat(shifted, editable.beatsPerBar),
        durationBeats: slot.position.durationBeats,
      };
    }
  }

  if (validateEditableProgression({ slots, beatsPerBar: editable.beatsPerBar }).length > 0) {
    return editable;
  }
  const selectedSlotId = slots[index]?.id ?? slots[index - 1]?.id;
  const next = { slots, selectedSlotId };
  const operation: DeleteChordOperation = {
    type: "delete",
    slotId,
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

export function replaceEditableChordWithNoChord(
  editable: EditableProgression,
  slotId: string,
): EditableProgression {
  const slot = editable.slots.find((candidate) => candidate.id === slotId);
  if (!slot || slot.currentChord.label === "N.C.") return editable;
  const slots = editable.slots.map((candidate) => {
    if (candidate.id !== slotId) return cloneSlot(candidate);
    return {
      ...cloneSlot(candidate),
      currentChord: {
        ...cloneChord(candidate.currentChord),
        label: "N.C.",
        bass: undefined,
        tensions: [],
      },
      alternatives: [],
      warnings: [],
      voicingMemory: undefined,
      edited: true,
      editSource: "manual-label" as const,
      quickCandidateSelection: undefined,
    };
  });
  const next = { slots, selectedSlotId: slotId };
  const operation: ReplaceChordOperation = {
    type: "replace",
    slotIds: [slotId],
    editSource: "manual-label",
    ...operationSnapshots(editable, next),
  };
  return recordEditOperation(editable, operation);
}

function orderedSlots(editable: EditableProgression): EditableChordSlot[] {
  return [...editable.slots]
    .sort(
      (left, right) => slotStartBeat(left, editable.beatsPerBar)
        - slotStartBeat(right, editable.beatsPerBar),
    )
    .map(cloneSlot);
}
