import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol, parseChordLabel } from "./chords";
import { chordIdentityKey, normalizeChordLabel, normalizeChordSymbol } from "./chordIdentity";
import type { ChordQuality, Tension } from "./types";
import {
  canonicalIdentityFromFactorized,
  factorizationPreservesIdentity,
  factorizeChordLabel,
  factorizeChordSymbol,
  factorizedKey,
  qualityFromParts,
  symbolFromFactorized,
} from "./chordFactorization";

/**
 * Taking a chord apart and putting it back.
 *
 * The whole value of F0 is that it changes nothing, so these tests are the
 * evidence rather than a formality: every quality, every tension, every slash,
 * over every root, has to come back as the same canonical identity it went in
 * as. A single case that does not is a new equivalence, and a new equivalence
 * silently merges two progressions the user thinks are different.
 */
const ALL_QUALITIES: ChordQuality[] = [
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
];

const ALL_TENSIONS: Tension[] = ["9", "b9", "#9", "11", "#11", "13", "b13"];
const ROOTS = Array.from({ length: 12 }, (_unused, index) => index);

describe("round trip", () => {
  it("keeps the canonical identity for every quality on every root", () => {
    for (const quality of ALL_QUALITIES) {
      for (const root of ROOTS) {
        const symbol = makeChordSymbol(root, quality, []);
        const direct = normalizeChordSymbol(symbol);
        const viaParts = canonicalIdentityFromFactorized(factorizeChordSymbol(symbol));

        expect(chordIdentityKey(viaParts)).toBe(chordIdentityKey(direct));
      }
    }
  });

  it("keeps the canonical identity for every quality with every tension", () => {
    for (const quality of ALL_QUALITIES) {
      for (const tension of ALL_TENSIONS) {
        const symbol = makeChordSymbol(0, quality, [tension]);
        expect(chordIdentityKey(canonicalIdentityFromFactorized(factorizeChordSymbol(symbol))))
          .toBe(chordIdentityKey(normalizeChordSymbol(symbol)));
      }
    }
  });

  it("keeps the canonical identity for every slash bass", () => {
    for (const quality of ALL_QUALITIES) {
      for (const bass of ROOTS) {
        const symbol = makeChordSymbol(0, quality, [], bass);
        expect(chordIdentityKey(canonicalIdentityFromFactorized(factorizeChordSymbol(symbol))))
          .toBe(chordIdentityKey(normalizeChordSymbol(symbol)));
      }
    }
  });

  it("keeps the canonical identity through the written label", () => {
    for (const quality of ALL_QUALITIES) {
      for (const root of ROOTS) {
        const label = labelFromSymbol(makeChordSymbol(root, quality, []));
        expect(factorizationPreservesIdentity(label)).toBe(true);
      }
    }
  });

  it("comes back as a symbol that means the same chord", () => {
    for (const quality of ALL_QUALITIES) {
      for (const root of ROOTS) {
        const original = makeChordSymbol(root, quality, []);
        const rebuilt = symbolFromFactorized(factorizeChordSymbol(original));

        expect(rebuilt).toBeDefined();
        expect(chordIdentityKey(normalizeChordSymbol(rebuilt!)))
          .toBe(chordIdentityKey(normalizeChordSymbol(original)));
      }
    }
  });

  it("comes back as a symbol that means the same chord, with a slash", () => {
    for (const quality of ALL_QUALITIES) {
      const original = makeChordSymbol(0, quality, [], 7);
      const rebuilt = symbolFromFactorized(factorizeChordSymbol(original));

      expect(rebuilt).toBeDefined();
      expect(chordIdentityKey(normalizeChordSymbol(rebuilt!)))
        .toBe(chordIdentityKey(normalizeChordSymbol(original)));
    }
  });
});

describe("the chords the contract calls out", () => {
  it.each([
    "Cmaj9", "Cm11", "C7sus4", "C7(b9)", "C7(#11)", "C7(b13)", "C6", "Cm6", "C69",
    "Cmaj7/E", "Cm7b5", "Cdim7", "Caug", "Csus2", "Cadd9", "C13", "C9", "Cm9",
    "Gbadd9", "F#add9", "Em7/G", "G6",
  ])("keeps %s intact", (label) => {
    expect(factorizationPreservesIdentity(label)).toBe(true);
  });

  it("does not merge Em/G with G6", () => {
    // Same pitch classes, different chords. A factorization that lost the
    // difference would merge two progressions the user hears as different.
    const emOverG = factorizeChordLabel("Em/G")!;
    const g6 = factorizeChordLabel("G6")!;

    expect(factorizedKey(emOverG)).not.toBe(factorizedKey(g6));
    expect(chordIdentityKey(canonicalIdentityFromFactorized(emOverG)))
      .not.toBe(chordIdentityKey(canonicalIdentityFromFactorized(g6)));
  });

  it("treats a written tension and the quality that implies it as the same chord", () => {
    // Cmaj9 and Cmaj7(9) are one chord written two ways.
    const implied = factorizeChordLabel("Cmaj9")!;
    const written = factorizeChordSymbol(makeChordSymbol(0, "maj7", ["9"]));

    expect(factorizedKey(implied)).toBe(factorizedKey(written));
  });

  it("keeps the sixth as a tension of a major triad rather than its own triad", () => {
    const six = factorizeChordLabel("C6")!;
    const plain = factorizeChordLabel("C")!;

    expect(six.triad).toBe(plain.triad);
    expect(six.tensions).toContain("6");
    expect(plain.tensions).toEqual([]);
  });

  it("separates the seventh from the triad", () => {
    expect(factorizeChordLabel("Cm7")!.triad).toBe("minor");
    expect(factorizeChordLabel("Cm7")!.seventh).toBe("minor7");
    expect(factorizeChordLabel("Cmaj7")!.seventh).toBe("major7");
    expect(factorizeChordLabel("Cdim7")!.seventh).toBe("diminished7");
    expect(factorizeChordLabel("C")!.seventh).toBeNull();
  });

  it("reads a rest as a rest", () => {
    for (const label of ["N.C.", "NC", "-", "no chord"]) {
      expect(factorizeChordLabel(label)?.noChord).toBe(true);
      expect(canonicalIdentityFromFactorized(factorizeChordLabel(label)!).noChord).toBe(true);
    }
  });

  it("returns null for a label nothing can parse", () => {
    expect(factorizeChordLabel("H♯wobble")).toBeNull();
  });
});

describe("the quality list, inverted", () => {
  it("names every quality from its parts", () => {
    for (const quality of ALL_QUALITIES) {
      const factorized = factorizeChordSymbol(makeChordSymbol(0, quality, []));
      expect(qualityFromParts(factorized.triad, factorized.seventh, factorized.tensions))
        .toBe(quality);
    }
  });

  it("has no name for parts the closed list does not cover", () => {
    // A diminished triad with a natural 13 is a real sound and not one of the
    // twenty-one names. Returning undefined is what stops a later stage from
    // rounding it to the nearest spelling.
    expect(qualityFromParts("diminished", "minor7", ["13"])).toBeUndefined();
    expect(symbolFromFactorized({
      root: 0, triad: "diminished", seventh: "minor7", tensions: ["13"], bass: 0,
    })).toBeDefined();
    expect(symbolFromFactorized({
      root: 0, triad: "unknown", seventh: null, tensions: [], bass: 0,
    })).toBeUndefined();
  });
});

describe("determinism", () => {
  it("gives the same parts every time", () => {
    for (const label of ["Cmaj9", "Em7/G", "F#7(#11)", "Bbm11", "A13"]) {
      const first = factorizedKey(factorizeChordLabel(label)!);
      expect(factorizedKey(factorizeChordLabel(label)!)).toBe(first);
      expect(factorizedKey(factorizeChordLabel(label)!)).toBe(first);
    }
  });

  it("orders tensions the same way regardless of how they were written", () => {
    const written = factorizeChordSymbol(makeChordSymbol(0, "dom7", ["13", "b9"]));
    const other = factorizeChordSymbol(makeChordSymbol(0, "dom7", ["b9", "13"]));

    expect(written.tensions).toEqual(other.tensions);
  });
});

describe("against the parser, not against itself", () => {
  it("agrees with normalizeChordLabel on every label the parser accepts", () => {
    const labels: string[] = [];
    for (const quality of ALL_QUALITIES) {
      for (const root of ROOTS) {
        labels.push(labelFromSymbol(makeChordSymbol(root, quality, [])));
        labels.push(labelFromSymbol(makeChordSymbol(root, quality, [], (root + 4) % 12)));
      }
    }

    let checked = 0;
    for (const label of labels) {
      if (parseChordLabel(label) === null) continue;
      checked += 1;
      expect(chordIdentityKey(canonicalIdentityFromFactorized(factorizeChordLabel(label)!)))
        .toBe(chordIdentityKey(normalizeChordLabel(label)!));
    }
    expect(checked).toBeGreaterThan(400);
  });
});
