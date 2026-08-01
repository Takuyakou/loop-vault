import { MAJOR_DEGREES, MINOR_DEGREES } from "./constants";
import type {
  DegreeValue,
  DegreeVocabularyId,
  PracticeDifficulty,
  ScaleMode,
} from "./types";
import {
  DEGREE_VOCABULARIES,
  type DegreeVocabulary,
} from "./vocabulary";

export type DegreeDifficultyLevel = 1 | 2 | 3;

export interface DegreeDifficultyPreset {
  readonly level: DegreeDifficultyLevel;
  readonly allowedDegrees: readonly DegreeValue[];
  readonly vocabularyId: DegreeVocabularyId;
  readonly degreeSequence: readonly DegreeValue[];
  readonly vocabularies: readonly DegreeVocabulary[];
  readonly difficulty: PracticeDifficulty;
}

export function degreeDifficultyPreset(
  level: DegreeDifficultyLevel,
  scale: ScaleMode,
): DegreeDifficultyPreset {
  const scaleDegrees = scale === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
  const vocabularyIds: readonly DegreeVocabularyId[] = level === 1
    ? ["tonic-single", "tonic-dominant", "tonic-dominant-octave"]
    : level === 2
      ? [
          "tonic-single",
          "tonic-dominant",
          "tonic-dominant-octave",
          "minor-color-cadence",
          "tonic-dominant-mixolydian",
          "ascending-minor-color",
          "dominant-octave-resolution",
        ]
      : Object.keys(DEGREE_VOCABULARIES) as DegreeVocabularyId[];
  const defaultVocabularyId: Readonly<Record<DegreeDifficultyLevel, DegreeVocabularyId>> = {
    1: "tonic-dominant-octave",
    2: "minor-color-cadence",
    3: "tonic-dominant-mixolydian",
  };
  const defaultVocabulary = DEGREE_VOCABULARIES[defaultVocabularyId[level]];
  const vocabularyDegrees = vocabularyIds.flatMap(
    (id) => DEGREE_VOCABULARIES[id].degreeSequence,
  );
  const allowedDegrees = level === 1
    ? vocabularyDegrees
    : level === 2
      ? [...scaleDegrees, ...vocabularyDegrees]
      : [
          ...scaleDegrees,
          ...vocabularyDegrees,
        ];
  const values: Readonly<Record<DegreeDifficultyLevel, PracticeDifficulty>> = {
    1: {
      noteCount: 3,
      phraseLengthBeats: 3,
      tempo: 72,
      pitchSpanSemitones: 12,
      degreeComplexity: 1,
      rhythmComplexity: 1,
      positionShift: 0,
      listenLimit: 4,
      hintAvailability: 4,
      transferDistance: 2,
    },
    2: {
      noteCount: 4,
      phraseLengthBeats: 4,
      tempo: 88,
      pitchSpanSemitones: 17,
      degreeComplexity: 2,
      rhythmComplexity: 1,
      positionShift: 1,
      listenLimit: 3,
      hintAvailability: 4,
      transferDistance: 5,
    },
    3: {
      noteCount: 4,
      phraseLengthBeats: 4,
      tempo: 104,
      pitchSpanSemitones: 24,
      degreeComplexity: 3,
      rhythmComplexity: 2,
      positionShift: 2,
      listenLimit: 2,
      hintAvailability: 4,
      transferDistance: 7,
    },
  };
  return deepFreeze({
    level,
    allowedDegrees: deduplicateDegrees(allowedDegrees),
    vocabularyId: defaultVocabulary.id,
    degreeSequence: defaultVocabulary.degreeSequence,
    vocabularies: vocabularyIds.map((id) => DEGREE_VOCABULARIES[id]),
    difficulty: values[level],
  });
}

function deduplicateDegrees(values: readonly DegreeValue[]): readonly DegreeValue[] {
  const unique = new Map<string, DegreeValue>();
  for (const value of values) {
    unique.set(`${value.degree}:${value.accidental}:${value.octave}`, value);
  }
  return [...unique.values()];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
