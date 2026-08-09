import { describe, expect, test } from "vitest";
import { STANDARD_BASS_TUNINGS } from "./constants";
import {
  ROOT_MOTION_FINGERING_POLICY_VERSION,
  ROOT_MOTION_GENERATOR_VERSION,
  ROOT_MOTION_MAX_ATTEMPTS,
  deriveRootMotionTransfer,
  generateRootMotionExercise,
  rootMotionFromSignedSemitones,
  rootMotionWeights,
  solveRootMotionFingering,
  type RootMotionGeneratorSnapshot,
} from "./rootMotion";

function snapshot(overrides: Partial<RootMotionGeneratorSnapshot> = {}): RootMotionGeneratorSnapshot {
  return {
    generatorVersion: ROOT_MOTION_GENERATOR_VERSION,
    seed: "root-motion-test-seed",
    level: 3,
    noteCount: 2,
    phraseLengthBeats: 4,
    tempo: 96,
    tuning: STANDARD_BASS_TUNINGS[4],
    stringCount: 4,
    fretRange: { min: 0, max: 12 },
    pitchSpan: { minMidi: 28, maxMidi: 55 },
    handedness: "right",
    maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
    ...overrides,
  };
}

describe("Root Motion vocabulary", () => {
  test.each([
    [-7, "down", 7, "fifth"], [-6, "down", 6, "tritone"], [-5, "down", 5, "fourth"],
    [-4, "down", 4, "third"], [-3, "down", 3, "third"], [-2, "down", 2, "second"],
    [-1, "down", 1, "second"], [0, "same", 0, "same"], [1, "up", 1, "second"],
    [2, "up", 2, "second"], [3, "up", 3, "third"], [4, "up", 4, "third"],
    [5, "up", 5, "fourth"], [6, "up", 6, "tritone"], [7, "up", 7, "fifth"],
  ] as const)("represents %i semitones exactly", (signed, direction, semitones, category) => {
    expect(rootMotionFromSignedSemitones(signed)).toEqual({ signedSemitones: signed, direction, semitones, category });
  });

  test("keeps the frozen Stage00 weighted vocabulary", () => {
    expect(rootMotionWeights()).toEqual([
      [0, 2], [-1, 2], [1, 2], [-2, 3], [2, 3], [-3, 2], [3, 2], [-4, 2], [4, 2],
      [-5, 4], [5, 4], [-6, 1], [6, 1], [-7, 4], [7, 4],
    ]);
  });
});

describe("canonical Root Motion fingering", () => {
  test("uses fret shift, then midrange, then deterministic lexical order", () => {
    const result = solveRootMotionFingering({
      sourceMidi: 40,
      targetMidi: 45,
      tuning: STANDARD_BASS_TUNINGS[4],
      fretRange: { min: 0, max: 12 },
    });
    expect(result).toMatchObject({
      ok: true,
      pair: {
        source: { stringIndex: 1, fret: 7, midiNote: 40 },
        target: { stringIndex: 2, fret: 7, midiNote: 45 },
        shape: { stringRelation: "higher-string-adjacent", fretShift: 0, sameFret: true },
        policyVersion: ROOT_MOTION_FINGERING_POLICY_VERSION,
      },
    });
  });

  test("reports unavailable instead of inventing a shape", () => {
    expect(solveRootMotionFingering({
      sourceMidi: 24,
      targetMidi: 31,
      tuning: STANDARD_BASS_TUNINGS[4],
      fretRange: { min: 0, max: 12 },
    })).toEqual({ ok: false, error: "unplayable-source-or-target" });
  });

  test("keeps semantic labels physical when the visual handedness changes elsewhere", () => {
    const result = solveRootMotionFingering({ sourceMidi: 40, targetMidi: 45, tuning: STANDARD_BASS_TUNINGS[4], fretRange: { min: 0, max: 12 } });
    expect(result.ok && result.pair.shape.stringRelation).toBe("higher-string-adjacent");
  });
});

describe("Root Motion generator", () => {
  test("is deterministic and produces exact legal motion", () => {
    const first = generateRootMotionExercise(snapshot());
    const second = generateRootMotionExercise(snapshot());
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.exercise.motions).toHaveLength(1);
    expect(first.exercise.targetEvents[1].midiNote - first.exercise.targetEvents[0].midiNote)
      .toBe(first.exercise.motions[0].signedSemitones);
    expect(first.exercise.fingering).toHaveLength(1);
  });

  test("creates legal three-note chain exercises for Level 4", () => {
    const result = generateRootMotionExercise(snapshot({ level: 4, noteCount: 3, phraseLengthBeats: 6, seed: "chain" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercise.targetEvents).toHaveLength(3);
    expect(result.exercise.motions).toHaveLength(2);
    expect(result.exercise.fingering).toHaveLength(2);
  });

  test("supports the five-string low-B range without an octave substitution", () => {
    const result = generateRootMotionExercise(snapshot({
      tuning: STANDARD_BASS_TUNINGS[5], stringCount: 5, fretRange: { min: 0, max: 8 },
      pitchSpan: { minMidi: 23, maxMidi: 36 }, seed: "low-b",
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let index = 1; index < result.exercise.targetEvents.length; index += 1) {
      expect(result.exercise.targetEvents[index].midiNote - result.exercise.targetEvents[index - 1].midiNote)
        .toBe(result.exercise.motions[index - 1].signedSemitones);
    }
  });

  test("fails closed for incompatible level configuration and non-fixed retry limits", () => {
    expect(generateRootMotionExercise(snapshot({ level: 1, noteCount: 3 as 2 }))).toMatchObject({ ok: false, error: { code: "invalid-config" } });
    expect(generateRootMotionExercise(snapshot({ maxAttempts: 1 as 32 }))).toMatchObject({ ok: false, error: { code: "invalid-config" } });
  });
});
test("Transfer preserves the signed sequence while selecting a different legal start", () => {
  const source = generateRootMotionExercise(snapshot({ level: 4, noteCount: 3, phraseLengthBeats: 6, seed: "transfer-source" }));
  if (!source.ok) throw new Error(source.error.message);
  const transferred = deriveRootMotionTransfer(source.exercise);
  expect(transferred.ok).toBe(true);
  if (!transferred.ok) return;
  expect(transferred.exercise.motions).toEqual(source.exercise.motions);
  expect(transferred.exercise.targetEvents[0].midiNote).not.toBe(source.exercise.targetEvents[0].midiNote);
});