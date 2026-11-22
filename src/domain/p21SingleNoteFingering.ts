import { eRankerCostModel } from "./eRankerFingering";
import { handPositionProxy } from "./handPositionFingering";
import type { FingeringCostModel, ProgressionFingeringEvent, SupportedCandidates } from "./progressionFingering";

/**
 * P21: for one-note hands, keep the hand where it is (案 A). This is a new model; E1-T/P11-13e is untouched for the
 * saved records (`eRankerCostModel`).
 *
 * All three tiers are integers. The ordering is (hand moves, 0.25 movement units, basic-finger offset) and each tier
 * is larger than the maximum of every lower tier even at the 8192-card limit.
 */
export const P21_POLICY = Object.freeze({
  /** Hands with more sounding cards than this keep the old E1-T result. */
  maxCards: 8192,
  /** Weight of a 0.25 hand-position difference. Larger than the maximum basic-finger total (4 × maxCards). */
  movementUnit: 50_000,
  /** Weight of one hand move. Larger than the maximum movement total (312 × maxCards × movementUnit). */
  moveWeight: 200_000_000_000,
} as const);

export interface P21CostModel extends FingeringCostModel {
  readonly singleNotePreserving: true;
  readonly legacy: FingeringCostModel;
}

const positionOf = (group: SupportedCandidates, index: number): number => {
  const candidate = group.candidates[index]!;
  return handPositionProxy(group.signature.startsWith("L:") ? "left" : "right", group.pitches, candidate.fingers);
};
const basicDistance = (group: SupportedCandidates, index: number): number => {
  const candidate = group.candidates[index]!;
  const hand = group.signature.startsWith("L:") ? "left" : "right";
  return candidate.fingers.reduce((sum, finger) => sum + (hand === "left" ? 5 - finger : finger - 1), 0);
};

export function p21ERankerCostModel(): P21CostModel {
  const positions = new WeakMap<SupportedCandidates, readonly number[]>();
  const position = (group: SupportedCandidates, index: number) => {
    let values = positions.get(group);
    if (!values) {
      values = group.candidates.map((_candidate, each) => positionOf(group, each));
      positions.set(group, values);
    }
    return values[index]!;
  };
  return {
    singleNotePreserving: true,
    legacy: eRankerCostModel(),
    local: (event: ProgressionFingeringEvent, group: SupportedCandidates, index: number) => {
      // Multi-note cards are fixed by the first stage (an anchor); their local score never changes which finger is used.
      if (group.pitches.length !== 1) return 0;
      return basicDistance(group, index);
    },
    transition: (previous, previousIndex, current, currentIndex) => {
      // P21 deliberately does not use seconds / timePressure: a slow one-note line must keep the hand position too.
      const delta = Math.abs(position(current, currentIndex) - position(previous, previousIndex));
      const quarters = Math.round(delta * 4);
      const moves = delta >= 1 ? 1 : 0;
      return moves * P21_POLICY.moveWeight + quarters * P21_POLICY.movementUnit;
    },
  };
}
