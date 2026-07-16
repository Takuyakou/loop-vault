import { slotStartBeat } from "./editableProgression";
import type { EditableChordSlot } from "./types";

const EPSILON = 0.000_001;

export function validateEditableProgression(
  editable: { slots: readonly EditableChordSlot[] },
): string[] {
  const errors: string[] = [];
  const ordered = [...editable.slots].sort(
    (left, right) => slotStartBeat(left) - slotStartBeat(right),
  );
  for (const [index, slot] of ordered.entries()) {
    if (!Number.isFinite(slot.position.durationBeats) || slot.position.durationBeats <= 0) {
      errors.push(`Slot ${slot.id} must have a positive duration.`);
    }
    const next = ordered[index + 1];
    if (next && slotEndBeat(slot) - slotStartBeat(next) > EPSILON) {
      errors.push(`Slots ${slot.id} and ${next.id} overlap.`);
    }
  }
  return errors;
}

export function progressionSpan(slots: readonly EditableChordSlot[]) {
  if (slots.length === 0) {
    return { startBeat: 0, endBeat: 0 };
  }
  return {
    startBeat: Math.min(...slots.map(slotStartBeat)),
    endBeat: Math.max(...slots.map(slotEndBeat)),
  };
}

export function preservesProgressionSpan(
  before: readonly EditableChordSlot[],
  after: readonly EditableChordSlot[],
): boolean {
  const left = progressionSpan(before);
  const right = progressionSpan(after);
  return Math.abs(left.startBeat - right.startBeat) <= EPSILON
    && Math.abs(left.endBeat - right.endBeat) <= EPSILON;
}

export function slotsAreAdjacent(
  left: EditableChordSlot,
  right: EditableChordSlot,
): boolean {
  return Math.abs(slotEndBeat(left) - slotStartBeat(right)) <= EPSILON;
}

function slotEndBeat(slot: EditableChordSlot): number {
  return slotStartBeat(slot) + slot.position.durationBeats;
}
