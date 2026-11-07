import { describe, expect, it } from "vitest";
import {
  normalizeRemoved,
  recommendedOnScreen,
  screenBarsToSourceBars,
  screenToSource,
  shiftRangeKey,
  shiftSaveRange,
  shiftSegments,
  sourceToScreen,
  spanCrossesRemoved,
  type BeatRange,
} from "./barMap";
import type { CorrectionSegment } from "./correctionModel";

/** P17-02: the source ⇔ screen map of 「小節を消して詰める」. */

const cut2: BeatRange[] = [{ start: 4, end: 8 }];

describe("bar map (P17-02)", () => {
  it("is the identity when nothing was cut", () => {
    expect(sourceToScreen(0, [])).toBe(0);
    expect(sourceToScreen(3.5, [])).toBe(3.5);
    expect(screenToSource(0, 8, [])).toEqual([{ start: 0, end: 8 }]);
    expect(spanCrossesRemoved(0, 8, [])).toBe(false);
  });

  it("maps source beats around a removed span, including both edges", () => {
    expect(sourceToScreen(0, cut2)).toBe(0);
    expect(sourceToScreen(3.999, cut2)).toBe(3.999);
    expect(sourceToScreen(4, cut2)).toBeUndefined();
    expect(sourceToScreen(7.999, cut2)).toBeUndefined();
    expect(sourceToScreen(8, cut2)).toBe(4);
    expect(sourceToScreen(12, cut2)).toBe(8);
  });

  it("splits a screen range at every removed span and keeps the total length", () => {
    expect(screenToSource(0, 4, cut2)).toEqual([{ start: 0, end: 4 }]);
    expect(screenToSource(4, 8, cut2)).toEqual([{ start: 8, end: 12 }]);
    expect(screenToSource(0, 8, cut2)).toEqual([{ start: 0, end: 4 }, { start: 8, end: 12 }]);
    expect(screenToSource(2, 6, cut2)).toEqual([{ start: 2, end: 4 }, { start: 8, end: 10 }]);
    const ranges = screenToSource(1, 11, cut2);
    expect(ranges.reduce((sum, range) => sum + (range.end - range.start), 0)).toBe(10);
  });

  it("tells whether a range touches a cut (touching the edge does not)", () => {
    expect(spanCrossesRemoved(0, 4, cut2)).toBe(false);
    expect(spanCrossesRemoved(8, 12, cut2)).toBe(false);
    expect(spanCrossesRemoved(3, 5, cut2)).toBe(true);
    expect(spanCrossesRemoved(0, 8, cut2)).toBe(true);
  });

  it("maps whole screen bars back to source bars only when they do not cross a cut", () => {
    expect(screenBarsToSourceBars({ startBar: 1, endBar: 1 }, 4, cut2)).toEqual({ startBar: 1, endBar: 1 });
    expect(screenBarsToSourceBars({ startBar: 2, endBar: 2 }, 4, cut2)).toEqual({ startBar: 3, endBar: 3 });
    expect(screenBarsToSourceBars({ startBar: 1, endBar: 2 }, 4, cut2)).toBeUndefined();
  });

  it("composes cuts: removing a screen bar after a cut adds its source span and merges neighbours", () => {
    const first = normalizeRemoved([...cut2, ...screenToSource(4, 8, cut2)]);
    expect(first).toEqual([{ start: 4, end: 12 }]);
    expect(sourceToScreen(0, first)).toBe(0);
    expect(sourceToScreen(12, first)).toBe(4);
    expect(screenToSource(0, 10, first)).toEqual([{ start: 0, end: 4 }, { start: 12, end: 18 }]);
    expect(sourceToScreen(4, first)).toBeUndefined();
    expect(sourceToScreen(14, first)).toBe(6);
  });

  it("shifts save ranges: before stays, after moves left, overlapping loses the cut bars", () => {
    expect(shiftSaveRange({ startBar: 1, endBar: 1 }, 2, 2)).toEqual({ startBar: 1, endBar: 1 });
    expect(shiftSaveRange({ startBar: 3, endBar: 7 }, 2, 2)).toEqual({ startBar: 2, endBar: 6 });
    expect(shiftSaveRange({ startBar: 1, endBar: 7 }, 2, 2)).toEqual({ startBar: 1, endBar: 6 });
    expect(shiftSaveRange({ startBar: 2, endBar: 2 }, 2, 2)).toBeUndefined();
    expect(shiftSaveRange({ startBar: 2, endBar: 4 }, 2, 3)).toEqual({ startBar: 2, endBar: 2 });
    expect(shiftRangeKey("3-7", 2, 2)).toBe("2-6");
    expect(shiftRangeKey("2-2", 2, 2)).toBeUndefined();
  });

  it("shifts segments by number, drops the repeat count only where the length changed", () => {
    const segments: CorrectionSegment[] = [
      { id: "a", startBar: 1, endBar: 4, label: "区切り1", source: "segmentSections", repeatCount: 2 },
      { id: "b", startBar: 5, endBar: 8, label: "区切り2", source: "segmentSections", repeatCount: 2 },
      { id: "c", startBar: 9, endBar: 9, label: "9小節", source: "fallback-8bar" },
    ];
    expect(shiftSegments(segments, 2, 2)).toEqual([
      { id: "a", startBar: 1, endBar: 3, label: "区切り1", source: "segmentSections" },
      { id: "b", startBar: 4, endBar: 7, label: "区切り2", source: "segmentSections", repeatCount: 2 },
      { id: "c", startBar: 8, endBar: 8, label: "8小節", source: "fallback-8bar" },
    ]);
    expect(shiftSegments(segments, 9, 9)).toEqual([
      { id: "a", startBar: 1, endBar: 4, label: "区切り1", source: "segmentSections", repeatCount: 2 },
      { id: "b", startBar: 5, endBar: 8, label: "区切り2", source: "segmentSections", repeatCount: 2 },
    ]);
  });

  it("moves recommended ranges with the song and leaves out the ones touching a cut", () => {
    const candidates = [
      { startBar: 1, endBar: 2 },
      { startBar: 2, endBar: 3 },
      { startBar: 3, endBar: 4 },
      { startBar: 5, endBar: 8 },
    ];
    expect(recommendedOnScreen(candidates, cut2, 4, 7)).toEqual([
      { startBar: 2, endBar: 3 },
      { startBar: 4, endBar: 7 },
    ]);
  });
});
