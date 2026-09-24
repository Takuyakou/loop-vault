import { describe, expect, it } from "vitest";
import { availableTimelineScales, clampTimelineScale, compactTimelineCard, timelinePixelsPerBeat } from "./timelineLayout";

describe("Voicing Loop timeline geometry", () => {
  it("fills short progressions at every valid scale without reserving nonexistent groups", () => {
    expect(availableTimelineScales(8)).toEqual([8]);
    expect(clampTimelineScale(16, 8)).toBe(8);
    expect(timelinePixelsPerBeat(960, 32, 4, 8)).toBe(30);
    expect(timelinePixelsPerBeat(960, 32, 4, 16)).toBe(30);
  });

  it("keeps card widths proportional to source duration on a long progression", () => {
    expect(availableTimelineScales(20)).toEqual([8, 12, 16]);
    const pixelsPerBeat = timelinePixelsPerBeat(960, 80, 4, 8);
    expect([1, 2, 4].map((duration) => duration * pixelsPerBeat)).toEqual([30, 60, 120]);
    expect(timelinePixelsPerBeat(960, 80, 4, 16)).toBe(15);
    expect(compactTimelineCard(30)).toBe(true);
    expect(compactTimelineCard(60)).toBe(false);
  });
});
