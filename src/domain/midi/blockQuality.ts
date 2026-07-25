import { normalizePc } from "../chords";
import type { CandidateChordEvent } from "./candidateBlock";

/**
 * Block quality scoring for candidate selection.
 *
 * v1 scored a block as `averageRankingScore + repeatBonus + diversityBonus`.
 * The ranking term saturates — 92.8% of corpus events sit at exactly 1.0 — so
 * the bonuses were the only thing separating candidates, and one of them was a
 * bonus for having more distinct chords. That penalised vamps and compact loops
 * for being what they are.
 *
 * v2 scores the musical evidence instead: how well the notes support the chords
 * (duration-weighted), whether the block starts and ends on a real boundary,
 * whether the shape recurs, and whether it loops back on itself. Chord count is
 * not part of the score at all; density is handled as a diversity class during
 * selection.
 */

export interface BlockQualityComponents {
  evidence: number;
  boundary: number;
  repeat: number;
  loopFitness: number;
  total: number;
}

const WEIGHTS = {
  evidence: 0.55,
  boundary: 0.15,
  repeat: 0.20,
  loopFitness: 0.10,
} as const;

/** Blocks below this are never selected just to fill a density class slot. */
export const qualityFloor = 0.35;

/**
 * Per-file min-max normalisation of the recovered raw match score.
 *
 * Deliberately calibration-free: no corpus-derived constants, and selection only
 * ever compares blocks inside one analysis. A file whose chords are all equally
 * well supported yields a flat 0.5, which is the honest answer — that file
 * offers no evidence to discriminate on.
 */
export function normaliseEvidence(rawScores: readonly number[]): (value: number) => number {
  const finite = rawScores.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return () => 0.5;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (max - min < 1e-9) return () => 0.5;
  return (value: number) => {
    if (!Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, (value - min) / (max - min)));
  };
}

function durationWeighted(
  events: readonly CandidateChordEvent[],
  valueOf: (event: CandidateChordEvent) => number,
): number {
  const total = events.reduce((sum, event) => sum + event.durationBeats, 0);
  if (total <= 0) return 0;
  return events.reduce((sum, event) => sum + valueOf(event) * event.durationBeats, 0) / total;
}

function evidenceScore(
  events: readonly CandidateChordEvent[],
  normalise: (value: number) => number,
): number {
  if (events.length === 0) return 0;
  return durationWeighted(events, (event) => (
    event.rawMatchScore !== undefined ? normalise(event.rawMatchScore) : 0.5
  ));
}

/**
 * How cleanly the events sit on the metric grid. A block whose chords change on
 * bar lines reads as a usable loop; one whose changes land off the grid is more
 * likely an artefact of the fixed analysis window.
 */
function boundaryScore(events: readonly CandidateChordEvent[], beatsPerBar: number): number {
  if (events.length === 0) return 0;
  return durationWeighted(events, (event) => {
    const offset = event.relativeStartBeat % beatsPerBar;
    if (Math.abs(offset) < 1e-9) return 1;
    if (Math.abs(offset - Math.round(offset)) < 1e-9) return 0.6;
    return 0.2;
  });
}

/** Saturating: recurring twice is the signal, recurring ten times adds nothing. */
function repeatScore(repeatCount: number): number {
  if (repeatCount <= 1) return 0;
  return Math.min(1, (repeatCount - 1) / 2);
}

/**
 * How well the block's end leads back to its start.
 *
 * Deliberately avoids assuming a reliable global key: it looks only at the
 * interval between the last and first chord and at their shared pitch classes.
 */
export function loopFitnessScore(events: readonly CandidateChordEvent[]): number {
  if (events.length < 2) return 0;
  const first = events[0].chord;
  const last = events[events.length - 1].chord;

  const interval = normalizePc(first.root - last.root);
  // V -> I is a fifth up (7 semitones down to the tonic); IV -> I and bVII -> I
  // are the other common returns. Anything else is neutral rather than penalised.
  const motion = interval === 5 ? 1 : interval === 7 ? 0.7 : interval === 2 ? 0.6 : interval === 0 ? 0.5 : 0.2;

  const firstTones = new Set(chordTones(first.root, first.quality));
  const lastTones = chordTones(last.root, last.quality);
  const shared = lastTones.filter((tone) => firstTones.has(tone)).length;
  const commonToneRatio = lastTones.length > 0 ? shared / lastTones.length : 0;

  return 0.6 * motion + 0.4 * commonToneRatio;
}

function chordTones(root: number, quality: string): number[] {
  const third = quality.startsWith("min") || quality === "dim" || quality === "dim7" ? 3
    : quality.includes("sus4") || quality === "sus4" ? 5
      : quality === "sus2" ? 2 : 4;
  const fifth = quality === "dim" || quality === "dim7" || quality === "min7b5" ? 6
    : quality === "aug" ? 8 : 7;
  return [normalizePc(root), normalizePc(root + third), normalizePc(root + fifth)];
}

export function scoreBlockQuality(
  events: readonly CandidateChordEvent[],
  options: {
    repeatCount: number;
    beatsPerBar: number;
    normaliseEvidence: (value: number) => number;
  },
): BlockQualityComponents {
  const evidence = evidenceScore(events, options.normaliseEvidence);
  const boundary = boundaryScore(events, options.beatsPerBar);
  const repeat = repeatScore(options.repeatCount);
  const loopFitness = loopFitnessScore(events);
  const total = WEIGHTS.evidence * evidence
    + WEIGHTS.boundary * boundary
    + WEIGHTS.repeat * repeat
    + WEIGHTS.loopFitness * loopFitness;

  return {
    evidence: round(evidence),
    boundary: round(boundary),
    repeat: round(repeat),
    loopFitness: round(loopFitness),
    total: round(total),
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
