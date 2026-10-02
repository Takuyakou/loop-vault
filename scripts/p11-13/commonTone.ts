import { handPositionCostModel, type HandPositionPolicy } from "../../src/domain/handPositionFingering";
import type { FingeringCostModel, SupportedCandidates } from "../../src/domain/progressionFingering";

export const COMMON_TONE_GAMMAS = Object.freeze([0.125, 0.25, 0.5, 1]);
export const COMMON_TONE_BASE: HandPositionPolicy = Object.freeze({ variant: "E1-T", curve: "inverse", lambda: 2 });

export function sharedFingerChanges(previous: SupportedCandidates, i: number, current: SupportedCandidates, j: number) {
  if (previous.signature.slice(0,2) !== current.signature.slice(0,2)) return 0;
  return previous.pitches.reduce((sum, pitch, index) => {
    const next = current.pitches.indexOf(pitch);
    return sum + Number(next >= 0 && previous.candidates[i]!.fingers[index] !== current.candidates[j]!.fingers[next]);
  }, 0);
}

/** Diagnostic only: no candidate exclusion, no anchor override, no UI registration. */
export function commonToneCostModel(gamma: number): FingeringCostModel {
  if (!Number.isFinite(gamma) || gamma < 0) throw Error("Common Tone gamma must be finite and nonnegative");
  const base = handPositionCostModel(COMMON_TONE_BASE);
  const cache = new WeakMap<SupportedCandidates, WeakMap<SupportedCandidates, number[][]>>();
  return {
    local: base.local,
    transition: (previous, i, current, j, seconds) => {
      if (!gamma) return base.transition(previous,i,current,j,seconds);
      let next = cache.get(previous);
      if (!next) { next = new WeakMap(); cache.set(previous,next); }
      let matrix = next.get(current);
      if (!matrix) {
        matrix = previous.candidates.map((_a,a) => current.candidates.map((_b,b) => sharedFingerChanges(previous,a,current,b)));
        next.set(current,matrix);
      }
      return base.transition(previous,i,current,j,seconds) + gamma * matrix[i]![j]!;
    },
  };
}
