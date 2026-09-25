import { describe, expect, it } from "vitest";
import { parseChordLabel } from "./chords";
import { chordPitchClasses } from "./chordVoicing";
import { parseExtendedTextChordLabel, parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextSaveData } from "./extendedTextSave";

describe("P8.8.1 Extended-only altered aliases and spelling", () => {
  it.each([
    ["F7-5", "dom7", ["#11"], ["5"], [3, 5, 9, 11]],
    ["Fm7-5", "min7b5", [], [], [3, 5, 8, 11]],
    ["F7+5", "dom7", ["#5"], [], [1, 3, 5, 9]],
    ["F7+9", "dom7", ["#9"], [], [3, 5, 8, 9, 0]],
    ["F7+11", "dom7", ["#11"], [], [3, 5, 9, 11, 0]],
  ] as const)("maps %s without changing the Product chord parser", (written, quality, tensions, omissions, pitches) => {
    const chord = parseExtendedTextChordLabel(written);
    expect(chord).toMatchObject({ quality, tensions: [...tensions], label: written });
    expect(chord?.omissions ?? []).toEqual([...omissions]);
    expect(chordPitchClasses(chord!).sort((a, b) => a - b))
      .toEqual([...pitches].sort((a, b) => a - b));
    expect(parseChordLabel(written)).toBeNull();
  });

  it("keeps written G-sharp root and slash-bass through source conversion", () => {
    expect(parseExtendedTextChordLabel("G#m7")?.label).toBe("G#m7");
    const source = "| G#m7/C# F7-5 Fm7-5 F7+5 | F7+9 F7+11 C+ _ |";
    const parsed = parseExtendedTextProgression(source);
    expect(parsed.state, JSON.stringify(parsed.diagnostics)).toBe("VALID");
    expect(parsed.slots.map(slot => slot.chord?.label).filter(Boolean))
      .toEqual(["G#m7/C#", "F7-5", "Fm7-5", "F7+5", "F7+9", "F7+11", "C+"]);
    const saved = extendedTextSaveData(parsed);
    expect(saved.chords.map(item => item.chord.label))
      .toEqual(["G#m7/C#", "F7-5", "Fm7-5", "F7+5", "F7+9", "F7+11", "C+"]);
    expect(saved.textSource.harmonicSpans[0]?.writtenChord).toBe("G#m7/C#");
    expect(saved.textSource.harmonicSpans[1]?.semanticAlterations).toEqual(["b5"]);
  });

  it("does not guess malformed or unapproved signed alterations", () => {
    for (const value of ["F7-9", "F7+7", "F7--5", "F7+13", "F7+/A"]) {
      expect(parseExtendedTextChordLabel(value)).toBeUndefined();
    }
  });
});
