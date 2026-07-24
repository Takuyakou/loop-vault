import { describe, expect, it } from "vitest";
import { chordIdentityKey, normalizeChordLabel } from "./chordIdentity";
import { formatChordSymbol, labelFromSymbol, makeChordSymbol, parseChordLabel } from "./chords";
import type { ChordQuality } from "./types";

const allQualities: ChordQuality[] = [
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
];

describe("chord label contract: reported product bugs", () => {
  it("parses 6/9 chords instead of reading /9 as a slash bass", () => {
    const parsed = parseChordLabel("C6/9");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({ root: 0, quality: "sixNine" });
    expect(parsed?.bass).toBeUndefined();
    expect(parsed?.label).toBe("C6/9");
  });

  it("keeps a real slash bass on a 6/9 chord", () => {
    expect(parseChordLabel("Bb6/9/F")).toMatchObject({ root: 10, quality: "sixNine", bass: 5 });
    expect(parseChordLabel("Bb6/9/F")?.label).toBe("Bb6/9/F");
  });

  it("never emits bare tensions glued onto the quality token", () => {
    expect(parseChordLabel("A13sus")?.label).toBe("A13sus4");
    expect(parseChordLabel("A13sus4")?.label).toBe("A13sus4");
    expect(parseChordLabel("A13sus")?.label).not.toBe("Asus413");
    expect(labelFromSymbol(makeChordSymbol(9, "dom7sus4", ["13"]))).toBe("A13sus4");
  });

  it("treats 7sus and 7sus4 as the same dominant suspended chord", () => {
    expect(parseChordLabel("A7sus")?.label).toBe("A7sus4");
    expect(parseChordLabel("A7sus4")?.label).toBe("A7sus4");
  });

  it("places leftover alterations in parentheses", () => {
    expect(labelFromSymbol(makeChordSymbol(0, "dom7", ["b9"]))).toBe("C7(b9)");
    expect(labelFromSymbol(makeChordSymbol(0, "maj7", ["#11"]))).toBe("Cmaj7(#11)");
  });
});

describe("chord label contract: parenthesized tensions", () => {
  it("folds parenthesized tensions into the quality that already spells them", () => {
    expect(parseChordLabel("Bbm7(9)")).toMatchObject({ root: 10, quality: "min9", tensions: [] });
    expect(parseChordLabel("Abmaj7(9)")).toMatchObject({ quality: "maj9", tensions: [] });
    expect(parseChordLabel("Dbm7(11)")).toMatchObject({ quality: "min11", tensions: [] });
  });

  it("keeps tensions the quality does not imply", () => {
    expect(parseChordLabel("C7(b9)")).toMatchObject({ quality: "dom7", tensions: ["b9"] });
    expect(parseChordLabel("Emaj7(#11,9)")).toMatchObject({ quality: "maj9", tensions: ["#11"] });
  });

  it("reads multi-tension groups in any order", () => {
    expect(parseChordLabel("C7(9,13)")?.label).toBe("C13");
    expect(parseChordLabel("C7(13,9)")?.label).toBe("C13");
  });

  it("maps maj13 onto an existing identity without extending the detector vocabulary", () => {
    const parsed = parseChordLabel("Amaj13(9)/C#");
    expect(parsed).toMatchObject({ root: 9, quality: "maj9", tensions: ["13"], bass: 1 });
  });
});

describe("chord label contract: note tokens", () => {
  it("resolves double accidentals and theoretical spellings", () => {
    expect(parseChordLabel("Bbb7")).toMatchObject({ root: 9, quality: "dom7" });
    expect(parseChordLabel("Cb9")).toMatchObject({ root: 11, quality: "dom9" });
    expect(parseChordLabel("Fb7")).toMatchObject({ root: 4, quality: "dom7" });
    expect(parseChordLabel("E#dim7/B")).toMatchObject({ root: 5, quality: "dim7", bass: 11 });
  });

  it("rejects labels outside the note alphabet", () => {
    expect(parseChordLabel("Hmaj7")).toBeNull();
    expect(parseChordLabel("b9")).toBeNull();
    expect(parseChordLabel("")).toBeNull();
    expect(parseChordLabel("C/H")).toBeNull();
  });

  it("drops a slash bass that merely restates the root", () => {
    expect(labelFromSymbol(makeChordSymbol(0, "maj", [], 0))).toBe("C");
  });
});

describe("chord label contract: legacy alias compatibility", () => {
  it("reads back the malformed labels older builds could produce", () => {
    // `Asus413` came from concatenating tensions straight onto the quality token.
    expect(parseChordLabel("Asus413")).toMatchObject({ root: 9, quality: "dom7sus4", tensions: ["13"] });
    expect(parseChordLabel("Asus413")?.label).toBe("A13sus4");
    expect(chordIdentityKey(normalizeChordLabel("Asus413")!))
      .toBe(chordIdentityKey(normalizeChordLabel("A13sus4")!));
  });

  it("still reads labels the previous parser accepted", () => {
    expect(parseChordLabel("Cm7/G")).toMatchObject({ root: 0, quality: "min7", bass: 7 });
    expect(parseChordLabel("F#m7b5")).toMatchObject({ root: 6, quality: "min7b5" });
    expect(parseChordLabel("C7b9")).toMatchObject({ quality: "dom7", tensions: ["b9"] });
    expect(parseChordLabel("DM7")?.label).toBe("Dmaj7");
  });
});

describe("chord label contract: key-aware spelling", () => {
  it("uses flat spelling for flat keys and sharp spelling for sharp keys", () => {
    const chord = makeChordSymbol(6, "add9");
    expect(formatChordSymbol(chord, { keyContext: "Gb major" })).toBe("Gbadd9");
    expect(formatChordSymbol(chord, { keyContext: "B major" })).toBe("F#add9");
  });

  it("honours an explicit accidental preference over the key context", () => {
    const chord = makeChordSymbol(1, "six");
    expect(formatChordSymbol(chord, { keyContext: "B major", accidentalPreference: "flat" })).toBe("Db6");
  });

  it("spells the slash bass with the same preference as the root", () => {
    const chord = makeChordSymbol(6, "maj", [], 8);
    expect(formatChordSymbol(chord, { keyContext: "Gb major" })).toBe("Gb/Ab");
    expect(formatChordSymbol(chord, { keyContext: "B major" })).toBe("F#/G#");
  });

  it("falls back to the canonical spelling without a key context", () => {
    expect(formatChordSymbol(makeChordSymbol(6, "add9"))).toBe("F#add9");
    expect(labelFromSymbol(makeChordSymbol(6, "add9"))).toBe("F#add9");
  });
});

describe("chord label contract: identity round-trip", () => {
  it("round-trips every quality on every root", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const quality of allQualities) {
        const symbol = makeChordSymbol(root, quality);
        const reparsed = parseChordLabel(symbol.label);
        expect(reparsed, `${symbol.label} should reparse`).not.toBeNull();
        expect(chordIdentityKey(normalizeChordLabel(symbol.label)!))
          .toBe(chordIdentityKey(normalizeChordLabel(reparsed!.label)!));
      }
    }
  });

  it("round-trips every quality with a slash bass", () => {
    for (const quality of allQualities) {
      const symbol = makeChordSymbol(0, quality, [], 7);
      const reparsed = parseChordLabel(symbol.label);
      expect(reparsed, `${symbol.label} should reparse`).not.toBeNull();
      expect(reparsed?.bass).toBe(7);
    }
  });

  it("treats enharmonic spellings as the same identity", () => {
    const flat = normalizeChordLabel("Gbadd9");
    const sharp = normalizeChordLabel("F#add9");
    expect(chordIdentityKey(flat!)).toBe(chordIdentityKey(sharp!));
    expect(chordIdentityKey(normalizeChordLabel("Db6")!))
      .toBe(chordIdentityKey(normalizeChordLabel("C#6")!));
  });

  it("keeps slash-bass chords distinct from their root-position form", () => {
    expect(chordIdentityKey(normalizeChordLabel("C6")!))
      .not.toBe(chordIdentityKey(normalizeChordLabel("C6/E")!));
  });

  it("recognises no-chord labels", () => {
    expect(normalizeChordLabel("N.C.")).toMatchObject({ noChord: true });
    expect(chordIdentityKey(normalizeChordLabel("N.C.")!)).toBe("NC");
  });
});
