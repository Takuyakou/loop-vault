/**
 * Input level metering (contract 01 / brief §11.5). Pure and deterministic: it
 * derives a stable RMS and peak from a block of normalized samples in [-1, 1]
 * and flags clipping. Level values are display-only and are never saved or sent.
 */

export interface LevelReading {
  /** Root-mean-square level in [0, 1]. */
  readonly rms: number;
  /** Absolute peak in [0, 1]. */
  readonly peak: number;
  /** True when the block reaches/exceeds the clip threshold. */
  readonly clipping: boolean;
}

/** Samples at or above this absolute value are treated as clipped. */
export const CLIP_THRESHOLD = 0.99;

export function readLevel(
  samples: ArrayLike<number>,
  clipThreshold: number = CLIP_THRESHOLD,
): LevelReading {
  if (!(clipThreshold > 0)) {
    throw new RangeError("Clip threshold must be positive.");
  }
  const length = samples.length;
  if (length === 0) {
    return Object.freeze({ rms: 0, peak: 0, clipping: false });
  }
  let sumSquares = 0;
  let peak = 0;
  let clipping = false;
  for (let i = 0; i < length; i += 1) {
    const sample = samples[i];
    if (!Number.isFinite(sample)) {
      throw new RangeError("Samples must be finite numbers.");
    }
    const magnitude = Math.abs(sample);
    sumSquares += sample * sample;
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= clipThreshold) clipping = true;
  }
  const rms = Math.sqrt(sumSquares / length);
  return Object.freeze({
    rms: clampUnit(rms),
    peak: clampUnit(peak),
    clipping,
  });
}

/** A discrete meter segment count, for a color-independent text/bar alternative. */
export function meterSegments(rms: number, segments: number): number {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new RangeError("Segment count must be a positive integer.");
  }
  const clamped = clampUnit(rms);
  return Math.min(segments, Math.round(clamped * segments));
}

function clampUnit(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
