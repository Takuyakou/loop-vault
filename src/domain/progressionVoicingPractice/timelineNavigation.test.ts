import { describe, expect, it } from "vitest";
import { chordIndexAtTimelineBeat } from "./timelineNavigation";
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
