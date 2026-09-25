import { describe, expect, it } from "vitest";
import { easeOutCubic, pageTurnTarget } from "./timelineFollow";

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
    expect(target).toBeCloseTo(788);
  });

  it("uses absolute chord beats for both 1/4 and 4/4 source meters", () => {
    for (const sourceBarBeats of [1, 4]) {
      const target = pageTurnTarget({ chordStartBeat: 12 * sourceBarBeats,
        chordDurationBeats: sourceBarBeats, pixelsPerBeat: 80 / sourceBarBeats,
        viewportWidth: 800, scrollLeft: 0, contentWidth: 3200 });
      expect(target).toBe(948);
    }
  });

  it("clamps seek and forced Follow restoration to the scroll range", () => {
    const geometry = { chordStartBeat: 100, chordDurationBeats: 4, pixelsPerBeat: 40,
      viewportWidth: 800, scrollLeft: 3000, contentWidth: 4400 };
    expect(pageTurnTarget(geometry, true)).toBe(3600);
    expect(pageTurnTarget({ ...geometry, scrollLeft: 3600 })).toBeUndefined();
  });

  it("turns for partial left and right clipping, including fractional scroll", () => {
    const base = { chordStartBeat: 20, chordDurationBeats: 4, pixelsPerBeat: 40,
      viewportWidth: 400, contentWidth: 2400 };
    expect(pageTurnTarget({ ...base, scrollLeft: 801.25 })).toBe(788);
    expect(pageTurnTarget({ ...base, scrollLeft: 558.5 })).toBe(788);
    expect(pageTurnTarget({ ...base, scrollLeft: 1200 })).toBe(788);
  });

  it("clamps at the start and end of the scrollable content", () => {
    expect(pageTurnTarget({ chordStartBeat: 0, chordDurationBeats: 4, pixelsPerBeat: 40,
      viewportWidth: 400, scrollLeft: 200, contentWidth: 2000 })).toBe(0);
    expect(pageTurnTarget({ chordStartBeat: 46, chordDurationBeats: 4, pixelsPerBeat: 40,
      viewportWidth: 400, scrollLeft: 0, contentWidth: 2000 })).toBe(1600);
  });

  it("uses a bounded ease-out curve for the 250 ms turn", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0.5)).toBe(0.875);
    expect(easeOutCubic(2)).toBe(1);
  });
});
