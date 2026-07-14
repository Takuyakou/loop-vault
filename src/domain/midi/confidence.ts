import type { ChordCandidateScore } from "./candidates";
import type { DecodedSegment } from "./decoder";

export type ConfidenceLevel = "high" | "medium" | "review";

export interface ConfidenceFeatures {
  top1Score: number;
  top2Score: number;
  margin: number;
  entropy: number;
  coreCoverage: number;
  foreignNoteRatio: number;
  bassAgreement: number;
  keyAgreement: number;
  temporalConsistency: number;
  boundaryStrength: number;
}

export interface ConfidenceResult {
  features: ConfidenceFeatures;
  level: ConfidenceLevel;
  value: number;
}

export function confidenceForDecoded(path: readonly DecodedSegment[], index: number): ConfidenceResult {
  const decoded = path[index];
  const candidates = decoded.scored.candidates;
  const top1 = decoded.candidate;
  const top2 = candidates.find((candidate) => candidate !== top1) ?? top1;
  const probabilities = softmax(candidates.map((candidate) => candidate.totalScore));
  const entropy = probabilities.length <= 1 ? 0 : -probabilities.reduce((sum, value) => sum + (value > 0 ? value * Math.log(value) : 0), 0) / Math.log(probabilities.length);
  const previous = path[index - 1]?.candidate.chord;
  const next = path[index + 1]?.candidate.chord;
  const neighbors = [previous, next].filter(Boolean);
  const temporalConsistency = neighbors.length === 0 ? 0.7 : neighbors.filter((chord) =>
    chord?.root === top1.chord.root && chord.quality === top1.chord.quality).length / neighbors.length;
  const features: ConfidenceFeatures = {
    top1Score: top1.totalScore,
    top2Score: top2.totalScore,
    margin: top1.totalScore - top2.totalScore,
    entropy,
    coreCoverage: top1.coreCoverageScore,
    foreignNoteRatio: top1.foreignNotePenalty,
    bassAgreement: Math.max(0, top1.bassCompatibilityScore),
    keyAgreement: top1.keyCompatibilityScore,
    temporalConsistency,
    boundaryStrength: (decoded.scored.segment.startBoundaryStrength + decoded.scored.segment.endBoundaryStrength) / 2,
  };
  const level = confidenceLevel(features);
  const value = level === "high" ? 0.86 : level === "medium" ? 0.68 : 0.46;
  return { features, level, value };
}

export function confidenceLevel(features: ConfidenceFeatures): ConfidenceLevel {
  if (features.margin >= 0.2 && features.coreCoverage >= 0.62 && features.foreignNoteRatio <= 0.18
    && features.entropy <= 0.88) return "high";
  if (features.margin >= 0.08 && features.coreCoverage >= 0.45 && features.foreignNoteRatio <= 0.32) return "medium";
  return "review";
}

function softmax(values: number[]): number[] {
  if (!values.length) return [];
  const max = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - max));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

export function uniqueAlternatives(candidates: readonly ChordCandidateScore[], primary: ChordCandidateScore, limit = 2): ChordCandidateScore[] {
  return candidates.filter((candidate) => candidate.chord.label !== primary.chord.label).slice(0, limit);
}
