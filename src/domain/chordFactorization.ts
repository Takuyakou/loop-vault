import { makeChordSymbol, normalizePc, parseChordLabel } from "./chords";
import {
  chordIdentityKey,
  normalizeChordLabel,
  normalizeChordSymbol,
  type ChordSeventh,
  type ChordTriad,
  type NormalizedChordIdentity,
} from "./chordIdentity";
import type { ChordQuality, ChordSymbol, Tension } from "./types";

/**
 * A chord hypothesis taken apart into the pieces that can be argued about
 * separately.
 *
 * `ChordQuality` is a closed list of twenty-one whole chords — `min11`, `dom13`,
 * `sixNine`. That list is fine for naming a chord and useless for reasoning
 * about one: asking "is the seventh minor?" means asking which of eight quality
 * names are in play, and evidence for a root cannot be weighed without dragging
 * the whole quality template along with it. This splits the same information
 * into root, triad, seventh, tensions and bass, so a later stage can score the
 * root without the quality having a vote.
 *
 * Nothing here changes what the product says. Every function round-trips back to
 * the existing canonical identity, and the tests assert that rather than assume
 * it. The point of F0 is to have the representation in hand with the behaviour
 * provably untouched, so the stages that do change behaviour start from a
 * position where any difference is theirs.
 */

export type CoreTriad = ChordTriad;
export type SeventhKind = ChordSeventh;

/** A tension as an interval, keeping the alteration that names it. */
export type TensionKind =
  | "9" | "b9" | "#9"
  | "11" | "#11"
  | "13" | "b13"
  | "6";

export interface FactorizedChordIdentity {
  root: number;
  triad: CoreTriad;
  seventh: SeventhKind | null;
  tensions: TensionKind[];
  /** Equal to `root` when the chord is in root position. */
  bass: number;
  noChord?: boolean;
}

/**
 * Quality names, as the parts they are made of.
 *
 * Derived from the same table `chordIdentity` uses rather than written out
 * again, so the two cannot drift. A sixth is carried as a tension rather than as
 * part of the triad because that is what it is: `C6` is a major triad with a
 * sixth, and treating it as its own triad kind would make `C6` and `Cmaj` fail
 * to share the triad they audibly share.
 */
const TENSION_ORDER: TensionKind[] = ["b9", "9", "#9", "11", "#11", "b13", "13", "6"];

function sortTensions(tensions: readonly TensionKind[]): TensionKind[] {
  return [...new Set(tensions)].sort(
    (left, right) => TENSION_ORDER.indexOf(left) - TENSION_ORDER.indexOf(right),
  );
}

/**
 * The quality list, factorized.
 *
 * Kept as data so `qualityFromParts` can invert it by lookup instead of by a
 * chain of conditionals that would have to be kept in step by hand.
 */
const QUALITY_PARTS: Record<ChordQuality, {
  triad: CoreTriad;
  seventh: SeventhKind | null;
  tensions: TensionKind[];
}> = {
  maj: { triad: "major", seventh: null, tensions: [] },
  min: { triad: "minor", seventh: null, tensions: [] },
  dim: { triad: "diminished", seventh: null, tensions: [] },
  aug: { triad: "augmented", seventh: null, tensions: [] },
  maj7: { triad: "major", seventh: "major7", tensions: [] },
  min7: { triad: "minor", seventh: "minor7", tensions: [] },
  dom7: { triad: "major", seventh: "minor7", tensions: [] },
  min7b5: { triad: "diminished", seventh: "minor7", tensions: [] },
  dim7: { triad: "diminished", seventh: "diminished7", tensions: [] },
  maj9: { triad: "major", seventh: "major7", tensions: ["9"] },
  min9: { triad: "minor", seventh: "minor7", tensions: ["9"] },
  dom9: { triad: "major", seventh: "minor7", tensions: ["9"] },
  min11: { triad: "minor", seventh: "minor7", tensions: ["11"] },
  dom13: { triad: "major", seventh: "minor7", tensions: ["13"] },
  sus2: { triad: "sus2", seventh: null, tensions: [] },
  sus4: { triad: "sus4", seventh: null, tensions: [] },
  dom7sus4: { triad: "sus4", seventh: "minor7", tensions: [] },
  add9: { triad: "major", seventh: null, tensions: ["9"] },
  six: { triad: "major", seventh: null, tensions: ["6"] },
  min6: { triad: "minor", seventh: null, tensions: ["6"] },
  sixNine: { triad: "major", seventh: null, tensions: ["6", "9"] },
};

const partsKey = (
  triad: CoreTriad, seventh: SeventhKind | null, tensions: readonly TensionKind[],
) => `${triad}|${seventh ?? "-"}|${sortTensions(tensions).join(".")}`;

const QUALITY_BY_PARTS = new Map<string, ChordQuality>(
  (Object.entries(QUALITY_PARTS) as Array<[ChordQuality, typeof QUALITY_PARTS[ChordQuality]]>)
    .map(([quality, parts]) => [partsKey(parts.triad, parts.seventh, parts.tensions), quality]),
);

/** The quality name for a set of parts, when the closed list has one. */
export function qualityFromParts(
  triad: CoreTriad,
  seventh: SeventhKind | null,
  tensions: readonly TensionKind[],
): ChordQuality | undefined {
  return QUALITY_BY_PARTS.get(partsKey(triad, seventh, tensions));
}

/**
 * Takes a symbol apart.
 *
 * The tensions a quality name implies and the ones written after it are merged,
 * because `Cmaj9` and `Cmaj7(9)` are the same chord and the difference is only
 * in how someone chose to write it.
 */
export function factorizeChordSymbol(symbol: ChordSymbol): FactorizedChordIdentity {
  const parts = QUALITY_PARTS[symbol.quality];
  // `Tension` has no "6" — a sixth is only ever part of a quality name — so every
  // written tension is already a TensionKind.
  const written: TensionKind[] = symbol.tensions.filter(
    (tension) => TENSION_ORDER.includes(tension as TensionKind),
  );
  return {
    root: normalizePc(symbol.root),
    triad: parts.triad,
    seventh: parts.seventh,
    tensions: sortTensions([...parts.tensions, ...written]),
    bass: normalizePc(symbol.bass ?? symbol.root),
  };
}

/** Takes a written label apart, or null when nothing can parse it. */
export function factorizeChordLabel(label: string): FactorizedChordIdentity | null {
  const trimmed = label.trim();
  if (/^(n\.?c\.?|no chord|-)$/i.test(trimmed)) {
    return { root: -1, triad: "unknown", seventh: null, tensions: [], bass: -1, noChord: true };
  }
  const parsed = parseChordLabel(trimmed);
  return parsed ? factorizeChordSymbol(parsed) : null;
}

/**
 * Back to the canonical identity.
 *
 * This is the direction that matters for safety: every consumer of chord
 * identity — dedup, signatures, pattern grouping — goes through
 * `NormalizedChordIdentity`, so a factorized value that cannot return to the
 * identity it came from would be a new equivalence sneaking in. A sixth returns
 * to the extension list, an altered tension to the alteration list, exactly
 * where `normalizeChordSymbol` puts them.
 */
export function canonicalIdentityFromFactorized(
  factorized: FactorizedChordIdentity,
): NormalizedChordIdentity {
  if (factorized.noChord) {
    return { rootPitchClass: -1, triad: "unknown", extensions: [], alterations: [], noChord: true };
  }

  const extensions: number[] = [];
  const alterations: string[] = [];
  for (const tension of factorized.tensions) {
    if (tension === "9") extensions.push(9);
    else if (tension === "11") extensions.push(11);
    else if (tension === "13") extensions.push(13);
    else if (tension === "6") extensions.push(6);
    else alterations.push(tension);
  }

  const rootPitchClass = normalizePc(factorized.root);
  const bassPitchClass = normalizePc(factorized.bass);

  return {
    rootPitchClass,
    triad: factorized.triad,
    ...(factorized.seventh ? { seventh: factorized.seventh } : {}),
    extensions: [...new Set(extensions)].sort((left, right) => left - right),
    alterations: [...new Set(alterations)].sort(),
    ...(bassPitchClass !== rootPitchClass ? { bassPitchClass } : {}),
  };
}

/**
 * Back to a written symbol, when the closed quality list can express the parts.
 *
 * Returns undefined rather than inventing a name. A factorized value the quality
 * list has no word for is a real possibility once later stages start proposing
 * roots and triads independently, and silently rounding it to the nearest
 * spelling would be how a chord the product cannot name becomes a chord the
 * product names wrongly.
 */
export function symbolFromFactorized(
  factorized: FactorizedChordIdentity,
): ChordSymbol | undefined {
  if (factorized.noChord) return undefined;

  // Prefer the quality that already covers the tensions, so `Cmaj9` comes back
  // as `maj9` rather than as `maj7` with a `9` written after it.
  const whole = qualityFromParts(factorized.triad, factorized.seventh, factorized.tensions);
  if (whole !== undefined) {
    return makeChordSymbol(
      factorized.root, whole, [],
      factorized.bass === factorized.root ? undefined : factorized.bass,
    );
  }

  const base = qualityFromParts(factorized.triad, factorized.seventh, []);
  if (base === undefined) return undefined;
  const written = factorized.tensions.filter(
    (tension): tension is Exclude<TensionKind, "6"> => tension !== "6",
  );
  if (written.length !== factorized.tensions.length) return undefined;

  return makeChordSymbol(
    factorized.root, base, written as Tension[],
    factorized.bass === factorized.root ? undefined : factorized.bass,
  );
}

/**
 * Whether taking a label apart and putting it back changes what it means.
 *
 * Compares identity keys rather than labels: coming back as `Cmaj7(9)` instead
 * of `Cmaj9` would be a different spelling of the same chord, which is allowed,
 * while coming back as a different chord is not.
 */
export function factorizationPreservesIdentity(label: string): boolean {
  const identity = normalizeChordLabel(label);
  const factorized = factorizeChordLabel(label);
  if (identity === null || factorized === null) return identity === null && factorized === null;
  return chordIdentityKey(canonicalIdentityFromFactorized(factorized))
    === chordIdentityKey(identity);
}

/** Stable string form, for diagnostics and dedup of factorized values. */
export function factorizedKey(factorized: FactorizedChordIdentity): string {
  if (factorized.noChord) return "NC";
  return [
    factorized.root,
    factorized.triad,
    factorized.seventh ?? "-",
    factorized.tensions.join("."),
    factorized.bass,
  ].join("|");
}

/** The factorized form of a symbol's canonical identity, for cross-checking. */
export function identityFromSymbolViaFactorization(
  symbol: ChordSymbol,
): NormalizedChordIdentity {
  return canonicalIdentityFromFactorized(factorizeChordSymbol(symbol));
}

/** The identity the product would produce, for the same symbol. */
export function identityFromSymbolDirectly(symbol: ChordSymbol): NormalizedChordIdentity {
  return normalizeChordSymbol(symbol);
}
