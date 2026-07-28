import { canonicalChordAlternative, QUICK_CHORD_ALTERNATIVE_LIMIT } from "../chordAlternatives";
import { chordPitchClasses } from "../chordVoicing";
import { makeChordSymbol, normalizePc } from "../chords";
import type { ChordSymbol } from "../types";

export interface AccuracyFirstAlternative {
  chord: ChordSymbol;
  confidence: number;
}

/**
 * Restores the plain identity hidden by an automatically attached bass.
 *
 * Rank 1 and the two alternatives already visible in Product Top-3 stay in
 * place. The companion is inserted after them and never enters persisted data
 * unless the user explicitly chooses it.
 */
export function addBassPlainCompanion<T extends AccuracyFirstAlternative>(
  current: ChordSymbol,
  alternatives: readonly T[],
  histogram: readonly number[],
  confidence: number,
): AccuracyFirstAlternative[] {
  const sourceBass = current.bass;
  if (sourceBass === undefined || normalizePc(sourceBass) === normalizePc(current.root)) {
    return [...alternatives];
  }
  const plain = makeChordSymbol(
    normalizePc(current.root),
    current.quality,
    [...current.tensions],
  );
  const plainKey = canonicalChordAlternative(plain);
  if (
    canonicalChordAlternative(current) === plainKey
    || alternatives.some((entry) => canonicalChordAlternative(entry.chord) === plainKey)
  ) {
    return [...alternatives];
  }
  const supported = chordPitchClasses(plain).every((pitchClass) =>
    (histogram[normalizePc(pitchClass)] ?? 0) > 0);
  if (!supported) return [...alternatives];

  const insertionIndex = Math.min(2, alternatives.length);
  return [
    ...alternatives.slice(0, insertionIndex),
    { chord: plain, confidence },
    ...alternatives.slice(insertionIndex),
  ].slice(0, QUICK_CHORD_ALTERNATIVE_LIMIT);
}
