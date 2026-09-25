import { describe, expect, it } from "vitest";
import { parseChordLabel, parseTextChordLabel } from "./chords";
import { chordPitchClasses, voiceChordForPreview } from "./chordVoicing";
import { canonicalIdentityFromFactorized, factorizeChordSymbol } from "./chordFactorization";
import { chordIdentityKey, normalizeChordSymbol } from "./chordIdentity";
import { normalizedChordKey } from "./voicing";

describe("P8.8 shared text chord semantics", () => {
  it.each([
    ["CmMaj7", "minMaj7", [0, 3, 7, 11]],
    ["C5", "power", [0, 7]],
    ["Cadd13", "add13", [0, 4, 7, 9]],
    ["D11", "dom11", [2, 6, 9, 0, 4, 7]],
  ] as const)("preserves %s as an explicit quality", (label, quality, expected) => {
    const chord = parseTextChordLabel(label);
    expect(chord?.quality).toBe(quality);
    expect(chord?.label).toBe(label);
    expect(chordPitchClasses(chord!).sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
  });

  it("keeps omissions distinct from unmodified identity and removes only written tones", () => {
    const omitted = parseTextChordLabel("C(omit3)")!;
    expect(omitted.omissions).toEqual(["3"]);
    expect(chordPitchClasses(omitted)).toEqual([0, 7]);
    expect(voiceChordForPreview(omitted).notes.some(note => note % 12 === 4)).toBe(false);
    expect(chordIdentityKey(canonicalIdentityFromFactorized(factorizeChordSymbol(omitted))))
      .toBe(chordIdentityKey(normalizeChordSymbol(omitted)));
    expect(normalizedChordKey(omitted)).not.toBe(normalizedChordKey(parseChordLabel("C")!));
    expect(parseTextChordLabel("F7(no5)")?.label).toBe("F7(omit5)");
    expect(parseTextChordLabel("Dm11(omit3)")?.omissions).toEqual(["3"]);
  });

  it("protects quality slash, bass and combined written alterations", () => {
    expect(parseChordLabel("C5")).toBeNull();
    expect(parseChordLabel("Cadd13")).toBeNull();
    expect(parseTextChordLabel("Bb6/9/F")?.bass).toBe(5);
    expect(parseTextChordLabel("C6/9")?.bass).toBeUndefined();
    expect(parseTextChordLabel("E7(b9,#11,b13)")?.tensions).toEqual(["b9", "#11", "b13"]);
  });
});
