import { describe, expect, it } from "vitest";
import {
  createCompletedAttempt,
  degreeDifficultyPreset,
  degreeVocabulary,
  deriveTransferExercise,
  fretboardPositions,
  generateDegreeExercise,
} from ".";
import { generatedExercise, generatorSnapshot } from "./testFixtures";

function sourceAttempt(rating: "again" | "good" = "good") {
  const exercise = generatedExercise({ seed: "transfer-source", key: "C" });
  return createCompletedAttempt({
    id: `attempt-${rating}`,
    sessionId: "session-transfer",
    startedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:01:00.000Z",
    listenCount: 1,
    hintLevel: 0,
    singSkipped: false,
    singGateCompleted: true,
    rating,
    exercise,
  });
}

describe("Degree Echo transfer", () => {
  it("derives a deterministic different-key exercise with the same degrees and rhythm", () => {
    const source = sourceAttempt();
    const first = deriveTransferExercise(source, {
      targetKey: "G",
      preferredStringIndex: 2,
      preferredFret: 7,
    });
    const second = deriveTransferExercise(source, {
      targetKey: "G",
      preferredStringIndex: 2,
      preferredFret: 7,
    });
    expect(second).toEqual(first);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.sourceAttemptId).toBe(source.id);
    expect(first.exercise.tonalContext.key).toBe("G");
    expect(first.exercise.id).not.toBe(source.exerciseId);
    expect(first.exercise.targetEvents.map((event) => event.degree))
      .toEqual(source.exerciseSnapshot.targetEvents.map((event) => event.degree));
    expect(first.exercise.targetEvents.map(({ index, startBeat, durationBeats, velocity }) => ({
      index,
      startBeat,
      durationBeats,
      velocity,
    }))).toEqual(source.exerciseSnapshot.targetEvents.map(({
      index,
      startBeat,
      durationBeats,
      velocity,
    }) => ({ index, startBeat, durationBeats, velocity })));
    for (const event of first.exercise.targetEvents) {
      expect(fretboardPositions(
        event.midiNote,
        first.exercise.generatorSnapshot.tuning,
        first.exercise.generatorSnapshot.fretRange,
      ).length).toBeGreaterThan(0);
    }
  });

  it("rejects same-key, unsupported-key, and ineligible source attempts", () => {
    expect(deriveTransferExercise(sourceAttempt(), { targetKey: "C" }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "same-key" }),
      }));
    expect(deriveTransferExercise(sourceAttempt(), { targetKey: "H" }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "unsupported-key" }),
      }));
    expect(deriveTransferExercise(sourceAttempt("again"), { targetKey: "G" }))
      .toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "source-not-eligible" }),
      }));
  });

  it("keeps major-relative degree intervals when transferring a minor phrase", () => {
    const vocabulary = degreeVocabulary("tonic-dominant-mixolydian");
    const generated = generateDegreeExercise(generatorSnapshot({
      scale: "minor",
      key: "D",
      vocabularyId: vocabulary.id,
      degreeSequence: vocabulary.degreeSequence,
      allowedDegrees: degreeDifficultyPreset(3, "minor").allowedDegrees,
      noteCount: vocabulary.degreeSequence.length,
      pitchSpan: { minMidi: 23, maxMidi: 67 },
      fretRange: { min: 0, max: 24 },
      maxAttempts: 256,
    }));
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const source = createCompletedAttempt({
      id: "minor-transfer-source",
      sessionId: "minor-transfer-session",
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-01T00:01:00.000Z",
      listenCount: 1,
      hintLevel: 0,
      singSkipped: false,
      singGateCompleted: true,
      rating: "good",
      exercise: generated.exercise,
    });
    const transferred = deriveTransferExercise(source, { targetKey: "A" });
    expect(transferred.ok).toBe(true);
    if (!transferred.ok) return;
    expect(transferred.exercise.targetEvents.map((event) => event.midiNote % 12))
      .toEqual([9, 4, 6, 7]);
  });
});
