import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../chords";
import { deriveAcceptableAlternatives } from "./acceptableAlternatives";

describe("acceptable alternatives", () => {
  it("derives deterministic strong tension and enharmonic reductions", () => {
    const primary = makeChordSymbol(1, "maj9");
    const alternatives = deriveAcceptableAlternatives(primary);
    expect(alternatives).toEqual(deriveAcceptableAlternatives(primary));
    expect(alternatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ chord: "Dbmaj9", strength: "strong", reason: "enharmonic" }),
      expect.objectContaining({ chord: "C#maj7", strength: "strong", reason: "tension-reduction" }),
    ]));
  });

  it("adds weak slash and six/minor-seven equivalents only when requested", () => {
    const slash = makeChordSymbol(9, "min7", [], 0);
    expect(deriveAcceptableAlternatives(slash)).toEqual([]);
    expect(deriveAcceptableAlternatives(slash, { includeWeak: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ chord: "Am7", strength: "weak" }),
      expect.objectContaining({ chord: "C6", strength: "weak" }),
    ]));
  });

  it("caps each strength at four and never returns the primary label", () => {
    const primary = makeChordSymbol(1, "maj9", ["9", "#11"], 7);
    const alternatives = deriveAcceptableAlternatives(primary, { includeWeak: true });
    expect(alternatives.filter((item) => item.strength === "strong").length).toBeLessThanOrEqual(4);
    expect(alternatives.filter((item) => item.strength === "weak").length).toBeLessThanOrEqual(4);
    expect(alternatives.some((item) => item.chord === primary.label)).toBe(false);
  });
});
