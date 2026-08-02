import type {
  PracticeTargetEvent,
  SingingReference,
  SingingReferenceMode,
} from "./types";

export function resolveSingingReference(
  events: readonly PracticeTargetEvent[],
  mode: SingingReferenceMode,
): SingingReference {
  if (events.length === 0) {
    throw new RangeError("A singing reference requires at least one target event.");
  }
  const resolvedOctaveShift = mode === "original"
    ? 0
    : mode === "octave-1"
      ? 1
      : mode === "octave-2"
        ? 2
        : resolveAutoShift(events);
  const shiftedEvents = events.map((event) => {
    const midiNote = event.midiNote + (12 * resolvedOctaveShift);
    if (midiNote > 127) {
      throw new RangeError("Singing reference exceeds the MIDI note range.");
    }
    return Object.freeze({
      ...event,
      degree: Object.freeze({ ...event.degree }),
      midiNote,
    });
  });
  return deepFreeze({
    mode,
    resolvedOctaveShift,
    events: shiftedEvents,
  });
}

function resolveAutoShift(events: readonly PracticeTargetEvent[]): 0 | 1 | 2 {
  const average = events.reduce((sum, event) => sum + event.midiNote, 0) / events.length;
  if (average < 42) return 2;
  if (average < 54) return 1;
  return 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
