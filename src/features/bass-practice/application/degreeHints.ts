import {
  degreeContour,
  formatDegree,
  fretboardPositions,
  midiNoteName,
  type FretboardPosition,
  type HintLevel,
  type PracticeExercise,
} from "../domain";

export interface DegreeHintDisclosure {
  readonly level: HintLevel;
  readonly tonalContext?: PracticeExercise["tonalContext"];
  readonly noteCount?: number;
  readonly contour?: ReturnType<typeof degreeContour>;
  readonly degrees?: readonly string[];
  readonly noteNames?: readonly string[];
  readonly fretboard?: readonly {
    readonly sequenceIndex: number;
    readonly degree: string;
    readonly noteName: string;
    readonly positions: readonly FretboardPosition[];
  }[];
}

export function degreeHintDisclosure(
  exercise: PracticeExercise,
  level: HintLevel,
): DegreeHintDisclosure {
  if (!Number.isInteger(level) || level < 0 || level > 4) {
    throw new RangeError("Hint level must be an integer between 0 and 4.");
  }
  if (level === 0) return Object.freeze({ level });

  const tonalContext = Object.freeze({ ...exercise.tonalContext });
  if (level === 1) return Object.freeze({ level, tonalContext });

  const noteCount = exercise.targetEvents.length;
  const contour = degreeContour(exercise);
  if (level === 2) {
    return Object.freeze({ level, tonalContext, noteCount, contour });
  }

  const degrees = Object.freeze(
    exercise.targetEvents.map((event) => formatDegree(event.degree)),
  );
  if (level === 3) {
    return Object.freeze({ level, tonalContext, noteCount, contour, degrees });
  }

  const noteNames = Object.freeze(exercise.targetEvents.map((event) => (
    midiNoteName(event.midiNote, exercise.tonalContext.key, exercise.tonalContext.scale)
  )));
  const fretboard = Object.freeze(exercise.targetEvents.map((event, sequenceIndex) => (
    Object.freeze({
      sequenceIndex,
      degree: degrees[sequenceIndex],
      noteName: noteNames[sequenceIndex],
      positions: fretboardPositions(
        event.midiNote,
        exercise.generatorSnapshot.tuning,
        exercise.generatorSnapshot.fretRange,
      ),
    })
  )));
  return Object.freeze({
    level,
    tonalContext,
    noteCount,
    contour,
    degrees,
    noteNames,
    fretboard,
  });
}
