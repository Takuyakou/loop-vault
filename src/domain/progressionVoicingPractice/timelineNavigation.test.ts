import { describe, expect, it } from "vitest";
import { chordIndexAtTimelineBeat, timelineBeatAtPointer } from "./timelineNavigation";
import type { ProgressionVoicingPracticeSnapshot } from "./types";

const snapshot = {
  lengthBeats: 8,
  events: [
    { startBeat: 0, durationBeats: 2 },
    { startBeat: 4, durationBeats: 2 },
  ],
} as unknown as ProgressionVoicingPracticeSnapshot;

describe("timeline navigation", () => {
  it("uses the sounding chord and snaps gaps forward, then backwards at the tail", () => {
    expect([0, 1.9, 2, 3.9, 4, 6, 8].map((beat) => chordIndexAtTimelineBeat(snapshot, beat)))
      .toEqual([0, 0, 1, 1, 1, 1, 1]);
    expect(chordIndexAtTimelineBeat({ ...snapshot, events: [] }, 2)).toBeUndefined();
  });
});


describe("range pointer maps to global beats without changing meter", () => {
  it.each([4, 3, 5])("snaps first/last/short 2-beat cards in %i/4", meter => {
    const value = { ...snapshot, meter: { numerator: meter, denominator: 4 as const } };
    expect([100, 119, 140, 180].map(x => chordIndexAtTimelineBeat(value,
      timelineBeatAtPointer(x, 100, 10, 8)!))).toEqual([0, 0, 1, 1]);
    expect(timelineBeatAtPointer(115, 100 - 40, 10, 8)).toBe(5.5);
    expect(chordIndexAtTimelineBeat(value, timelineBeatAtPointer(115, 100 - 40, 10, 8)!)).toBe(1);
  });
  it("clamps pointer edges and rejects unusable geometry", () => {
    expect(timelineBeatAtPointer(-10, 100, 10, 8)).toBe(0);
    expect(timelineBeatAtPointer(200, 100, 10, 8)).toBe(8);
    expect(timelineBeatAtPointer(NaN, 0, 10, 8)).toBeUndefined();
    expect(timelineBeatAtPointer(10, 0, 0, 8)).toBeUndefined();
    expect(timelineBeatAtPointer(10, 0, 10, 0)).toBeUndefined();
  });
});
