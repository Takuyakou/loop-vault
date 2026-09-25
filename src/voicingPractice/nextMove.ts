import type { FingerNumber, FingeringHand, RankedFingering } from "../domain/progressionFingering";
import type { ProgressionFingeringHandTargets } from "./fingeringDisplay";

export type MovementKind = "KEEP" | "SMALL" | "MEDIUM" | "LARGE" | "ADD" | "RELEASE";
export interface FingerMovement {
  readonly hand: FingeringHand;
  readonly finger?: FingerNumber;
  readonly from?: number;
  readonly to?: number;
  readonly semitones?: number;
  readonly kind: MovementKind;
  readonly estimated: boolean;
}

function classify(from: number | undefined, to: number | undefined): MovementKind {
  if (from === undefined) return "ADD";
  if (to === undefined) return "RELEASE";
  const distance = Math.abs(to - from);
  return distance === 0 ? "KEEP" : distance <= 2 ? "SMALL" : distance <= 5 ? "MEDIUM" : "LARGE";
}
function movement(hand: FingeringHand, from: number | undefined, to: number | undefined,
  finger: FingerNumber | undefined, estimated: boolean): FingerMovement {
  return { hand, finger, from, to, semitones: from === undefined || to === undefined ? undefined : to - from,
    kind: classify(from, to), estimated };
}

/** Order-preserving edit alignment. Every source and destination note appears exactly once. */
function estimatedHandMoves(hand: FingeringHand, from: readonly number[], to: readonly number[]): FingerMovement[] {
  const left = [...from].sort((a, b) => a - b);
  const right = [...to].sort((a, b) => a - b);
  const costs = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i++) costs[i]![0] = i * 6;
  for (let j = 1; j <= right.length; j++) costs[0]![j] = j * 6;
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    costs[i]![j] = Math.min(costs[i - 1]![j - 1]! + Math.abs(left[i - 1]! - right[j - 1]!),
      costs[i - 1]![j]! + 6, costs[i]![j - 1]! + 6);
  }
  const result: FingerMovement[] = [];
  let i = left.length; let j = right.length;
  while (i || j) {
    if (i && j && costs[i]![j] === costs[i - 1]![j - 1]! + Math.abs(left[i - 1]! - right[j - 1]!)) {
      result.push(movement(hand, left[--i], right[--j], undefined, true));
    } else if (i && costs[i]![j] === costs[i - 1]![j]! + 6) {
      result.push(movement(hand, left[--i], undefined, undefined, true));
    } else {
      result.push(movement(hand, undefined, right[--j], undefined, true));
    }
  }
  return result.reverse();
}

function formalHandMoves(hand: FingeringHand, current: RankedFingering, next: RankedFingering): FingerMovement[] {
  const before = new Map(current.fingers.map((finger, index) => [finger, current.pitches[index]!]));
  const after = new Map(next.fingers.map((finger, index) => [finger, next.pitches[index]!]));
  const fingers = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  return fingers.map((finger) => movement(hand, before.get(finger), after.get(finger), finger, false));
}

export function nextMoveIndex(currentIndex: number, count: number, loopEnabled: boolean): number | undefined {
  if (count < 1 || currentIndex < 0 || currentIndex >= count) return undefined;
  return currentIndex + 1 < count ? currentIndex + 1 : loopEnabled ? 0 : undefined;
}

/** Read-only view of already resolved notes and VL-09 practice hand assignments. */
function sameNotes(first: readonly number[], second: readonly number[]): boolean {
  if (first.length !== second.length) return false;
  const sortedFirst = [...first].sort((a, b) => a - b);
  const sortedSecond = [...second].sort((a, b) => a - b);
  return sortedFirst.every((note, index) => note === sortedSecond[index]);
}

export function computeNextMoves(current: ProgressionFingeringHandTargets, next: ProgressionFingeringHandTargets,
  currentFingers: Readonly<Partial<Record<FingeringHand, RankedFingering>>> = {},
  nextFingers: Readonly<Partial<Record<FingeringHand, RankedFingering>>> = {}): readonly FingerMovement[] {
  return (["left", "right"] as const).flatMap((hand) => {
    const before = currentFingers[hand]; const after = nextFingers[hand];
    return before && after && sameNotes(before.pitches, current[hand]) && sameNotes(after.pitches, next[hand])
      ? formalHandMoves(hand, before, after) : estimatedHandMoves(hand, current[hand], next[hand]);
  });
}

export function prioritizedMoves(moves: readonly FingerMovement[], limit: number): {
  readonly visible: readonly FingerMovement[]; readonly omitted: number;
} {
  const order: Record<MovementKind, number> = { LARGE: 0, ADD: 1, RELEASE: 1, SMALL: 2, MEDIUM: 2, KEEP: 3 };
  const visible = [...moves].sort((a, b) => order[a.kind] - order[b.kind]
    || (a.hand === b.hand ? 0 : a.hand === "left" ? -1 : 1)
    || (a.finger ?? 0) - (b.finger ?? 0)).slice(0, limit);
  return { visible, omitted: moves.length - visible.length };
}
