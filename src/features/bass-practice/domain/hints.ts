import type {
  HintLevel,
  PracticeExercise,
  PracticeHint,
} from "./types";

const DEGREE_HINTS: readonly PracticeHint[] = Object.freeze([
  Object.freeze({ level: 1, kind: "tonal-context" }),
  Object.freeze({ level: 2, kind: "note-count-contour" }),
  Object.freeze({ level: 3, kind: "degree-sequence" }),
  Object.freeze({ level: 4, kind: "note-names-fretboard" }),
]);

export function buildDegreeHints(maximumLevel: HintLevel): readonly PracticeHint[] {
  assertHintLevel(maximumLevel);
  return Object.freeze(DEGREE_HINTS.filter((hint) => hint.level <= maximumLevel));
}

export function nextHintLevel(
  current: HintLevel,
  maximum: HintLevel,
): HintLevel {
  assertHintLevel(current);
  assertHintLevel(maximum);
  if (current > maximum) {
    throw new RangeError("Current hint level cannot exceed the available level.");
  }
  return Math.min(current + 1, maximum) as HintLevel;
}

export function degreeContour(exercise: PracticeExercise): "same" | "up" | "down" | "mixed" {
  const notes = exercise.targetEvents.map((event) => event.midiNote);
  if (notes.every((note) => note === notes[0])) return "same";
  if (notes.every((note, index) => index === 0 || note >= notes[index - 1])) return "up";
  if (notes.every((note, index) => index === 0 || note <= notes[index - 1])) return "down";
  return "mixed";
}

function assertHintLevel(value: number): asserts value is HintLevel {
  if (!Number.isInteger(value) || value < 0 || value > 4) {
    throw new RangeError("Hint level must be an integer between 0 and 4.");
  }
}
