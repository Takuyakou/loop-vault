import { describe, expect, it } from "vitest";
import { isFollowScrollPosition, pageTurnTarget } from "./timelineFollow";

describe("timeline page-turn follow", () => {
  it.each([8, 12, 16])("keeps a fully visible chord steady at display %i", (scale) => {
    const pixelsPerBeat = 800 / (scale * 4);
    expect(pageTurnTarget({ chordStartBeat: 8, chordDurationBeats: 4, pixelsPerBeat,
      viewportWidth: 800, scrollLeft: 0, contentWidth: 4000 })).toBeUndefined();
  });

  it.each([8, 12, 16])("turns the page for the next offscreen chord at display %i", (scale) => {
    const pixelsPerBeat = 800 / (scale * 4);
    const startBeat = scale * 4;
    const target = pageTurnTarget({ chordStartBeat: startBeat, chordDurationBeats: 4, pixelsPerBeat,
      viewportWidth: 800, scrollLeft: 0, contentWidth: 4000 });
    expect(target).toBeCloseTo(600);
  });

  it("uses absolute chord beats for both 1/4 and 4/4 source meters", () => {
    for (const sourceBarBeats of [1, 4]) {
      const target = pageTurnTarget({ chordStartBeat: 12 * sourceBarBeats,
        chordDurationBeats: sourceBarBeats, pixelsPerBeat: 80 / sourceBarBeats,
        viewportWidth: 800, scrollLeft: 0, contentWidth: 3200 });
      expect(target).toBe(760);
    }
  });

  it("clamps seek and forced Follow restoration to the scroll range", () => {
    const geometry = { chordStartBeat: 100, chordDurationBeats: 4, pixelsPerBeat: 40,
      viewportWidth: 800, scrollLeft: 3000, contentWidth: 4400 };
    expect(pageTurnTarget(geometry, true)).toBe(3600);
    expect(pageTurnTarget({ ...geometry, scrollLeft: 3600 })).toBeUndefined();
  });

  it("distinguishes the exact app scroll from a user scroll without time heuristics", () => {
    expect(isFollowScrollPosition(600, 600)).toBe(true);
    expect(isFollowScrollPosition(600.5, 600)).toBe(true);
    expect(isFollowScrollPosition(570, 600)).toBe(false);
    expect(isFollowScrollPosition(600, undefined)).toBe(false);
  });
});
