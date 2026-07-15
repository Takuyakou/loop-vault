import { parseChordLabel } from "../../chords";
import type { ChordTimelineItem } from "../../types";
import { chordLabelsEquivalent } from "./differenceReview";
import type { ExpectedChordSegment } from "../evaluation/types";
import type { RealMidiEvaluationCase } from "./types";

export interface AnalyzedRealMidiCase {
  definition: RealMidiEvaluationCase;
  legacy: readonly ChordTimelineItem[];
  reranker: readonly ChordTimelineItem[];
}

export interface GoldMetrics {
  caseCount: number;
  durationBeats: number;
  rootAccuracy: number;
  qualityAccuracy: number;
  tetradAccuracy: number;
  exactAccuracy: number;
  strongAlternativeAccuracy: number;
  weakAlternativeAccuracy: number;
  top3Accuracy: number;
  boundaryPrecision: number;
  boundaryRecall: number;
  correctionCost: number;
}

export interface SilverMetrics {
  caseCount: number;
  durationBeats: number;
  legacySavedAgreement: number;
  rerankerSavedAgreement: number;
  legacyTop3Agreement: number;
  rerankerTop3Agreement: number;
  regressionCount: number;
  improvementCount: number;
  legacyCorrectionDistance: number;
  rerankerCorrectionDistance: number;
}

export interface BronzeMetrics {
  caseCount: number;
  segmentCount: number;
  analyzerAgreement: number;
  averageConfidence: number;
  confidenceDistribution: { high: number; medium: number; review: number };
  reviewCandidateCount: number;
  chordDistribution: Record<string, number>;
}

export function evaluateGoldCases(
  cases: readonly AnalyzedRealMidiCase[],
  analyzer: "legacy" | "reranker",
): GoldMetrics {
  let duration = 0;
  let root = 0;
  let quality = 0;
  let tetrad = 0;
  let exact = 0;
  let strong = 0;
  let weak = 0;
  let top3 = 0;
  let corrections = 0;
  let expectedBoundaries = 0;
  let predictedBoundaries = 0;
  let matchedBoundaries = 0;
  for (const item of cases) {
    const timeline = item[analyzer];
    for (const expected of item.definition.expected.primary) {
      const weight = expected.endBeat - expected.startBeat;
      const prediction = bestPrediction(expected, timeline);
      duration += weight;
      if (!prediction) { corrections += 1; continue; }
      const predictedChord = parseChordLabel(prediction.chord.label);
      if (predictedChord?.root === expected.root) root += weight;
      if (predictedChord?.quality === expected.quality) quality += weight;
      if (predictedChord && tetradFamily(predictedChord.quality) === tetradFamily(expected.quality)) tetrad += weight;
      const sets = acceptedLabels(item.definition, expected);
      const label = prediction.chord.label;
      if (chordLabelsEquivalent(label, expected.primary)) exact += weight;
      if (matchesAny(label, [expected.primary, ...sets.strong])) strong += weight;
      if (matchesAny(label, [expected.primary, ...sets.strong, ...sets.weak])) weak += weight;
      const candidates = [label, ...prediction.alternatives.map((alternative) => alternative.chord.label)];
      if (candidates.some((candidate) => matchesAny(candidate, [expected.primary, ...sets.strong, ...sets.weak]))) top3 += weight;
      if (!chordLabelsEquivalent(label, expected.primary)) corrections += 1;
    }
    const boundaries = boundaryCounts(item.definition, timeline);
    expectedBoundaries += boundaries.expected;
    predictedBoundaries += boundaries.predicted;
    matchedBoundaries += boundaries.matched;
  }
  return {
    caseCount: cases.length,
    durationBeats: duration,
    rootAccuracy: ratio(root, duration),
    qualityAccuracy: ratio(quality, duration),
    tetradAccuracy: ratio(tetrad, duration),
    exactAccuracy: ratio(exact, duration),
    strongAlternativeAccuracy: ratio(strong, duration),
    weakAlternativeAccuracy: ratio(weak, duration),
    top3Accuracy: ratio(top3, duration),
    boundaryPrecision: ratio(matchedBoundaries, predictedBoundaries),
    boundaryRecall: ratio(matchedBoundaries, expectedBoundaries),
    correctionCost: corrections,
  };
}

export function evaluateSilverCases(cases: readonly AnalyzedRealMidiCase[]): SilverMetrics {
  let duration = 0;
  let legacy = 0; let reranker = 0; let legacyTop3 = 0; let rerankerTop3 = 0;
  let regressions = 0; let improvements = 0; let legacyDistance = 0; let rerankerDistance = 0;
  cases.forEach((item) => item.definition.expected.primary.forEach((expected) => {
    const weight = expected.endBeat - expected.startBeat;
    const legacyPrediction = bestPrediction(expected, item.legacy);
    const rerankerPrediction = bestPrediction(expected, item.reranker);
    const legacyMatch = Boolean(legacyPrediction && chordLabelsEquivalent(legacyPrediction.chord.label, expected.primary));
    const rerankerMatch = Boolean(rerankerPrediction && chordLabelsEquivalent(rerankerPrediction.chord.label, expected.primary));
    duration += weight;
    if (legacyMatch) legacy += weight; else legacyDistance += 1;
    if (rerankerMatch) reranker += weight; else rerankerDistance += 1;
    if (legacyPrediction && top3Labels(legacyPrediction).some((label) => chordLabelsEquivalent(label, expected.primary))) legacyTop3 += weight;
    if (rerankerPrediction && top3Labels(rerankerPrediction).some((label) => chordLabelsEquivalent(label, expected.primary))) rerankerTop3 += weight;
    if (legacyMatch && !rerankerMatch) regressions += 1;
    if (!legacyMatch && rerankerMatch) improvements += 1;
  }));
  return {
    caseCount: cases.length, durationBeats: duration,
    legacySavedAgreement: ratio(legacy, duration), rerankerSavedAgreement: ratio(reranker, duration),
    legacyTop3Agreement: ratio(legacyTop3, duration), rerankerTop3Agreement: ratio(rerankerTop3, duration),
    regressionCount: regressions, improvementCount: improvements,
    legacyCorrectionDistance: legacyDistance, rerankerCorrectionDistance: rerankerDistance,
  };
}

export function evaluateBronzeCases(cases: readonly AnalyzedRealMidiCase[]): BronzeMetrics {
  let segments = 0; let agreements = 0; let confidence = 0; let reviewCandidates = 0;
  const confidenceDistribution = { high: 0, medium: 0, review: 0 };
  const chordDistribution: Record<string, number> = {};
  cases.forEach((item) => item.definition.expected.primary.forEach((expected) => {
    const legacy = bestPrediction(expected, item.legacy);
    const reranker = bestPrediction(expected, item.reranker);
    if (!legacy || !reranker) { reviewCandidates += 1; return; }
    segments += 1;
    const agrees = chordLabelsEquivalent(legacy.chord.label, reranker.chord.label);
    if (agrees) agreements += 1;
    confidence += reranker.confidence;
    const bucket = reranker.confidence >= 0.75 ? "high" : reranker.confidence >= 0.55 ? "medium" : "review";
    confidenceDistribution[bucket] += 1;
    if (!agrees || bucket === "review") reviewCandidates += 1;
    chordDistribution[reranker.chord.label] = (chordDistribution[reranker.chord.label] ?? 0) + 1;
  }));
  return {
    caseCount: cases.length, segmentCount: segments,
    analyzerAgreement: ratio(agreements, segments), averageConfidence: ratio(confidence, segments),
    confidenceDistribution, reviewCandidateCount: reviewCandidates,
    chordDistribution: Object.fromEntries(Object.entries(chordDistribution).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function bestPrediction(expected: ExpectedChordSegment, timeline: readonly ChordTimelineItem[]) {
  return timeline.map((item) => {
    const startBeat = (item.bar - 1) * 4 + item.beat - 1;
    return { item, overlap: Math.max(0, Math.min(expected.endBeat, startBeat + item.durationBeats) - Math.max(expected.startBeat, startBeat)) };
  }).filter((entry) => entry.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap)[0]?.item;
}

function acceptedLabels(definition: RealMidiEvaluationCase, expected: ExpectedChordSegment) {
  const set = definition.expected.alternatives?.find((item) => item.startBeat === expected.startBeat && item.endBeat === expected.endBeat);
  return {
    strong: set?.alternatives.filter((item) => item.strength === "strong").map((item) => item.chord) ?? [],
    weak: set?.alternatives.filter((item) => item.strength === "weak").map((item) => item.chord) ?? [],
  };
}

function boundaryCounts(definition: RealMidiEvaluationCase, timeline: readonly ChordTimelineItem[]) {
  const expected = definition.expected.primary.slice(1).map((item) => item.startBeat);
  const predicted = timeline.map((item) => (item.bar - 1) * 4 + item.beat - 1)
    .filter((beat) => beat > definition.range.startBeat && beat < definition.range.endBeat);
  const matched = expected.filter((beat) => predicted.some((candidate) => Math.abs(candidate - beat) <= 0.25)).length;
  return { expected: expected.length, predicted: predicted.length, matched };
}

function top3Labels(item: ChordTimelineItem): string[] {
  return [item.chord.label, ...item.alternatives.map((alternative) => alternative.chord.label)];
}

function matchesAny(label: string, accepted: readonly string[]): boolean {
  return accepted.some((candidate) => chordLabelsEquivalent(label, candidate));
}

function tetradFamily(quality: string): string {
  return quality.replace(/9|11|13/, "7").replace(/add9|sixNine|six/, "maj");
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : Number((value / total).toFixed(6));
}
