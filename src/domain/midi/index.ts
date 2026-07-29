export {
  analyzeMidi,
  analyzerVersion,
  defaultAnalyzerMode,
  hybridAnalyzerVersion,
  legacyAnalyzerVersion,
  legacyBoundaryRerankerVersion,
  voiceAwareRerankerVersion,
  buildWeightedWindows,
  extractBlockCandidates,
  inferTrackRoles,
  matchWindow,
  smoothTimeline,
} from "./analysis";
export { analyzeMidiHybrid, buildHybridPipeline, defaultHybridFeatures, timelineFromHybridPipeline } from "./hybrid";
export type { HybridPipelineResult } from "./hybrid";
export { beatGridSignature, extractHybridBlocks } from "./blocks";
export {
  buildCandidateEvents,
  candidateEventsAsTimeline,
  candidateStats,
  countStructuredRepeats,
  relativeSignature,
  structuredSignature,
  summaryFromEvents,
} from "./candidateBlock";
export type {
  CandidateChordEvent, CandidateChordStats, CandidateDensityClass,
} from "./candidateBlock";
export {
  candidateIntervalIou,
  candidateLimitForBars,
  candidateOverlapIouThreshold,
  candidateRegionCountForBars,
  candidateRegionIndex,
  selectProgressionCandidates,
} from "./candidateSelection";
export type { CandidateSelectionEntry } from "./candidateSelection";
export { parseMidi } from "./parser";
export { parseRawSmf } from "./rawSmf";
export { normalizeNotes, overlapWithSegment } from "./normalize";
export { beatsPerBar, tickToSeconds } from "./timing";
export { buildVoices, isPercussionEvidence, selectChordEvidenceNotes, voiceId } from "./voices";
export { gmProgramRole, isGmPercussionProgram } from "./gmRoles";
export {
  annotateVoiceRoles,
  buildVoiceFeatureInputs,
  defaultVoiceRoleInferenceThresholds,
  extractVoiceFeatures,
  inferVoiceRole,
  resolveVoiceRole,
  voiceRoleEvidence,
} from "./voiceRoles";
export {
  buildVoiceAwarePitchProfile,
  buildVoiceRoleProfiles,
  contributionWeightsForRole,
} from "./voiceProfiles";
export { beatStrength, defaultAnalyzerWeights, noteFeatures } from "./weights";
export { extractTrackFeatures, inferTrackRoleProfiles } from "./trackRoles";
export { extractOrnamentFeatures } from "./ornaments";
export { buildSegmentLattice, generateBoundaries } from "./segmentation";
export { buildCumulativePitchFeatures, buildWeightedPitchProfile, profileFromCumulative } from "./profiles";
export { canonicalChord, chordTemplates, scoreChordCandidates, scoreSegments, scoreStructuredChordCandidate } from "./candidates";
export { chordPitchSet, selectDiverseAlternatives } from "./candidateDiversity";
export type { CandidateDiversityOptions } from "./candidateDiversity";
export {
  operationCorrectionCost,
  operationCorrectionCostFromEditMethod,
  operationCorrectionCostResult,
  structureEditorCanReach,
  summarizeOperationCorrectionCosts,
} from "./correctionCost";
export type {
  CorrectionFeedbackEditMethod,
  DetectedChordCandidates,
  OperationCorrectionCategory,
  OperationCorrectionCost,
  OperationCorrectionCostResult,
  OperationCorrectionCostSummary,
} from "./correctionCost";
export {
  analyzeMidiLegacyBoundaryRerank,
  chooseLegacyBoundaryCandidate,
  defaultLegacyBoundaryRerankerThresholds,
  materializeRerankedTimelineItem,
} from "./legacyBoundaryReranker";
export type { LegacyBoundaryRerankerThresholds, RerankDecision } from "./legacyBoundaryReranker";
export {
  analyzeMidiVoiceAwareRerank,
  scoreVoiceAwareChordCandidates,
  scoreVoiceAwareStructuredChordCandidate,
} from "./voiceAwareReranker";
export type { VoiceAwareRerankerOptions } from "./voiceAwareReranker";
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
  MidiTempoChange,
  NormalizedTimedNote,
  NoteSegmentOverlap,
  SegmentRange,
  TimedNote,
  ParsedTimedNote,
  TrackRole,
  Voice,
  VoiceRole,
  VoiceRoleEvidence,
  VoiceFeatureInput,
  VoiceRoleInference,
  VoiceContributionWeights,
  VoiceEvidenceProfiles,
  AnalysisInput,
  VoiceSelectionPreset,
  MidiAnalyzerMode,
  HybridFeatureFlags,
} from "./types";
export type { GmRoleEvidence } from "./gmRoles";
export type { VoiceRoleProfile } from "./voiceProfiles";
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
export {
  addMidiSources,
  applyAnalysisSessionPreset,
  createAnalysisSession,
  createMidiSourceId,
  buildPreparedMidiSongData,
  buildSessionAnalysisRequest,
  gmProgramName,
  preAnalysisRoleFromProductRole,
  preAnalysisVoiceId,
  preScanMidiSource,
  removeMidiSource,
  resetAnalysisSessionAuto,
  selectedSessionNotes,
  updateAnalysisSessionSource,
  updateAnalysisSessionVoice,
} from "./preAnalysis";
export type {
  AnalysisSession,
  AnalysisSessionIntakeResult,
  AnalysisSessionSource,
  AnalysisSessionVoice,
  AnalysisSessionWarning,
  AnalysisSessionWarningCode,
  MidiIntakeIssue,
  MidiIntakeIssueCode,
  MidiSourceInput,
  PreAnalysisMidiSource,
  PreAnalysisControlChange,
  PreAnalysisNote,
  PreAnalysisSelectionPreset,
  PreAnalysisSourceScan,
  PreAnalysisTempoPoint,
  PreAnalysisTimeSignaturePoint,
  PreAnalysisVoice,
  PreAnalysisVoiceRole,
  PreScanMidiSourceOptions,
  SessionAnalysisRequest,
} from "./preAnalysis";
export {
  buildOccurrences,
  groupIntoPatterns,
  groupedReachableOccurrences,
  occurrenceToCandidate,
  siblingOccurrences,
} from "./occurrence";
export type { CandidateOccurrence, CandidatePattern } from "./occurrence";
export { evaluateSegmentation, segmentSections } from "./sections";
export type { Section, SectionBoundaryReason, SegmentationQuality } from "./sections";
export {
  LEGATO_GAP_BEATS,
  detectExtractionProfile,
  extractionRoleThresholds,
  prepareMidiForAnalysis,
  repairLegato,
} from "./extractionProfile";
export type { ExtractionProfile, ParsedMidi } from "./extractionProfile";
