import { qualityFloor } from "./blockQuality";
import {
  classifyCandidateKind, kindRank, structuralUsefulness, type CandidateKind,
} from "./candidateKind";
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

export interface UsefulnessSelectionOptions {
  harmonicActiveBars: readonly number[];
  visibleLimit?: number;
  allVisibleLimit?: number;
  qualityFloor?: number;
}

export interface UsefulnessSelectionStep extends PatternSelectionStep {
  kind: CandidateKind;
  structuralUsefulness: number;
  addedNewIdentity: boolean;
}

/**
 * A chosen pattern together with the occurrence its card leads with.
 *
 * The occurrence is picked when the pattern is selected, not before, because the
 * most useful one to show depends on what the earlier cards already show. A
 * pattern that appears in bars 1-8 and 90-97 should lead with 90-97 if the first
 * eight bars are already on screen — the card then lands where the song still
 * needs one, and its siblings stay one click away either way.
 */
export interface SelectedPattern {
  pattern: PatternCandidate;
  occurrence: PatternCandidate["representative"];
}

export interface UsefulnessSelectionResult extends Omit<PatternSelectionResult, "steps" | "selected" | "visible"> {
  selected: SelectedPattern[];
  visible: SelectedPattern[];
  steps: UsefulnessSelectionStep[];
}

/**
 * Marginal coverage, coarsened into eleven buckets.
 *
 * Compared exactly it decides almost every tie and quality never gets a say;
 * bucketed, two candidates that close a similar share of the remaining gap are
 * treated as equal and the later keys break the tie.
 */
function coverageBucket(newBars: number, uncovered: number): number {
  if (uncovered <= 0) return 0;
  return Math.round((newBars / uncovered) * 10);
}

/**
 * Selection ordered by usefulness, then by coverage.
 *
 * The previous objective was a weighted sum in which quality could outweigh
 * coverage, so a two-bar vamp with a high repeat count beat a sixteen-bar
 * progression by 0.0013. A weighted sum has no way to express "a progression
 * comes before a vamp" — any weight large enough to guarantee it makes the other
 * terms decorative.
 *
 * So the keys are compared in order instead:
 *
 *   1. kind            progression, then vamp, then fragment
 *   2. new identity    a shape not yet on screen beats a repeat of one
 *   3. structural      how complete a statement the candidate is
 *   4. coverage        share of the still-open gap it closes, bucketed
 *   5. quality         the block score
 *   6. position        earliest bar, then pattern id
 *
 * Quality stays a gate as well as the fifth key: everything below the floor is
 * out before any of this runs, so nothing weak is ever admitted to fill a slot.
 *
 * Coverage no longer stops the search. One sixteen-bar candidate can cover the
 * whole song and still leave every other useful pattern unoffered, which is the
 * failure this replaces.
 */
export function selectPatternsByUsefulness(
  patterns: readonly PatternCandidate[],
  options: UsefulnessSelectionOptions,
): UsefulnessSelectionResult {
  const visibleLimit = options.visibleLimit ?? DEFAULT_VISIBLE_LIMIT;
  const allVisibleLimit = options.allVisibleLimit ?? DEFAULT_ALL_VISIBLE_LIMIT;
  const floor = options.qualityFloor ?? qualityFloor;

  const activeBars = [...options.harmonicActiveBars].sort((left, right) => left - right);
  const total = activeBars.length;

  const eligible = patterns.filter((pattern) => pattern.score >= floor);
  const kindOf = new Map<string, CandidateKind>(eligible.map((pattern) => [
    pattern.patternId,
    classifyCandidateKind({ lengthBars: pattern.lengthBars, stats: pattern.representative.stats }),
  ]));
  const structuralOf = new Map<string, number>(eligible.map((pattern) => [
    pattern.patternId,
    structuralUsefulness({ lengthBars: pattern.lengthBars, stats: pattern.representative.stats }),
  ]));

  // Held only when there is something to hold it for, and never when vamps are
  // all the song has — then they fill the list on their own merits.
  const vampsAvailable = eligible.some((pattern) => kindOf.get(pattern.patternId) === "vamp");
  const progressionsAvailable = eligible.filter(
    (pattern) => kindOf.get(pattern.patternId) === "progression",
  ).length;
  const vampReserve = vampsAvailable && progressionsAvailable >= visibleLimit ? 1 : 0;

  const activeSet = new Set(activeBars);
  const barsOfOccurrence = (occurrence: PatternCandidate["representative"]) => {
    const bars: number[] = [];
    for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) {
      if (activeSet.has(bar)) bars.push(bar);
    }
    return bars;
  };

  const covered = new Set<number>();
  const shownIdentities = new Set<string>();
  const selected: SelectedPattern[] = [];
  const steps: UsefulnessSelectionStep[] = [];
  const remaining = new Set(eligible.map((pattern) => pattern.patternId));
  let stoppedBecause: PatternSelectionReason = "stopped-limit";

  const coverageNow = () => (total === 0 ? 0 : covered.size / total);

  /**
   * The occurrence of this pattern that closes the most of the remaining gap.
   *
   * Ties fall back to score and then position, so the card still leads with the
   * clearest statement whenever coverage does not distinguish the options.
   */
  const bestOccurrenceFor = (pattern: PatternCandidate) => [...pattern.occurrences]
    .map((occurrence) => ({
      occurrence,
      newBars: barsOfOccurrence(occurrence).filter((bar) => !covered.has(bar)).length,
    }))
    .sort((left, right) => right.newBars - left.newBars
      || right.occurrence.score - left.occurrence.score
      || left.occurrence.startBar - right.occurrence.startBar
      || left.occurrence.id.localeCompare(right.occurrence.id))[0];

  while (selected.length < allVisibleLimit && remaining.size > 0) {
    const uncovered = total - covered.size;
    let best: {
      pattern: PatternCandidate;
      occurrence: PatternCandidate["representative"];
      keys: number[];
      newBars: number;
      redundant: number;
      newIdentity: boolean;
    } | undefined;

    for (const pattern of eligible) {
      if (!remaining.has(pattern.patternId)) continue;
      const choice = bestOccurrenceFor(pattern);
      if (!choice) continue;
      const newBars = choice.newBars;
      const newIdentity = !shownIdentities.has(pattern.normalizedProgressionIdentity);

      // Nothing is admitted just to make up the count. A candidate has to close
      // part of the gap, or introduce a shape the user cannot otherwise see —
      // and the second reason only counts while there are visible slots to fill.
      const addsValue = newBars > 0 || (newIdentity && selected.length < visibleLimit);
      if (!addsValue) continue;

      const patternKind = kindOf.get(pattern.patternId) ?? "fragment";
      // Kind-first ordering means a song with hundreds of progressions never
      // reaches its vamps, so the vamp lane stays empty and the one-chord loop
      // the user asked about is nowhere on screen. One visible slot is held for
      // it — a vamp is a shape worth offering, not a leftover.
      const holdingSlotForVamp = vampReserve > 0
        && selected.length >= visibleLimit - vampReserve
        && selected.length < visibleLimit;
      if (holdingSlotForVamp && patternKind !== "vamp") continue;

      const keys = [
        kindRank[patternKind],
        newIdentity ? 0 : 1,
        -(structuralOf.get(pattern.patternId) ?? 0),
        -coverageBucket(newBars, uncovered),
        -pattern.score,
        choice.occurrence.startBar,
      ];

      if (!best || compareKeys(keys, best.keys, pattern.patternId, best.pattern.patternId) < 0) {
        best = {
          pattern,
          occurrence: choice.occurrence,
          keys,
          newBars,
          redundant: barsOfOccurrence(choice.occurrence).length - newBars,
          newIdentity,
        };
      }
    }

    if (!best) {
      stoppedBecause = selected.length === 0 ? "stopped-limit" : "stopped-no-marginal-value";
      break;
    }

    remaining.delete(best.pattern.patternId);
    selected.push({ pattern: best.pattern, occurrence: best.occurrence });
    shownIdentities.add(best.pattern.normalizedProgressionIdentity);
    for (const bar of barsOfOccurrence(best.occurrence)) covered.add(bar);
    steps.push({
      patternId: best.pattern.patternId,
      representativeOccurrenceId: best.occurrence.id,
      startBar: best.occurrence.startBar,
      endBar: best.occurrence.endBar,
      newBars: best.newBars,
      redundantBars: best.redundant,
      utility: 0,
      coverageAfter: Number(coverageNow().toFixed(6)),
      reason: best.newBars > 0 ? "selected-by-coverage" : "selected-by-quality",
      kind: kindOf.get(best.pattern.patternId) ?? "fragment",
      structuralUsefulness: structuralOf.get(best.pattern.patternId) ?? 0,
      addedNewIdentity: best.newIdentity,
    });
  }

  if (selected.length >= allVisibleLimit) stoppedBecause = "stopped-limit";

  const visible = selected.slice(0, visibleLimit);
  const visibleCovered = new Set<number>();
  for (const entry of visible) {
    for (const bar of barsOfOccurrence(entry.occurrence)) visibleCovered.add(bar);
  }
  const selectedIds = new Set(selected.map((entry) => entry.pattern.patternId));

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

/** Lexicographic comparison with a final tie-break on id, so runs are identical. */
function compareKeys(
  left: readonly number[],
  right: readonly number[],
  leftId: string,
  rightId: string,
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return leftId.localeCompare(rightId);
}

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
