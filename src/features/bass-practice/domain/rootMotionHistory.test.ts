import { expect, test } from "vitest";
import { STANDARD_BASS_TUNINGS } from "./constants";
import { ROOT_MOTION_GENERATOR_VERSION, ROOT_MOTION_MAX_ATTEMPTS, generateRootMotionExercise } from "./rootMotion";
import { createRootMotionHistoryEntry } from "./rootMotionHistory";

test("Root Motion factual History persists objective and self-rated evidence without private source data", () => {
  const result = generateRootMotionExercise({ generatorVersion: ROOT_MOTION_GENERATOR_VERSION, seed: "history", level: 3, noteCount: 8, phraseLengthBeats: 16, tempo: 96, tuning: STANDARD_BASS_TUNINGS[4], stringCount: 4, fretRange: { min: 0, max: 12 }, pitchSpan: { minMidi: 28, maxMidi: 55 }, handedness: "right", maxAttempts: ROOT_MOTION_MAX_ATTEMPTS });
  if (!result.ok) throw new Error(result.error.message);
  const entry = createRootMotionHistoryEntry({ completedAt: "2026-08-09T10:00:00.000Z", exercise: result.exercise, selfRating: "good", firstAnswer: { submitted: { direction: "up", category: "second", semitones: 2 }, expected: result.exercise.motions[0], directionCorrect: true, categoryCorrect: true, exactIntervalCorrect: true, replayCountBeforeFirstAnswer: 0, answerAttempts: 1, assistance: "independent" } });
  expect(entry).toMatchObject({ version: 1, source: { kind: "generated" }, selfRating: "good", firstAnswer: { assistance: "independent" } });
  expect(entry.motions).toHaveLength(7);
  expect(JSON.stringify(entry)).not.toMatch(/title|path|device|audio|midiSource/i);
});