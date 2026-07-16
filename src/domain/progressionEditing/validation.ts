import { slotStartBeat } from "./editableProgression";
import type { EditableChordSlot } from "./types";

const EPSILON = 0.000_001;

export function validateEditableProgression(
  editable: { slots: readonly EditableChordSlot[]; beatsPerBar?: number },
): string[] {
  const beatsPerBar = editable.beatsPerBar ?? 4;
  const errors: string[] = [];
  const ordered = [...editable.slots].sort(
    (left, right) => slotStartBeat(left, beatsPerBar) - slotStartBeat(right, beatsPerBar),
  );
  for (const [index, slot] of ordered.entries()) {
    if (!Number.isFinite(slot.position.durationBeats) || slot.position.durationBeats <= 0) {
      errors.push(`Slot ${slot.id} must have a positive duration.`);
    }
    const next = ordered[index + 1];
    if (next && slotEndBeat(slot, beatsPerBar) - slotStartBeat(next, beatsPerBar) > EPSILON) {
      errors.push(`Slots ${slot.id} and ${next.id} overlap.`);
    }
  }
  return errors;
}

export function progressionSpan(slots: readonly EditableChordSlot[], beatsPerBar = 4) {
  return progressionSpanFor(slots, beatsPerBar);
}

export function preservesProgressionSpan(
  before: readonly EditableChordSlot[],
  after: readonly EditableChordSlot[],
  beatsPerBar = 4,
): boolean {
  const left = progressionSpanFor(before, beatsPerBar);
  const right = progressionSpanFor(after, beatsPerBar);
  return Math.abs(left.startBeat - right.startBeat) <= EPSILON
    && Math.abs(left.endBeat - right.endBeat) <= EPSILON;
}

export function slotsAreAdjacent(
  left: EditableChordSlot,
  right: EditableChordSlot,
  beatsPerBar = 4,
): boolean {
  return Math.abs(slotEndBeat(left, beatsPerBar) - slotStartBeat(right, beatsPerBar)) <= EPSILON;
}

function progressionSpanFor(slots: readonly EditableChordSlot[], beatsPerBar: number) {
  if (slots.length === 0) {
    return { startBeat: 0, endBeat: 0 };
  }
  return {
    startBeat: Math.min(...slots.map((slot) => slotStartBeat(slot, beatsPerBar))),
    endBeat: Math.max(...slots.map((slot) => slotEndBeat(slot, beatsPerBar))),
  };
}

function slotEndBeat(slot: EditableChordSlot, beatsPerBar: number): number {
  return slotStartBeat(slot, beatsPerBar) + slot.position.durationBeats;
}
