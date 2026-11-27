/**
 * P25-02 K6「なめらかにつなぐ」: today's cyclic optimizer (`optimizeCandidateGroups`) choosing among the K
 * candidates only, with K's own costs (today's static cost cannot price a one-hand ② candidate).
 */
import { optimizeCandidateGroups } from "../voicingPractice/optimizeProgression";
import type { StyleVoicingCandidate } from "../voicingPractice/candidateTools";
import { styleVoicingTransitionCost } from "../voicingPractice/transitionCost";
import { optimizerCandidates, placementNotes, shapePlacementStaticCost, type RootlessOrder, type ShapeVoicingPlacement, type ShapeVoicingResult } from ".";

interface ShapeOption {
  readonly placement: ShapeVoicingPlacement;
  readonly staticCost: number;
  /** The view the transition cost measures: a one-hand ② placement is read as lowest note | upper three. */
  readonly view: StyleVoicingCandidate;
}

function costView(result: ShapeVoicingResult, placement: ShapeVoicingPlacement): StyleVoicingCandidate {
  const allNotes = placementNotes(placement);
  const measured = result.oneHand && placement.right.length === 0
    ? { left: allNotes.slice(0, 1), right: allNotes.slice(1) }
    : { left: [...placement.left], right: [...placement.right] };
  return {
    styleId: "lesson-v2", leftHandNotes: measured.left, rightHandNotes: measured.right, allNotes,
    requiredIntervals: [], addedColorIntervals: [], omittedIntervals: [], warnings: [],
  };
}

function compareNumbers(left: readonly number[], right: readonly number[]): number {
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}

/** One placement per result, chosen across the whole progression (including the last → first link). */
export function optimizeShapeProgression(
  results: readonly ShapeVoicingResult[],
  order: RootlessOrder,
): ShapeVoicingPlacement[] {
  const groups = results.map((result) => optimizerCandidates(result, order).map((placement): ShapeOption => ({
    placement, staticCost: shapePlacementStaticCost(result, placement), view: costView(result, placement),
  })));
  if (groups.some((group) => group.length === 0)) {
    // A card that cannot sound keeps the static choice of the others; optimise over the playable ones.
    const playable = groups.map((group, index) => ({ group, index })).filter(({ group }) => group.length > 0);
    const chosen = optimizeShapeOptions(playable.map(({ group }) => group));
    const byIndex = new Map(playable.map(({ index }, position) => [index, chosen[position]!.placement]));
    return results.map((_, index) => byIndex.get(index) ?? { left: [], right: [] });
  }
  return optimizeShapeOptions(groups).map((option) => option.placement);
}

function optimizeShapeOptions(groups: readonly ShapeOption[][]): ShapeOption[] {
  return optimizeCandidateGroups(groups, {
    start: (option) => option.staticCost,
    transition: (previous, current) => styleVoicingTransitionCost(previous.view, current.view),
    compare: (left, right) => left.staticCost - right.staticCost
      || compareNumbers(left.placement.left, right.placement.left)
      || compareNumbers(left.placement.right, right.placement.right),
  });
}
