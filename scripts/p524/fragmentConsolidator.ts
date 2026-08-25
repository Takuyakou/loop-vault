import {
  runP524ConsolidationPipeline,
  type P524ConsolidationResult,
  type P524FragmentEvidence,
} from "./fragmentConsolidatorCore";

export type {
  P524BoundaryDecision,
  P524ConsolidationOperations,
  P524ConsolidationResult,
  P524ConsolidationSupported,
  P524ConsolidationUnavailable,
  P524FragmentEvidence,
  P524SuppliedShadowEvidence,
} from "./fragmentConsolidatorCore";

const maximumTransientAddedPcDurationCoverage = 0.35;
const maximumTransientAddedPcAttacks = 1;

/**
 * Reconciles a partial voicing only from adjacent local evidence. The current
 * state's added PC never self-justifies: it also needs preceding transient Bass
 * evidence and must remain below structural occupancy in the current cell.
 */
export function consolidateP524PerformanceFragments(
  input: unknown,
  suppliedEvidence?: unknown,
): P524ConsolidationResult {
  try {
    const pipeline = runP524ConsolidationPipeline(input, suppliedEvidence);
    const { result, parsed, bassLane } = pipeline;
    if (result.status === "unavailable" || parsed === undefined || bassLane?.status !== "supported"
      || result.states.length < 2) return result;

  const states: (typeof result.states)[number][] = [];
  const mergedBoundaryBeats = new Set<number>();
  let bassIndex = 0;
  let fragmentIndex = 0;
  for (const current of result.states) {
    const previous = states.at(-1);
    if (previous === undefined) {
      states.push(current);
      continue;
    }
    while (bassIndex + 1 < bassLane.states.length
      && bassLane.states[bassIndex].endBeat <= previous.startBeat) bassIndex += 1;
    while (fragmentIndex + 1 < result.fragments.length
      && result.fragments[fragmentIndex].endBeat <= current.startBeat) fragmentIndex += 1;
    const precedingFragment = result.fragments[Math.max(0, fragmentIndex - 1)];
    const currentFragment = result.fragments[fragmentIndex];
    const bassState = bassLane.states[bassIndex];
    const added = difference(current.pitchClasses, previous.pitchClasses);
    const removed = difference(previous.pitchClasses, current.pitchClasses);
    const transientSupport = new Set(
      bassState !== undefined
        && previous.startBeat >= bassState.startBeat
        && previous.endBeat <= bassState.endBeat
        ? bassState.transientPitchClasses ?? []
        : [],
    );
    const adjacentFragments = precedingFragment?.endBeat === currentFragment?.startBeat
      && currentFragment.startBeat === current.startBeat;
    const locallySupportedNonpersistentAddition = adjacentFragments
      && added.length > 0
      && removed.length === 0
      && added.every((pitchClass) => {
        const durationCoverage = currentFragment.pitchClassDurationCoverage[pitchClass];
        const attackCount = currentFragment.pitchClassAttackCounts[pitchClass];
        return transientSupport.has(pitchClass)
          && Number.isFinite(durationCoverage)
          && durationCoverage > 0
          && durationCoverage <= maximumTransientAddedPcDurationCoverage
          && Number.isInteger(attackCount)
          && attackCount > 0
          && attackCount <= maximumTransientAddedPcAttacks;
      });
    if (!locallySupportedNonpersistentAddition) {
      states.push(current);
      continue;
    }
    mergedBoundaryBeats.add(current.startBeat);
    states[states.length - 1] = {
      startBeat: previous.startBeat,
      endBeat: current.endBeat,
      pitchClasses: current.pitchClasses,
      label: current.label,
    };
  }
    if (mergedBoundaryBeats.size === 0) return result;
    return {
      ...result,
      states,
      boundaries: result.boundaries.map((decision) => mergedBoundaryBeats.has(decision.beat) ? {
        ...decision,
        decision: "merge-same-state" as const,
        repeatedSupport: true,
        supportingEvidence: ["preceding-transient-bass", "low-duration-coverage", "single-attack"],
        reason: "local-transient-partial-voicing" as const,
      } : decision),
      fragments: reassignFragments(result.fragments, states),
    };
  } catch {
    return runP524ConsolidationPipeline(undefined).result;
  }
}

function reassignFragments(
  fragments: readonly P524FragmentEvidence[],
  states: P524ConsolidationResult["states"],
): readonly P524FragmentEvidence[] {
  let stateIndex = 0;
  return fragments.map((fragment) => {
    while (stateIndex + 1 < states.length
      && fragment.startBeat >= states[stateIndex + 1].startBeat) stateIndex += 1;
    return { ...fragment, assignedStateIndex: stateIndex };
  });
}


function difference(left: readonly number[], right: readonly number[]): readonly number[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}
