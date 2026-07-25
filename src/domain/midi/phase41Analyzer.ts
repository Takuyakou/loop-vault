import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiWithRankingScores } from "./legacy";
import { phase4QualityEvidence } from "./phase4Analyzer";
import type { AnalyzeMidiOptions } from "./types";

export const phase41AnalyzerVersion = "phase4.1-v1";

/**
 * Phase 4.1 analyzer.
 *
 * Keeps Phase 4.0's chord detection exactly as promoted and changes what the
 * candidate list is for: covering the song rather than ranking it. Adds the
 * analysis-only robustness pass for AI-extracted MIDI.
 *
 * Every earlier mode is still selectable, so this is one constant away from
 * being reverted.
 */
export function analyzeMidiPhase41(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options, {
    // Chord detection is unchanged from phase4-v1.
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
    // Section awareness measured no better than plain coverage in P4.1-04, so
    // the section signal stays available but is not switched on.
    useCoverageSelection: true,
    // Enabled only because it fired on no corpus file and left every corpus
    // timeline byte-identical.
    useExtractionProfile: true,
    analyzerVersion: phase41AnalyzerVersion,
  }).analysis;
}
