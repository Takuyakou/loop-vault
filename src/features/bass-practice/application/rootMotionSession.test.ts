import { describe, expect, test } from "vitest";
import { STANDARD_BASS_TUNINGS, ROOT_MOTION_GENERATOR_VERSION, ROOT_MOTION_MAX_ATTEMPTS, generateRootMotionExercise } from "../domain";
import { RootMotionPracticeSession } from "./rootMotionSession";

function exercise() {
  const result = generateRootMotionExercise({
    generatorVersion: ROOT_MOTION_GENERATOR_VERSION, seed: "session", level: 3, noteCount: 2,
    phraseLengthBeats: 4, tempo: 96, tuning: STANDARD_BASS_TUNINGS[4], stringCount: 4,
    fretRange: { min: 0, max: 12 }, pitchSpan: { minMidi: 28, maxMidi: 55 }, handedness: "right", maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.exercise;
}

describe("Root Motion Practice session", () => {
  test("captures first-answer evidence before self review and never derives a rating", () => {
    const session = new RootMotionPracticeSession(exercise());
    expect(session.startListen().ok).toBe(true);
    expect(session.completeListen().ok).toBe(true);
    const motion = exercise().motions[0];
    const answer = session.submitIdentify({ direction: motion.direction, category: motion.category, semitones: motion.semitones });
    expect(answer.ok).toBe(true);
    expect(answer.snapshot.firstAnswer).toMatchObject({ directionCorrect: true, categoryCorrect: true, exactIntervalCorrect: true, replayCountBeforeFirstAnswer: 0, assistance: "independent" });
    expect(answer.snapshot.rating).toBeUndefined();
    expect(session.submitIdentify({ direction: "up", category: "second", semitones: 1 }).ok).toBe(false);
    expect(session.continueToPlay().ok).toBe(true);
    expect(session.completePlay().ok).toBe(true);
    expect(session.rate("hard").snapshot.rating).toBe("hard");
  });

  test("records hints and replay count in first-answer evidence", () => {
    const session = new RootMotionPracticeSession(exercise());
    session.startListen(); session.completeListen(); session.startListen(); session.completeListen();
    session.nextHint(); session.nextHint();
    const motion = exercise().motions[0];
    const result = session.submitIdentify({ direction: motion.direction, category: motion.category, semitones: motion.semitones });
    expect(result.snapshot.firstAnswer).toMatchObject({ replayCountBeforeFirstAnswer: 1, assistance: "assisted", answerAttempts: 1 });
  });

  test("requires the evidence appropriate to the selected level", () => {
    const generated = generateRootMotionExercise({
      generatorVersion: ROOT_MOTION_GENERATOR_VERSION, seed: "level-two", level: 2, noteCount: 2,
      phraseLengthBeats: 4, tempo: 96, tuning: STANDARD_BASS_TUNINGS[4], stringCount: 4,
      fretRange: { min: 0, max: 12 }, pitchSpan: { minMidi: 28, maxMidi: 55 }, handedness: "right", maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
    });
    if (!generated.ok) throw new Error(generated.error.message);
    const session = new RootMotionPracticeSession(generated.exercise);
    session.startListen(); session.completeListen();
    expect(session.submitIdentify({ direction: "up" })).toMatchObject({ ok: false, message: "Choose an interval category." });
  });

  test("cancels initial playback back to ready without retaining a replay", () => {
    const session = new RootMotionPracticeSession(exercise());
    session.startListen();
    expect(session.cancelListen()).toMatchObject({ ok: true, snapshot: { status: "ready", listenCount: 0 } });
  });
});