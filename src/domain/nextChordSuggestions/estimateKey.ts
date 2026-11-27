/**
 * P25 V23 Stage 1: the 24-key estimate used only by the next-chord suggestions. It never feeds
 * `keyDecision.key` (the screen's key, saved key or the cards' degrees).
 *
 * The score is the one in the proposal (v4 §2.3): chord fit with position weights, structure bonuses,
 * major/minor separation, and a strict rule for a lone minor V7 so a single C7 does not make F minor
 * outrank F major. Ties are broken by score, major before minor, then the distance from the first chord
 * (v4 change 4: `(tonic - chords[0].root + 12) % 12` ascending), so transposing the chart transposes the
 * answer without changing the order.
 */
import { normalizePc } from "../chords";
import type { ChordQuality, ChordSymbol } from "../types";

export type KeyMode = "major" | "minor";
export type QualityFamily = "maj" | "min" | "dom" | "dim" | "aug";

export interface EstimatedKey {
  readonly tonic: number;
  readonly mode: KeyMode;
}

export interface KeyEstimate {
  /** One or two keys within 3 points of the top (top first). */
  readonly keys: readonly EstimatedKey[];
  /** True when the top key is 4+ points ahead of the second (or there is no second). */
  readonly confident: boolean;
}

const MAJOR_SCALE = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR_SCALE = new Set([0, 2, 3, 5, 7, 8, 10, 11]);

/** The five families of v4 §3.1 (aug is independent so its two rows can be reached). */
export function familyOf(chord: ChordSymbol): QualityFamily {
  if (chord.altered) return "dom";
  switch (chord.quality) {
    case "aug": return "aug";
    case "dom7": case "dom9": case "dom11": case "dom13": case "dom7sus4": return "dom";
    case "dim": case "dim7": case "min7b5": return "dim";
    case "min": case "min7": case "min9": case "min11": case "min6": case "minMaj7": return "min";
    default: return "maj";
  }
}

/** Skeleton intervals; tensions are not part of the key fit, an altered dominant uses root/3/7. */
const SKELETON: Readonly<Record<ChordQuality, readonly number[]>> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  maj9: [0, 4, 7, 11, 2], min9: [0, 3, 7, 10, 2], dom9: [0, 4, 7, 10, 2],
  min11: [0, 3, 7, 10, 2, 5], dom13: [0, 4, 7, 10, 2, 9],
  sus2: [0, 2, 7], sus4: [0, 5, 7], dom7sus4: [0, 5, 7, 10],
  add9: [0, 4, 7, 2], add13: [0, 4, 7, 9], six: [0, 4, 7, 9],
  min6: [0, 3, 7, 9], sixNine: [0, 4, 7, 9, 2], minMaj7: [0, 3, 7, 11],
  power: [0, 7], dom11: [0, 4, 7, 10, 2, 5],
};

function skeleton(chord: ChordSymbol): number[] {
  if (chord.altered) return [0, 4, 10].map((interval) => normalizePc(chord.root + interval));
  return SKELETON[chord.quality].map((interval) => normalizePc(chord.root + interval));
}

function matches(deg: number, family: QualityFamily, table: ReadonlyArray<readonly [number, readonly QualityFamily[]]>): boolean {
  return table.some(([value, families]) => value === deg && families.includes(family));
}

const MAJOR_DIATONIC: ReadonlyArray<readonly [number, readonly QualityFamily[]]> = [
  [0, ["maj"]], [2, ["min"]], [4, ["min"]], [5, ["maj"]], [7, ["dom", "maj"]], [9, ["min"]], [11, ["dim"]],
];
const MINOR_DIATONIC: ReadonlyArray<readonly [number, readonly QualityFamily[]]> = [
  [0, ["min"]], [2, ["dim"]], [3, ["maj"]], [5, ["min"]], [7, ["min", "dom", "maj"]], [8, ["maj"]], [10, ["maj", "dom"]],
];
const MAJOR_SECONDARY: ReadonlyArray<readonly [number, readonly QualityFamily[]]> = [
  [0, ["dom"]], [2, ["dom"]], [4, ["dom"]], [9, ["dom"]],
];
const MINOR_SECONDARY: ReadonlyArray<readonly [number, readonly QualityFamily[]]> = [
  [0, ["dom"]], [2, ["dom"]], [5, ["dom"]],
];
const MAJOR_BORROWED: ReadonlyArray<readonly [number, readonly QualityFamily[]]> = [
  [5, ["min"]], [10, ["maj", "dom"]], [8, ["maj"]], [3, ["maj"]],
];
const MINOR_BORROWED: ReadonlyArray<readonly [number, readonly QualityFamily[]]> = [
  [5, ["maj"]], [1, ["maj"]],
];

function scoreKey(chords: readonly ChordSymbol[], tonic: number, mode: KeyMode): number {
  const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const diatonic = mode === "major" ? MAJOR_DIATONIC : MINOR_DIATONIC;
  const secondary = mode === "major" ? MAJOR_SECONDARY : MINOR_SECONDARY;
  const borrowed = mode === "major" ? MAJOR_BORROWED : MINOR_BORROWED;
  let score = 0;
  for (let index = 0; index < chords.length; index += 1) {
    const chord = chords[index]!;
    const weight = chords.length === 1 ? 1.5 : index === 0 ? 1.2 : index === chords.length - 1 ? 1.5 : 1;
    const deg = normalizePc(chord.root - tonic);
    const family = familyOf(chord);
    const tones = skeleton(chord);
    const inScale = tones.filter((tone) => !scale.has(normalizePc(tone - tonic))).length;
    if (matches(deg, family, diatonic)) score += 10 * weight;
    else if (matches(deg, family, secondary)) score += 6 * weight;
    else if (matches(deg, family, borrowed)) score += 4 * weight;
    else if (inScale === 0) score += 3 * weight;
    else score -= 3 * inScale * weight;
    if (chord.bass !== undefined && chord.bass !== chord.root && !scale.has(normalizePc(chord.bass - tonic))) score -= 2 * weight;
  }
  const first = chords[0]!;
  const last = chords[chords.length - 1]!;
  const firstDeg = normalizePc(first.root - tonic);
  const lastDeg = normalizePc(last.root - tonic);
  const tonicQuality = mode === "major" ? "maj" : "min";
  if (firstDeg === 0 && familyOf(first) === tonicQuality) score += 5;
  if (lastDeg === 0 && familyOf(last) === tonicQuality) score += 4;
  for (let index = 0; index + 1 < chords.length; index += 1) {
    const a = chords[index]!;
    const b = chords[index + 1]!;
    if (normalizePc(a.root - tonic) === 7 && familyOf(a) === "dom"
      && normalizePc(b.root - tonic) === 0 && familyOf(b) === tonicQuality) {
      score += 8;
      break;
    }
  }
  if (mode === "minor" && chords.some((chord) => normalizePc(chord.root - tonic) === 7 && familyOf(chord) === "dom")) {
    const context = chords.some((chord) => {
      const deg = normalizePc(chord.root - tonic);
      return (deg === 0 && familyOf(chord) === "min") || (deg === 5 && familyOf(chord) === "min") || (deg === 2 && familyOf(chord) === "dim");
    });
    if (context) score += 6;
  }
  return score;
}

function compareKeys(left: { key: EstimatedKey; score: number }, right: { key: EstimatedKey; score: number }, firstRoot: number): number {
  return right.score - left.score
    || (left.key.mode === right.key.mode ? 0 : left.key.mode === "major" ? -1 : 1)
    || normalizePc(left.key.tonic - firstRoot) - normalizePc(right.key.tonic - firstRoot);
}

export function estimateCandidateKeys(chords: readonly ChordSymbol[]): KeyEstimate | undefined {
  if (chords.length === 0) return undefined;
  const scored: Array<{ key: EstimatedKey; score: number }> = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const mode of ["major", "minor"] as const) {
      scored.push({ key: { tonic, mode }, score: scoreKey(chords, tonic, mode) });
    }
  }
  scored.sort((left, right) => compareKeys(left, right, chords[0]!.root));
  const top = scored[0]!;
  const second = scored[1];
  const confident = second === undefined || top.score - second.score >= 4;
  const keys = scored.filter((entry) => entry.score >= top.score - 3).slice(0, 2).map((entry) => entry.key);
  return { keys: keys.length > 0 ? keys : [top.key], confident };
}

export function estimateKeyForSuggestions(chords: readonly ChordSymbol[]): EstimatedKey | undefined {
  return estimateCandidateKeys(chords)?.keys[0];
}

/** The proposal's key context for spelling labels; flat keys use flats, the rest sharps. */
export function keyContextFor(key: EstimatedKey): string {
  const major = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const minor = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
  const name = (key.mode === "major" ? major : minor)[key.tonic]!;
  return `${name} ${key.mode}`;
}
