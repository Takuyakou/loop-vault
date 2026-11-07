import type { FingerNumber, FingeringHand, RankedFingering } from "../domain/progressionFingering";

/**
 * Screen order of the ten finger slots is the keyboard's order, low to high:
 * L5 L4 L3 L2 L1 | R1 R2 R3 R4 R5. Each hand always has all five (an unused finger is an empty
 * slot, never squeezed out), so a panel's shape never depends on the chord.
 */
export const FINGER_ORDER: Readonly<Record<FingeringHand, readonly FingerNumber[]>> = {
  left: [5, 4, 3, 2, 1],
  right: [1, 2, 3, 4, 5],
};

export interface HandSlot {
  readonly hand: FingeringHand;
  readonly finger: FingerNumber;
  /** MIDI pitch under this finger, when the finger is used. */
  readonly pitch?: number;
}

export interface HandSlots {
  /** Always five, in `FINGER_ORDER`. */
  readonly slots: readonly HandSlot[];
  /** Notes past the fifth (never given a finger); the slots stay five. */
  readonly overflow: readonly number[];
}

/**
 * Puts a hand's notes under its fingers. A formal fingering wins; without one the notes keep
 * their pitch order from the outer finger (L5 / R1), the same estimate the next-move row uses.
 */
export function buildHandSlots(hand: FingeringHand, pitches: readonly number[], fingering?: RankedFingering): HandSlots {
  const byFinger = new Map<FingerNumber, number>();
  const overflow: number[] = [];
  const sorted = [...pitches].sort((a, b) => a - b);
  const formal = fingering
    && fingering.pitches.length === fingering.fingers.length
    && sorted.length === fingering.pitches.length
    && sorted.every((pitch) => fingering.pitches.includes(pitch));
  if (formal) {
    fingering.pitches.forEach((pitch, index) => {
      const finger = fingering.fingers[index]!;
      if (byFinger.has(finger)) overflow.push(pitch);
      else byFinger.set(finger, pitch);
    });
  } else {
    sorted.forEach((pitch, index) => {
      if (index >= 5) { overflow.push(pitch); return; }
      byFinger.set((hand === "left" ? 5 - index : 1 + index) as FingerNumber, pitch);
    });
  }
  return {
    slots: FINGER_ORDER[hand].map((finger) => ({ hand, finger, pitch: byFinger.get(finger) })),
    overflow: overflow.sort((a, b) => a - b),
  };
}

/** Degree names by semitones above the chord root. A non-chord tone still gets its name (F♯ over B♭ is ♭13). */
const DEGREE_BY_SEMITONE = ["1", "b9", "9", "#9", "3", "11", "#11", "5", "b13", "13", "b7", "7"] as const;

/** The degree of a pitch above the chord root, always (a root-relative interval, whatever the chord's tones). */
export function degreeFromRoot(root: number, pitch: number): string {
  return DEGREE_BY_SEMITONE[(((pitch - root) % 12) + 12) % 12]!;
}

export interface SlotDegree {
  readonly label: string;
  /** False for a note the chord does not name: it keeps its name (from the root), shown quieter. */
  readonly chordTone: boolean;
}

/**
 * The degree to show for a pitch: the chord's own name for it when it has one, otherwise its interval
 * from the root. "—" only when the root is unknown.
 */
export function slotDegree(named: ReadonlyMap<number, string | null>, root: number | undefined, pitch: number): SlotDegree {
  const degree = named.get(pitch);
  if (degree) return { label: degree, chordTone: true };
  return { label: root === undefined ? "—" : degreeFromRoot(root, pitch), chordTone: false };
}
