import { describe, expect, it } from "vitest";
import {
  RHYTHM_GENERATOR_VERSION,
  buildRhythmHints,
  deriveRhythmTransferExercise,
  generateRhythmExercise,
  rhythmVocabularyIds,
  type RhythmGeneratorSnapshot,
} from "./index";

function snapshot(overrides: Partial<RhythmGeneratorSnapshot> = {}): RhythmGeneratorSnapshot {
  return { generatorVersion: RHYTHM_GENERATOR_VERSION, seed: "rhythm-fixture", vocabularyId: "eighth", tempo: 88, meter: { numerator: 4, denominator: 4 }, phraseBars: 1, startPositionBeats: 0, countInBars: 1, listenLimit: 2, ...overrides };
}

describe("Rhythm Echo generator", () => {
  it("generates every vocabulary cell inside its phrase without forbidden overlap", () => {
    for (const vocabularyId of rhythmVocabularyIds()) {
      const result = generateRhythmExercise(snapshot({ vocabularyId }));
      expect(result.ok, vocabularyId).toBe(true);
      if (!result.ok) continue;
      const phraseBeats = result.exercise.meter.numerator * result.exercise.generatorSnapshot.phraseBars;
      expect(result.exercise.targetEvents).not.toHaveLength(0);
      for (const [index, event] of result.exercise.targetEvents.entries()) {
        expect(event.index).toBe(index);
        expect(event.startBeat).toBeGreaterThanOrEqual(0);
        expect(event.startBeat + event.durationBeats).toBeLessThanOrEqual(phraseBeats);
        if (index > 0) expect(event.startBeat).toBeGreaterThanOrEqual(result.exercise.targetEvents[index - 1]!.startBeat);
      }
    }
  });

  it.each([{ numerator: 3, denominator: 4 }, { numerator: 4, denominator: 4 }, { numerator: 6, denominator: 8 }] as const)("supports meter $numerator/$denominator", (meter) => {
    const result = generateRhythmExercise(snapshot({ meter, vocabularyId: "rest-start", phraseBars: 2, startPositionBeats: 1 }));
    expect(result).toMatchObject({ ok: true, exercise: { meter } });
  });

  it("is deterministic for an identical snapshot and distinguishes transfer identity", () => {
    const first = generateRhythmExercise(snapshot({ seed: "stable", vocabularyId: "sixteenth-syncopation" }));
    const second = generateRhythmExercise(snapshot({ seed: "stable", vocabularyId: "sixteenth-syncopation" }));
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("fixture must generate");
    const transfer = deriveRhythmTransferExercise({ id: "attempt-1", completedAt: "2026-08-02T10:00:00.000Z", rating: "good", exerciseSnapshot: first.exercise }, { tempo: 96, startPositionBeats: 1 });
    expect(transfer).toMatchObject({ ok: true, sourceAttemptId: "attempt-1", exercise: { mode: "rhythm", tempo: 96 } });
    expect(transfer.ok && transfer.exercise.id).not.toBe(first.exercise.id);
  });

  it("keeps Hint 0 empty and makes the full grid the fourth disclosure", () => {
    expect(buildRhythmHints(0)).toEqual([]);
    expect(buildRhythmHints(3).map((hint) => hint.kind)).toEqual(["tempo-meter", "start-position", "rhythm-syllables"]);
    expect(buildRhythmHints(4)[3]).toEqual({ level: 4, kind: "full-rhythm-grid" });
  });

  it("rejects out-of-range tempo, meter and count-in instead of silently normalizing", () => {
    expect(generateRhythmExercise(snapshot({ tempo: 29 })).ok).toBe(false);
    expect(generateRhythmExercise(snapshot({ meter: { numerator: 3, denominator: 8 } as never })).ok).toBe(false);
    expect(generateRhythmExercise(snapshot({ countInBars: 3 as never })).ok).toBe(false);
  });
});
