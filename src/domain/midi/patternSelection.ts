import { qualityFloor } from "./blockQuality";
import type { PatternCandidate } from "./patternCandidate";

/**
 * Selection over patterns instead of occurrences.
 *
 * The objective here is deliberately the same one the occurrence selector uses —
 * marginal coverage against the still-open gap, discounted by overlap, gated by
 * quality. Only the unit changed. Keeping the objective fixed is what makes the
 * effect of the unit measurable on its own; the objective itself is replaced in
 * the next stage.
 *
 * One consequence is immediate: a pattern can be chosen once, so a display slot
 * can never be spent on a progression that is already on screen.
 */

export interface PatternSelectionOptions {
  harmonicActiveBars: readonly number[];
  visibleLimit?: number;
  allVisibleLimit?: number;
  coverageTarget?: number;
  qualityFloor?: number;
  weights?: {
    quality: number;
    coverage: number;
    diversity: number;
    overlap: number;
  };
}

export type PatternSelectionReason =
  | "selected-by-coverage"
  | "selected-by-quality"
  | "stopped-no-marginal-value"
  | "stopped-coverage-target"
  | "stopped-limit";

export interface PatternSelectionStep {
  patternId: string;
  representativeOccurrenceId: string;
  startBar: number;
  endBar: number;
  newBars: number;
  redundantBars: number;
  utility: number;
  coverageAfter: number;
  reason: PatternSelectionReason;
}

export interface PatternSelectionResult {
  selected: PatternCandidate[];
  visible: PatternCandidate[];
  coverage: number;
  coverageAtVisible: number;
  longestUncoveredRun: number;
  uncoveredBars: number[];
  steps: PatternSelectionStep[];
  stoppedBecause: PatternSelectionReason;
  unselected: PatternCandidate[];
}

const DEFAULT_VISIBLE_LIMIT = 10;
const DEFAULT_ALL_VISIBLE_LIMIT = 30;
const DEFAULT_COVERAGE_TARGET = 0.95;

const defaultWeights = { quality: 0.30, coverage: 0.50, diversity: 0.12, overlap: 0.28 };

function longestRun(active: readonly number[], covered: ReadonlySet<number>): number {
  let longest = 0;
  let run = 0;
  for (const bar of active) {
    if (covered.has(bar)) run = 0;
    else {
      run += 1;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}

export function selectPatternsByCoverage(
  patterns: readonly PatternCandidate[],
  options: PatternSelectionOptions,
): PatternSelectionResult {
  const weights = options.weights ?? defaultWeights;
  const visibleLimit = options.visibleLimit ?? DEFAULT_VISIBLE_LIMIT;
  const allVisibleLimit = options.allVisibleLimit ?? DEFAULT_ALL_VISIBLE_LIMIT;
  const coverageTarget = options.coverageTarget ?? DEFAULT_COVERAGE_TARGET;
  const floor = options.qualityFloor ?? qualityFloor;

  const activeBars = [...options.harmonicActiveBars].sort((left, right) => left - right);
  const total = activeBars.length;

  // Quality remains a gate rather than a currency.
  const eligible = patterns.filter((pattern) => pattern.score >= floor);

  const scores = eligible.map((pattern) => pattern.score);
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const normalizeQuality = (score: number) => (
    maxScore - minScore < 1e-9 ? 0.5 : (score - minScore) / (maxScore - minScore)
  );

  const covered = new Set<number>();
  const chosenIdentities = new Set<string>();
  const selected: PatternCandidate[] = [];
  const steps: PatternSelectionStep[] = [];
  const remaining = new Set(eligible.map((pattern) => pattern.patternId));
  let stoppedBecause: PatternSelectionReason = "stopped-limit";

  const coverageNow = () => (total === 0 ? 0 : covered.size / total);

  while (selected.length < allVisibleLimit) {
    if (coverageNow() >= coverageTarget) {
      stoppedBecause = "stopped-coverage-target";
      break;
    }

    const uncoveredCount = total - covered.size;
    let best: { pattern: PatternCandidate; utility: number; newBars: number; redundant: number } | undefined;
    let anyAddsCoverage = false;

    for (const pattern of eligible) {
      if (!remaining.has(pattern.patternId)) continue;
      if (pattern.coveredBars.length === 0) continue;
      const newBars = pattern.coveredBars.filter((bar) => !covered.has(bar)).length;
      const redundant = pattern.coveredBars.length - newBars;
      if (newBars > 0) anyAddsCoverage = true;

      const marginalCoverage = uncoveredCount === 0 ? 0 : newBars / uncoveredCount;
      const redundantCoverage = total === 0 ? 0 : redundant / total;
      const diversityGain = chosenIdentities.has(pattern.normalizedProgressionIdentity) ? 0 : 1;

      const utility = weights.quality * normalizeQuality(pattern.score)
        + weights.coverage * marginalCoverage
        + weights.diversity * diversityGain * 0.1
        - weights.overlap * redundantCoverage;

      if (!best
        || utility > best.utility
        || (utility === best.utility
          && pattern.representative.startBar < best.pattern.representative.startBar)) {
        best = { pattern, utility, newBars, redundant };
      }
    }

    if (!best) {
      stoppedBecause = "stopped-limit";
      break;
    }
    if (!anyAddsCoverage && selected.length > 0) {
      stoppedBecause = "stopped-no-marginal-value";
      break;
    }

    if (best.newBars === 0 && anyAddsCoverage) {
      const withCoverage = eligible
        .filter((pattern) => remaining.has(pattern.patternId))
        .map((pattern) => {
          const newBars = pattern.coveredBars.filter((bar) => !covered.has(bar)).length;
          return { pattern, newBars, redundant: pattern.coveredBars.length - newBars };
        })
        .filter((entry) => entry.newBars > 0)
        .sort((left, right) => right.newBars - left.newBars
          || right.pattern.score - left.pattern.score
          || left.pattern.representative.startBar - right.pattern.representative.startBar)[0];
      if (withCoverage) best = { ...withCoverage, utility: best.utility };
    }

    remaining.delete(best.pattern.patternId);
    selected.push(best.pattern);
    chosenIdentities.add(best.pattern.normalizedProgressionIdentity);
    for (const bar of best.pattern.coveredBars) covered.add(bar);
    steps.push({
      patternId: best.pattern.patternId,
      representativeOccurrenceId: best.pattern.representative.id,
      startBar: best.pattern.representative.startBar,
      endBar: best.pattern.representative.endBar,
      newBars: best.newBars,
      redundantBars: best.redundant,
      utility: Number(best.utility.toFixed(6)),
      coverageAfter: Number(coverageNow().toFixed(6)),
      reason: best.newBars > 0 ? "selected-by-coverage" : "selected-by-quality",
    });
  }

  const visible = selected.slice(0, visibleLimit);
  const visibleCovered = new Set<number>();
  for (const pattern of visible) for (const bar of pattern.coveredBars) visibleCovered.add(bar);
  const selectedIds = new Set(selected.map((pattern) => pattern.patternId));

  return {
    selected,
    visible,
    coverage: Number(coverageNow().toFixed(6)),
    coverageAtVisible: Number((total === 0 ? 0 : visibleCovered.size / total).toFixed(6)),
    longestUncoveredRun: longestRun(activeBars, covered),
    uncoveredBars: activeBars.filter((bar) => !covered.has(bar)),
    steps,
    stoppedBecause,
    unselected: patterns.filter((pattern) => !selectedIds.has(pattern.patternId)),
  };
}
