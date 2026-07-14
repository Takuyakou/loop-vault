import type { ChordQuality, ChordTimelineItem } from "../../types";
import type {
  AnalyzerForEvaluation, EvaluationCaseInput, EvaluationCaseResult, EvaluationMetrics,
  EvaluationReport, ExpectedChordSegment, MidiEvaluationCategory,
} from "./types";

const emptyMetrics = (): EvaluationMetrics => ({
  caseCount: 0, durationBeats: 0, rootAccuracy: 0, qualityAccuracy: 0,
  tetradAccuracy: 0, exactAccuracy: 0, top3Accuracy: 0, boundaryPrecision: 0,
  boundaryRecall: 0, overSegmentationRate: 0, underSegmentationRate: 0, correctionCost: 0,
});

export function evaluateAnalyzer(
  cases: readonly EvaluationCaseInput[], analyzer: AnalyzerForEvaluation,
  metadata: { analyzerMode: string; analyzerVersion: string; datasetId: string },
): EvaluationReport {
  const results = cases.map(({ definition, bytes }) => evaluateCase(definition, analyzer(bytes).fullTimeline));
  const categories = [...new Set(results.flatMap((result) => result.category))].sort();
  return {
    schemaVersion: 1,
    ...metadata,
    metrics: aggregate(results),
    byCategory: Object.fromEntries(categories.map((category) => [category, aggregate(
      results.filter((result) => result.category.includes(category as MidiEvaluationCategory)),
    )])),
    cases: results,
  };
}

export function evaluateCase(
  definition: EvaluationCaseInput["definition"], predicted: readonly ChordTimelineItem[],
): EvaluationCaseResult {
  const beatsPerBar = 4;
  const expected = definition.expected.chordTimeline;
  const predictedRanges = predicted.map((item) => ({
    startBeat: (item.bar - 1) * beatsPerBar + item.beat - 1,
    endBeat: (item.bar - 1) * beatsPerBar + item.beat - 1 + item.durationBeats,
    item,
  }));
  let duration = 0;
  let root = 0;
  let quality = 0;
  let tetrad = 0;
  let exact = 0;
  let top3 = 0;
  let corrections = 0;
  for (const target of expected) {
    const targetDuration = target.endBeat - target.startBeat;
    const match = bestOverlap(target, predictedRanges);
    duration += targetDuration;
    if (!match) { corrections += 1; continue; }
    if (match.item.chord.root === target.root) root += targetDuration;
    if (qualityFamily(match.item.chord.quality) === qualityFamily(target.quality)) quality += targetDuration;
    if (tetradFamily(match.item.chord.quality) === tetradFamily(target.quality)) tetrad += targetDuration;
    if (accepted(target, match.item.chord.label)) exact += targetDuration;
    const candidates = [match.item.chord.label, ...match.item.alternatives.map((entry) => entry.chord.label)];
    if (candidates.some((label) => accepted(target, label))) top3 += targetDuration;
    if (!accepted(target, match.item.chord.label)) corrections += 1;
  }
  const expectedBoundaries = expected.slice(1).map((segment) => segment.startBeat);
  const predictedBoundaries = predictedRanges.slice(1).map((segment) => segment.startBeat);
  const matchedBoundaries = expectedBoundaries.filter((boundary) =>
    predictedBoundaries.some((candidate) => Math.abs(candidate - boundary) <= 0.25)).length;
  const metrics: EvaluationMetrics = {
    caseCount: 1,
    durationBeats: duration,
    rootAccuracy: ratio(root, duration),
    qualityAccuracy: ratio(quality, duration),
    tetradAccuracy: ratio(tetrad, duration),
    exactAccuracy: ratio(exact, duration),
    top3Accuracy: ratio(top3, duration),
    boundaryPrecision: ratio(matchedBoundaries, predictedBoundaries.length),
    boundaryRecall: ratio(matchedBoundaries, expectedBoundaries.length),
    overSegmentationRate: ratio(Math.max(0, predicted.length - expected.length), expected.length),
    underSegmentationRate: ratio(Math.max(0, expected.length - predicted.length), expected.length),
    correctionCost: corrections,
  };
  return { id: definition.id, split: definition.split, category: definition.category, ...metrics };
}

export function aggregate(results: readonly EvaluationCaseResult[]): EvaluationMetrics {
  if (results.length === 0) return emptyMetrics();
  const duration = results.reduce((sum, item) => sum + item.durationBeats, 0);
  const weighted = (key: keyof EvaluationMetrics) => ratio(
    results.reduce((sum, item) => sum + Number(item[key]) * item.durationBeats, 0), duration,
  );
  return {
    caseCount: results.length,
    durationBeats: duration,
    rootAccuracy: weighted("rootAccuracy"),
    qualityAccuracy: weighted("qualityAccuracy"),
    tetradAccuracy: weighted("tetradAccuracy"),
    exactAccuracy: weighted("exactAccuracy"),
    top3Accuracy: weighted("top3Accuracy"),
    boundaryPrecision: weighted("boundaryPrecision"),
    boundaryRecall: weighted("boundaryRecall"),
    overSegmentationRate: weighted("overSegmentationRate"),
    underSegmentationRate: weighted("underSegmentationRate"),
    correctionCost: results.reduce((sum, item) => sum + item.correctionCost, 0),
  };
}

function bestOverlap(target: ExpectedChordSegment, predicted: Array<{ startBeat: number; endBeat: number; item: ChordTimelineItem }>) {
  const best = predicted
    .map((entry) => ({
      entry,
      overlap: Math.max(0, Math.min(target.endBeat, entry.endBeat) - Math.max(target.startBeat, entry.startBeat)),
    }))
    .sort((left, right) => right.overlap - left.overlap || left.entry.startBeat - right.entry.startBeat)[0];
  return best?.overlap ? best.entry : undefined;
}

function accepted(target: ExpectedChordSegment, label: string): boolean {
  return label === target.primary || (target.acceptableAlternatives ?? []).includes(label);
}

function qualityFamily(quality: ChordQuality): string {
  if (quality.startsWith("min") || quality === "dim" || quality === "dim7") return quality.startsWith("min") ? "minor" : "dim";
  if (quality.startsWith("sus") || quality === "dom7sus4") return "sus";
  if (quality === "aug") return "aug";
  return "major";
}

function tetradFamily(quality: ChordQuality): string {
  return quality.replace(/9|11|13/, "7").replace(/add9|sixNine|six/, "maj");
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : Number((value / total).toFixed(6));
}
