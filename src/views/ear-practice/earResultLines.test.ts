import { describe, expect, it } from "vitest";
import { median } from "../../domain/earPractice";
import { secondsLines } from "./earResultLines";

/** P23-23b X8/C4: the seconds' line of the result's chord cards. */
describe("secondsLines (P23-23b X8)", () => {
  it("2.0・2.0・2.0・6.0: only the fourth is yellow, the lengths are 1/3・1/3・1/3・1", () => {
    const cards = [{ sec: 2 }, { sec: 2 }, { sec: 2 }, { sec: 6 }];
    const middle = median([2, 2, 2, 6]);
    const lines = secondsLines(cards, middle);
    expect(middle).toBe(2);
    expect(lines.map((line) => line?.ratio)).toEqual([1 / 3, 1 / 3, 1 / 3, 1]);
    expect(lines.map((line) => line?.slow)).toEqual([false, false, false, true]);
  });

  it("has no line where a card has no seconds", () => {
    const lines = secondsLines([{ sec: 2 }, {}, { sec: 6 }], 2);
    expect(lines[0]).toEqual({ ratio: 1 / 3, slow: false });
    expect(lines[1]).toBeUndefined();
    expect(lines[2]).toEqual({ ratio: 1, slow: true });
  });

  it("has no yellow line when the question has no median", () => {
    const lines = secondsLines([{ sec: 4 }, { sec: 8 }], undefined);
    expect(lines.map((line) => line?.slow)).toEqual([false, false]);
  });

  it("does not divide by zero when every card has no seconds", () => {
    expect(secondsLines([{}, {}], undefined)).toEqual([undefined, undefined]);
  });
});
