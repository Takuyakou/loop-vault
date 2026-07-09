import type { MidiProgressionAnalysis } from "../types";

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
  roleHint?: TrackRole;
}

export interface MidiSongData {
  notes: TimedNote[];
  tempo?: number;
  timeSignature?: string;
  ticksPerBeat: number;
  totalBars: number;
  tracks: MidiTrackInfo[];
}

export interface AnalyzeMidiOptions {
  sourceAssetId?: string;
  fileName?: string;
  beatsPerWindow?: 1 | 2 | 4;
}

export type AnalyzeMidiResult = MidiProgressionAnalysis;
