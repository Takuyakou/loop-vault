/**
 * Meters that are not a plain reading of a song (1/4, 13/4 …). The screen only says so: the meter of
 * the file is never rewritten (KNOWN-FAILURES: do not rewrite the source meter; P5.38 keeps meter,
 * totalBars and the timeline as the source truth).
 */
export function isUnusualMeter(numerator: number, denominator: number): boolean {
  return numerator < 2 || numerator > 12 || ![2, 4, 8, 16].includes(denominator);
}
