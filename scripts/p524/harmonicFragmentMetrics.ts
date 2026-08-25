import {
  countP524UnsupportedBassEvidence,
  type P524ExpectedBassState,
  P524ExpectedHarmonicState,
  P524SyntheticFixture,
} from "./harmonicFragmentFixtures";

export const p524BoundaryToleranceBeats = 0.25;

export interface P524PredictedHarmonicState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClasses: readonly number[];
  readonly label: string;
}

export interface P524PredictedBassState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClass: number;
  readonly transientPitchClasses?: readonly number[];
}

export interface P524FixtureMetrics {
  readonly fixtureId: P524SyntheticFixture["id"];
  readonly groundTruthStates: number;
  readonly detectedStates: number;
  readonly fragmentationRatio: number;
  readonly expectedChanges: number;
  readonly detectedChanges: number;
  readonly matchedChanges: number;
  readonly changePrecision: number;
  readonly changeRecall: number;
  readonly falseMergeRate: number;
  readonly overSegmentationRate: number;
  readonly prematureStableChanges: number;
  readonly matchedStateIdentities: number;
  readonly identityErrorRate: number;
  readonly bassLaneEquivalent: boolean;
  readonly bassLaneSafetyViolations: number;
}

export interface P524AggregateMetrics {
  readonly fixtureCount: number;
  readonly groundTruthStates: number;
  readonly detectedStates: number;
  readonly fragmentationRatio: number;
  readonly expectedChanges: number;
  readonly detectedChanges: number;
  readonly matchedChanges: number;
  readonly changePrecision: number;
  readonly changeRecall: number;
  readonly falseMergeRate: number;
  readonly overSegmentationRate: number;
  readonly prematureStableChanges: number;
  readonly matchedStateIdentities: number;
  readonly identityErrorRate: number;
  readonly bassLaneFailureFixtures: number;
  readonly bassLaneSafetyViolations: number;
}

const p524FixtureIds = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
const p524ExpectedStateCardinality: Readonly<Record<P524SyntheticFixture["id"], number>> = {
  A: 1,
  B: 1,
  C: 2,
  D: 2,
  E: 4,
  F: 2,
  G: 2,
  H: 1,
  I: 1,
  J: 2,
  K: 6,
};

export function evaluateP524Fixture(
  fixture: P524SyntheticFixture,
  predicted: readonly P524PredictedHarmonicState[],
  predictedBassStates: readonly P524PredictedBassState[],
  toleranceBeats = p524BoundaryToleranceBeats,
): P524FixtureMetrics {
  assertTolerance(toleranceBeats);
  assertPredictedTimeline(fixture, predicted);
  assertPredictedBassTimeline(fixture, predictedBassStates);
  const expectedBoundaries = boundariesOf(fixture.expectedStates);
  const predictedBoundaries = boundariesOf(predicted);
  const matchedChanges = countP524OneToOneBoundaryMatches(
    expectedBoundaries,
    predictedBoundaries,
    toleranceBeats,
  );
  const matchedStateIdentities = countSemanticStateMatches(
    fixture.expectedStates,
    predicted,
    toleranceBeats,
  );
  const bassLaneEquivalent = bassStatesEqual(fixture.expectedBassStates, predictedBassStates);
  const bassLaneSafetyViolations = countBassLaneSafetyViolations(fixture, predictedBassStates);
  return {
    fixtureId: fixture.id,
    groundTruthStates: fixture.expectedStates.length,
    detectedStates: predicted.length,
    fragmentationRatio: ratio(predicted.length, fixture.expectedStates.length),
    expectedChanges: expectedBoundaries.length,
    detectedChanges: predictedBoundaries.length,
    matchedChanges,
    changePrecision: precision(matchedChanges, predictedBoundaries.length, expectedBoundaries.length),
    changeRecall: recall(matchedChanges, expectedBoundaries.length),
    falseMergeRate: ratio(expectedBoundaries.length - matchedChanges, expectedBoundaries.length),
    overSegmentationRate: ratio(
      Math.max(0, predicted.length - fixture.expectedStates.length),
      fixture.expectedStates.length,
    ),
    prematureStableChanges: fixture.id === "J" && expectedBoundaries.length === 1
      ? predictedBoundaries.filter((boundary) => boundary < expectedBoundaries[0]).length
      : 0,
    matchedStateIdentities,
    identityErrorRate: ratio(fixture.expectedStates.length - matchedStateIdentities, fixture.expectedStates.length),
    bassLaneEquivalent,
    bassLaneSafetyViolations,
  };
}

export function aggregateP524Metrics(
  metrics: readonly P524FixtureMetrics[],
): P524AggregateMetrics {
  assertExactFixtureMetrics(metrics);
  const totals = metrics.reduce((value, entry) => ({
    fixtureCount: value.fixtureCount + 1,
    groundTruthStates: value.groundTruthStates + entry.groundTruthStates,
    detectedStates: value.detectedStates + entry.detectedStates,
    expectedChanges: value.expectedChanges + entry.expectedChanges,
    detectedChanges: value.detectedChanges + entry.detectedChanges,
    matchedChanges: value.matchedChanges + entry.matchedChanges,
    prematureStableChanges: value.prematureStableChanges + entry.prematureStableChanges,
    matchedStateIdentities: value.matchedStateIdentities + entry.matchedStateIdentities,
    bassLaneFailureFixtures: value.bassLaneFailureFixtures + (entry.bassLaneEquivalent ? 0 : 1),
    bassLaneSafetyViolations: value.bassLaneSafetyViolations + entry.bassLaneSafetyViolations,
  }), {
    fixtureCount: 0,
    groundTruthStates: 0,
    detectedStates: 0,
    expectedChanges: 0,
    detectedChanges: 0,
    matchedChanges: 0,
    prematureStableChanges: 0,
    matchedStateIdentities: 0,
    bassLaneFailureFixtures: 0,
    bassLaneSafetyViolations: 0,
  });
  return {
    ...totals,
    fragmentationRatio: ratio(totals.detectedStates, totals.groundTruthStates),
    changePrecision: precision(totals.matchedChanges, totals.detectedChanges, totals.expectedChanges),
    changeRecall: recall(totals.matchedChanges, totals.expectedChanges),
    falseMergeRate: ratio(totals.expectedChanges - totals.matchedChanges, totals.expectedChanges),
    overSegmentationRate: ratio(
      Math.max(0, totals.detectedStates - totals.groundTruthStates),
      totals.groundTruthStates,
    ),
    identityErrorRate: ratio(
      totals.groundTruthStates - totals.matchedStateIdentities,
      totals.groundTruthStates,
    ),
  };
}

function boundariesOf(states: readonly Pick<P524ExpectedHarmonicState, "startBeat">[]): number[] {
  return states.slice(1).map((entry) => entry.startBeat);
}

export function countP524OneToOneBoundaryMatches(
  expected: readonly number[],
  predicted: readonly number[],
  tolerance: number,
): number {
  assertTolerance(tolerance);
  if (expected.some((boundary) => !Number.isFinite(boundary))
    || predicted.some((boundary) => !Number.isFinite(boundary))) {
    throw new Error("boundaries must be finite");
  }
  const sortedExpected = [...expected].sort((left, right) => left - right);
  const sortedPredicted = [...predicted].sort((left, right) => left - right);
  let expectedIndex = 0;
  let predictedIndex = 0;
  let matches = 0;
  while (expectedIndex < sortedExpected.length && predictedIndex < sortedPredicted.length) {
    const expectedBoundary = sortedExpected[expectedIndex];
    const predictedBoundary = sortedPredicted[predictedIndex];
    if (predictedBoundary < expectedBoundary - tolerance) {
      predictedIndex += 1;
    } else if (expectedBoundary < predictedBoundary - tolerance) {
      expectedIndex += 1;
    } else {
      matches += 1;
      expectedIndex += 1;
      predictedIndex += 1;
    }
  }
  return matches;
}

function assertExactFixtureMetrics(metrics: readonly P524FixtureMetrics[]): void {
  const ids = metrics.map((entry) => entry.fixtureId);
  if (metrics.length !== p524FixtureIds.length
    || new Set(ids).size !== p524FixtureIds.length
    || p524FixtureIds.some((id) => !ids.includes(id))) {
    throw new Error("metrics must contain the exact unique complete A-K fixture set");
  }
  metrics.forEach(assertValidFixtureMetrics);
}

function assertValidFixtureMetrics(entry: P524FixtureMetrics): void {
  const counts = [
    entry.groundTruthStates,
    entry.detectedStates,
    entry.expectedChanges,
    entry.detectedChanges,
    entry.matchedChanges,
    entry.prematureStableChanges,
    entry.matchedStateIdentities,
    entry.bassLaneSafetyViolations,
  ];
  const unitRates = [
    entry.changePrecision,
    entry.changeRecall,
    entry.falseMergeRate,
    entry.identityErrorRate,
  ];
  const nonnegativeRates = [entry.fragmentationRatio, entry.overSegmentationRate];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)
    || unitRates.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || nonnegativeRates.some((value) => !Number.isFinite(value) || value < 0)
    || entry.groundTruthStates !== p524ExpectedStateCardinality[entry.fixtureId]
    || entry.expectedChanges !== p524ExpectedStateCardinality[entry.fixtureId] - 1
    || entry.expectedChanges !== entry.groundTruthStates - 1
    || entry.detectedChanges !== Math.max(0, entry.detectedStates - 1)
    || entry.matchedChanges > entry.expectedChanges
    || entry.matchedChanges > entry.detectedChanges
    || entry.matchedStateIdentities > entry.groundTruthStates
    || entry.matchedStateIdentities > entry.detectedStates
    || typeof entry.bassLaneEquivalent !== "boolean"
    || entry.fragmentationRatio !== ratio(entry.detectedStates, entry.groundTruthStates)
    || entry.changePrecision !== precision(entry.matchedChanges, entry.detectedChanges, entry.expectedChanges)
    || entry.changeRecall !== recall(entry.matchedChanges, entry.expectedChanges)
    || entry.falseMergeRate !== ratio(entry.expectedChanges - entry.matchedChanges, entry.expectedChanges)
    || entry.overSegmentationRate !== ratio(
      Math.max(0, entry.detectedStates - entry.groundTruthStates),
      entry.groundTruthStates,
    )
    || entry.identityErrorRate !== ratio(
      entry.groundTruthStates - entry.matchedStateIdentities,
      entry.groundTruthStates,
    )
    || (entry.fixtureId !== "J" && entry.prematureStableChanges !== 0)
    || entry.prematureStableChanges > entry.detectedChanges) {
    throw new Error(`fixture ${entry.fixtureId} contains invalid metrics`);
  }
}

function countSemanticStateMatches(
  expected: readonly P524ExpectedHarmonicState[],
  predicted: readonly P524PredictedHarmonicState[],
  tolerance: number,
): number {
  let expectedIndex = 0;
  let predictedIndex = 0;
  let matches = 0;
  while (expectedIndex < expected.length && predictedIndex < predicted.length) {
    const expectedState = expected[expectedIndex];
    const predictedState = predicted[predictedIndex];
    const timingAligned = Math.abs(expectedState.startBeat - predictedState.startBeat) <= tolerance
      && Math.abs(expectedState.endBeat - predictedState.endBeat) <= tolerance;
    if (timingAligned) {
      if (stateIdentityEqual(expectedState, predictedState)) matches += 1;
      expectedIndex += 1;
      predictedIndex += 1;
    } else if (predictedState.endBeat < expectedState.endBeat - tolerance) {
      predictedIndex += 1;
    } else {
      expectedIndex += 1;
    }
  }
  return matches;
}

function stateIdentityEqual(
  expected: Pick<P524ExpectedHarmonicState, "label" | "pitchClasses">,
  predicted: Pick<P524PredictedHarmonicState, "label" | "pitchClasses">,
): boolean {
  return expected.label === predicted.label
    && pitchClassesEqual(expected.pitchClasses, predicted.pitchClasses);
}

function pitchClassesEqual(left: readonly number[], right: readonly number[]): boolean {
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((pitchClass, index) => pitchClass === sortedRight[index]);
}

function bassStatesEqual(
  expected: readonly P524ExpectedBassState[],
  predicted: readonly P524PredictedBassState[],
): boolean {
  return expected.length === predicted.length && expected.every((state, index) => {
    const candidate = predicted[index];
    return candidate !== undefined
      && state.startBeat === candidate.startBeat
      && state.endBeat === candidate.endBeat
      && state.pitchClass === candidate.pitchClass
      && pitchClassesEqual(state.transientPitchClasses ?? [], candidate.transientPitchClasses ?? []);
  });
}

function countBassLaneSafetyViolations(
  fixture: P524SyntheticFixture,
  predicted: readonly P524PredictedBassState[],
): number {
  return countP524UnsupportedBassEvidence(fixture.notes, predicted);
}

function assertPredictedTimeline(
  fixture: P524SyntheticFixture,
  predicted: readonly P524PredictedHarmonicState[],
): void {
  if (predicted.length === 0) return;
  predicted.forEach((entry, index) => {
    const pitchClassesValid = entry.pitchClasses.length > 0
      && new Set(entry.pitchClasses).size === entry.pitchClasses.length
      && entry.pitchClasses.every((pitchClass) => Number.isInteger(pitchClass) && pitchClass >= 0 && pitchClass <= 11);
    if (!entry.label.trim() || !pitchClassesValid
      || !Number.isFinite(entry.startBeat) || !Number.isFinite(entry.endBeat)
      || entry.startBeat < 0 || entry.endBeat <= entry.startBeat
      || (index === 0 ? entry.startBeat !== 0 : entry.startBeat !== predicted[index - 1].endBeat)) {
      throw new Error("predicted harmonic states must have valid identity and form a finite contiguous timeline");
    }
  });
  if (predicted.at(-1)?.endBeat !== fixture.totalBeats) {
    throw new Error("predicted harmonic states must cover the fixture");
  }
}

function assertPredictedBassTimeline(
  fixture: P524SyntheticFixture,
  predicted: readonly P524PredictedBassState[],
): void {
  if (!Array.isArray(predicted) || predicted.length === 0) {
    throw new Error("an explicit Bass Lane result is required");
  }
  predicted.forEach((entry: P524PredictedBassState, index: number) => {
    const transientPitchClasses = entry.transientPitchClasses ?? [];
    if (!Number.isFinite(entry.startBeat) || !Number.isFinite(entry.endBeat)
      || entry.startBeat < 0 || entry.endBeat <= entry.startBeat
      || (index === 0 ? entry.startBeat !== 0 : entry.startBeat !== predicted[index - 1].endBeat)
      || !Number.isInteger(entry.pitchClass) || entry.pitchClass < 0 || entry.pitchClass > 11
      || new Set(transientPitchClasses).size !== transientPitchClasses.length
      || transientPitchClasses.some((pitchClass) => (
        !Number.isInteger(pitchClass) || pitchClass < 0 || pitchClass > 11 || pitchClass === entry.pitchClass
      ))) {
      throw new Error("predicted Bass Lane states are corrupt or not a finite contiguous timeline");
    }
  });
  if (predicted.at(-1)?.endBeat !== fixture.totalBeats) {
    throw new Error("predicted Bass Lane states must cover the fixture");
  }
}

function assertTolerance(tolerance: number): void {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("boundary tolerance must be finite and nonnegative");
  }
}

function precision(matches: number, predicted: number, expected: number): number {
  if (predicted === 0) return expected === 0 ? 1 : 0;
  return matches / predicted;
}

function recall(matches: number, expected: number): number {
  return expected === 0 ? 1 : matches / expected;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
