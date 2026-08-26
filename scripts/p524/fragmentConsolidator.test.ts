import { describe, expect, it } from "vitest";
import {
  aggregateP524Metrics,
  evaluateP524Fixture,
} from "./harmonicFragmentMetrics";
import { generateP524SyntheticFixtures } from "./harmonicFragmentFixtures";
import {
  consolidateP524PerformanceFragments,
  type P524ConsolidationResult,
} from "./fragmentConsolidator";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  toP524ShadowNotes,
  type P524ShadowInput,
} from "./shadowEvidence";

const fixtures = generateP524SyntheticFixtures();

function inputFor(fixture: (typeof fixtures)[number]): P524ShadowInput {
  return {
    notes: toP524ShadowNotes(fixture.notes),
    meter: fixture.meter,
    totalBeats: fixture.totalBeats,
  };
}

function supported(result: P524ConsolidationResult): Exclude<P524ConsolidationResult, { status: "unavailable" }> {
  expect(result.status).not.toBe("unavailable");
  if (result.status === "unavailable") throw new Error("shadow consolidator was unavailable");
  return result;
}

describe("P5.24-02 exact A-K shadow consolidation", () => {
  it("produces exact semantic states, Bass evidence, and locked aggregate metrics", () => {
    const metrics = fixtures.map((fixture) => {
      const input = inputFor(fixture);
      const bassLane = estimateP524BassLane(input);
      const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
      const result = supported(consolidateP524PerformanceFragments(input, { bassLane, harmonicRhythm }));
      expect(result.states).toEqual(fixture.expectedStates);
      expect(result.harmonicRhythm).toBe(fixture.expectedHarmonicRhythm);
      expect(result.legacyFallback).toBe(fixture.expectLegacyFallback);
      expect(result.operations.inputNotes).toBe(fixture.notes.length);
      expect(result.operations.noteIntervalSearches).toBeLessThanOrEqual(fixture.notes.length * 2);
      expect(result.operations.profileSweepCells).toBe(result.fragments.length * 12);
      return evaluateP524Fixture(fixture, result.states, bassLane.states);
    });
    expect(metrics.map((entry) => ({
      id: entry.fixtureId,
      states: entry.detectedStates,
      fragmentation: entry.fragmentationRatio,
      precision: entry.changePrecision,
      recall: entry.changeRecall,
      falseMerge: entry.falseMergeRate,
      overSegmentation: entry.overSegmentationRate,
      identityError: entry.identityErrorRate,
      bassEquivalent: entry.bassLaneEquivalent,
      bassSafety: entry.bassLaneSafetyViolations,
    }))).toEqual(fixtures.map((fixture) => ({
      id: fixture.id,
      states: fixture.expectedStates.length,
      fragmentation: 1,
      precision: 1,
      recall: 1,
      falseMerge: 0,
      overSegmentation: 0,
      identityError: 0,
      bassEquivalent: true,
      bassSafety: 0,
    })));
    expect(aggregateP524Metrics(metrics)).toEqual({
      fixtureCount: 11,
      groundTruthStates: 24,
      detectedStates: 24,
      expectedChanges: 13,
      detectedChanges: 13,
      matchedChanges: 13,
      prematureStableChanges: 0,
      matchedStateIdentities: 24,
      bassLaneFailureFixtures: 0,
      bassLaneSafetyViolations: 0,
      fragmentationRatio: 1,
      changePrecision: 1,
      changeRecall: 1,
      falseMergeRate: 0,
      overSegmentationRate: 0,
      identityErrorRate: 0,
    });
  });

  it("consolidates A/B/F/H/I while retaining C/D/E/G/J and fail-closing K", () => {
    const byId = new Map(fixtures.map((fixture) => [
      fixture.id,
      supported(consolidateP524PerformanceFragments(inputFor(fixture))),
    ]));
    for (const id of ["A", "B", "F", "H", "I"] as const) {
      expect(byId.get(id)?.states).toEqual(fixtures.find((fixture) => fixture.id === id)?.expectedStates);
    }
    expect(byId.get("C")?.boundaries[0]).toMatchObject({
      beat: 4,
      decision: "split-strong-change",
      pcSubsetOrSupersetSupport: true,
      persistentBassTransition: true,
      persistentNewPitchClasses: [9],
    });
    expect(byId.get("D")?.boundaries[0]).toMatchObject({
      beat: 4,
      decision: "split-strong-change",
      pcSubsetOrSupersetSupport: true,
      persistentNewPitchClasses: [11],
    });
    expect(byId.get("J")?.states.map((state) => state.startBeat)).toEqual([0, 4]);
    expect(byId.get("K")).toMatchObject({ status: "legacy-fallback", harmonicRhythm: "unknown", legacyFallback: true });
  });

  it("does not form a stable state for transient tension flutter", () => {
    const fixture = fixtures.find((entry) => entry.id === "A");
    if (!fixture) throw new Error("fixture A missing");
    const result = supported(consolidateP524PerformanceFragments(inputFor(fixture)));
    expect(result.states).toEqual([{ startBeat: 0, endBeat: 8, pitchClasses: [0, 4, 7], label: "C" }]);
    expect(result.fragments[0].pitchClasses).not.toContain(11);
  });

  it("is deterministic, order-invariant, and leaves normalized notes unchanged", () => {
    fixtures.forEach((fixture) => {
      const input = inputFor(fixture);
      const before = structuredClone(input);
      const first = consolidateP524PerformanceFragments(input);
      const second = consolidateP524PerformanceFragments({ ...input, notes: [...input.notes].reverse() });
      expect(second).toEqual(first);
      expect(input).toEqual(before);
    });
  });

  it("is identical at the exact duration threshold across multiple note permutations", () => {
    const thresholdDurations = [0.1, 0.2, 0.2] as const;
    expect(thresholdDurations.reduce((total, duration) => total + duration, 0)).toBe(0.5);
    const thresholdNotes: P524ShadowInput["notes"] = [
      ...inputFor(fixtures[0]).notes,
      ...thresholdDurations.map((durationBeats, index) => ({
        id: `threshold-b-${index}`,
        pitch: 71,
        startBeat: 4,
        durationBeats,
        velocity: 1,
        rolePrior: "upper" as const,
      })),
    ];
    const permutations = [
      thresholdNotes,
      [...thresholdNotes].reverse(),
      [...thresholdNotes.slice(7), ...thresholdNotes.slice(0, 7)],
      [...thresholdNotes].sort((left, right) => right.id.localeCompare(left.id)),
    ];
    const results = permutations.map((notes) => {
      const input: P524ShadowInput = { notes, meter: [4, 4], totalBeats: 8 };
      const before = structuredClone(input);
      const result = consolidateP524PerformanceFragments(input);
      expect(input).toEqual(before);
      return result;
    });
    const first = supported(results[0]);
    expect(first.states).toEqual([
      { startBeat: 0, endBeat: 4, pitchClasses: [0, 4, 7], label: "C" },
      { startBeat: 4, endBeat: 5, pitchClasses: [0, 4, 7, 11], label: "Cmaj7" },
      { startBeat: 5, endBeat: 8, pitchClasses: [0, 4, 7], label: "C" },
    ]);
    expect(first.boundaries).toMatchObject([
      { beat: 4, decision: "split-strong-change", persistentNewPitchClasses: [11] },
      { beat: 5, decision: "split-strong-change", persistentRemovedPitchClasses: [11] },
    ]);
    results.slice(1).forEach((result) => {
      expect(result).toEqual(results[0]);
      expect(supported(result).states).toEqual(first.states);
      expect(supported(result).boundaries).toEqual(first.boundaries);
    });
  });
});

describe("P5.24-02 fail-closed shadow boundary", () => {
  it("rejects malformed input and corrupt supplied Stage01 evidence without throwing", () => {
    const input = inputFor(fixtures[0]);
    const bassLane = estimateP524BassLane(input);
    const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
    const malformed = [
      null,
      {},
      { ...input, meter: [3, 4] },
      { ...input, notes: [{ ...input.notes[0], durationBeats: Number.NaN }] },
      { ...input, notes: [input.notes[0], input.notes[0]] },
    ];
    malformed.forEach((value) => {
      expect(() => consolidateP524PerformanceFragments(value)).not.toThrow();
      expect(consolidateP524PerformanceFragments(value)).toMatchObject({ status: "unavailable", legacyFallback: true });
    });
    expect(consolidateP524PerformanceFragments(input, {
      bassLane,
      harmonicRhythm: { ...harmonicRhythm, structuralBoundaries: [2] },
    })).toMatchObject({ status: "unavailable", reason: "invalid-shadow-evidence" });
  });

  it("rejects sparse arrays", () => {
    const input = inputFor(fixtures[0]);
    const sparse = new Array(input.notes.length);
    for (let index = 1; index < input.notes.length; index += 1) sparse[index] = input.notes[index];
    expect(consolidateP524PerformanceFragments({ ...input, notes: sparse })).toMatchObject({
      status: "unavailable",
      reason: "invalid-input",
    });
  });

  it("catches hostile top-level and note getters across the complete public wrapper", () => {
    const hostileTop = new Proxy({}, {
      get: () => { throw new Error("hostile top-level getter"); },
    });
    expect(() => consolidateP524PerformanceFragments(hostileTop)).not.toThrow();
    expect(consolidateP524PerformanceFragments(hostileTop)).toMatchObject({
      status: "unavailable", reason: "invalid-input",
    });

    const input = inputFor(fixtures[0]);
    const hostileNote = new Proxy(input.notes[0], {
      get: (_target, property, receiver) => property === "pitch"
        ? (() => { throw new Error("hostile note getter"); })()
        : Reflect.get(_target, property, receiver),
    });
    expect(() => consolidateP524PerformanceFragments({ ...input, notes: [hostileNote, ...input.notes.slice(1)] })).not.toThrow();
    expect(consolidateP524PerformanceFragments({ ...input, notes: [hostileNote, ...input.notes.slice(1)] }))
      .toMatchObject({ status: "unavailable", reason: "invalid-input" });
  });
});
