import type { MidiProgressionAnalysis } from "../types";
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

export type MidiAnalyzerMode = "legacy" | "hybrid-v1" | "legacy-boundary-rerank";

export interface HybridFeatureFlags {
  trackRoleEstimation: boolean;
  ornamentSuppression: boolean;
  adaptiveSegmentation: boolean;
  keyPrior: boolean;
  twoPassDecoding: boolean;
  adjacentMerge: boolean;
}

export interface AnalyzeMidiOptions {
  sourceAssetId?: string;
  fileName?: string;
  beatsPerWindow?: 1 | 2 | 4;
  mode?: MidiAnalyzerMode;
  weights?: Partial<AnalyzerWeights>;
  debug?: boolean;
  features?: Partial<HybridFeatureFlags>;
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
  roleEvidence: VoiceRoleEvidence;
}
