import { describe, expect, it } from "vitest";
import type { ChordTimelineItem } from "../../domain/types";
import { groupChords, groupWidth, layoutChordBand } from "./chordBand";

const chord = (label: string, bar: number, durationBeats = 4): ChordTimelineItem => ({
  bar, beat: 1, durationBeats, confidence: 1, alternatives: [], warnings: [],
  chord: { root: 0, quality: "maj", tensions: [], label },
});

describe("Vault chord band", () => {
  it("merges only consecutive repeats and sums their length", () => {
    const groups = groupChords([chord("Dm7", 1), chord("Dm7", 2), chord("Dm7", 3), chord("G7", 4), chord("Dm7", 5)]);
    expect(groups.map((group) => [group.label, group.indices.length, group.beats, group.first])).toEqual([
      ["Dm7", 3, 12, 0], ["G7", 1, 4, 3], ["Dm7", 1, 4, 4],
    ]);
  });

  it("is as wide as the chord lasts but never narrower than a 9-character name", () => {
    const [short, long, name, capped] = groupChords([chord("C", 1, 2), chord("F", 2, 8), chord("Ebadd9/G", 4, 1), chord("Am", 5, 64)]);
    expect(groupWidth(short!)).toBe(22);
    expect(groupWidth(long!)).toBe(64);
    expect(groupWidth(name!)).toBeGreaterThanOrEqual(Math.ceil(8 * 7.2 + 14));
    expect(groupWidth(capped!)).toBe(128);
    // A degree widens a short frame up to 7 characters (vii7 under Bm7), never more.
    expect(groupWidth(short!, "vii7")).toBe(38);
    expect(groupWidth(short!, "♭IIIadd9/3rd")).toBe(56);
  });

  it("shows what fits and sums the rest as bars", () => {
    const chords = Array.from({ length: 65 }, (_, index) => chord(`C${index}`, index + 1));
    const groups = groupChords(chords);
    const layout = layoutChordBand(groups, 400, 65);
    expect(layout.shown).toBe(9);
    expect(layout.restBars).toBe(56);
    expect(layoutChordBand(groups.slice(0, 4), 400, 4)).toEqual({ shown: 4, restBars: 0 });
  });
});
