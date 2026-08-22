import { describe, expect, it } from "vitest";
import type { ChordTimelineItem } from "./types";
import {
  buildTimelineHarmonicActivity,
  harmonicActivityLevel,
} from "./timelineHarmonicActivity";

function event(
  bar: number,
  beat: number,
  durationBeats: number,
): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats,
    chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

describe("timeline harmonic activity", () => {
  it("ignores invalid or non-positive events and locks every bucket boundary", () => {
    const activity = buildTimelineHarmonicActivity([
      event(Number.NaN, 1, 4),
      event(1, Number.NaN, 4),
      event(1, 1, Number.POSITIVE_INFINITY),
      event(1, 1, 0),
      event(1, 1, -1),
      event(0, 1, 4),
      event(1, 0, 4),
      event(2, 1, 1),
      event(3, 1, 3),
      event(4, 1, 4),
    ], 4, 4);

    expect(activity).toEqual([
      { bar: 1, normalized: 0, level: "inactive" },
      { bar: 2, normalized: 0.25, level: "low" },
      { bar: 3, normalized: 0.75, level: "medium" },
      { bar: 4, normalized: 1, level: "high" },
    ]);
    expect([
      harmonicActivityLevel(0),
      harmonicActivityLevel(0.25),
      harmonicActivityLevel(0.250001),
      harmonicActivityLevel(0.75),
      harmonicActivityLevel(0.750001),
      harmonicActivityLevel(1),
    ]).toEqual(["inactive", "low", "medium", "medium", "high", "high"]);
  });

  it("clips cross-bar overlap, sums overlaps, and clamps outliers", () => {
    expect(buildTimelineHarmonicActivity([
      event(1, 4, 2),
      event(2, 1, 4),
    ], 2, 4)).toEqual([
      { bar: 1, normalized: 0.25, level: "low" },
      { bar: 2, normalized: 1, level: "high" },
    ]);
  });

  it("is deterministic for zero, one, and 145 bars regardless of event order", () => {
    expect(buildTimelineHarmonicActivity([], 0, 4)).toEqual([]);
    expect(buildTimelineHarmonicActivity([], 1, 4)).toEqual([
      { bar: 1, normalized: 0, level: "inactive" },
    ]);

    const events = [
      event(1, 1, 96),
      event(25, 1, 1),
      event(26, 1, 2),
      event(33, 1, 256),
      event(105, 1, 164),
      event(37, 1, 4),
    ];
    const forward = buildTimelineHarmonicActivity(events, 145, 4);
    const reversed = buildTimelineHarmonicActivity([...events].reverse(), 145, 4);

    expect(reversed).toEqual(forward);
    expect(forward).toHaveLength(145);
    expect(forward.every(({ normalized }) => normalized >= 0 && normalized <= 1)).toBe(true);
    expect(forward.filter(({ level }) => level === "inactive")).toHaveLength(14);
    expect(forward.filter(({ level }) => level === "low")).toHaveLength(1);
    expect(forward.filter(({ level }) => level === "medium")).toHaveLength(1);
    expect(forward.filter(({ level }) => level === "high")).toHaveLength(129);
  });
});
