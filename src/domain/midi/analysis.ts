import type { MidiProgressionAnalysis } from "../types";
import { analyzeMidiHybrid, hybridAnalyzerVersion } from "./hybrid";
import { fingerprintMidiBytes } from "./feedback";
import { analyzeMidiLegacyBoundaryRerank, legacyBoundaryRerankerVersion } from "./legacyBoundaryReranker";
import { analyzeMidi as analyzeMidiLegacy, analyzerVersion as legacyAnalyzerVersion } from "./legacy";
import type { AnalyzeMidiOptions } from "./types";
import { analyzeMidiVoiceAwareRerank, voiceAwareRerankerVersion } from "./voiceAwareReranker";

export const defaultAnalyzerMode = "legacy" as const;
export const analyzerVersion = legacyAnalyzerVersion;
export {
  hybridAnalyzerVersion,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
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
      : analyzeMidiLegacy(bytes, options);
  return { ...analysis, sourceFingerprint: fingerprintMidiBytes(bytes) };
}
