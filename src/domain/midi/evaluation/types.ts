import type { ChordQuality, MidiProgressionAnalysis } from "../../types";

export type MidiEvaluationCategory =
  | "chord-only" | "melody-mixed" | "bass-separated" | "no-bass" | "arpeggio"
  | "pad" | "slash-chord" | "tension" | "rootless" | "ornament-heavy"
  | "pedal-point" | "two-chords-per-bar" | "modulation" | "full-song"
  | "chord-drip" | "fl-studio";

export interface ExpectedChordSegment {
  startBeat: number;
  endBeat: number;
  primary: string;
  root: number;
  quality: ChordQuality;
  bass?: number;
  acceptableAlternatives?: string[];
}

export interface MidiEvaluationCase {
  id: string;
  title: string;
  midiPath: string;
  recipeFamily: string;
  split: "tune" | "holdout";
  category: MidiEvaluationCategory[];
  difficulty: "easy" | "medium" | "hard";
  expected: { chordTimeline: ExpectedChordSegment[] };
}

export interface EvaluationCaseInput {
  definition: MidiEvaluationCase;
  bytes: Uint8Array;
}

export interface EvaluationMetrics {
  caseCount: number;
  durationBeats: number;
  rootAccuracy: number;
  rootTop3Accuracy: number;
  qualityAccuracy: number;
  qualityTop3Accuracy: number;
  tetradAccuracy: number;
  exactAccuracy: number;
  exactTop3Accuracy: number;
  /** @deprecated Use exactTop3Accuracy. Kept for report compatibility. */
  top3Accuracy: number;
  boundaryPrecision: number;
  boundaryRecall: number;
  overSegmentationRate: number;
  underSegmentationRate: number;
  correctionCost: number;
}

export interface EvaluationCaseResult extends EvaluationMetrics {
  id: string;
  split: "tune" | "holdout";
  category: MidiEvaluationCategory[];
}

export interface EvaluationReport {
  schemaVersion: 1;
  analyzerMode: string;
  analyzerVersion: string;
  datasetId: string;
  metrics: EvaluationMetrics;
  byCategory: Record<string, EvaluationMetrics>;
  cases: EvaluationCaseResult[];
}

export type AnalyzerForEvaluation = (bytes: Uint8Array) => MidiProgressionAnalysis;
