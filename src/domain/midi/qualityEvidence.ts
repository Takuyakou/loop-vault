import { normalizePc } from "../chords";
import type { ChordQuality } from "../types";

/**
 * Quality-defining tone evidence.
 *
 * The legacy template score sums every chord tone equally, so a chord can be
 * labelled minor while its minor third is absent: the root, fifth and seventh
 * alone carry enough weight to win. On the `endless endless chord` fixture this
 * produces `F#m11` and `Em11` for bars whose notes contain neither a minor third
 * nor a fifth.
 *
 * This module names the tones a quality may not claim without, measures how much
 * of that evidence is actually sounding, and reports the shortfall. It does not
 * decide anything on its own — the analyzer applies the penalty.
 */

export interface QualityDefiningEvidence {
  /** Absolute pitch classes the quality cannot be named without. */
  requiredPitchClasses: number[];
  /** Share of the required tones actually sounding, 0..1. */
  coverage: number;
  /** Shortfall scaled for the score, 0 when every required tone is present. */
  missingPenalty: number;
}

/**
 * A tone is counted as sounding once it carries this share of the window's
 * weight, which keeps a stray grace note from standing in for a real chord tone.
 */
const presenceThreshold = 0.02;

/** How much a fully missing quality-defining tone costs the candidate. */
export const missingQualityTonePenalty = 0.35;

/**
 * Intervals that define each quality, relative to the root.
 *
 * The root and the fifth are deliberately absent: rootless voicings are common
 * and a fifth is the first tone players drop, so requiring either would reject
 * chords that are perfectly recognisable without them.
 */
const definingIntervals: Record<ChordQuality, readonly number[]> = {
  maj: [4],
  min: [3],
  dim: [3, 6],
  aug: [4, 8],
  maj7: [4, 11],
  min7: [3, 10],
  dom7: [4, 10],
  min7b5: [3, 6, 10],
  dim7: [3, 6, 9],
  maj9: [4, 11],
  min9: [3, 10],
  dom9: [4, 10],
  min11: [3, 10],
  dom13: [4, 10],
  sus2: [2],
  sus4: [5],
  dom7sus4: [5, 10],
  add9: [4],
  six: [4],
  min6: [3],
  sixNine: [4],
};

export function qualityDefiningIntervals(quality: ChordQuality): readonly number[] {
  return definingIntervals[quality] ?? [];
}

export function evaluateQualityEvidence(
  root: number,
  quality: ChordQuality,
  histogram: readonly number[],
  total: number,
): QualityDefiningEvidence {
  const intervals = qualityDefiningIntervals(quality);
  const requiredPitchClasses = intervals.map((interval) => normalizePc(root + interval));
  if (requiredPitchClasses.length === 0 || total <= 0) {
    return { requiredPitchClasses, coverage: 1, missingPenalty: 0 };
  }

  const present = requiredPitchClasses.filter(
    (pitchClass) => (histogram[pitchClass] ?? 0) / total > presenceThreshold,
  ).length;
  const coverage = present / requiredPitchClasses.length;

  return {
    requiredPitchClasses,
    coverage,
    missingPenalty: (1 - coverage) * missingQualityTonePenalty,
  };
}

/**
 * Bass support for the root is worth less when the quality itself is poorly
 * evidenced: a strong bass note should not be able to carry a chord label whose
 * defining tone is missing (§11.6).
 */
export function attenuateRootBonus(bonus: number, coverage: number): number {
  return bonus * (0.4 + 0.6 * coverage);
}

export const missingQualityToneWarning = "missing-quality-defining-tone";
export const ambiguousQualityWarning = "ambiguous-quality";
