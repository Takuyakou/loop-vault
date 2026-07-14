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
  number: number;
  tick: number;
  value: number;
}

export interface MidiSongData {
  notes: TimedNote[];
  tempo?: number;
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

export type MidiAnalyzerMode = "legacy" | "hybrid-v1";

export interface AnalyzeMidiOptions {
  sourceAssetId?: string;
  fileName?: string;
  beatsPerWindow?: 1 | 2 | 4;
  mode?: MidiAnalyzerMode;
  weights?: Partial<AnalyzerWeights>;
  debug?: boolean;
}

export type AnalyzeMidiResult = MidiProgressionAnalysis;
