import type { ChordSymbol } from "../types";

export interface HeldNoteState {
  count: number;
  velocity: number;
  sinceMs: number;
  lastEventMs: number;
}

export interface LiveNoteState {
  held: Map<string, HeldNoteState>;
  sustained: Set<string>;
  pedalByChannel: Map<number, boolean>;
}

export interface LiveMidiDomainEvent {
  timestampMs: number;
  status: number;
  channel: number;
  data1: number;
  data2: number;
}

export interface LiveChordAlternative {
  chord: ChordSymbol;
  score: number;
}

export type LiveChordDetectionKind = "empty" | "notes" | "chord";

export interface LiveChordDetection {
  kind: LiveChordDetectionKind;
  chord?: ChordSymbol;
  alternatives: LiveChordAlternative[];
  label: string;
  notes: number[];
  noteNames: string[];
  bass?: number;
  topScore?: number;
  scoreMargin?: number;
}

export interface LiveChordStabilizerState {
  confirmed: LiveChordDetection;
  provisional?: LiveChordDetection;
  pending?: LiveChordDetection;
  pendingSinceMs?: number;
  nextDeadlineMs?: number;
}

export interface LiveChordHistoryEntry {
  id: string;
  chord: ChordSymbol;
  label: string;
  bass?: string;
  notes: number[];
  startedAtMs: number;
  committedAtMs: number;
}

export interface LiveChordHistoryState {
  entries: LiveChordHistoryEntry[];
  candidateKey?: string;
  candidateSinceMs?: number;
  committedCandidateKey?: string;
}
