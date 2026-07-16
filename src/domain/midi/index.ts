export {
  analyzeMidi,
  analyzerVersion,
  defaultAnalyzerMode,
  hybridAnalyzerVersion,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
  buildWeightedWindows,
  extractBlockCandidates,
  inferTrackRoles,
  matchWindow,
  smoothTimeline,
} from "./analysis";
export { analyzeMidiHybrid, buildHybridPipeline, defaultHybridFeatures, timelineFromHybridPipeline } from "./hybrid";
export type { HybridPipelineResult } from "./hybrid";
export { beatGridSignature, extractHybridBlocks } from "./blocks";
export { parseMidi } from "./parser";
export { normalizeNotes, overlapWithSegment } from "./normalize";
export { beatStrength, defaultAnalyzerWeights, noteFeatures } from "./weights";
export { extractTrackFeatures, inferTrackRoleProfiles } from "./trackRoles";
export { extractOrnamentFeatures } from "./ornaments";
export { buildSegmentLattice, generateBoundaries } from "./segmentation";
export { buildCumulativePitchFeatures, buildWeightedPitchProfile, profileFromCumulative } from "./profiles";
export { canonicalChord, chordTemplates, scoreChordCandidates, scoreSegments, scoreStructuredChordCandidate } from "./candidates";
export { analyzeMidiLegacyBoundaryRerank, chooseLegacyBoundaryCandidate, defaultLegacyBoundaryRerankerThresholds } from "./legacyBoundaryReranker";
export type { LegacyBoundaryRerankerThresholds, RerankDecision } from "./legacyBoundaryReranker";
export { chordKeyCompatibility, estimateKeyCandidates } from "./keyPrior";
export { decodeChordPath, decodeGreedy, decodeTwoPass, defaultDecoderWeights } from "./decoder";
export { confidenceForDecoded, confidenceLevel, uniqueAlternatives } from "./confidence";
export { materializeDecodedSegments, mergeDecodedSegments } from "./merge";
export { buildCorrectionEvents, fingerprintMidiBytes } from "./feedback";
export type {
  AnalyzeMidiOptions,
  AnalyzeMidiResult,
  MidiSongData,
  MidiTrackInfo,
  MidiControlChange,
  NormalizedTimedNote,
  NoteSegmentOverlap,
  SegmentRange,
  TimedNote,
  TrackRole,
  MidiAnalyzerMode,
  HybridFeatureFlags,
} from "./types";
export type { AnalyzerWeights, NoteFeatures } from "./weights";
export type { HybridTrackRole, TrackFeatures, TrackRoleProfile } from "./trackRoles";
export type { OrnamentFeatures } from "./ornaments";
export type { BoundaryCandidate, BoundaryReason, SegmentCandidate, SegmentationOptions } from "./segmentation";
export type { CumulativePitchFeatures, WeightedPitchProfile } from "./profiles";
export type { ChordCandidateScore, ChordEvidence, ChordTemplate, ScoredSegment } from "./candidates";
export type { KeyRegionCandidate } from "./keyPrior";
export type { DecodedSegment, DecoderWeights } from "./decoder";
export type { ConfidenceFeatures, ConfidenceLevel, ConfidenceResult } from "./confidence";
export type { MergedDecodedSegment } from "./merge";
export type { MidiChordCorrectionEvent } from "./feedback";
