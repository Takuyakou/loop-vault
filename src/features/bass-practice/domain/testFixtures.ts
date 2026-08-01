import {
  DEGREE_GENERATOR_VERSION,
  STANDARD_BASS_TUNINGS,
} from "./constants";
import { degreeDifficultyPreset } from "./difficulty";
import { generateDegreeExercise } from "./generator";
import type {
  GeneratorSnapshot,
  PracticeExercise,
} from "./types";

export function generatorSnapshot(
  overrides: Partial<GeneratorSnapshot> = {},
): GeneratorSnapshot {
  const preset = degreeDifficultyPreset(2, "major");
  return {
    generatorVersion: DEGREE_GENERATOR_VERSION,
    seed: "fixture-seed",
    key: "C",
    scale: "major",
    allowedDegrees: preset.allowedDegrees,
    vocabularyId: preset.vocabularyId,
    degreeSequence: preset.degreeSequence,
    noteCount: preset.degreeSequence.length,
    phraseLengthBeats: 4,
    tempo: 88,
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    instrument: "bass",
    tuning: STANDARD_BASS_TUNINGS[4],
    fretRange: { min: 0, max: 12 },
    handedness: "right",
    rhythmPreset: "even",
    singingReferenceMode: "auto",
    maxAttempts: 64,
    ...overrides,
  };
}

export function generatedExercise(
  overrides: Partial<GeneratorSnapshot> = {},
): PracticeExercise {
  const result = generateDegreeExercise(generatorSnapshot(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.exercise;
}
