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


export interface FixedFingerSlot {
  readonly hand: FingeringHand;
  readonly finger: FingerNumber;
  readonly moves: readonly FingerMovement[];
}

/** Visual projection only. Formal finger IDs win; estimated alignment remains order-preserving. */
export function fixedFingerSlots(moves: readonly FingerMovement[]): readonly FixedFingerSlot[] {
  return (["left", "right"] as const).flatMap((hand) => {
    const handMoves = moves.filter((move) => move.hand === hand);
    const byFinger = new Map<FingerNumber, FingerMovement[]>();
    let sourceIndex = 0;
    let destinationIndex = 0;
    for (const move of handMoves) {
      let finger = move.finger;
      if (finger === undefined) {
        // An insertion and a removal can share one estimated position. Keep both actions in its slot.
        const position = move.to === undefined ? sourceIndex : destinationIndex;
        finger = (hand === "left" ? 5 - position : 1 + position) as FingerNumber;
        if (move.from !== undefined) sourceIndex++;
        if (move.to !== undefined) destinationIndex++;
      }
      const group = byFinger.get(finger) ?? [];
      group.push(move);
      byFinger.set(finger, group);
    }
    const order: FingerNumber[] = hand === "left" ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
    return order.map((finger) => ({ hand, finger, moves: byFinger.get(finger) ?? [] }));
  });
}

const JA_INTERVALS = ["", "半音", "全音", "短3", "長3", "4度", "増4", "5度", "短6", "長6", "短7", "長7"] as const;
const EN_INTERVALS = ["", "semitone", "whole tone", "minor 3rd", "major 3rd", "4th", "tritone", "5th", "minor 6th", "major 6th", "minor 7th", "major 7th"] as const;

/** Chromatic distance label; it makes no enharmonic or harmonic-identity claim. */
export function movementInterval(delta: number, language: "ja" | "en" = "ja"): string {
  if (!Number.isInteger(delta)) return "—";
  if (delta === 0) return language === "ja" ? "そのまま" : "same";
  const distance = Math.abs(delta);
  const octaves = Math.floor(distance / 12);
  const remainder = distance % 12;
  const intervals = language === "ja" ? JA_INTERVALS : EN_INTERVALS;
  const octave = language === "ja" ? `${octaves}oct` : `${octaves} oct`;
  const label = octaves
    ? `${octave}${remainder ? `+${intervals[remainder]}` : ""}`
    : intervals[remainder];
  return `${delta > 0 ? "↑" : "↓"} ${label}`;
}

export function handMoveSummary(moves: readonly FingerMovement[], language: "ja" | "en" = "ja"): string {
  const moving = moves.filter((move) => move.semitones !== undefined && move.semitones !== 0);
  const additions = moves.some((move) => move.kind === "ADD" || move.kind === "RELEASE");
  if (!moving.length && !additions) return language === "ja" ? "そのまま" : "Same";
  const directions = moving.map((move) => Math.sign(move.semitones!));
  const up = directions.filter((direction) => direction > 0).length;
  const down = directions.length - up;
  const majority = Math.max(up, down) > moving.length / 2;
  const distances = moving.map((move) => Math.abs(move.semitones!)).sort((a, b) => a - b);
  const middle = Math.floor(distances.length / 2);
  const median = distances.length % 2 ? distances[middle]! : (distances[middle - 1]! + distances[middle]!) / 2;
  if (majority && median >= 6) {
    const label = movementInterval(Math.round(median) * (up > down ? 1 : -1), language);
    return language === "ja" ? `手ごと ${label.replace(" ", " 約")}` : `Whole hand ${label}`;
  }
  if (moving.length <= 1 && !additions && moving.every((move) => Math.abs(move.semitones!) <= 2))
    return language === "ja" ? "指だけ" : "One finger";
  return language === "ja" ? "少し動く" : "Adjust shape";
}
