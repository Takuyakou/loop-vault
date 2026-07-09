import { describe, expect, it } from "vitest";
import { chordProgressFraction } from "./playbackProgress";

describe("chordProgressFraction", () => {
  it("returns elapsed fraction clamped to the chord duration", () => {
    expect(chordProgressFraction({ startBeat: 4, durationBeats: 4 }, 120, 3)).toBe(0.5);
    expect(chordProgressFraction({ startBeat: 4, durationBeats: 4 }, 120, -1)).toBe(0);
    expect(chordProgressFraction({ startBeat: 4, durationBeats: 4 }, 120, 99)).toBe(1);
  });

  it("returns null when timing cannot be shown", () => {
    expect(chordProgressFraction(undefined, 120, 0)).toBeNull();
    expect(chordProgressFraction({ startBeat: 0, durationBeats: 0 }, 120, 0)).toBeNull();
    expect(chordProgressFraction({ startBeat: 0, durationBeats: 4 }, 0, 0)).toBeNull();
  });
});
