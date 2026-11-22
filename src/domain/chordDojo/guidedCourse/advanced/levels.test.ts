import { describe, expect, it } from "vitest";
import { ADVANCED_LEVELS, PROGRESSION_FAMILIES, TWELVE_KEYS, advancedLevelSpec, isAdvancedLevel } from "./levels";

describe("P23-45 advanced course level contract", () => {
  it("keeps the published question counts and thresholds for Lv4–8 and the capstone", () => {
    expect(advancedLevelSpec(4)).toMatchObject({ sameDay: { questions: 20, pass: 18 }, delay: { questions: 10, pass: 8 } });
    // Lv5 adds the four mid-card questions to the ten progressions in the same-day attempt.
    expect(advancedLevelSpec(5).sameDay.parts.map((part) => [part.id, part.questions, part.pass])).toEqual([
      ["progressions", 10, 8],
      ["mid", 4, 3],
    ]);
    expect(advancedLevelSpec(5).delay).toMatchObject({ questions: 5, pass: 4 });
    expect(advancedLevelSpec(6)).toMatchObject({ sameDay: { questions: 12, pass: 10 }, delay: { questions: 6, pass: 5 } });
    expect(advancedLevelSpec(6).extra).toContain("12キー");
    expect(advancedLevelSpec(7)).toMatchObject({ sameDay: { questions: 10, pass: 8 }, delay: { questions: 5, pass: 4 } });
    expect(advancedLevelSpec(8).groups?.map((group) => group.id)).toEqual(["six", "nine", "thirteen"]);
    // P23-56: per group name 12 (10) · in a progression 4 (3) · ear 6 (5); later name 6 (5) · in a progression 3 (2).
    expect(advancedLevelSpec(8).sameDay.parts).toHaveLength(9);
    expect(advancedLevelSpec(8).sameDay).toMatchObject({ questions: 66, pass: 54 });
    expect(advancedLevelSpec(8).delay).toMatchObject({ questions: 27, pass: 21 });
    expect(advancedLevelSpec(8).sameDay.parts.slice(0, 3).map((part) => [part.id, part.questions, part.pass])).toEqual([
      ["six:name", 12, 10],
      ["six:context", 4, 3],
      ["six:ear", 6, 5],
    ]);
    expect(advancedLevelSpec("capstone").sameDay.questions).toBe(32);
    // P23-53 (rule 3): 22 + 4 + 2 of 32 the same day, 11 + 2 of 15 on the later day.
    expect(advancedLevelSpec("capstone").sameDay.pass).toBe(28);
    expect(advancedLevelSpec("capstone").delay.pass).toBe(13);
    expect(advancedLevelSpec("capstone").sameDay.parts.map((part) => [part.id, part.questions, part.pass])).toEqual([
      ["name", 24, 22],
      ["progression", 5, 4],
      ["sight", 3, 2],
    ]);
    expect(advancedLevelSpec("capstone").delay.parts.map((part) => [part.id, part.questions, part.pass])).toEqual([
      ["delay-name", 12, 11],
      ["delay-ear", 3, 2],
    ]);
  });

  it("covers the six progression families and all twelve keys", () => {
    expect(PROGRESSION_FAMILIES).toHaveLength(6);
    expect(TWELVE_KEYS).toHaveLength(12);
  });

  it("distinguishes numeric levels from the capstone", () => {
    expect(ADVANCED_LEVELS.map((entry) => entry.level)).toEqual([4, 5, 6, 7, 8, "capstone"]);
    expect(isAdvancedLevel(4)).toBe(true);
    expect(isAdvancedLevel("capstone")).toBe(false);
    expect(() => advancedLevelSpec(9 as never)).toThrow();
  });
});
