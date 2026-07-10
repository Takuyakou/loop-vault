import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { romanNumeralHint } from "./romanNumerals";

describe("romanNumeralHint", () => {
  it("maps common chords relative to a major key", () => {
    expect(romanNumeralHint(makeChordSymbol(0, "maj"), "C")).toMatchObject({ label: "I" });
    expect(romanNumeralHint(makeChordSymbol(2, "min"), "C")).toMatchObject({ label: "ii" });
    expect(romanNumeralHint(makeChordSymbol(7, "dom7"), "C")).toMatchObject({ label: "V7" });
    expect(romanNumeralHint(makeChordSymbol(8, "maj"), "C")).toMatchObject({ label: "bVI" });
  });

  it("includes bass information for a slash chord", () => {
    expect(romanNumeralHint(makeChordSymbol(9, "six", [], 1), "F#")).toMatchObject({
      label: "bIII",
      detail: "bass C#",
    });
  });

  it("does not infer a degree without a usable key", () => {
    expect(romanNumeralHint(makeChordSymbol(0, "maj"), undefined)).toBeUndefined();
  });
});
