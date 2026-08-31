import { makeChordSymbol } from "../../src/domain/chords";
import { chordPitchClasses } from "../../src/domain/chordVoicing";
import { countP524OneToOneBoundaryMatches } from "../p524/harmonicFragmentMetrics";
import type { P526LayeredState } from "./fixtures";
import type { P526StructuredState } from "./baseline";

export const p526BoundaryToleranceBeats = 0.25;

export function evaluateP526EightBarBaseline(
  expected: readonly P526LayeredState[],
  actual: readonly P526StructuredState[],
) {
  validateExpected(expected);
  assertTimeline(expected);
  assertTimeline(actual);
  const expectedBoundaries = expected.slice(1).map((state) => state.startBeat);
  const actualBoundaries = actual.slice(1).map((state) => state.startBeat);
  const matchedBoundaries = countP524OneToOneBoundaryMatches(
    expectedBoundaries,
    actualBoundaries,
    p526BoundaryToleranceBeats,
  );
  const expectedSlots = slots(expected);
  const actualSlots = slots(actual);
  const paired = expectedSlots.map((expectedState, index) => ({
    expected: expectedState,
    actual: actualSlots[index],
  }));
  const canonicalEligible = paired;
  const canonicalMatched = canonicalEligible.filter(({ expected: left, actual: right }) => (
    right !== undefined && left.rootPitchClass === right.chord.root && left.quality === right.chord.quality
  ));
  const bassEligible = canonicalMatched;
  const bassMatched = bassEligible.filter(({ expected: left, actual: right }) => (
    effectiveBass(right.chord.root, right.chord.bass) === left.structuralBassPitchClass
  ));
  const tensionEligible = bassMatched;
  const tensionMatched = tensionEligible.filter(({ expected: left, actual: right }) => (
    setEqual(left.alteredTensions, right.chord.tensions)
      && setEqual(left.pitchClasses, chordPitchClasses(right.chord))
  ));
  const spellingEligible = tensionMatched;
  const spellingMatched = spellingEligible.filter(({ expected: left, actual: right }) => (
    left.surfaceLabel === right.chord.label
  ));
  const exactMatched = paired.filter(({ expected: left, actual: right }) => (
    right !== undefined
      && left.surfaceLabel === right.chord.label
      && left.rootPitchClass === right.chord.root
      && left.quality === right.chord.quality
      && left.structuralBassPitchClass === effectiveBass(right.chord.root, right.chord.bass)
      && setEqual(left.alteredTensions, right.chord.tensions)
  )).length;
  const precision = divide(matchedBoundaries, actualBoundaries.length);
  const recall = divide(matchedBoundaries, expectedBoundaries.length);
  return {
    segmentation: {
      matchedBoundaries,
      expectedBoundaries: expectedBoundaries.length,
      detectedBoundaries: actualBoundaries.length,
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall),
      overSegmentationRate: divide(actual.length - expected.length, expected.length),
      falseMergeRate: divide(expectedBoundaries.length - matchedBoundaries, expectedBoundaries.length),
    },
    canonicalIdentity: axis(canonicalMatched.length, canonicalEligible.length),
    structuralBass: axis(bassMatched.length, bassEligible.length),
    alteredTension: axis(tensionMatched.length, tensionEligible.length),
    surfaceSpelling: axis(spellingMatched.length, spellingEligible.length),
    exactSurfaceLabel: axis(exactMatched, paired.length),
    exactFullBars: exactBars(expected, actual),
    stateCountBars: stateCountBars(expected, actual),
    totalBars: 8,
  } as const;
}

function validateExpected(states: readonly P526LayeredState[]): void {
  for (const state of states) {
    const symbol = makeChordSymbol(state.rootPitchClass, state.quality, [...state.alteredTensions]);
    if (!setEqual(chordPitchClasses(symbol), state.pitchClasses)) {
      throw new Error(`${state.surfaceLabel} expected pitch classes disagree with its structured chord`);
    }
  }
}

function assertTimeline(states: readonly { readonly startBeat: number; readonly endBeat: number }[]): void {
  if (states.length === 0 || states[0]?.startBeat !== 0 || states.at(-1)?.endBeat !== 32) {
    throw new Error("P5.26 timeline must cover eight 4/4 bars");
  }
  states.forEach((state, index) => {
    if (!Number.isFinite(state.startBeat) || !Number.isFinite(state.endBeat) || state.endBeat <= state.startBeat
      || (index > 0 && states[index - 1]?.endBeat !== state.startBeat)) {
      throw new Error("P5.26 timeline must be finite, sorted, and contiguous");
    }
  });
}

function slots<T extends { readonly startBeat: number; readonly endBeat: number }>(states: readonly T[]): readonly T[] {
  return Array.from({ length: 16 }, (_, index) => {
    const beat = index * 2;
    const state = states.find((candidate) => candidate.startBeat <= beat && candidate.endBeat > beat);
    if (state === undefined) throw new Error(`P5.26 timeline has no state at beat ${beat}`);
    return state;
  });
}

function effectiveBass(root: number, bass: number | undefined): number {
  return bass ?? root;
}

function setEqual(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function axis(matchedSlots: number, eligibleSlots: number) {
  return { matchedSlots, eligibleSlots, accuracy: divide(matchedSlots, eligibleSlots) } as const;
}

function exactBars(expected: readonly P526LayeredState[], actual: readonly P526StructuredState[]): number {
  return Array.from({ length: 8 }, (_, index) => index + 1).filter((bar) => {
    const left = expected.filter((state) => state.bar === bar).map((state) => state.surfaceLabel);
    const right = actual.filter((state) => state.bar === bar).map((state) => state.chord.label);
    return left.length === right.length && left.every((label, index) => label === right[index]);
  }).length;
}

function stateCountBars(expected: readonly P526LayeredState[], actual: readonly P526StructuredState[]): number {
  return Array.from({ length: 8 }, (_, index) => index + 1).filter((bar) => (
    expected.filter((state) => state.bar === bar).length === actual.filter((state) => state.bar === bar).length
  )).length;
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
