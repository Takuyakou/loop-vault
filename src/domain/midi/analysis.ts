import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiHybrid, hybridAnalyzerVersion } from "./hybrid";
import { fingerprintMidiBytes } from "./feedback";
import { analyzeMidiLegacyBoundaryRerank, legacyBoundaryRerankerVersion } from "./legacyBoundaryReranker";
import { analyzeMidi as analyzeMidiLegacy, analyzerVersion as legacyAnalyzerVersion } from "./legacy";
import { analyzeMidiPhase4, phase4AnalyzerVersion } from "./phase4Analyzer";
import { analyzeMidiPhase41, phase41AnalyzerVersion } from "./phase41Analyzer";
import type { AnalyzeMidiOptions } from "./types";
import { analyzeMidiVoiceAwareRerank, voiceAwareRerankerVersion } from "./voiceAwareReranker";

/**
 * Promoted to `phase4.1-v1` in P4.1-07 after every frozen coverage gate passed
 * and the chord corpora came back byte-identical; see
 * docs/phase4.1/07-final-validation.md.
 *
 * Chord detection is unchanged from `phase4-v1`. What changed is the candidate
 * list: it now covers the song instead of ranking it. Reverting is a one-line
 * change — every previous mode is still available.
 */
export const defaultAnalyzerMode = "phase4.1-v1" as const;
export const analyzerVersion = phase41AnalyzerVersion;
/** Kept for rollback: the analyzer promoted in Phase 4.0. */
export const phase40DefaultAnalyzerMode = "phase4-v1" as const;
export {
  hybridAnalyzerVersion,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
  phase4AnalyzerVersion,
  phase41AnalyzerVersion,
  voiceAwareRerankerVersion,
};
export { buildWeightedWindows, extractBlockCandidates, inferTrackRoles, matchWindow, smoothTimeline } from "./legacy";

export function analyzeMidi(bytes: Uint8Array, options: AnalyzeMidiOptions = {}): MidiProgressionAnalysis {
  const mode = options.mode ?? defaultAnalyzerMode;
  const analysis = mode === "hybrid-v1"
    ? analyzeMidiHybrid(bytes, options)
    : mode === "voice-aware-rerank-v1"
      ? analyzeMidiVoiceAwareRerank(bytes, options)
    : mode === "legacy-boundary-rerank"
      ? analyzeMidiLegacyBoundaryRerank(bytes, options)
    : mode === "phase4-v1"
      ? analyzeMidiPhase4(bytes, options)
    : mode === "phase4.1-v1"
      ? analyzeMidiPhase41(bytes, options)
      : analyzeMidiLegacy(bytes, options);
  return { ...analysis, sourceFingerprint: fingerprintMidiBytes(bytes) };
}
