import { describe, expect, it } from "vitest";
import { createGeneratorSnapshot, mergeDegreeExercises, type DegreeUiSettings } from "./BassPracticeView";
import { generateDegreeExercise } from "../domain";

const SETTINGS: DegreeUiSettings = {
  stringCount: 4,
  handedness: "right",
  fretRange: { min: 0, max: 12 },
  singEnabled: true,
  singingReferenceMode: "auto",
  phraseBars: 2,
};

describe("mergeDegreeExercises (2-bar Degree Echo)", () => {
  it("concatenates two one-bar phrases into a coherent two-bar exercise", () => {
    const base = createGeneratorSnapshot(SETTINGS, 1);
    const first = generateDegreeExercise(base);
    const second = generateDegreeExercise({ ...base, seed: `${base.seed}::bar2` });
    if (!first.ok || !second.ok) throw new Error("fixture generation failed");

    const merged = mergeDegreeExercises(first.exercise, second.exercise);

    expect(merged.targetEvents).toHaveLength(
      first.exercise.targetEvents.length + second.exercise.targetEvents.length,
    );
    // indices are sequential across both bars
    expect(merged.targetEvents.map((event) => event.index)).toEqual(
      merged.targetEvents.map((_, index) => index),
    );
    // the second bar is offset by the first bar's length
    const offset = first.exercise.difficulty.phraseLengthBeats;
    const secondStart = merged.targetEvents[first.exercise.targetEvents.length].startBeat;
    expect(secondStart).toBe(second.exercise.targetEvents[0].startBeat + offset);
    // phrase length is the sum of both bars
    expect(merged.difficulty.phraseLengthBeats).toBe(
      first.exercise.difficulty.phraseLengthBeats + second.exercise.difficulty.phraseLengthBeats,
    );
    // same key/scale, distinct id
    expect(merged.tonalContext).toEqual(first.exercise.tonalContext);
    expect(merged.id).not.toBe(first.exercise.id);
  });
});
