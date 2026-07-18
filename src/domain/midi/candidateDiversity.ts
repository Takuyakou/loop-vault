import { normalizePc } from "../chords";
import { QUICK_CHORD_ALTERNATIVE_LIMIT } from "../chordAlternatives";
import type { ChordSymbol, Tension } from "../types";
import { canonicalChord, chordTemplates, type ChordCandidateScore } from "./candidates";

export interface CandidateDiversityOptions {
  primary: ChordCandidateScore;
  /** Alternatives only. Quick editing shows at most five alternatives. */
  limit?: number;
  bassPitchClass?: number;
}

const tensionIntervals: Readonly<Record<Tension, number>> = {
  "9": 2,
  b9: 1,
  "#9": 3,
  "11": 5,
  "#11": 6,
  "13": 9,
  b13: 8,
};

export function selectDiverseAlternatives(
  candidates: readonly ChordCandidateScore[],
  options: CandidateDiversityOptions,
): ChordCandidateScore[] {
  const limit = Math.max(0, Math.min(
    QUICK_CHORD_ALTERNATIVE_LIMIT,
    options.limit ?? QUICK_CHORD_ALTERNATIVE_LIMIT,
  ));
  if (limit === 0) return [];

  const primaryKey = canonicalChord(options.primary.chord);
  const pool = stableCandidates(candidates).filter(
    (candidate) => canonicalChord(candidate.chord) !== primaryKey,
  );
  const selected: ChordCandidateScore[] = [];
  const selectedKeys = new Set<string>();
  const take = (candidate: ChordCandidateScore | undefined): void => {
    if (!candidate || selected.length >= limit) return;
    const key = canonicalChord(candidate.chord);
    if (key === primaryKey || selectedKeys.has(key)) return;
    selected.push(candidate);
    selectedKeys.add(key);
  };
  const takeFirst = (predicate: (candidate: ChordCandidateScore) => boolean): void => {
    take(pool.find((candidate) => !selectedKeys.has(canonicalChord(candidate.chord)) && predicate(candidate)));
  };

  const primaryPitchSet = chordPitchSet(options.primary.chord);
  const equivalentPitchSet = (candidate: ChordCandidateScore) =>
    samePitchSet(chordPitchSet(candidate.chord), primaryPitchSet);
  const matchesBassRoot = (candidate: ChordCandidateScore) => options.bassPitchClass !== undefined
    && (candidate.chord.root === normalizePc(options.bassPitchClass)
      || candidate.chord.bass === normalizePc(options.bassPitchClass));

  takeFirst((candidate) => candidate.chord.root !== options.primary.chord.root
    && !matchesBassRoot(candidate)
    && !equivalentPitchSet(candidate));
  takeFirst((candidate) => candidate.chord.root === options.primary.chord.root
    && candidate.chord.quality !== options.primary.chord.quality
    && !equivalentPitchSet(candidate));
  if (options.bassPitchClass !== undefined) {
    takeFirst((candidate) => matchesBassRoot(candidate) && !equivalentPitchSet(candidate));
  }
  takeFirst(equivalentPitchSet);

  for (const candidate of pool) take(candidate);
  return selected;
}

export function chordPitchSet(chord: ChordSymbol): number[] {
  const template = chordTemplates.find((entry) => entry.quality === chord.quality);
  const intervals = template
    ? [...template.required, ...template.important, ...template.optional]
    : [0];
  const pitches = intervals.map((interval) => normalizePc(chord.root + interval));
  pitches.push(...chord.tensions.map((tension) => normalizePc(chord.root + tensionIntervals[tension])));
  if (chord.bass !== undefined) pitches.push(normalizePc(chord.bass));
  return [...new Set(pitches)].sort((left, right) => left - right);
}

function stableCandidates(candidates: readonly ChordCandidateScore[]): ChordCandidateScore[] {
  const byChord = new Map<string, ChordCandidateScore>();
  for (const candidate of candidates) {
    const key = canonicalChord(candidate.chord);
    const current = byChord.get(key);
    if (!current || compareCandidates(candidate, current) < 0) byChord.set(key, candidate);
  }
  return [...byChord.values()].sort(compareCandidates).slice(0, 8);
}

function compareCandidates(left: ChordCandidateScore, right: ChordCandidateScore): number {
  return right.totalScore - left.totalScore
    || canonicalChord(left.chord).localeCompare(canonicalChord(right.chord));
}

function samePitchSet(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
