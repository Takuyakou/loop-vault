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

  it("keeps lowercase minor seventh and ninth labels distinct from major labels", () => {
    expect(parseChordLabel("Dm7")).toMatchObject({ quality: "min7", label: "Dm7" });
    expect(parseChordLabel("Dm9")).toMatchObject({ quality: "min9", label: "Dm9" });
    expect(parseChordLabel("DM7")).toMatchObject({ quality: "maj7", label: "Dmaj7" });
    expect(parseChordLabel("DM9")).toMatchObject({ quality: "maj9", label: "Dmaj9" });
  });

  it("accepts case-insensitive long major suffixes without treating short lowercase m as major", () => {
    expect(parseChordLabel("DMAJ7")).toMatchObject({ quality: "maj7", label: "Dmaj7" });
    expect(parseChordLabel("DMaj7")).toMatchObject({ quality: "maj7", label: "Dmaj7" });
    expect(parseChordLabel("DMAJ9")).toMatchObject({ quality: "maj9", label: "Dmaj9" });
    expect(parseChordLabel("DMaj9")).toMatchObject({ quality: "maj9", label: "Dmaj9" });
    expect(parseChordLabel("Dm7")).toMatchObject({ quality: "min7" });
    expect(parseChordLabel("Dm9")).toMatchObject({ quality: "min9" });
  });
});
