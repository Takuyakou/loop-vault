import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiHybrid, hybridAnalyzerVersion } from "./hybrid";
import { fingerprintMidiBytes } from "./feedback";
import { analyzeMidiLegacyBoundaryRerank, legacyBoundaryRerankerVersion } from "./legacyBoundaryReranker";
import { analyzeMidi as analyzeMidiLegacy, analyzerVersion as legacyAnalyzerVersion } from "./legacy";
import { analyzeMidiPhase4, phase4AnalyzerVersion } from "./phase4Analyzer";
import { analyzeMidiPhase41, phase41AnalyzerVersion } from "./phase41Analyzer";
import { analyzeMidiPhase412, phase412AnalyzerVersion } from "./phase412Analyzer";
import type { AnalyzeMidiOptions } from "./types";
import { analyzeMidiVoiceAwareRerank, voiceAwareRerankerVersion } from "./voiceAwareReranker";

/** Kept for rollback: the analyzer promoted in Phase 4.0. */
export const phase40DefaultAnalyzerMode = "phase4-v1" as const;

/**
 * Rolled back to `phase4-v1` in P4.1.1-00.
 *
 * `phase4.1-v1` met every coverage gate, but the gates measured which bars the
 * candidate list reached, not whether the cards were distinct. On
 * 15.Endless,endless. the top three cards were the same one-chord Em11/A
 * pattern at three different positions, so the list covered the song while
 * offering the user one usable progression. Coverage is not the same thing as
 * usefulness, and the frozen gates could not tell the two apart.
 *
 * The rollback is the default only. `phase4.1-v1` stays selectable so the
 * coverage work remains measurable against whatever replaces it.
 */
export const defaultAnalyzerMode = phase40DefaultAnalyzerMode;
export const analyzerVersion = phase4AnalyzerVersion;
export {
  hybridAnalyzerVersion,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
  phase4AnalyzerVersion,
  phase41AnalyzerVersion,
  phase412AnalyzerVersion,
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
    : mode === "phase4.1.2-v1"
      ? analyzeMidiPhase412(bytes, options)
      : analyzeMidiLegacy(bytes, options);
  return { ...analysis, sourceFingerprint: fingerprintMidiBytes(bytes) };
}
