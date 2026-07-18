import type { ChordSymbol } from "../types";

export interface ChordAlternative {
  chord: ChordSymbol;
  confidence: number;
}

export type ProgressionEditSource =
  | "manual-label"
  | "alternative"
  | "structure-editor"
  | "propagation"
  | "split"
  | "merge"
  | "insert"
  | "delete"
  | "reset";

export interface EditableChordSlot {
  id: string;
  position: {
    bar: number;
    beat: number;
    durationBeats: number;
  };
  originalChord: ChordSymbol;
  currentChord: ChordSymbol;
  alternatives: ChordAlternative[];
  confidence?: number;
  warnings: string[];
  edited: boolean;
  editSource?: ProgressionEditSource;
}

export interface EditableProgression {
  candidateId: string;
  beatsPerBar: number;
  slots: EditableChordSlot[];
  selectedSlotId?: string;
  history: ProgressionEditOperation[];
  historyIndex: number;
}

export interface ProgressionEditSnapshot {
  slots: EditableChordSlot[];
  selectedSlotId?: string;
}

interface BaseProgressionEditOperation {
  before: ProgressionEditSnapshot;
  after: ProgressionEditSnapshot;
}

export interface ReplaceChordOperation extends BaseProgressionEditOperation {
  type: "replace";
  slotIds: string[];
  editSource: Extract<
    ProgressionEditSource,
    "manual-label" | "alternative" | "structure-editor" | "propagation" | "reset"
  >;
}

export interface SplitChordOperation extends BaseProgressionEditOperation {
  type: "split";
  slotId: string;
}

export interface MergeChordOperation extends BaseProgressionEditOperation {
  type: "merge";
  slotIds: [string, string];
  keptSlotId: string;
}

export interface DeleteChordOperation extends BaseProgressionEditOperation {
  type: "delete";
  slotId: string;
}

export interface InsertChordOperation extends BaseProgressionEditOperation {
  type: "insert";
  slotId: string;
  afterSlotId: string;
}

export interface ResetProgressionOperation extends BaseProgressionEditOperation {
  type: "reset";
}

export type ProgressionEditOperation =
  | ReplaceChordOperation
  | SplitChordOperation
  | MergeChordOperation
  | DeleteChordOperation
  | InsertChordOperation
  | ResetProgressionOperation;

export interface ProgressionEditSummaryItem {
  slotId: string;
  bar: number;
  beat: number;
  original: string;
  current: string;
  editSource?: ProgressionEditSource;
}


export type SimilarSegmentReasonCode =
  | "weighted-pcp-match"
  | "bass-profile-match"
  | "original-root-match"
  | "chord-family-match"
  | "duration-match"
  | "metric-position-match"
  | "key-context-match"
  | "previous-chord-match"
  | "next-chord-match"
  | "enabled-voices-match"
  | "role-profiles-match"
  | "chord-symbol-fallback";

export interface SimilarSegmentCandidate {
  segmentId: string;
  similarity: number;
  reasons: SimilarSegmentReasonCode[];
}

export interface SimilarityRoleProfile {
  role: string;
  confidence?: number;
  rootWeight?: number;
  qualityWeight?: number;
}

export interface SimilaritySegmentContext {
  weightedPcp?: readonly number[];
  bassProfile?: readonly number[];
  originalRoot?: number;
  family?: string;
  durationBeats?: number;
  metricPosition?: number;
  key?: string;
  previousChord?: ChordSymbol;
  nextChord?: ChordSymbol;
  enabledVoiceIds?: readonly string[];
  roleProfiles?: Readonly<Record<string, SimilarityRoleProfile>>;
}

/**
 * Analysis features keyed by EditableChordSlot.id. Missing features are
 * deterministically derived from the slot's ChordSymbol and timeline context.
 */
export interface SimilarityContext {
  segments?: Readonly<Record<string, SimilaritySegmentContext>>;
}

export interface SimilarityVoiceContext {
  enabledVoiceIds: readonly string[];
  roleProfiles: Readonly<Record<string, SimilarityRoleProfile>>;
}

export interface SimilarityContextBuildOptions {
  key?: string;
  voiceContext?: SimilarityVoiceContext;
}
