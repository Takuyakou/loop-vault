import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiWithRankingScores } from "./legacy";
import { phase4QualityEvidence } from "./phase4Analyzer";
import type { AnalyzeMidiOptions } from "./types";

export const phase412AnalyzerVersion = "phase4.1.2-v1";

/**
 * Phase 4.1.2 analyzer.
 *
 * Chord detection is byte-for-byte the one promoted in Phase 4.0: the timeline,
 * the quality-evidence constants and the canonical identity contract are all
 * untouched here. What changes is what a display slot is spent on.
 *
 * `phase4.1-v1` selected occurrences and rendered a card each, so one
 * progression could take four of ten slots. This selects patterns, so it cannot.
 * Every earlier mode stays selectable and the product default is unaffected
 * until the frozen usefulness gates pass.
 */
export function analyzeMidiPhase412(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
    usePatternSelection: true,
    useExtractionProfile: true,
    analyzerVersion: phase412AnalyzerVersion,
  }).analysis;
}
