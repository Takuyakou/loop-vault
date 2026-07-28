import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { fastLabelSuggestions, parseFastChordEntry } from "./fastLabelEntry";

describe("Fast Label Entry", () => {
  it("keeps ordinary chord labels unchanged", () => {
    expect(parseFastChordEntry("F#m9", "C major")).toEqual(parseChordLabel("F#m9"));
  });

  it("resolves roman and numeric degrees in the detected key", () => {
    expect(parseFastChordEntry("ii7", "C major")?.label).toBe("Dm7");
    expect(parseFastChordEntry("V7", "D major")?.label).toBe("A7");
    expect(parseFastChordEntry("bVII", "C major")?.label).toBe("Bb");
    expect(parseFastChordEntry("4maj7", "D major")?.label).toBe("Gmaj7");
  });

  it("uses the preceding quality first for a bare numeric degree", () => {
    expect(parseFastChordEntry("5", "C major", parseChordLabel("Dm9")!)?.label).toBe("Gm9");
    expect(parseFastChordEntry("5", "C major")?.label).toBe("G7");
  });

  it("prioritizes autocomplete entries that retain the preceding quality", () => {
    const suggestions = fastLabelSuggestions("C major", parseChordLabel("Am7")!);
    expect(suggestions.slice(0, 3).map((entry) => entry.input)).toEqual(["i7", "ii7", "iii7"]);
    expect(suggestions[4]?.chord.label).toBe("Gm7");
    expect(suggestions.some((entry) => entry.chord.label === "G7")).toBe(true);
  });

  it("requires a valid key for degree input", () => {
    expect(parseFastChordEntry("V7", undefined)).toBeNull();
    expect(fastLabelSuggestions(undefined)).toEqual([]);
  });
});
