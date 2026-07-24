import { normalizePc, parseChordLabel } from "./chords";
import type { ChordQuality, ChordSymbol, Tension } from "./types";

/**
 * Spelling-independent description of a chord.
 *
 * `ChordSymbol` carries a display label, so `Gbadd9` and `F#add9` compare as
 * different chords even though they sound identical. Evaluation and dedup need
 * the opposite: pitch classes only, with the quality broken into the parts that
 * can be scored separately (triad, seventh, extensions, alterations, bass).
 */
export interface NormalizedChordIdentity {
  rootPitchClass: number;
  triad: ChordTriad;
  seventh?: ChordSeventh;
  extensions: number[];
  alterations: string[];
  bassPitchClass?: number;
  noChord?: boolean;
}

export type ChordTriad =
  | "major" | "minor" | "diminished" | "augmented" | "sus2" | "sus4" | "power" | "unknown";

export type ChordSeventh = "minor7" | "major7" | "diminished7";

interface QualityStructure {
  triad: ChordTriad;
  seventh?: ChordSeventh;
  extensions: readonly number[];
}

const qualityStructures: Record<ChordQuality, QualityStructure> = {
  maj: { triad: "major", extensions: [] },
  min: { triad: "minor", extensions: [] },
  dim: { triad: "diminished", extensions: [] },
  aug: { triad: "augmented", extensions: [] },
  maj7: { triad: "major", seventh: "major7", extensions: [] },
  min7: { triad: "minor", seventh: "minor7", extensions: [] },
  dom7: { triad: "major", seventh: "minor7", extensions: [] },
  min7b5: { triad: "diminished", seventh: "minor7", extensions: [] },
  dim7: { triad: "diminished", seventh: "diminished7", extensions: [] },
  maj9: { triad: "major", seventh: "major7", extensions: [9] },
  min9: { triad: "minor", seventh: "minor7", extensions: [9] },
  dom9: { triad: "major", seventh: "minor7", extensions: [9] },
  min11: { triad: "minor", seventh: "minor7", extensions: [11] },
  dom13: { triad: "major", seventh: "minor7", extensions: [13] },
  sus2: { triad: "sus2", extensions: [] },
  sus4: { triad: "sus4", extensions: [] },
  dom7sus4: { triad: "sus4", seventh: "minor7", extensions: [] },
  add9: { triad: "major", extensions: [9] },
  six: { triad: "major", extensions: [6] },
  min6: { triad: "minor", extensions: [6] },
  sixNine: { triad: "major", extensions: [6, 9] },
};

const naturalTensions: Partial<Record<Tension, number>> = { "9": 9, "11": 11, "13": 13 };

export function normalizeChordSymbol(symbol: ChordSymbol): NormalizedChordIdentity {
  const structure = qualityStructures[symbol.quality];
  const extensions = new Set<number>(structure.extensions);
  const alterations = new Set<string>();

  for (const tension of symbol.tensions) {
    const natural = naturalTensions[tension];
    if (natural !== undefined) extensions.add(natural);
    else alterations.add(tension);
  }

  const rootPitchClass = normalizePc(symbol.root);
  const bassPitchClass = symbol.bass === undefined ? undefined : normalizePc(symbol.bass);

  return {
    rootPitchClass,
    triad: structure.triad,
    ...(structure.seventh ? { seventh: structure.seventh } : {}),
    extensions: [...extensions].sort((left, right) => left - right),
    alterations: [...alterations].sort(),
    ...(bassPitchClass !== undefined && bassPitchClass !== rootPitchClass
      ? { bassPitchClass }
      : {}),
  };
}

export function normalizeChordLabel(label: string): NormalizedChordIdentity | null {
  const trimmed = label.trim();
  if (isNoChordLabel(trimmed)) {
    return { rootPitchClass: -1, triad: "unknown", extensions: [], alterations: [], noChord: true };
  }
  const parsed = parseChordLabel(trimmed);
  return parsed ? normalizeChordSymbol(parsed) : null;
}

export function isNoChordLabel(label: string): boolean {
  return /^(n\.?c\.?|no chord|-)$/i.test(label.trim());
}

/** Stable string form for dedup keys and map lookups. */
export function chordIdentityKey(identity: NormalizedChordIdentity): string {
  if (identity.noChord) return "NC";
  return [
    identity.rootPitchClass,
    identity.triad,
    identity.seventh ?? "-",
    identity.extensions.join("."),
    identity.alterations.join("."),
    identity.bassPitchClass ?? "-",
  ].join("|");
}

export function chordIdentitiesEqual(
  left: NormalizedChordIdentity,
  right: NormalizedChordIdentity,
): boolean {
  return chordIdentityKey(left) === chordIdentityKey(right);
}
