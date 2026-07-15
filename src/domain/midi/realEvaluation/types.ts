import type { ExpectedChordSegment } from "../evaluation/types";

export type EvaluationLabelStrength = "gold" | "silver" | "bronze";

export type EvaluationLabelOrigin =
  | "stored-progression"
  | "manual-correction"
  | "difference-review"
  | "implicit-save"
  | "manual-import";

export type AlternativeStrength = "strong" | "weak";

export interface ExpectedAlternative {
  chord: string;
  strength: AlternativeStrength;
  reason:
    | "tension-reduction"
    | "omitted-fifth"
    | "enharmonic"
    | "equivalent-pitch-set"
    | "manual";
}

export interface ExpectedAlternativeSet {
  startBeat: number;
  endBeat: number;
  alternatives: ExpectedAlternative[];
}

export interface RealMidiEvaluationCase {
  schemaVersion: 1;
  id: string;
  source: {
    fingerprint: string;
    assetId?: string;
    fileName?: string;
  };
  range: {
    startBeat: number;
    endBeat: number;
    startBar?: number;
    endBar?: number;
  };
  expected: {
    primary: ExpectedChordSegment[];
    alternatives?: ExpectedAlternativeSet[];
  };
  label: {
    strength: EvaluationLabelStrength;
    origin: EvaluationLabelOrigin;
    reviewedAt?: string;
    reviewer?: "local-user";
  };
  context?: {
    key?: string;
    previousChord?: string;
    nextChord?: string;
    category?: string[];
  };
  analyzerContext?: {
    sourceAnalyzerVersion?: string;
    sourceWeightsVersion?: string;
  };
}

export type MidiDifferenceJudgment =
  | "legacy"
  | "reranker"
  | "both-acceptable"
  | "neither"
  | "skip";

export interface ChordLabelSnapshot {
  primary: string;
  alternatives: string[];
  confidence?: number;
  warnings?: string[];
}

export interface MidiDifferenceReview {
  schemaVersion: 1;
  id: string;
  sourceFingerprint: string;
  range: { startBeat: number; endBeat: number };
  legacy: ChordLabelSnapshot;
  reranker: ChordLabelSnapshot;
  alternatives: ChordLabelSnapshot[];
  judgment: MidiDifferenceJudgment;
  correctedChord?: string;
  reviewedAt: string;
}

export interface LocalMidiSourceIndexEntry {
  fingerprint: string;
  assetId?: string;
  lastKnownPath?: string;
  fileName?: string;
  size?: number;
  modifiedAt?: string;
}
