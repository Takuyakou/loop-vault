import type { ChordTimelineItem, SavedProgressionBlock } from "../types";

export type PracticeLevel = 1 | 2 | 3 | 4 | 5;
export type DojoPracticeLevel = 1 | 2 | 3;
export type PracticeMode = "step" | "flow";
export type PracticeLeniency = "easy" | "normal" | "strict";
export type PracticeMatchState = "empty" | "partial" | "match" | "wrong";

export interface PracticeChordRequirements {
  requiredPitchClasses: number[];
  optionalPitchClasses: number[];
  allowedPitchClasses: number[];
  requiredBassPitchClass?: number;
  chordKey: string;
}

export interface PracticeInputSnapshot {
  heldMidiNotes: number[];
  sustainedMidiNotes: number[];
  attackRevision: number;
  timestampMs: number;
}

export interface PracticeMatchResult {
  state: PracticeMatchState;
  heldPitchClasses: number[];
  missingPitchClasses: number[];
  foreignPitchClasses: number[];
  bassMatches: boolean;
  attackSatisfied: boolean;
}

export interface PracticeProvisionalClear {
  level: PracticeLevel;
  clearedAt: string;
  clearedOnLocalDate: string;
  targetTempo: number;
}

export interface ProgressionPracticeProgress {
  schemaVersion: 1;
  progressionFingerprint: string;
  confirmedLevel?: PracticeLevel;
  provisional?: PracticeProvisionalClear;
  lastPracticedAt?: string;
}

export interface PracticeSessionState {
  blockId: string;
  progressionFingerprint: string;
  level: DojoPracticeLevel;
  mode: PracticeMode;
  leniency: PracticeLeniency;
  status: "idle" | "ready" | "running" | "paused" | "completed";
  currentEventIndex: number;
  roundNumber: number;
  roundDirty: boolean;
  consecutiveCleanFlowRounds: number;
  bpm: number;
  targetTempo: number;
  requiredAttackRevision: number;
  provisionalCandidate?: {
    state: "match" | "wrong";
    sinceMs: number;
    pitchSignature: string;
    attackRevision: number;
  };
  eventResults: Array<"pending" | "match" | "miss">;
  lastRoundWasClean?: boolean;
  lastInput?: PracticeInputSnapshot;
  lastMatch?: PracticeMatchResult;
}

export type PracticeAction =
  | { type: "START_SESSION" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "MIDI_STATE_CHANGED"; input: PracticeInputSnapshot }
  | { type: "STABLE_DEADLINE"; nowMs: number }
  | { type: "FLOW_TARGET_OPEN"; eventIndex: number }
  | { type: "FLOW_TARGET_CLOSE"; eventIndex: number }
  | { type: "ROUND_COMPLETED" }
  | { type: "DEVICE_DISCONNECTED" }
  | { type: "END_SESSION" };

export interface PracticeSessionContext {
  events: readonly ChordTimelineItem[];
  requirements: readonly PracticeChordRequirements[];
}

export interface PracticeRecommendation {
  ideaId: string;
  ideaTitle: string;
  block: SavedProgressionBlock;
  stale: boolean;
  confirmationDue: boolean;
  unstarted: boolean;
  favorite: boolean;
}

