import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "./chords";
import { voiceChordForPreview } from "./chordVoicing";

describe("voiceChordForPreview", () => {
  it("creates a playable voicing with bass and upper notes", () => {
    const voiced = voiceChordForPreview(makeChordSymbol(0, "maj7"));

    expect(voiced.bassNote % 12).toBe(0);
    expect(voiced.notes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(voiced.notes.map((note) => note % 12))).toEqual(
      new Set([0, 4, 7, 11]),
    );
  });

  it("uses slash bass when present", () => {
    const voiced = voiceChordForPreview(makeChordSymbol(0, "min7", [], 7));

    expect(voiced.bassNote % 12).toBe(7);
  });
});
