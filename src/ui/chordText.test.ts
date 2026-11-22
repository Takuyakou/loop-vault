import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../domain/chords";
import { degreeOf } from "../domain/harmony/degrees";
import { displayChordLabel, displayDegreeLabel, displayDegreeList, splitChordLabel } from "./chordText";

describe("displayChordLabel (P23-04)", () => {
  it.each([
    ["C", "C"],
    ["F#m7b5", "F♯m7♭5"],
    ["Bbmaj7", "B♭maj7"],
    ["F#7(b9)", "F♯7(♭9)"],
    ["C7(#9,b13)", "C7(♯9,♭13)"],
    ["G7sus4/C", "G7sus4/C"],
    ["Gsus4/Bb", "Gsus4/B♭"],
    ["Ebm(maj7)", "E♭m(maj7)"],
    ["Eb6/9", "E♭6/9"],
    ["Cadd9", "Cadd9"],
    ["Bb…", "B♭…"],
    ["A♭maj9", "A♭maj9"],
    ["?", "?"],
    ["休み", "休み"],
  ])("%s → %s", (input, output) => {
    expect(displayChordLabel(input)).toBe(output);
  });
});

describe("splitChordLabel (P23-04)", () => {
  it("splits the shown name into the root and the rest", () => {
    expect(splitChordLabel("F#m7b5")).toEqual({ letter: "F", accidental: "♯", rest: "m7♭5" });
    expect(splitChordLabel("C")).toEqual({ letter: "C", accidental: "", rest: "" });
    expect(splitChordLabel("Ab/C")).toEqual({ letter: "A", accidental: "♭", rest: "/C" });
    expect(splitChordLabel("G7sus4/C")).toEqual({ letter: "G", accidental: "", rest: "7sus4/C" });
    expect(splitChordLabel("?")).toBeUndefined();
    expect(splitChordLabel("休み")).toBeUndefined();
  });
});

describe("displayDegreeLabel (P23-04)", () => {
  it.each([
    ["I", "Ⅰ"], ["i", "Ⅰm"],
    ["ii", "Ⅱm"], ["ii7", "Ⅱm7"],
    ["vi", "Ⅵm"], ["v7", "Ⅴm7"],
    ["V7", "Ⅴ7"], ["III7", "Ⅲ7"],
    ["Imaj7", "Ⅰmaj7"], ["iv6", "Ⅳm6"],
    ["ii9", "Ⅱm9"], ["ii11", "Ⅱm11"],
    ["♭VII7", "♭Ⅶ7"], ["bVII7", "♭Ⅶ7"],
    ["#IV", "♯Ⅳ"], ["vii7♭5", "Ⅶm7♭5"],
    ["viidim", "Ⅶdim"], ["viidim7", "Ⅶdim7"],
    ["iiø7", "Ⅱø7"], ["♯ivø7", "♯Ⅳø7"],
    ["♯idim7", "♯Ⅰdim7"], ["i(maj7)", "Ⅰm(maj7)"],
    ["V7(♭9)", "Ⅴ7(♭9)"], ["V7(b9)", "Ⅴ7(♭9)"],
    ["V7sus4", "Ⅴ7sus4"], ["I+", "Ⅰ+"],
    ["I/3rd", "Ⅰ/3rd"], ["ii7/5th", "Ⅱm7/5th"],
    ["I6/9", "Ⅰ6/9"], ["IVmaj9/V", "Ⅳmaj9/Ⅴ"],
    ["II/I", "Ⅱ/Ⅰ"], ["V/IV", "Ⅴ/Ⅳ"],
    ["VIadd9/♯I", "Ⅵadd9/♯Ⅰ"], ["♭VImaj7/V", "♭Ⅵmaj7/Ⅴ"],
    ["IIm7", "Ⅱm7"], ["VIm", "Ⅵm"],
    ["IΔ7", "ⅠΔ7"], ["VIIø7(11)", "Ⅶø7(11)"],
    ["Ⅱm7", "Ⅱm7"], ["♭Ⅶ7", "♭Ⅶ7"],
    ["I–V–vi–IV", "I–V–vi–IV"], ["ii7–♭II7–Imaj7", "ii7–♭II7–Imaj7"],
    ["?", "?"], ["1", "1"],
  ])("%s → %s", (input, output) => {
    expect(displayDegreeLabel(input)).toBe(output);
  });

  it("passes undefined through", () => {
    expect(displayDegreeLabel(undefined)).toBeUndefined();
  });

  it("shows the real degreeOf values in the one form", () => {
    const shown = (label: string) => displayDegreeLabel(degreeOf(parseChordLabel(label)!, "C major")?.label);
    expect(shown("Dm7")).toBe("Ⅱm7");
    expect(shown("Bb7")).toBe("♭Ⅶ7");
    expect(shown("Am")).toBe("Ⅵm");
    expect(shown("Bm7b5")).toBe("Ⅶm7♭5");
    expect(shown("C/E")).toBe("Ⅰ/3rd");
  });
});

describe("displayDegreeList", () => {
  it.each([
    ["IVmaj7–V7–iii7–vi7", "Ⅳmaj7–Ⅴ7–Ⅲm7–Ⅵm7"],
    ["I–VIm7–IVΔ7–V7", "Ⅰ–Ⅵm7–ⅣΔ7–Ⅴ7"],
    ["iiø7–V7(♭9)–i(maj7)", "Ⅱø7–Ⅴ7(♭9)–Ⅰm(maj7)"],
    ["I6/9–V/IV", "Ⅰ6/9–Ⅴ/Ⅳ"],
    ["i–iv–V7–i", "Ⅰm–Ⅳm–Ⅴ7–Ⅰm"],
    ["ii7", "Ⅱm7"],
    ["Ⅱm9–Ⅴ13–Ⅰ6/9", "Ⅱm9–Ⅴ13–Ⅰ6/9"],
    ["王道進行", "王道進行"],
    ["Imagine", "Imagine"],
    ["Indiana–Imagine", "Indiana–Imagine"],
  ])("%s → %s", (input, output) => {
    expect(displayDegreeList(input)).toBe(output);
  });

  it("keeps undefined", () => {
    expect(displayDegreeList(undefined)).toBeUndefined();
  });
});
