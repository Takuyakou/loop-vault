import { parseChordLabel } from "../../chords";
import type { StoredProgressionComparisonItem } from "./storedProgressions";
import type {
  ChordLabelSnapshot,
  MidiDifferenceReviewCase,
  ReviewPriority,
  ReviewReason,
} from "./types";

export interface StoredProgressionMismatchRecord {
  caseId: string;
  sourceFingerprint: string;
  assetId?: string;
  range: { startBeat: number; endBeat: number; startBar?: number; endBar?: number };
  segments: StoredProgressionComparisonItem[];
}

export const defaultReviewPriorityWeights: Readonly<Record<ReviewReason, number>> = {
  "analyzer-disagreement": 40,
  "low-confidence": 20,
  "small-top1-top2-margin": 12,
  "slash-chord": 8,
  "tension-chord": 6,
  "rootless-candidate": 10,
  "frequent-correction-family": 10,
  "unseen-chord-quality": 8,
  "saved-label-mismatch": 25,
  "boundary-mismatch": 18,
};

export function normalizeChordLabel(label: string): string | undefined {
  const chord = parseChordLabel(label);
  if (!chord) return undefined;
  const bass = chord.bass === undefined ? "" : `/${chord.bass}`;
  return `${chord.root}:${chord.quality}:${[...chord.tensions].sort().join(",")}${bass}`;
}

export function chordLabelsEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeChordLabel(left);
  const normalizedRight = normalizeChordLabel(right);
  return normalizedLeft !== undefined && normalizedLeft === normalizedRight;
}

export function buildDifferenceReviewCases(
  mismatches: readonly StoredProgressionMismatchRecord[],
): MidiDifferenceReviewCase[] {
  return mismatches.flatMap((record) => record.segments.flatMap((segment, index) => {
    if (!segment.legacy || !segment.reranker) return [];
    const legacy = snapshot(
      segment.legacy,
      segment.legacyAlternatives,
      segment.legacyConfidence,
      segment.legacyWarnings,
    );
    const reranker = snapshot(
      segment.reranker,
      segment.rerankerAlternatives,
      segment.rerankerConfidence,
      segment.rerankerWarnings,
    );
    const saved = snapshot(segment.saved);
    if (!needsReview(saved, legacy, reranker)) return [];
    return [{
      id: `${record.caseId}-${index}-${segment.startBeat}-${segment.endBeat}`,
      sourceFingerprint: record.sourceFingerprint,
      range: { startBeat: segment.startBeat, endBeat: segment.endBeat },
      saved,
      legacy,
      reranker,
      priority: reviewPriority(saved, legacy, reranker),
    }];
  })).sort((left, right) => right.priority.score - left.priority.score || left.id.localeCompare(right.id));
}

export function reviewPriority(
  saved: ChordLabelSnapshot,
  legacy: ChordLabelSnapshot,
  reranker: ChordLabelSnapshot,
  weights = defaultReviewPriorityWeights,
): ReviewPriority {
  const reasons: ReviewReason[] = [];
  if (!chordLabelsEquivalent(legacy.primary, reranker.primary)
    || !labelSetsEquivalent(legacy.alternatives, reranker.alternatives)) {
    reasons.push("analyzer-disagreement");
  }
  if ((legacy.confidence ?? 1) < 0.55 || (reranker.confidence ?? 1) < 0.55) reasons.push("low-confidence");
  if (!chordLabelsEquivalent(saved.primary, legacy.primary)
    || !chordLabelsEquivalent(saved.primary, reranker.primary)) reasons.push("saved-label-mismatch");
  if ([saved.primary, legacy.primary, reranker.primary].some((label) => label.includes("/"))) reasons.push("slash-chord");
  if ([saved.primary, legacy.primary, reranker.primary].some((label) => /(?:9|11|13)/.test(label))) reasons.push("tension-chord");
  return { score: reasons.reduce((sum, reason) => sum + weights[reason], 0), reasons };
}

function needsReview(
  saved: ChordLabelSnapshot,
  legacy: ChordLabelSnapshot,
  reranker: ChordLabelSnapshot,
): boolean {
  return !chordLabelsEquivalent(legacy.primary, reranker.primary)
    || !labelSetsEquivalent(legacy.alternatives, reranker.alternatives)
    || !chordLabelsEquivalent(saved.primary, legacy.primary)
    || !chordLabelsEquivalent(saved.primary, reranker.primary)
    || (legacy.confidence ?? 1) < 0.55
    || (reranker.confidence ?? 1) < 0.55;
}

function labelSetsEquivalent(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (values: readonly string[]) => values.map(normalizeChordLabel).filter(Boolean).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function snapshot(
  primary: string,
  alternatives: readonly string[] = [],
  confidence?: number,
  warnings?: readonly string[],
): ChordLabelSnapshot {
  return {
    primary,
    alternatives: [...alternatives],
    ...(confidence !== undefined ? { confidence } : {}),
    ...(warnings && warnings.length > 0 ? { warnings: [...warnings] } : {}),
  };
}
