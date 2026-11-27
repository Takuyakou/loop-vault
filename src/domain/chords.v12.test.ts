// P25 V12: text keeps the slash bass letter as typed; the MIDI/legacy parser (parseChordLabel) is unchanged.
import { describe, expect, it } from "vitest";
import { parseChordLabel, parseTextChordLabel } from "./chords";
import { parseExtendedTextChordLabel } from "./extendedTextProgression";

describe("P25 V12 typed slash bass spelling", () => {
  it.each([
    ["F#m9/G#", "F#m9/G#"], ["E/G#", "E/G#"], ["Cmaj7/B", "Cmaj7/B"], ["Ab/Eb", "Ab/Eb"], ["C7/Db", "C7/Db"],
    ["F#7/A#", "F#7/A#"], ["Bb/C", "Bb/C"], ["C/Eb", "C/Eb"], ["F#m9/Ab", "F#m9/Ab"],
  ])("text %s reads %s", (input, label) => {
    expect(parseTextChordLabel(input)?.label).toBe(label);
    expect(parseExtendedTextChordLabel(input)?.label).toBe(label);
  });
  it("a double accidental keeps today's spelling, and the pitches never change", () => {
    expect(parseTextChordLabel("C/Ebb")?.label).toBe(parseTextChordLabel("C/D")?.label);
    expect(parseTextChordLabel("F#m9/G#")?.bass).toBe(parseTextChordLabel("F#m9/Ab")?.bass);
  });
  it("parseChordLabel (frozen) is unchanged", () => {
    expect(parseChordLabel("F#m9/G#")?.label).toBe("F#m9/Ab");
  });
});
