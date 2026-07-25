import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiWithRankingScores } from "./legacy";
import type { AnalyzeMidiOptions } from "./types";

export const phase4AnalyzerVersion = "phase4-symbolic-v1";

/**
 * Phase 4 analyzer.
 *
 * Same pipeline as legacy, with quality-defining tone evidence enabled: a chord
 * is charged for naming a quality whose defining tone is absent, and a bass note
 * sitting on the root no longer compensates for that absence.
 *
 * Kept as a separate mode so `defaultAnalyzerMode` stays `legacy` until the
 * P4.0-06 comparison is reviewed and approved.
 */
export function analyzeMidiPhase4(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options, {
    useQualityEvidence: true,
    analyzerVersion: phase4AnalyzerVersion,
  }).analysis;
}
