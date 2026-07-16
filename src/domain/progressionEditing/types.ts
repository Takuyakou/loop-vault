import type { ChordSymbol } from "../types";

export interface ChordAlternative {
  chord: ChordSymbol;
  confidence: number;
}

export type ProgressionEditSource =
  | "manual-label"
  | "alternative"
  | "structure-editor"
  | "split"
  | "merge"
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
    "manual-label" | "alternative" | "structure-editor" | "reset"
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

export type ProgressionEditOperation =
  | ReplaceChordOperation
  | SplitChordOperation
  | MergeChordOperation
  | DeleteChordOperation;

export interface ProgressionEditSummaryItem {
  slotId: string;
  bar: number;
  beat: number;
  original: string;
  current: string;
  editSource?: ProgressionEditSource;
}

