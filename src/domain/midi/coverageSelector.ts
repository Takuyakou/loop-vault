import { qualityFloor } from "./blockQuality";
import type { CandidateOccurrence } from "./occurrence";

/**
 * Coverage-driven candidate selection.
 *
 * The previous selector ranked by score and then spread picks across fixed
 * 25-bar regions. On a 100-bar song that is four regions, so six of ten picks
 * landed inside the same sixteen bars while seventy bars had nothing at all —
 * including the entire chorus. Ranking never asked whether a bar was already
 * represented.
 *
 * This selects greedily on marginal gain instead: at each step it takes the
 * occurrence that adds the most previously-uncovered harmony, discounted by how
 * much it merely repeats what is already shown. Quality is still a gate, not a
 * currency — a weak candidate is never admitted just because it covers
 * something.
 */

export interface CoverageSelectionWeights {
  quality: number;
  coverage: number;
  diversity: number;
  overlap: number;
}

export const defaultCoverageWeights: CoverageSelectionWeights = {
  quality: 0.30,
  coverage: 0.50,
  diversity: 0.12,
  overlap: 0.28,
};

export interface CoverageSelectionOptions {
  /** Bars that carry harmony. Bars outside this set are never counted. */
  harmonicActiveBars: readonly number[];
  /** Shown without interaction. */
  visibleLimit?: number;
  /** Reachable behind "show more". */
  allVisibleLimit?: number;
  /** Stop once this share of harmonic bars is covered. */
  coverageTarget?: number;
  weights?: CoverageSelectionWeights;
  /** Occurrences below this score are never selected. */
  qualityFloor?: number;
}

export type CoverageSelectionReason =
  | "selected-by-coverage"
  | "selected-by-quality"
  | "rejected-by-quality-floor"
  | "stopped-no-marginal-value"
  | "stopped-coverage-target"
  | "stopped-limit";

export interface CoverageSelectionStep {
  occurrenceId: string;
  startBar: number;
  endBar: number;
  newBars: number;
  redundantBars: number;
  utility: number;
  coverageAfter: number;
  reason: CoverageSelectionReason;
}

export interface CoverageSelectionResult {
  /** Ordered: the first `visibleLimit` are shown immediately. */
  selected: CandidateOccurrence[];
  visible: CandidateOccurrence[];
  coverage: number;
  coverageAtVisible: number;
  longestUncoveredRun: number;
  uncoveredBars: number[];
  steps: CoverageSelectionStep[];
  stoppedBecause: CoverageSelectionReason;
  /** Never removed: everything not selected is still available. */
  unselected: CandidateOccurrence[];
}

const DEFAULT_VISIBLE_LIMIT = 10;
const DEFAULT_ALL_VISIBLE_LIMIT = 30;
const DEFAULT_COVERAGE_TARGET = 0.95;

function barsOf(occurrence: CandidateOccurrence, active: ReadonlySet<number>): number[] {
  const bars: number[] = [];
  for (let bar = occurrence.startBar; bar <= occurrence.endBar; bar += 1) {
    if (active.has(bar)) bars.push(bar);
  }
  return bars;
}

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

export function selectOccurrencesByCoverage(
  occurrences: readonly CandidateOccurrence[],
  options: CoverageSelectionOptions,
): CoverageSelectionResult {
  const weights = options.weights ?? defaultCoverageWeights;
  const visibleLimit = options.visibleLimit ?? DEFAULT_VISIBLE_LIMIT;
  const allVisibleLimit = options.allVisibleLimit ?? DEFAULT_ALL_VISIBLE_LIMIT;
  const coverageTarget = options.coverageTarget ?? DEFAULT_COVERAGE_TARGET;
  const floor = options.qualityFloor ?? qualityFloor;

  const activeBars = [...options.harmonicActiveBars].sort((left, right) => left - right);
  const active = new Set(activeBars);
  const total = activeBars.length;

  // Quality is a gate. Everything below the floor is out before coverage is
  // considered at all, so a bar is never covered by admitting a weak candidate.
  const eligible = occurrences.filter((occurrence) => occurrence.score >= floor);
  const rejected = occurrences.filter((occurrence) => occurrence.score < floor);

  const scores = eligible.map((occurrence) => occurrence.score);
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const normalizeQuality = (score: number) => (
    maxScore - minScore < 1e-9 ? 0.5 : (score - minScore) / (maxScore - minScore)
  );

  const covered = new Set<number>();
  const chosenIdentities = new Set<string>();
  const selected: CandidateOccurrence[] = [];
  const steps: CoverageSelectionStep[] = [];
  const remaining = new Set(eligible.map((occurrence) => occurrence.id));
  let stoppedBecause: CoverageSelectionReason = "stopped-limit";

  const coverageNow = () => (total === 0 ? 0 : covered.size / total);

  while (selected.length < allVisibleLimit) {
    if (coverageNow() >= coverageTarget) {
      stoppedBecause = "stopped-coverage-target";
      break;
    }

    const uncoveredCount = total - covered.size;
    let best: { occurrence: CandidateOccurrence; utility: number; newBars: number; redundant: number } | undefined;
    let anyAddsCoverage = false;

    for (const occurrence of eligible) {
      if (!remaining.has(occurrence.id)) continue;
      const bars = barsOf(occurrence, active);
      if (bars.length === 0) continue;
      const newBars = bars.filter((bar) => !covered.has(bar)).length;
      const redundant = bars.length - newBars;
      if (newBars > 0) anyAddsCoverage = true;

      // Measured against the gap that is still open, not against the whole
      // song. Dividing by the total made every step look negligible once a few
      // bars were covered, so quality quietly outranked coverage and selection
      // stalled with a third of the song still missing.
      const marginalCoverage = uncoveredCount === 0 ? 0 : newBars / uncoveredCount;
      const redundantCoverage = total === 0 ? 0 : redundant / total;
      const diversityGain = chosenIdentities.has(occurrence.relativeSignature) ? 0 : 1;
      const utility = weights.quality * normalizeQuality(occurrence.score)
        + weights.coverage * marginalCoverage
        + weights.diversity * diversityGain * 0.1
        - weights.overlap * redundantCoverage;

      if (!best
        || utility > best.utility
        || (utility === best.utility && occurrence.startBar < best.occurrence.startBar)) {
        best = { occurrence, utility, newBars, redundant };
      }
    }

    if (!best) {
      stoppedBecause = "stopped-limit";
      break;
    }

    // Stop only when nothing left can add uncovered harmony. Filling to the cap
    // for its own sake buries the useful candidates, but stopping while gaps
    // remain is the failure this selector exists to fix.
    if (!anyAddsCoverage && selected.length > 0) {
      stoppedBecause = "stopped-no-marginal-value";
      break;
    }

    // Prefer a candidate that closes part of the gap over a higher-scoring one
    // that only repeats covered ground.
    if (best.newBars === 0 && anyAddsCoverage) {
      const withCoverage = eligible
        .filter((occurrence) => remaining.has(occurrence.id))
        .map((occurrence) => {
          const bars = barsOf(occurrence, active);
          const newBars = bars.filter((bar) => !covered.has(bar)).length;
          return { occurrence, newBars, redundant: bars.length - newBars };
        })
        .filter((entry) => entry.newBars > 0)
        .sort((left, right) => right.newBars - left.newBars
          || right.occurrence.score - left.occurrence.score
          || left.occurrence.startBar - right.occurrence.startBar)[0];
      if (withCoverage) {
        best = { ...withCoverage, utility: best.utility };
      }
    }

    remaining.delete(best.occurrence.id);
    selected.push(best.occurrence);
    chosenIdentities.add(best.occurrence.relativeSignature);
    for (const bar of barsOf(best.occurrence, active)) covered.add(bar);
    steps.push({
      occurrenceId: best.occurrence.id,
      startBar: best.occurrence.startBar,
      endBar: best.occurrence.endBar,
      newBars: best.newBars,
      redundantBars: best.redundant,
      utility: Number(best.utility.toFixed(6)),
      coverageAfter: Number(coverageNow().toFixed(6)),
      reason: best.newBars > 0 ? "selected-by-coverage" : "selected-by-quality",
    });
  }

  for (const occurrence of rejected.slice(0, 20)) {
    steps.push({
      occurrenceId: occurrence.id,
      startBar: occurrence.startBar,
      endBar: occurrence.endBar,
      newBars: 0,
      redundantBars: 0,
      utility: 0,
      coverageAfter: Number(coverageNow().toFixed(6)),
      reason: "rejected-by-quality-floor",
    });
  }

  const visible = selected.slice(0, visibleLimit);
  const visibleCovered = new Set<number>();
  for (const occurrence of visible) {
    for (const bar of barsOf(occurrence, active)) visibleCovered.add(bar);
  }
  const selectedIds = new Set(selected.map((occurrence) => occurrence.id));

  return {
    selected,
    visible,
    coverage: Number(coverageNow().toFixed(6)),
    coverageAtVisible: Number((total === 0 ? 0 : visibleCovered.size / total).toFixed(6)),
    longestUncoveredRun: longestRun(activeBars, covered),
    uncoveredBars: activeBars.filter((bar) => !covered.has(bar)),
    steps,
    stoppedBecause,
    unselected: occurrences.filter((occurrence) => !selectedIds.has(occurrence.id)),
  };
}
