import {
  canonicalChordAlternative,
  QUICK_CHORD_ALTERNATIVE_LIMIT,
} from "../chordAlternatives";
import { makeChordSymbol, normalizePc } from "../chords";
import type { ChordSymbol } from "../types";

export const observedFlatNineCandidateRuleId = "observed-flat-nine-dominant:E1" as const;

interface RankedChord {
  chord: ChordSymbol;
  rawScore: number;
}

interface ChordAlternative {
  chord: ChordSymbol;
  confidence: number;
}

/**
 * Adds only the Phase 4.8 E1 candidate: a complete observed dominant-seventh
 * core plus an observed flat ninth in the same analysis window.
 *
 * The winner and the existing visible Top-3 are never re-ranked. Generated
 * candidates start after the first two alternatives and are bounded by the
 * existing quick-candidate limit.
 */
export function addObservedFlatNineDominantCandidate(
  current: ChordSymbol,
  alternatives: readonly ChordAlternative[],
  rankedChords: readonly RankedChord[],
  histogram: readonly number[],
): ChordAlternative[] {
  const existing = new Set([
    canonicalChordAlternative(current),
    ...alternatives.map((entry) => canonicalChordAlternative(entry.chord)),
  ]);
  const seenRoots = new Set<number>();
  const generated: ChordAlternative[] = [];
  const sourceCores = [...rankedChords]
    .filter((entry) =>
      entry.chord.quality === "dom7"
      && entry.chord.tensions.length === 0)
    .sort((left, right) => right.rawScore - left.rawScore
      || left.chord.root - right.chord.root
      || left.chord.label.localeCompare(right.chord.label));

  for (const source of sourceCores) {
    const root = normalizePc(source.chord.root);
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    if (!hasCompleteObservedE1Evidence(histogram, root)) continue;

    const chord = makeChordSymbol(
      root,
      "dom7",
      ["b9"],
      source.chord.bass,
    );
    const key = canonicalChordAlternative(chord);
    if (existing.has(key)) continue;
    existing.add(key);
    generated.push({
      chord,
      confidence: clampConfidence(source.rawScore),
    });
    if (generated.length >= 2) break;
  }

  if (generated.length === 0) return [...alternatives];
  const insertionIndex = Math.min(2, alternatives.length);
  return [
    ...alternatives.slice(0, insertionIndex),
    ...generated,
    ...alternatives.slice(insertionIndex),
  ].slice(0, QUICK_CHORD_ALTERNATIVE_LIMIT);
}

export function hasCompleteObservedE1Evidence(
  histogram: readonly number[],
  root: number,
): boolean {
  return [0, 4, 7, 10, 1].every((interval) =>
    (histogram[normalizePc(root + interval)] ?? 0) > 0);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}
