import {
  chordIdentityKey,
  normalizeChordSymbol,
} from "../../src/domain/chordIdentity";
import {
  makeChordSymbol,
  normalizePc,
  parseChordLabel,
} from "../../src/domain/chords";
import type { ChordSymbol } from "../../src/domain/types";

export const observedFlatNineRuleId = "observed-flat-nine-dominant-v1";

/** Gold/UI alias normalization only. Product chord parsing remains unchanged. */
export function normalizeFlatNineAlias(label: string): string {
  return label.replaceAll("♭", "b");
}

export function parseCanonicalFlatNineLabel(label: string): ChordSymbol | null {
  return parseChordLabel(normalizeFlatNineAlias(label));
}

export function makeFlatNineDominant(
  root: number,
  bass = root,
): ChordSymbol {
  const normalizedRoot = normalizePc(root);
  const normalizedBass = normalizePc(bass);
  return makeChordSymbol(
    normalizedRoot,
    "dom7",
    ["b9"],
    normalizedBass === normalizedRoot ? undefined : normalizedBass,
  );
}

export function flatNineIdentity(root: number, bass = root): string {
  return chordIdentityKey(normalizeChordSymbol(makeFlatNineDominant(root, bass)));
}
