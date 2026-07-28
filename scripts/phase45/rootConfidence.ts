import { normalizeChordLabel } from "../../src/domain/chordIdentity";
import type { LegacyWindowCandidateDiagnostic } from "../../src/domain/midi/legacy";

export interface RootConfidenceRow {
  fileId: string;
  eventId: string;
  scenarioId: string;
  variant: "clean" | "stress";
  expected: string;
  expectedRoot: number | null;
  detectedRoot: number | null;
  rootCorrect: boolean;
  rootRank1Score: number;
  rootRank2Score: number;
  rawMargin: number;
  normalizedMargin: number;
  rootEntropy: number;
  candidateCount: number;
  noteCount: number;
  coverage: number | null;
  currentTop3RootRescue: boolean;
  oracleCanonicalGain: boolean;
  oracleRootLoss: boolean;
}

export interface ConfidenceBand {
  kind: "normalized-margin-gte" | "root-entropy-lte" | "combined";
  normalizedMarginThreshold?: number;
  rootEntropyThreshold?: number;
}

export interface ConfidenceBandResult {
  band: ConfidenceBand;
  eventCount: number;
  rootCorrectCount: number;
  rootAccuracy: number;
  wilson95: { lower: number; upper: number };
  top3RootRescueRate: number;
  allocationEligibleCount: number;
  expectedCanonicalGains: number;
  expectedRootLosses: number;
  rootLossToGainRatio: number | null;
  gatePass: boolean;
}

const normalizedMarginThresholds = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2];
const rootEntropyThresholds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25];

export const rootConfidenceGate = {
  minimumAccuracy: 0.98,
  minimumWilsonLower: 0.95,
  minimumEvents: 48,
  maximumRootLossToGainRatio: 0.25,
} as const;

export function buildRootConfidenceRow(input: {
  fileId: string;
  eventId: string;
  scenarioId: string;
  variant: "clean" | "stress";
  expected: string;
  rawWindow: LegacyWindowCandidateDiagnostic;
  currentTop3RootRescue: boolean;
  oracleCanonicalGain: boolean;
  oracleRootLoss: boolean;
}): RootConfidenceRow {
  const rootScores = bestScorePerRoot(input.rawWindow);
  const ranked = rootScores
    .map((score, root) => ({ root, score }))
    .sort((left, right) => right.score - left.score || left.root - right.root);
  const first = ranked[0] ?? { root: -1, score: 0 };
  const second = ranked[1] ?? { root: -1, score: 0 };
  const expectedRoot = normalizeChordLabel(input.expected)?.rootPitchClass ?? null;
  const rawMargin = first.score - second.score;
  const denominator = Math.abs(first.score) + Math.abs(second.score) + Number.EPSILON;
  const primaryCandidate = input.rawWindow.candidates[0];

  return {
    fileId: input.fileId,
    eventId: input.eventId,
    scenarioId: input.scenarioId,
    variant: input.variant,
    expected: input.expected,
    expectedRoot,
    detectedRoot: first.root >= 0 ? first.root : null,
    rootCorrect: expectedRoot !== null && first.root === expectedRoot,
    rootRank1Score: first.score,
    rootRank2Score: second.score,
    rawMargin,
    normalizedMargin: rawMargin / denominator,
    rootEntropy: softmaxEntropy(rootScores, 0.1),
    candidateCount: input.rawWindow.candidates.length,
    noteCount: input.rawWindow.noteCount,
    coverage: primaryCandidate?.qualityCoverage ?? null,
    currentTop3RootRescue: input.currentTop3RootRescue,
    oracleCanonicalGain: input.oracleCanonicalGain,
    oracleRootLoss: input.oracleRootLoss,
  };
}

export function evaluateRootConfidenceBands(
  rows: readonly RootConfidenceRow[],
): ConfidenceBandResult[] {
  const bands: ConfidenceBand[] = [
    ...normalizedMarginThresholds.map((threshold) => ({
      kind: "normalized-margin-gte" as const,
      normalizedMarginThreshold: threshold,
    })),
    ...rootEntropyThresholds.map((threshold) => ({
      kind: "root-entropy-lte" as const,
      rootEntropyThreshold: threshold,
    })),
    ...normalizedMarginThresholds.flatMap((margin) =>
      rootEntropyThresholds.map((entropy) => ({
        kind: "combined" as const,
        normalizedMarginThreshold: margin,
        rootEntropyThreshold: entropy,
      }))),
  ];
  return bands.map((band) => evaluateBand(rows, band));
}

export function selectRootConfidenceBand(
  results: readonly ConfidenceBandResult[],
): ConfidenceBandResult | null {
  return [...results]
    .filter((result) => result.gatePass)
    .sort((left, right) =>
      right.eventCount - left.eventCount
      || right.rootAccuracy - left.rootAccuracy
      || right.wilson95.lower - left.wilson95.lower
      || bandKey(left.band).localeCompare(bandKey(right.band)))[0] ?? null;
}

export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.959963984540054,
): { lower: number; upper: number } {
  if (total === 0) return { lower: 0, upper: 0 };
  const proportion = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = proportion + z2 / (2 * total);
  const spread = z * Math.sqrt(
    proportion * (1 - proportion) / total + z2 / (4 * total * total),
  );
  return {
    lower: Math.max(0, (centre - spread) / denominator),
    upper: Math.min(1, (centre + spread) / denominator),
  };
}

export function softmaxEntropy(scores: readonly number[], temperature: number): number {
  if (scores.length === 0) return 0;
  const safeTemperature = Math.max(Number.EPSILON, temperature);
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp((score - max) / safeTemperature));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.reduce((entropy, weight) => {
    const probability = weight / total;
    return probability <= 0 ? entropy : entropy - probability * Math.log(probability);
  }, 0);
}

function bestScorePerRoot(window: LegacyWindowCandidateDiagnostic): number[] {
  const scores = Array(12).fill(Number.NEGATIVE_INFINITY) as number[];
  for (const candidate of window.candidates) {
    const root = ((candidate.chord.root % 12) + 12) % 12;
    scores[root] = Math.max(scores[root], candidate.rawScore);
  }
  return scores.map((score) => Number.isFinite(score) ? score : -1);
}

function evaluateBand(
  rows: readonly RootConfidenceRow[],
  band: ConfidenceBand,
): ConfidenceBandResult {
  const selected = rows.filter((row) => matchesBand(row, band));
  const rootCorrectCount = selected.filter((row) => row.rootCorrect).length;
  const rootAccuracy = selected.length === 0 ? 0 : rootCorrectCount / selected.length;
  const interval = wilsonInterval(rootCorrectCount, selected.length);
  const rootWrong = selected.filter((row) => !row.rootCorrect);
  const rescueCount = rootWrong.filter((row) => row.currentTop3RootRescue).length;
  const gains = selected.filter((row) => row.oracleCanonicalGain).length;
  const losses = selected.filter((row) => row.oracleRootLoss).length;
  const lossRatio = gains === 0 ? null : losses / gains;
  const gatePass = selected.length >= rootConfidenceGate.minimumEvents
    && rootAccuracy >= rootConfidenceGate.minimumAccuracy
    && interval.lower >= rootConfidenceGate.minimumWilsonLower
    && lossRatio !== null
    && lossRatio <= rootConfidenceGate.maximumRootLossToGainRatio;

  return {
    band,
    eventCount: selected.length,
    rootCorrectCount,
    rootAccuracy,
    wilson95: interval,
    top3RootRescueRate: rootWrong.length === 0 ? 0 : rescueCount / rootWrong.length,
    allocationEligibleCount: selected.length,
    expectedCanonicalGains: gains,
    expectedRootLosses: losses,
    rootLossToGainRatio: lossRatio,
    gatePass,
  };
}

function matchesBand(row: RootConfidenceRow, band: ConfidenceBand): boolean {
  const marginPass = band.normalizedMarginThreshold === undefined
    || row.normalizedMargin >= band.normalizedMarginThreshold;
  const entropyPass = band.rootEntropyThreshold === undefined
    || row.rootEntropy <= band.rootEntropyThreshold;
  return marginPass && entropyPass;
}

function bandKey(band: ConfidenceBand): string {
  return [
    band.kind,
    band.normalizedMarginThreshold ?? "",
    band.rootEntropyThreshold ?? "",
  ].join(":");
}
