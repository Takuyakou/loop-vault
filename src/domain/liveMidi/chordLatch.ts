/**
 * P24-06: the pure chord latch of 「鍵盤で入れる」.
 *
 * While the keys are held, the largest set that was down at one moment is the candidate; releasing one key
 * at a time does not shrink it. When every key is released the candidate becomes the one chord. A set of two
 * or fewer notes never commits (the caller asks the chord detector and adds nothing either).
 *
 * This is the same shape as the Phase 5.20 latch in `VoicingPanel` (that one also waits 100ms for stability);
 * the panel itself is not touched.
 */
export interface ChordLatchUpdate {
  /** The largest set held since the last commit. */
  readonly candidate: readonly number[];
  /** Set on the one update in which every key was released, when the candidate was a chord-sized set. */
  readonly committed?: readonly number[];
}

export interface ChordLatch {
  update(held: readonly number[]): ChordLatchUpdate;
  reset(): void;
}

/** P24-06: a chord needs at least three notes; two or fewer never become a card. */
export const MIN_LATCHED_NOTES = 3;

export function createChordLatch(): ChordLatch {
  let candidate: number[] = [];
  return {
    update(held) {
      const notes = [...new Set(held)].sort((left, right) => left - right);
      if (notes.length === 0) {
        const committed = candidate.length >= MIN_LATCHED_NOTES ? candidate : undefined;
        candidate = [];
        return committed === undefined ? { candidate: [] } : { candidate: [], committed };
      }
      if (candidate.length === 0 || notes.length > candidate.length) {
        candidate = notes;
      } else if (notes.length === candidate.length && !notes.every((note) => candidate.includes(note))) {
        // Pressed anew at the same size: the latest set is the one the person is holding.
        candidate = notes;
      }
      // A released subset keeps the larger candidate: releasing one key at a time must not shrink the chord.
      return { candidate };
    },
    reset() { candidate = []; },
  };
}
