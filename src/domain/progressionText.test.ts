import { describe, expect, it } from "vitest";
import type { ChordTimelineItem } from "./types";
import { formatProgressionText } from "./progressionText";

function chord(label: string, bar: number, beat = 1): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats: 4,
    chord: {
      root: 0,
      quality: "maj7",
      tensions: [],
      label,
    },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

describe("formatProgressionText", () => {
  it("formats one chord per bar in Chord Drip style", () => {
    expect(formatProgressionText([
      chord("Dmaj9", 1),
      chord("A6/C#", 2),
      chord("D", 3),
      chord("Em9", 4),
    ])).toBe("| Dmaj9 | A6/C# | D | Em9 |");
  });

  it("keeps multiple chords in the same bar together", () => {
    expect(formatProgressionText([
      chord("Dmaj9", 1),
      chord("Em9", 2, 1),
      chord("A7sus4", 2, 3),
    ])).toBe("| Dmaj9 | Em9 A7sus4 |");
  });

  it("wraps every four bars by default", () => {
    expect(formatProgressionText([
      chord("C", 1),
      chord("Dm", 2),
      chord("Em", 3),
      chord("F", 4),
      chord("G", 5),
    ])).toBe("| C | Dm | Em | F |\n| G |");
  });
});
