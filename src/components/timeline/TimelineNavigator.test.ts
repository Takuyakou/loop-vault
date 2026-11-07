import { describe, expect, it } from "vitest";
import { fractionAt, windowLeftFromDrag } from "./TimelineNavigator";

describe("TimelineNavigator geometry (P5.26.2-04)", () => {
  it("maps the left edge, the middle and the right edge of the strip to 0, 0.5 and 1", () => {
    expect(fractionAt(100, 100, 400)).toBe(0);
    expect(fractionAt(300, 100, 400)).toBe(0.5);
    expect(fractionAt(500, 100, 400)).toBe(1);
  });

  it("clamps outside the strip and survives a zero-width strip", () => {
    expect(fractionAt(40, 100, 400)).toBe(0);
    expect(fractionAt(900, 100, 400)).toBe(1);
    expect(fractionAt(300, 100, 0)).toBe(0);
  });

  it("a dragged frame keeps the point it was grabbed at and stays inside the strip", () => {
    // frame 20 % wide, grabbed 5 % from its left edge
    expect(windowLeftFromDrag(0.5, 0.05, 0.2)).toBeCloseTo(0.45);
    expect(windowLeftFromDrag(0, 0.05, 0.2)).toBe(0);
    expect(windowLeftFromDrag(1, 0.05, 0.2)).toBeCloseTo(0.8);
  });
});
