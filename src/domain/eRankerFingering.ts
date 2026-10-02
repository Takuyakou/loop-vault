import { handPositionCostModel } from "./handPositionFingering";
import type { FingeringCostModel, SupportedCandidates } from "./progressionFingering";

/** P11-13d frozen candidate. No UI-adjustable weights or candidate filtering. */
export const E_RANKER_POLICY = Object.freeze({ variant: "E1-T", curve: "inverse", lambda: 2, gamma: 1 } as const);

export function eRankerCostModel(): FingeringCostModel {
  const base = handPositionCostModel(E_RANKER_POLICY);
  const cache = new WeakMap<SupportedCandidates, WeakMap<SupportedCandidates, number[][]>>();
  return {
    local: base.local,
    transition: (previous, i, current, j, seconds) => {
      let next = cache.get(previous);
      if (!next) { next = new WeakMap(); cache.set(previous, next); }
      let matrix = next.get(current);
      if (!matrix) {
        matrix = previous.candidates.map((a) => current.candidates.map((b) => {
          if (previous.signature.slice(0, 2) !== current.signature.slice(0, 2)) return 0;
          return previous.pitches.reduce((sum, pitch, index) => {
            const nextPitch = current.pitches.indexOf(pitch);
            return sum + Number(nextPitch >= 0 && a.fingers[index] !== b.fingers[nextPitch]);
          }, 0);
        }));
        next.set(current, matrix);
      }
      return base.transition(previous, i, current, j, seconds) + E_RANKER_POLICY.gamma * matrix[i]![j]!;
    },
  };
}
