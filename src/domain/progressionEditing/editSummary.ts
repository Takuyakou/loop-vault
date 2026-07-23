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
  return progressionEditSummary(editable).length > 0
    || editable.history
      .slice(0, editable.historyIndex)
      .some((operation) => operation.type === "voicing-memory")
    || progressionStructureChanged(editable);
}

function progressionStructureChanged(editable: EditableProgression): boolean {
  const baseline = editable.history[0]?.before.slots;
  if (!baseline) return false;
  if (baseline.length !== editable.slots.length) return true;
  return baseline.some((slot, index) => {
    const current = editable.slots[index];
    return !current
      || slot.id !== current.id
      || slot.position.bar !== current.position.bar
      || slot.position.beat !== current.position.beat
      || slot.position.durationBeats !== current.position.durationBeats;
  });
}

