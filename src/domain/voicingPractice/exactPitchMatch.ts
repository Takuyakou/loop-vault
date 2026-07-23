import { normalizePc } from "../chords";
import type {
  PracticeInputSnapshot,
  PracticeMatchResult,
} from "../practice";
import type { ExactPitchMatchOptions } from "./types";

export const DEFAULT_OCTAVE_SHIFT_CANDIDATES = [-24, -12, 0, 12, 24] as const;

export function matchExactPitch(
  targetMidiNotes: readonly number[],
  input: PracticeInputSnapshot,
  requiredAttackRevision = 0,
  options: ExactPitchMatchOptions = {
    allowGlobalOctaveShift: true,
    octaveShiftCandidates: DEFAULT_OCTAVE_SHIFT_CANDIDATES,
  },
): PracticeMatchResult {
  const target = sorted(targetMidiNotes);
  const held = sorted(input.heldMidiNotes);
  const shifts = options.allowGlobalOctaveShift
    ? unique(options.octaveShiftCandidates)
    : [0];
  const attackSatisfied = input.attackRevision >= requiredAttackRevision;
  const exact = shifts.some((shift) => arraysEqual(
    held,
    target.map((note) => note + shift),
  ));
  const partial = held.length < target.length && shifts.some((shift) => {
    const shifted = target.map((note) => note + shift);
    return held.every((note) => shifted.includes(note));
  });
  const heldPitchClasses = unique(held.map(normalizePc));
  const targetPitchClasses = unique(target.map(normalizePc));
  const missingPitchClasses = targetPitchClasses.filter(
    (pitchClass) => !heldPitchClasses.includes(pitchClass),
  );
  const foreignPitchClasses = heldPitchClasses.filter(
    (pitchClass) => !targetPitchClasses.includes(pitchClass),
  );

  return {
    state: held.length === 0
      ? "empty"
      : exact && attackSatisfied
        ? "match"
        : partial || exact
          ? "partial"
          : "wrong",
    heldPitchClasses,
    missingPitchClasses,
    foreignPitchClasses,
    bassMatches: exact,
    attackSatisfied,
  };
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sorted(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
