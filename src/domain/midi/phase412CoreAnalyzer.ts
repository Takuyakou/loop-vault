import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiWithRankingScores } from "./legacy";
import { phase4QualityEvidence } from "./phase4Analyzer";
import type { AnalyzeMidiOptions } from "./types";

export const phase412CoreAnalyzerVersion = "phase4.1.2-core-v1";

/**
 * Phase 4.1.2 without Stage E.
 *
 * Stages A through D changed what a display slot is spent on and how the list is
 * ordered; Stage E changed how many candidates exist to choose from. Those are
 * different bets with different costs, and the final assessment could not
 * separate them because only the combination was measurable.
 *
 * This mode exists so the ablation asks one question at a time. Chord detection
 * is unchanged from `phase4-v1` here as it is everywhere in this phase.
 */
export function analyzeMidiPhase412Core(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
    usePatternSelection: true,
    useStructuralWindows: false,
    useExtractionProfile: true,
    analyzerVersion: phase412CoreAnalyzerVersion,
  }).analysis;
}
