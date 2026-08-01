import { describe, expect, it } from "vitest";
import { generatedExercise } from "../domain/testFixtures";
import { degreeHintDisclosure } from "./degreeHints";

describe("Degree Echo hint disclosure", () => {
  it("reveals the ladder sequentially and keeps fretboard data exclusive to level 4", () => {
    const exercise = generatedExercise({ seed: "hint-disclosure" });
    const disclosures = ([0, 1, 2, 3, 4] as const).map(
      (level) => degreeHintDisclosure(exercise, level),
    );

    expect(disclosures[0]).toEqual({ level: 0 });
    expect(disclosures[1]).toEqual({
      level: 1,
      tonalContext: exercise.tonalContext,
    });
    expect(disclosures[2]).toMatchObject({
      level: 2,
      noteCount: exercise.targetEvents.length,
    });
    expect(disclosures[2]).not.toHaveProperty("degrees");
    expect(disclosures[3]).toHaveProperty("degrees");
    expect(disclosures[3]).not.toHaveProperty("noteNames");
    expect(disclosures.slice(0, 4).every((item) => !("fretboard" in item))).toBe(true);
    expect(disclosures[4].fretboard).toHaveLength(exercise.targetEvents.length);
    expect(disclosures[4].fretboard?.every((item) => item.positions.length > 0)).toBe(true);
  });
});
