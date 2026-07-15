import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol, parseChordLabel } from "./chords";

describe("chord symbols", () => {
  it("builds a display label from structured chord data", () => {
    expect(labelFromSymbol(makeChordSymbol(0, "min7", [], 7))).toBe("Cm7/G");
  });

  it("parses common chord labels into pitch-class based symbols", () => {
    expect(parseChordLabel("F#m7b5")).toMatchObject({
      root: 6,
      quality: "min7b5",
      tensions: [],
      label: "F#m7b5",
    });
  });

  it("returns null for labels outside the supported vocabulary", () => {
    expect(parseChordLabel("Hmaj7")).toBeNull();
  });

  it("parses extended qualities before separating explicit tensions", () => {
    expect(parseChordLabel("Cmaj9")).toMatchObject({ quality: "maj9", tensions: [] });
    expect(parseChordLabel("C7b9")).toMatchObject({ quality: "dom7", tensions: ["b9"] });
  });
});
