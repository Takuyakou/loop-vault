import { preferredFingeringDistance, rankCyclicFingerings, type FingerNumber, type FingeringCostModel, type FingeringHand, type FingeringRankingOptions, type ProgressionFingeringEvent, type SupportedCandidates } from "./progressionFingering";

export type TimePressureCurve = "inverse" | "sqrt" | "shifted-inverse";
export type HandPositionVariant = "E1-raw" | "E1-T-zero-prior" | "E1-T";
export interface HandPositionPolicy {
  readonly variant: HandPositionVariant;
  readonly lambda: number;
  readonly curve: TimePressureCurve;
}
/** Experimental candidate frozen from the bounded dev comparison (passing grid 0.125..4). Never the default. */
export const EXPERIMENTAL_HAND_POSITION_POLICY: HandPositionPolicy = Object.freeze({ variant: "E1-T", lambda: 0.5, curve: "inverse" });
const KEYBOARD_COORDINATES = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6] as const;

/** Relative white-key coordinate, not physical reach or a biomechanical distance. */
export function keyboardPositionProxy(pitch: number): number {
  return Math.floor(pitch / 12) * 7 + KEYBOARD_COORDINATES[((pitch % 12) + 12) % 12]!;
}
export function handPositionProxy(hand: FingeringHand, pitches: readonly number[], fingers: readonly FingerNumber[]): number {
  const anchors = pitches.map((pitch, i) => keyboardPositionProxy(pitch) - (hand === "right" ? fingers[i]! - 1 : 5 - fingers[i]!)).sort((a,b) => a-b);
  if (!anchors.length) return 0;
  const middle = Math.floor(anchors.length / 2);
  return anchors.length % 2 ? anchors[middle]! : (anchors[middle - 1]! + anchors[middle]!) / 2;
}
export function timePressure(seconds: number, curve: TimePressureCurve = "inverse"): number {
  // Numerical protection only, not an acceptance threshold or a fast/slow classification.
  const time = Math.max(0.001, Number.isFinite(seconds) ? seconds : 1);
  return curve === "sqrt" ? 1 / Math.sqrt(time) : curve === "shifted-inverse" ? 1 / (1 + time) : 1 / time;
}
export function handPositionCostModel(policy: HandPositionPolicy): FingeringCostModel {
  const positions = new WeakMap<SupportedCandidates, readonly number[]>();
  const position = (group: SupportedCandidates, index: number) => {
    let values = positions.get(group);
    if (!values) {
      values = group.candidates.map(candidate => handPositionProxy(group.signature.startsWith("L:") ? "left" : "right", group.pitches, candidate.fingers));
      positions.set(group, values);
    }
    return values[index]!;
  };
  return {
    local: (event, group, index) => policy.variant === "E1-T" ? policy.lambda * preferredFingeringDistance(event, group.candidates[index]!.fingers) : 0,
    transition: (previous, i, current, j, seconds) => {
      const from = position(previous, i);
      const to = position(current, j);
      return Math.abs(to - from) * (policy.variant === "E1-raw" ? 1 : timePressure(seconds, policy.curve));
    },
  };
}
export function rankHandPositionFingerings(events: readonly ProgressionFingeringEvent[], policy: HandPositionPolicy = EXPERIMENTAL_HAND_POSITION_POLICY, options: FingeringRankingOptions = {}) {
  return rankCyclicFingerings(events, { ...options, costModel: handPositionCostModel(policy) });
}
