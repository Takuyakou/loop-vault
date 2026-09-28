import { describe, expect, it } from "vitest";
import type { ChordTimelineItem } from "../../domain/types";
import { timelineIndexAt } from "./timelinePlayhead";

const item = (bar: number, beat: number, durationBeats: number): ChordTimelineItem => ({
  bar, beat, durationBeats, confidence: 1, alternatives: [], warnings: [],
  chord: { root: 0, quality: "maj", tensions: [], label: "C" },
});

describe("timelineIndexAt", () => {
  const timeline = [item(1, 1, 4), item(2, 1, 2), item(2, 3, 2)];

  it("follows the preview timing at the given tempo", () => {
    expect(timelineIndexAt(0, timeline, 120)).toBe(0);
    expect(timelineIndexAt(1_999, timeline, 120)).toBe(0);
    expect(timelineIndexAt(2_000, timeline, 120)).toBe(1);
    expect(timelineIndexAt(3_100, timeline, 120)).toBe(2);
  });

  it("returns -1 after the last chord and for empty timelines", () => {
    expect(timelineIndexAt(4_000, timeline, 120)).toBe(-1);
    expect(timelineIndexAt(0, [], 120)).toBe(-1);
  });

  it("starts from the first chord even when the block does not start at bar 1", () => {
    expect(timelineIndexAt(0, [item(5, 1, 4), item(6, 1, 4)], 60)).toBe(0);
    expect(timelineIndexAt(4_000, [item(5, 1, 4), item(6, 1, 4)], 60)).toBe(1);
  });
});
