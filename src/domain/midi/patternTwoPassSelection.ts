import { qualityFloor } from "./blockQuality";
import {
  classifyCandidateKind, kindRank, structuralUsefulness, type CandidateKind,
} from "./candidateKind";
import type { PatternCandidate } from "./patternCandidate";
import {
  overlapPenalty, repeatPeriodsOf, structuralSalience, temporalNovelty,
} from "./patternEvidence";
import type {
  SelectedPattern, UsefulnessSelectionOptions, UsefulnessSelectionResult, UsefulnessSelectionStep,
} from "./patternSelection";
import type { Section } from "./sections";

/**
 * Two-pass pattern selection.
 *
 * The single-pass ordering put a progression before a vamp and a long span before
 * a short one. That cleared the top-three gates and did not reach the spans the
 * corpus names: 93.5% of the remaining rank failures were patterns that existed,
 * grouped correctly, and simply were not picked. Nothing in the objective could
 * tell a span the music marks out from a span the window set happened to offer at
 * the same length and a slightly better score.
 *
 * Pass one fills the main lane on structural evidence and temporal spread. Pass
 * two fills the rest by marginal relevance, so the tail closes the gaps the head
 * left instead of restating it.
 *
 * No gold information enters here. Every signal — sections, repeat periods, bar
 * positions, coverage — is read from the material. There is no scenario id, no
 * block id and no fixed bar position anywhere in this file.
 */

export interface TwoPassSelectionOptions extends UsefulnessSelectionOptions {
  sections?: readonly Section[];
  totalBars?: number;
  /** Cards the first pass may claim before the second pass fills the rest. */
  mainLaneQuota?: number;
}

const DEFAULT_VISIBLE_LIMIT = 10;
const DEFAULT_ALL_VISIBLE_LIMIT = 30;
const DEFAULT_MAIN_LANE_QUOTA = 3;

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

export function selectPatternsTwoPass(
  patterns: readonly PatternCandidate[],
  options: TwoPassSelectionOptions,
): UsefulnessSelectionResult {
  const visibleLimit = options.visibleLimit ?? DEFAULT_VISIBLE_LIMIT;
  const allVisibleLimit = options.allVisibleLimit ?? DEFAULT_ALL_VISIBLE_LIMIT;
  const floor = options.qualityFloor ?? qualityFloor;
  const sections = options.sections ?? [];
  const mainLaneQuota = options.mainLaneQuota ?? DEFAULT_MAIN_LANE_QUOTA;

  const activeBars = [...options.harmonicActiveBars].sort((left, right) => left - right);
  const total = activeBars.length;
  const totalBars = options.totalBars ?? (activeBars[activeBars.length - 1] ?? 1);
  const activeSet = new Set(activeBars);

  const eligible = patterns.filter((pattern) => pattern.score >= floor);
  const kindOf = new Map<string, CandidateKind>(eligible.map((pattern) => [
    pattern.patternId,
    classifyCandidateKind({ lengthBars: pattern.lengthBars, stats: pattern.representative.stats }),
  ]));
  const structuralOf = new Map<string, number>(eligible.map((pattern) => [
    pattern.patternId,
    structuralUsefulness({ lengthBars: pattern.lengthBars, stats: pattern.representative.stats }),
  ]));
  const periods = repeatPeriodsOf(eligible);
  const salienceOf = new Map<string, number>(eligible.map((pattern) => [
    pattern.patternId,
    structuralSalience(pattern, sections, periods),
  ]));

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
  const coverageNow = () => (total === 0 ? 0 : covered.size / total);

  /** The occurrence of this pattern that closes the most of the remaining gap. */
  const bestOccurrenceFor = (pattern: PatternCandidate) => [...pattern.occurrences]
    .map((occurrence) => ({
      occurrence,
      newBars: barsOfOccurrence(occurrence).filter((bar) => !covered.has(bar)).length,
    }))
    .sort((left, right) => right.newBars - left.newBars
      || right.occurrence.score - left.occurrence.score
      || left.occurrence.startBar - right.occurrence.startBar
      || left.occurrence.id.localeCompare(right.occurrence.id))[0];

  const take = (
    pattern: PatternCandidate,
    occurrence: PatternCandidate["representative"],
    newBars: number,
    newIdentity: boolean,
  ) => {
    remaining.delete(pattern.patternId);
    selected.push({ pattern, occurrence });
    shownIdentities.add(pattern.normalizedProgressionIdentity);
    for (const bar of barsOfOccurrence(occurrence)) covered.add(bar);
    steps.push({
      patternId: pattern.patternId,
      representativeOccurrenceId: occurrence.id,
      startBar: occurrence.startBar,
      endBar: occurrence.endBar,
      newBars,
      redundantBars: barsOfOccurrence(occurrence).length - newBars,
      utility: Number((salienceOf.get(pattern.patternId) ?? 0).toFixed(6)),
      coverageAfter: Number(coverageNow().toFixed(6)),
      reason: newBars > 0 ? "selected-by-coverage" : "selected-by-quality",
      kind: kindOf.get(pattern.patternId) ?? "fragment",
      structuralUsefulness: structuralOf.get(pattern.patternId) ?? 0,
      addedNewIdentity: newIdentity,
    });
  };

  // --- Pass one: the main lane ---------------------------------------------
  //
  // Progressions only, ranked on how strongly the music marks the span and how
  // far it sits from what is already chosen. Quality breaks ties rather than
  // leading, because a high score on an arbitrary span is exactly the failure
  // this pass exists to correct.
  const progressions = eligible.filter((pattern) => kindOf.get(pattern.patternId) === "progression");
  while (selected.length < Math.min(mainLaneQuota, visibleLimit) && remaining.size > 0) {
    const chosenSpans = selected.map((entry) => entry.occurrence);
    let best: {
      pattern: PatternCandidate;
      occurrence: PatternCandidate["representative"];
      keys: number[];
      newBars: number;
    } | undefined;

    for (const pattern of progressions) {
      if (!remaining.has(pattern.patternId)) continue;
      if (shownIdentities.has(pattern.normalizedProgressionIdentity)) continue;
      const choice = bestOccurrenceFor(pattern);
      if (!choice) continue;
      const keys = [
        -Math.round((salienceOf.get(pattern.patternId) ?? 0) * 20),
        -Math.round(temporalNovelty(pattern, chosenSpans, totalBars) * 10),
        -(structuralOf.get(pattern.patternId) ?? 0),
        -Math.round(pattern.score * 1000),
        choice.occurrence.startBar,
      ];
      if (!best || compareKeys(keys, best.keys, pattern.patternId, best.pattern.patternId) < 0) {
        best = { pattern, occurrence: choice.occurrence, keys, newBars: choice.newBars };
      }
    }

    if (!best) break;
    take(best.pattern, best.occurrence, best.newBars, true);
  }

  // --- Pass two: maximal marginal relevance --------------------------------
  //
  // Everything else competes on one weighted utility. Coverage counts here in a
  // way it deliberately does not in pass one: the tail's job is to close the gaps
  // the head left. Kind is a penalty rather than a hard key, so a vamp can take a
  // tail slot once the progressions worth showing are shown.
  while (selected.length < allVisibleLimit && remaining.size > 0) {
    const chosenSpans = selected.map((entry) => entry.occurrence);
    let best: {
      pattern: PatternCandidate;
      occurrence: PatternCandidate["representative"];
      utility: number;
      newBars: number;
      newIdentity: boolean;
    } | undefined;

    for (const pattern of eligible) {
      if (!remaining.has(pattern.patternId)) continue;
      const choice = bestOccurrenceFor(pattern);
      if (!choice) continue;
      const newIdentity = !shownIdentities.has(pattern.normalizedProgressionIdentity);
      // Nothing is admitted to make up the count: a candidate has to close part
      // of the gap, or introduce a shape the user cannot otherwise see, and the
      // second reason only counts while visible slots remain.
      const addsValue = choice.newBars > 0 || (newIdentity && selected.length < visibleLimit);
      if (!addsValue) continue;

      const uncovered = total - covered.size;
      const marginalCoverage = uncovered <= 0 ? 0 : choice.newBars / uncovered;
      // Salience is weighted lightly here: it is pass one's criterion, and
      // repeating it in the tail crowds out the reach the tail exists to add.
      // What the tail is for is a shape not yet shown and a bar not yet covered.
      const utility = 0.12 * (salienceOf.get(pattern.patternId) ?? 0)
        + 0.30 * (newIdentity ? 1 : 0)
        + 0.10 * temporalNovelty(pattern, chosenSpans, totalBars)
        + 0.30 * marginalCoverage
        + 0.16 * pattern.score
        - 0.18 * overlapPenalty(pattern, covered)
        - 0.30 * kindRank[kindOf.get(pattern.patternId) ?? "fragment"];

      if (!best
        || utility > best.utility
        || (utility === best.utility
          && pattern.patternId.localeCompare(best.pattern.patternId) < 0)) {
        best = { pattern, occurrence: choice.occurrence, utility, newBars: choice.newBars, newIdentity };
      }
    }

    if (!best) break;
    take(best.pattern, best.occurrence, best.newBars, best.newIdentity);
  }

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
    stoppedBecause: selected.length >= allVisibleLimit ? "stopped-limit" : "stopped-no-marginal-value",
    unselected: patterns.filter((pattern) => !selectedIds.has(pattern.patternId)),
  };
}
