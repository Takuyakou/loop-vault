import type { Representability } from "../../src/domain/midi/evaluation/metricsV2";
import type { Phase515ContractCase } from "./corpusContract";

export interface ComparisonEligibility {
  exactEventMetricEligible: boolean;
  identityMetricEligible: boolean;
  slashMetricEligible: boolean;
  timingMetricEligible: boolean;
  boundaryMetricEligible: boolean;
  identityRule:
    | "exact-event"
    | "canonical-overlap"
    | "probe-beat"
    | "invariant-deep-equal"
    | "excluded";
}

/**
 * Frozen Phase 5.15 denominator/exclusion rules. N.C. is evaluated by the
 * boundary/silence contract and never inflates chord identity metrics.
 */
export function comparisonEligibility(
  mode: Phase515ContractCase["comparisonMode"],
  representability: Representability,
  expectedHasSlashBass: boolean,
): ComparisonEligibility {
  const noChord = representability === "no-chord";
  const unsupportedForAwareMode = mode === "representability-aware"
    && representability !== "representable";
  const boundaryOnly = mode === "boundary-only";
  const identityMetricEligible = !noChord && !unsupportedForAwareMode && !boundaryOnly;
  return {
    exactEventMetricEligible:
      identityMetricEligible
      && mode === "exact-event"
      && representability === "representable",
    identityMetricEligible,
    slashMetricEligible: identityMetricEligible && expectedHasSlashBass,
    timingMetricEligible: identityMetricEligible && mode === "exact-event",
    boundaryMetricEligible:
      mode === "exact-event"
      || mode === "boundary-only"
      || mode === "canonical-identity"
      || mode === "representability-aware",
    identityRule: !identityMetricEligible
      ? "excluded"
      : mode === "exact-event"
        ? "exact-event"
        : mode === "probe-beat"
          ? "probe-beat"
          : mode === "invariant-deep-equal"
            ? "invariant-deep-equal"
            : "canonical-overlap",
  };
}

export function comparisonPass(
  policy: ComparisonEligibility,
  canonicalExact: boolean,
  timingExact: boolean,
): boolean | null {
  // Boundary-only and invariant cases are decided once at case/group level.
  // Emitting a per-event false for them incorrectly turns "not applicable"
  // into a failed identity comparison.
  if (
    !policy.identityMetricEligible
    || policy.identityRule === "invariant-deep-equal"
  ) return null;
  return canonicalExact && (
    policy.identityRule !== "exact-event" || timingExact
  );
}

export function exactEventPass(
  policy: ComparisonEligibility,
  canonicalExact: boolean,
  timingExact: boolean,
): boolean {
  return policy.exactEventMetricEligible && canonicalExact && timingExact;
}

export function noChordComparisonPass(silent: boolean): boolean {
  return silent;
}

export function boundaryMetrics(
  expected: readonly { startBeat: number; endBeat?: number }[],
  actual: readonly { startBeat: number; endBeat?: number }[],
  tolerance: number,
) {
  const expectedOnsets = transitionBoundaries(expected);
  const actualOnsets = transitionBoundaries(actual);
  // Sorted one-to-one greedy matching is maximum-cardinality for a scalar
  // tolerance interval. One detected onset can therefore never count twice.
  let expectedIndex = 0;
  let actualIndex = 0;
  let truePositive = 0;
  while (
    expectedIndex < expectedOnsets.length
    && actualIndex < actualOnsets.length
  ) {
    const expectedOnset = expectedOnsets[expectedIndex]!;
    const actualOnset = actualOnsets[actualIndex]!;
    if (Math.abs(expectedOnset - actualOnset) <= tolerance) {
      truePositive += 1;
      expectedIndex += 1;
      actualIndex += 1;
    } else if (actualOnset < expectedOnset - tolerance) {
      actualIndex += 1;
    } else {
      expectedIndex += 1;
    }
  }
  const precision = actualOnsets.length === 0
    ? Number(expectedOnsets.length === 0)
    : truePositive / actualOnsets.length;
  const recall = expectedOnsets.length === 0
    ? Number(actualOnsets.length === 0)
    : truePositive / expectedOnsets.length;
  return {
    expected: expectedOnsets.length,
    actual: actualOnsets.length,
    truePositive,
    precision: rounded(precision),
    recall: rounded(recall),
    f1: precision + recall === 0
      ? 0
      : rounded(2 * precision * recall / (precision + recall)),
  };
}

/**
 * A boundary is any non-origin segment onset plus a non-terminal segment end
 * which is followed by silence. Including isolated ends is what represents an
 * ideal N.C. gap: chord-off and chord-on are two real transitions even though
 * the analyzer emits no synthetic chord row for the silence itself.
 */
function transitionBoundaries(
  ranges: readonly { startBeat: number; endBeat?: number }[],
): number[] {
  const boundaries = new Set(
    ranges.map((item) => item.startBeat).filter((beat) => beat !== 0),
  );
  const ends = ranges.flatMap((item) =>
    item.endBeat === undefined ? [] : [item.endBeat]);
  const terminalEnd = ends.length === 0 ? undefined : Math.max(...ends);
  for (const end of ends) {
    if (end !== terminalEnd) boundaries.add(end);
  }
  return [...boundaries].sort((left, right) => left - right);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
