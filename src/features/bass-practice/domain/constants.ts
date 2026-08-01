import type { DegreeValue, StringCount } from "./types";

export const DEGREE_GENERATOR_VERSION = "degree-v1";
export const REVIEW_QUEUE_POLICY_VERSION = 1;

export const STANDARD_BASS_TUNINGS: Readonly<Record<StringCount, readonly number[]>> =
  Object.freeze({
    4: Object.freeze([28, 33, 38, 43]),
    5: Object.freeze([23, 28, 33, 38, 43]),
  });

export const MAJOR_DEGREES: readonly DegreeValue[] = freezeDegrees([
  { degree: 1, accidental: 0, octave: 0 },
  { degree: 2, accidental: 0, octave: 0 },
  { degree: 3, accidental: 0, octave: 0 },
  { degree: 4, accidental: 0, octave: 0 },
  { degree: 5, accidental: 0, octave: 0 },
  { degree: 6, accidental: 0, octave: 0 },
  { degree: 7, accidental: 0, octave: 0 },
]);

export const MINOR_DEGREES: readonly DegreeValue[] = freezeDegrees([
  { degree: 1, accidental: 0, octave: 0 },
  { degree: 2, accidental: 0, octave: 0 },
  { degree: 3, accidental: -1, octave: 0 },
  { degree: 4, accidental: 0, octave: 0 },
  { degree: 5, accidental: 0, octave: 0 },
  { degree: 6, accidental: -1, octave: 0 },
  { degree: 7, accidental: -1, octave: 0 },
]);

function freezeDegrees(values: DegreeValue[]): readonly DegreeValue[] {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}
