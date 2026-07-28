import { describe, expect, it } from "vitest";
import {
  chordIdentityKey,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import {
  factorizationPreservesIdentity,
  factorizeChordSymbol,
  symbolFromFactorized,
} from "../../src/domain/chordFactorization";
import { noteNameFromPitchClass } from "../../src/domain/chords";
import {
  flatNineIdentity,
  makeFlatNineDominant,
  parseCanonicalFlatNineLabel,
} from "./canonicalFlatNine";

describe("Phase 4.8 canonical 7(b9) contract", () => {
  it("round-trips one canonical identity across all 12 roots", () => {
    for (let root = 0; root < 12; root += 1) {
      const name = noteNameFromPitchClass(root);
      const aliases = [`${name}7b9`, `${name}7(b9)`, `${name}7♭9`];
      const parsed = aliases.map(parseCanonicalFlatNineLabel);
      expect(parsed.every(Boolean)).toBe(true);
      expect(new Set(parsed.map((chord) =>
        chordIdentityKey(normalizeChordSymbol(chord!))))).toEqual(
        new Set([flatNineIdentity(root)]),
      );
      const canonical = makeFlatNineDominant(root);
      expect(canonical.label).toBe(`${name}7(b9)`);
      expect(factorizationPreservesIdentity(canonical.label)).toBe(true);
      expect(symbolFromFactorized(factorizeChordSymbol(canonical)))
        .toEqual(canonical);
    }
  });

  it("preserves inversion bass while deduplicating root bass", () => {
    const rootPosition = makeFlatNineDominant(9, 9);
    const inversion = makeFlatNineDominant(9, 4);
    expect(rootPosition.label).toBe("A7(b9)");
    expect(rootPosition.bass).toBeUndefined();
    expect(inversion.label).toBe("A7(b9)/E");
    expect(inversion.bass).toBe(4);
    expect(flatNineIdentity(9, 9)).not.toBe(flatNineIdentity(9, 4));
  });
});
