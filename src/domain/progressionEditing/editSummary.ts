import { chordsEqual } from "./chordReplacement";
import type {
  EditableProgression,
  ProgressionEditSummaryItem,
} from "./types";

export function progressionEditSummary(
  editable: EditableProgression,
): ProgressionEditSummaryItem[] {
  return editable.slots.flatMap((slot) => {
    if (!slot.edited && chordsEqual(slot.originalChord, slot.currentChord)) {
      return [];
    }
    return [{
      slotId: slot.id,
      bar: slot.position.bar,
      beat: slot.position.beat,
      original: slot.originalChord.label,
      current: slot.currentChord.label,
      ...(slot.editSource ? { editSource: slot.editSource } : {}),
    }];
  });
}

export function hasProgressionEdits(editable: EditableProgression): boolean {
  return progressionEditSummary(editable).length > 0;
}

