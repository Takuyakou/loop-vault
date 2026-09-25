import { describe, expect, it } from "vitest";
import { isBlack, nextShapeRanges } from "./nextShape";
const hand = (left: number[], right: number[]) => ({ left, right });
describe("Next Shape compact range", () => {
  it("snaps a one-octave shape to readable octave boundaries", () => {
    expect(nextShapeRanges(hand([], [60,64,67])).ranges).toEqual([{ min: 48, max: 71 }]);
  });
  it("keeps two octaves and every source note in range", () => {
    const notes = [50,55,60,67,72];
    const range = nextShapeRanges(hand([], notes)).ranges[0]!;
    expect(notes.every((note) => note >= range.min && note <= range.max)).toBe(true);
    expect(range.max - range.min).toBeLessThanOrEqual(35);
  });
  it("splits distant hands instead of compressing the full span", () => {
    const shape = nextShapeRanges(hand([36,40], [76,79]));
    expect(shape.separated).toBe(true);
    expect(shape.ranges).toHaveLength(2);
    expect(shape.ranges[0]!.max).toBeLessThan(shape.ranges[1]!.min);
  });
  it("works for left-only, right-only and five notes per hand", () => {
    expect(nextShapeRanges(hand([36,40], [])).ranges).toHaveLength(1);
    expect(nextShapeRanges(hand([], [64,67])).ranges).toHaveLength(1);
    const notes = hand([36,40,43,47,48], [60,64,67,71,72]);
    const shape = nextShapeRanges(notes);
    expect([...notes.left, ...notes.right].every((note) => shape.ranges.some((range) => note >= range.min && note <= range.max))).toBe(true);
  });
  it("covers VL-09 seven-note redistribution and each selection family", () => {
    for (const notes of [hand([36,48], [60,64,67,71,74]), hand([], [48,60,64]), hand([41], [53,57])]) {
      const shape = nextShapeRanges(notes);
      expect([...notes.left, ...notes.right].every((note) => shape.ranges.some((range) => note >= range.min && note <= range.max))).toBe(true);
    }
  });
  it("uses correct black-key locations", () => {
    expect(isBlack(61)).toBe(true);
    expect(isBlack(60)).toBe(false);
  });
  it("has no range for no next voicing", () => {
    expect(nextShapeRanges(hand([], [])).ranges).toEqual([]);
  });
});
