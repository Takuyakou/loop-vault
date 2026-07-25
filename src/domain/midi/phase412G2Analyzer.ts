import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiWithRankingScores } from "./legacy";
import { phase4QualityEvidence } from "./phase4Analyzer";
import type { AnalyzeMidiOptions } from "./types";

export const phase412G2AnalyzerVersion = "phase4.1.2-g2-v1";
export const phase412CoreG2AnalyzerVersion = "phase4.1.2-core-g2-v1";

/**
 * The two-pass selector, with and without Stage E.
 *
 * G3 compares five configurations and two of them are these. They exist as modes
 * so the comparison runs through `analyzeMidi` like every other measurement,
 * rather than through a special path that could differ in some other way without
 * anyone noticing.
 *
 * Chord detection is unchanged from `phase4-v1`, as everywhere in this phase.
 */
function analyze(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions,
  useStructuralWindows: boolean,
  analyzerVersion: string,
): MidiProgressionAnalysis {
  return analyzeMidiWithRankingScores(bytes, options, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
    usePatternSelection: true,
    useTwoPassSelection: true,
    useStructuralWindows,
    useExtractionProfile: true,
    analyzerVersion,
  }).analysis;
}

export function analyzeMidiPhase412G2(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyze(bytes, options, true, phase412G2AnalyzerVersion);
}

export function analyzeMidiPhase412CoreG2(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
): MidiProgressionAnalysis {
  return analyze(bytes, options, false, phase412CoreG2AnalyzerVersion);
}
