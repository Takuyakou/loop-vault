import { describe, expect, it } from "vitest";
import { breakAfter, roundCount, roundScore, roundState } from "./guidedRounds";

describe("P23-51 rounds of five", () => {
  it("20 is 5×4, 14 is 5・5・4, 10 is 5×2", () => {
    expect(roundCount(20)).toBe(4);
    expect(roundCount(14)).toBe(3);
    expect(roundCount(10)).toBe(2);
    expect(roundState(11, 14, []).dots).toHaveLength(4);
  });

  it("the mock ③ header: question 9 of 20 after ✓ ✓ ✗ in round 2", () => {
    const results = [true, true, true, true, true, true, true, false];
    expect(roundState(9, 20, results)).toEqual({ round: 2, rounds: 4, dots: ["ok", "ok", "bad", "now", "todo"], bars: ["full", "part", "empty", "empty"] });
    // Once question 9 is answered its dot shows the result.
    expect(roundState(9, 20, [...results, true]).dots).toEqual(["ok", "ok", "bad", "ok", "todo"]);
  });

  it("pauses after 5, 10, 15 of 20 — not after 20", () => {
    expect([5, 10, 15, 20, 4].map((position) => breakAfter(position, 20))).toEqual([true, true, true, false, false]);
    expect([5, 10, 14].map((position) => breakAfter(position, 14))).toEqual([true, true, false]);
  });

  it("the mock ⑥ numbers: 5問中 4問 正解・ここまで 10問中 9問", () => {
    const results = [true, true, true, true, true, true, true, false, true, true];
    expect(roundScore(10, 20, results)).toEqual({ round: 2, rounds: 4, correct: 4, count: 5, totalCorrect: 9, totalCount: 10 });
  });
});
