import type { MidiProgressionAnalysis } from "../types";
import type { MidiTempoDiagnostics } from "./tempoAnalysis";
import type { AnalyzerWeights } from "./weights";

export type TrackRole = "bass" | "harmony" | "mixed" | "melody" | "percussion";

export interface TimedNote {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity: number;
  trackIndex: number;
  channel?: number;
  program?: number;
  programExplicit?: boolean;
}

export interface ParsedTimedNote extends TimedNote {
  channel: number;
  program: number;
  programExplicit: boolean;
}

export interface MidiTrackInfo {
  index: number;
  name: string;
  channel?: number;
  program?: number;
  roleHint?: TrackRole;
  roleOverride?: TrackRole;
}

export interface MidiControlChange {
  trackIndex: number;
  channel?: number;
  number: number;
  tick: number;
  value: number;
}

export interface MidiTempoChange {
  tick: number;
  bpm: number;
}

export interface MidiSongData {
  notes: TimedNote[];
  tempo?: number;
  tempoChanges?: MidiTempoChange[];
  /** Runtime-only representative-tempo evidence; never persisted in Vault data. */
  tempoDiagnostics?: MidiTempoDiagnostics;
  timeSignature?: string;
  ticksPerBeat: number;
  totalBars: number;
  tracks: MidiTrackInfo[];
  controlChanges: MidiControlChange[];
}

export interface NormalizedTimedNote extends TimedNote {
  sourceTrackIndex: number;
  program?: number;
  trackName?: string;
  isDrum: boolean;
  startBeat: number;
  endBeat: number;
  sustainedEndBeat: number;
}

export interface SegmentRange { startBeat: number; endBeat: number }

export interface NoteSegmentOverlap {
  note: NormalizedTimedNote;
  overlapBeats: number;
  overlapRatio: number;
}

export type MidiAnalyzerMode =
  | "legacy"
  | "hybrid-v1"
  | "legacy-boundary-rerank"
  | "voice-aware-rerank-v1"
  | "phase4-v1"
  | "phase4.1-v1"
  | "phase4.1.2-v1"
  | "phase4.1.2-core-v1"
  | "phase4.1.2-g2-v1"
  | "phase4.1.2-core-g2-v1";

export interface HybridFeatureFlags {
  trackRoleEstimation: boolean;
  ornamentSuppression: boolean;
  adaptiveSegmentation: boolean;
  keyPrior: boolean;
  twoPassDecoding: boolean;
  adjacentMerge: boolean;
}

export interface AccuracyFirstFeatureFlags {
  bassCompanionCandidates: boolean;
  melodyContaminationFilter: boolean;
  enableObservedFlatNineDominantCandidate: boolean;
  enableAccuracyCandidateUnion: boolean;
}

export interface AnalyzeMidiOptions {
  sourceAssetId?: string;
  fileName?: string;
  beatsPerWindow?: 1 | 2 | 4;
  mode?: MidiAnalyzerMode;
  weights?: Partial<AnalyzerWeights>;
  debug?: boolean;
  features?: Partial<HybridFeatureFlags>;
  accuracyFirst?: Partial<AccuracyFirstFeatureFlags>;
  analysisInput?: AnalysisInput;
  /** Runtime-only pre-analysis input. Never serialized into Vault data. */
  preparedData?: MidiSongData;
  /** Privacy-safe fingerprint for a prepared multi-source input. */
  analysisFingerprint?: string;
  /**
   * Runtime-only P5.24 integration. Only the literal boolean true enables
   * Harmonic State consolidation; omission and every other value keep the
   * exact legacy analyzer input.
   */
  enableHarmonicStateConsolidation?: boolean;
  /**
   * Runtime-only P5.26 integration. Only the literal boolean true enables
   * Local Harmonic Rhythm plus Structural Bass derived projection; omission
   * and false preserve the exact pre-P5.26 analyzer path.
   */
  enableLocalHarmonicStateConsolidation?: boolean;
  /**
   * Runtime-only P5.26 surface adapter. Only the literal boolean true enables
   * key-aware chord-label spelling; omission and false preserve exact output.
   */
  enableKeyAwareChordSpelling?: boolean;
  /**
   * P5.37 union-chimera partition (frozen policy v1). Default ON (approved in
   * P5.37-05); only the literal boolean `false` disables it (exact-legacy
   * rollback). When enabled, a fixed 2-beat window whose top-1 candidate is
   * supported by neither beat (two materially different coherent local harmonies
   * merged) is partitioned into its two beats' coherent candidates before smoothing.
   */
  enableUnionChimeraPartition?: boolean;

}

export type AnalyzeMidiResult = MidiProgressionAnalysis;

export type VoiceRole = "bass" | "harmony" | "pad" | "melody" | "percussion" | "mixed";

export interface VoiceRoleEvidence {
  channelRule?: {
    role: VoiceRole;
    confidence: number;
  };
  program?: {
    role: VoiceRole;
    confidence: number;
    explicit: boolean;
  };
  trackName?: {
    role: VoiceRole;
    confidence: number;
  };
  measured: Record<VoiceRole, number>;
}

export interface Voice {
  id: string;
  trackIndex: number;
  channel: number;
  trackName?: string;
  explicitPrograms: {
    program: number;
    noteCount: number;
    durationTicks: number;
  }[];
  dominantProgram?: number;
  dominantProgramExplicit: boolean;
  noteCount: number;
  pitchRange: [number, number];
  medianPitch: number;
  avgDurationTick: number;
  noteDensity: number;
  maxPolyphony: number;
  simultaneousOnsetRatio: number;
  lowestVoiceShare: number;
  highestVoiceShare: number;
  inferredRole: VoiceRole;
  roleConfidence: number;
  /** Runtime-only Role v2 review metadata. It is never added to Vault data. */
  roleConfidenceBucket?: "high" | "medium" | "low";
  /** Privacy-safe evidence categories, without a raw track name or MIDI data. */
  roleEvidenceKinds?: readonly string[];
  roleInferenceVersion?: "p521-role-v2-v1";
  roleEvidence: VoiceRoleEvidence;
}

export interface VoiceFeatureInput {
  voice: Voice;
  avgDurationBeats: number;
  stepwiseMotionRatio: number;
  repeatedPitchClassRatio: number;
  sustainRatio: number;
}

export interface VoiceRoleInference {
  role: VoiceRole;
  confidence: number;
  scores: Record<VoiceRole, number>;
  reasons: string[];
}

export interface VoiceContributionWeights {
  root: number;
  bass: number;
  quality: number;
  tension: number;
}

export interface VoiceEvidenceProfiles {
  rootEvidence: number[];
  bassEvidence: number[];
  qualityEvidence: number[];
  tensionEvidence: number[];
}

/**
 * An explicit, per-analysis contribution profile for the role-aware reranker.
 * Omitting it preserves the shipped role contribution behavior.
 */
export type VoiceContributionPreset = "standard" | "harmonic-core";

export interface AnalysisInput {
  voices: Voice[];
  enabledVoiceIds: string[];
  roleOverrides: Record<string, VoiceRole>;
  voiceContributionPreset?: VoiceContributionPreset;
}

export type VoiceSelectionPreset = "auto" | "harmony-and-bass" | "exclude-melody" | "all";
