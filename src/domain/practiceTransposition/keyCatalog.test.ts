import { describe, expect, it } from "vitest";
import {
  assertSupportedPracticeMode,
  canonicalizeKeySignature,
  formatKeySignature,
  getCanonicalKey,
  isSupportedPracticeMode,
  MAJOR_KEY_CATALOG,
  MINOR_KEY_CATALOG,
  parseKeySignature,
} from ".";

const analyzerPitchNames = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
] as const;

describe("practice transposition key catalog", () => {
  it("defines the required 12 canonical major keys", () => {
    expect(MAJOR_KEY_CATALOG.map((key) => key.canonicalName)).toEqual([
      "C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
    ]);
    expect(MAJOR_KEY_CATALOG.map((key) => key.tonicPitchClass)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(MAJOR_KEY_CATALOG.every((key) => key.mode === "major")).toBe(true);
  });

  it("defines the required 12 canonical minor keys", () => {
    expect(MINOR_KEY_CATALOG.map((key) => key.canonicalName)).toEqual([
      "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
    ]);
    expect(MINOR_KEY_CATALOG.map((key) => key.tonicPitchClass)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(MINOR_KEY_CATALOG.every((key) => key.mode === "minor")).toBe(true);
  });

  it("provides stable English and Japanese labels", () => {
    const dbMajor = getCanonicalKey(1, "major");
    const cSharpMinor = getCanonicalKey(1, "minor");
    expect(formatKeySignature(dbMajor, "en")).toBe("Db major");
    expect(formatKeySignature(dbMajor, "ja")).toBe("Dbメジャー");
    expect(formatKeySignature(cSharpMinor, "en")).toBe("C# minor");
    expect(formatKeySignature(cSharpMinor, "ja")).toBe("C#マイナー");
  });

  it("records the canonical sharp or flat preference", () => {
    expect(getCanonicalKey(1, "major").accidentalPreference).toBe("flat");
    expect(getCanonicalKey(6, "major").accidentalPreference).toBe("sharp");
    expect(getCanonicalKey(3, "minor").accidentalPreference).toBe("flat");
    expect(getCanonicalKey(8, "minor").accidentalPreference).toBe("sharp");
  });

  it("parses only supported major and minor spellings", () => {
    expect(parseKeySignature("C")).toEqual(getCanonicalKey(0, "major"));
    expect(parseKeySignature("Bb major")).toEqual(getCanonicalKey(10, "major"));
    expect(parseKeySignature("F#m")).toEqual(getCanonicalKey(6, "minor"));
    expect(parseKeySignature("Ebマイナー")).toEqual(getCanonicalKey(3, "minor"));
    expect(parseKeySignature("c minor")).toBe(getCanonicalKey(0, "minor"));
    expect(parseKeySignature("cm")).toBe(getCanonicalKey(0, "minor"));
    expect(parseKeySignature("d♭ MAJOR")).toBe(getCanonicalKey(1, "major"));
    expect(parseKeySignature("c♯m")).toBe(getCanonicalKey(1, "minor"));
    expect(parseKeySignature("D dorian")).toBeUndefined();
  });

  it.each([
    ["C", 0],
    ["B#", 0],
    ["C#", 1],
    ["Db", 1],
    ["D", 2],
    ["D#", 3],
    ["Eb", 3],
    ["E", 4],
    ["Fb", 4],
    ["F", 5],
    ["E#", 5],
    ["F#", 6],
    ["Gb", 6],
    ["G", 7],
    ["G#", 8],
    ["Ab", 8],
    ["A", 9],
    ["A#", 10],
    ["Bb", 10],
    ["B", 11],
    ["Cb", 11],
  ] as const)("normalizes enharmonic root %s", (name, pitchClass) => {
    expect(parseKeySignature(`${name} major`)).toBe(
      getCanonicalKey(pitchClass, "major"),
    );
    expect(parseKeySignature(`${name.toLowerCase()} minor`)).toBe(
      getCanonicalKey(pitchClass, "minor"),
    );
  });

  it("connects every key name emitted by the MIDI analyzers", () => {
    const analyzerKeys = analyzerPitchNames.flatMap((name) => (
      ["major", "minor"] as const
    ).map((mode) => `${name} ${mode}`));
    expect(analyzerKeys).toHaveLength(24);
    analyzerKeys.forEach((keyName, index) => {
      const mode = index % 2 === 0 ? "major" : "minor";
      const pitchClass = Math.floor(index / 2);
      expect(parseKeySignature(keyName)).toBe(getCanonicalKey(pitchClass, mode));
    });
  });

  it("returns deeply frozen canonical objects", () => {
    const parsed = parseKeySignature("D♭ major");
    expect(parsed).toBe(getCanonicalKey(1, "major"));
    expect(Object.isFrozen(MAJOR_KEY_CATALOG)).toBe(true);
    expect(Object.isFrozen(MINOR_KEY_CATALOG)).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.labels)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects non-finite or fractional pitch class %s",
    (pitchClass) => {
      expect(() => getCanonicalKey(pitchClass, "major")).toThrow(
        "Pitch class must be a finite integer",
      );
    },
  );

  it("rejects key objects that disagree with the canonical catalog", () => {
    const canonical = getCanonicalKey(2, "major");
    expect(canonicalizeKeySignature(canonical)).toBe(canonical);
    expect(() => canonicalizeKeySignature({
      ...canonical,
      canonicalName: "Db",
    })).toThrow("does not match the canonical key catalog");
    expect(() => canonicalizeKeySignature({
      ...canonical,
      tonicPitchClass: 14,
    })).toThrow("does not match the canonical key catalog");
    expect(() => formatKeySignature({
      ...canonical,
      labels: { en: "Db major", ja: "Dbメジャー" },
    }, "en")).toThrow("does not match the canonical key catalog");
  });

  it("guards unsupported modes explicitly", () => {
    expect(isSupportedPracticeMode("major")).toBe(true);
    expect(isSupportedPracticeMode("minor")).toBe(true);
    expect(isSupportedPracticeMode("dorian")).toBe(false);
    expect(() => assertSupportedPracticeMode("dorian")).toThrow(
      "Unsupported practice mode: dorian",
    );
  });
});
