import type { ChordSymbol, SavedProgressionBlock } from "../types";

export const PROGRESSION_MIDI_PPQ = 480;
export const PROGRESSION_MIDI_EXPORTER_VERSION = "p5.14-v1";
export const DEFAULT_MIDI_EXPORT_BPM = 96;
export const DEFAULT_MIDI_EXPORT_TIME_SIGNATURE = {
  numerator: 4,
  denominator: 4,
} as const;
export const DEFAULT_MIDI_EXPORT_VELOCITY = 96;

export type MidiExportVoicingSource = "saved" | "edited" | "generated";
export type MidiExportVoicingSummary = MidiExportVoicingSource | "mixed";

export interface MidiExportTimeSignature {
  numerator: number;
  denominator: number;
}

export interface MidiExportVoicing {
  midiNotes: readonly number[];
  source: MidiExportVoicingSource;
  velocity?: number;
}

export interface MidiExportChordEvent {
  chord: ChordSymbol | null;
  startBeats: number;
  durationBeats: number;
  voicing?: MidiExportVoicing;
}

export interface ProgressionMidiExportInput {
  events: readonly MidiExportChordEvent[];
  bpm: number;
  timeSignature: MidiExportTimeSignature;
  title?: string;
  warnings?: readonly MidiExportWarning[];
}

export interface NormalizedMidiEvent {
  index: number;
  chord: ChordSymbol | null;
  startTick: number;
  endTick: number;
  durationTicks: number;
  midiNotes: readonly number[];
  velocity: number;
  voicingSource?: MidiExportVoicingSource;
}

export interface ProgressionMidiModel {
  ppq: number;
  bpm: number;
  timeSignature: MidiExportTimeSignature;
  durationTicks: number;
  events: readonly NormalizedMidiEvent[];
  voicingSummary: MidiExportVoicingSummary;
  warnings: readonly MidiExportWarning[];
}

export interface ProgressionMidiExportResult extends ProgressionMidiModel {
  bytes: Uint8Array;
}

export type MidiExportWarningCode =
  | "bpm-fallback"
  | "time-signature-fallback";

export interface MidiExportWarning {
  code: MidiExportWarningCode;
  message: string;
}

export type MidiExportErrorCode =
  | "empty-progression"
  | "invalid-bpm"
  | "invalid-time-signature"
  | "invalid-position"
  | "invalid-duration"
  | "invalid-pitch"
  | "invalid-velocity"
  | "missing-voicing"
  | "slash-bass-mismatch";

export class ProgressionMidiExportError extends Error {
  readonly code: MidiExportErrorCode;
  readonly eventIndex?: number;

  constructor(code: MidiExportErrorCode, message: string, eventIndex?: number) {
    super(message);
    this.name = "ProgressionMidiExportError";
    this.code = code;
    this.eventIndex = eventIndex;
  }
}

export interface SavedProgressionMidiAdapterOptions {
  ideaBpm?: number;
}

export type SavedProgressionMidiSource = Pick<
  SavedProgressionBlock,
  "bpm" | "chords" | "timeSignature"
>;

