import { describe, expect, it } from "vitest";
import {
  countP524UnsupportedBassEvidence,
  generateP524DenseBenchmarkNotes,
  generateP524SyntheticFixtures,
  validateP524SyntheticFixtures,
} from "./harmonicFragmentFixtures";
import {
  aggregateP524Metrics,
  countP524OneToOneBoundaryMatches,
  evaluateP524Fixture,
  p524BoundaryToleranceBeats,
} from "./harmonicFragmentMetrics";
import {
  decideP524Promotion,
  p524BenchmarkExpectedNoteCount,
  p524BenchmarkProvenance,
  p524FeatureFlagDefault,
  p524FeatureFlagName,
  p524OfficialBaseline,
  p524PromotionThresholds,
  type P524PromotionInput,
} from "./promotionContract";

const measuredBenchmark = {
  medianRatio: 1,
  maximumSampleMs: 1,
  timedOut: false,
  measured: true,
  warmupCount: 3,
  sampleCount: 7,
  warmupDurationsMs: [1, 1, 1],
  sampleDurationsMs: [1, 1, 1, 1, 1, 1, 1],
  sampleRatios: [1, 1, 1, 1, 1, 1, 1],
  timeoutMs: 10_000,
  timeoutEnforced: true,
  provenance: p524BenchmarkProvenance,
  sourceFixture: "E",
  repetitions: 128,
  noteCount: p524BenchmarkExpectedNoteCount,
} as const;

const predictedState = (
  startBeat: number,
  endBeat: number,
  label: string,
  pitchClasses: readonly number[],
) => ({ startBeat, endBeat, label, pitchClasses });

describe("P5.24 Stage00 synthetic A-K ground truth", () => {
  it("generates deterministic complete 4/4 fixtures without raw MIDI", () => {
    const first = generateP524SyntheticFixtures();
    const second = generateP524SyntheticFixtures();
    expect(first).toEqual(second);
    expect(first.map((fixture) => fixture.id)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
    expect(first.every((fixture) => fixture.meter[0] === 4 && fixture.meter[1] === 4)).toBe(true);
    expect(first.every((fixture) => fixture.notes.length > 0 && fixture.expectedStates.length > 0)).toBe(true);
    const noteIds = first.flatMap((fixture) => fixture.notes.map((note) => note.id));
    expect(new Set(noteIds).size).toBe(noteIds.length);
  });

  it("locks subset changes, pedal/texture separation, inversion identity, anticipation, and mixed fallback", () => {
    const fixtures = new Map(generateP524SyntheticFixtures().map((fixture) => [fixture.id, fixture]));
    expect(fixtures.get("C")?.expectedStates.map((entry) => entry.label)).toEqual(["C", "Am7"]);
    expect(fixtures.get("D")?.expectedStates.map((entry) => entry.label)).toEqual(["C", "Cmaj7"]);
    expect(fixtures.get("B")?.expectedBassStates[0]?.transientPitchClasses).toEqual([2]);
    expect(fixtures.get("G")?.expectedBassStates).toHaveLength(1);
    expect(fixtures.get("G")?.expectedStates).toHaveLength(2);
    expect(fixtures.get("I")?.expectedBassStates).toHaveLength(2);
    expect(fixtures.get("I")?.expectedStates).toHaveLength(1);
    expect(fixtures.get("J")?.expectedStates[1]?.startBeat).toBe(4);
    expect(fixtures.get("J")?.notes.some((note) => note.startBeat === 3.75)).toBe(true);
    expect(fixtures.get("A")?.transientTensionBeats).toEqual([3.5]);
    expect(fixtures.get("A")?.notes.some((note) => note.pitch === 59 && note.durationBeats === 0.125)).toBe(true);
    expect(fixtures.get("K")?.expectedHarmonicRhythm).toBe("unknown");
    expect(fixtures.get("K")?.expectLegacyFallback).toBe(true);
  });

  it("rejects pitch-class and harmonic-identity corruption", () => {
    const fixtures = generateP524SyntheticFixtures();
    const corruptPitchClass = fixtures.map((fixture) => fixture.id !== "I" ? fixture : ({
      ...fixture,
      expectedStates: [{ ...fixture.expectedStates[0], pitchClasses: [0, 4, 12] }],
    }));
    expect(() => validateP524SyntheticFixtures(corruptPitchClass)).toThrow("corrupt pitch classes");

    const corruptIdentity = fixtures.map((fixture) => fixture.id !== "I" ? fixture : ({
      ...fixture,
      expectedStates: [{ ...fixture.expectedStates[0], pitchClasses: [0, 4, 8] }],
    }));
    expect(() => validateP524SyntheticFixtures(corruptIdentity)).toThrow("inconsistent pitch classes");

    const corruptBassPitchClass = fixtures.map((fixture) => fixture.id !== "I" ? fixture : ({
      ...fixture,
      expectedBassStates: [
        { ...fixture.expectedBassStates[0], pitchClass: 12 },
        fixture.expectedBassStates[1],
      ],
    }));
    expect(() => validateP524SyntheticFixtures(corruptBassPitchClass)).toThrow("Bass Lane states are corrupt");

    const missingBassCoverage = fixtures.map((fixture) => fixture.id !== "I" ? fixture : ({
      ...fixture,
      expectedBassStates: [fixture.expectedBassStates[0]],
    }));
    expect(() => validateP524SyntheticFixtures(missingBassCoverage)).toThrow("do not cover");

    const unsupportedBassIdentity = fixtures.map((fixture) => fixture.id !== "G" ? fixture : ({
      ...fixture,
      expectedBassStates: [{ ...fixture.expectedBassStates[0], pitchClass: 1 }],
    }));
    expect(() => validateP524SyntheticFixtures(unsupportedBassIdentity)).toThrow("no related stable/transient bass-note evidence");
  });

  it("indexes unbounded Bass evidence without state-by-note nested scans", () => {
    const size = 20_000;
    const states = Array.from({ length: size }, (_, index) => ({
      startBeat: index,
      endBeat: index + 1,
      pitchClass: index % 12,
    }));
    const notes = Array.from({ length: size }, (_, index) => ({
      pitch: 36 + index % 12,
      startBeat: index,
      durationBeats: 1,
      expectedLane: "bass" as const,
    })).reverse();
    expect(countP524UnsupportedBassEvidence(notes, states)).toBe(0);
    expect(countP524UnsupportedBassEvidence(notes, [...states].reverse())).toBe(0);
    expect(countP524UnsupportedBassEvidence(notes.slice(1), states)).toBe(1);
  });

  it("generates a bounded deterministic dense benchmark fixture", () => {
    expect(generateP524DenseBenchmarkNotes(2)).toEqual(generateP524DenseBenchmarkNotes(2));
    expect(generateP524DenseBenchmarkNotes(128)).toHaveLength(p524BenchmarkExpectedNoteCount);
    expect(() => generateP524DenseBenchmarkNotes(0)).toThrow("repetitions");
    expect(() => generateP524DenseBenchmarkNotes(257)).toThrow("repetitions");
  });
});

describe("P5.24 Stage00 metric and promotion contract", () => {
  it("reuses the official 0.25 beat boundary tolerance with one-to-one matching", () => {
    const fixture = generateP524SyntheticFixtures().find((entry) => entry.id === "C");
    if (!fixture) throw new Error("fixture C missing");
    expect(p524BoundaryToleranceBeats).toBe(0.25);
    expect(evaluateP524Fixture(fixture, [
      predictedState(0, 4.25, "C", [0, 4, 7]),
      predictedState(4.25, 8, "Am7", [0, 4, 7, 9]),
    ], fixture.expectedBassStates)).toMatchObject({ matchedChanges: 1, changePrecision: 1, changeRecall: 1, falseMergeRate: 0 });
    expect(evaluateP524Fixture(fixture, [
      predictedState(0, 3.74, "C", [0, 4, 7]),
      predictedState(3.74, 8, "Am7", [0, 4, 7, 9]),
    ], fixture.expectedBassStates)).toMatchObject({ matchedChanges: 0, changePrecision: 0, changeRecall: 0, falseMergeRate: 1 });
  });

  it("scores C-Am7, C-Cmaj7, and inversion I by canonical semantic identity", () => {
    const fixtures = new Map(generateP524SyntheticFixtures().map((fixture) => [fixture.id, fixture]));
    for (const id of ["C", "D"] as const) {
      const fixture = fixtures.get(id);
      if (!fixture) throw new Error(`fixture ${id} missing`);
      const corrupted = fixture.expectedStates.map((state, index) => index === 0 ? state : ({
        ...state,
        label: fixture.expectedStates[0].label,
        pitchClasses: fixture.expectedStates[0].pitchClasses,
      }));
      expect(evaluateP524Fixture(
        fixture,
        corrupted,
        fixture.expectedBassStates,
      )).toMatchObject({ matchedChanges: 1, matchedStateIdentities: 1, identityErrorRate: 0.5 });
    }

    const inversion = fixtures.get("I");
    if (!inversion) throw new Error("fixture I missing");
    expect(evaluateP524Fixture(
      inversion,
      inversion.expectedStates,
      inversion.expectedBassStates,
    )).toMatchObject({ matchedStateIdentities: 1, identityErrorRate: 0 });
    expect(evaluateP524Fixture(
      inversion,
      [{ ...inversion.expectedStates[0], label: "C/E" }],
      inversion.expectedBassStates,
    )).toMatchObject({ matchedStateIdentities: 0, identityErrorRate: 1 });
  });

  it("uses maximum-cardinality sorted matching and protects J from premature stabilization", () => {
    expect(countP524OneToOneBoundaryMatches([1, 1.2], [0.9, 1.05], 0.16)).toBe(2);
    const fixtureJ = generateP524SyntheticFixtures().find((entry) => entry.id === "J");
    if (!fixtureJ) throw new Error("fixture J missing");
    expect(evaluateP524Fixture(fixtureJ, [
      predictedState(0, 3.75, "G", [2, 7, 11]),
      predictedState(3.75, 8, "C", [0, 4, 7]),
    ], fixtureJ.expectedBassStates)).toMatchObject({ matchedChanges: 1, prematureStableChanges: 1 });
    expect(() => countP524OneToOneBoundaryMatches([Number.NaN], [1], 0.25)).toThrow("finite");
  });

  it("treats transient-tension flutter on an empty-expected-change fixture as over-segmentation", () => {
    const fixtureA = generateP524SyntheticFixtures().find((entry) => entry.id === "A");
    if (!fixtureA) throw new Error("fixture A missing");
    expect(evaluateP524Fixture(fixtureA, [
      predictedState(0, 3.5, "C", [0, 4, 7]),
      predictedState(3.5, 8, "C", [0, 4, 7]),
    ], fixtureA.expectedBassStates)).toMatchObject({
      expectedChanges: 0,
      detectedChanges: 1,
      changePrecision: 0,
      changeRecall: 1,
      falseMergeRate: 0,
      overSegmentationRate: 1,
    });
    expect(() => evaluateP524Fixture(fixtureA, [
      predictedState(0, Number.POSITIVE_INFINITY, "C", [0, 4, 7]),
    ], fixtureA.expectedBassStates)).toThrow("finite contiguous");
  });

  it("locks the metric definitions against perfect ground truth", () => {
    const fixtureMetrics = generateP524SyntheticFixtures().map((fixture) => evaluateP524Fixture(
      fixture,
      fixture.expectedStates,
      fixture.expectedBassStates,
    ));
    const aggregate = aggregateP524Metrics(fixtureMetrics);
    expect(aggregate.fragmentationRatio).toBe(1);
    expect(aggregate.changePrecision).toBe(1);
    expect(aggregate.changeRecall).toBe(1);
    expect(aggregate.falseMergeRate).toBe(0);
    expect(aggregate.overSegmentationRate).toBe(0);
  });

  it("locks a default-OFF flag and fails promotion on any hard false merge", () => {
    expect(p524FeatureFlagName).toBe("enableHarmonicStateConsolidation");
    expect(p524FeatureFlagDefault).toBe(false);
    expect(p524PromotionThresholds.maximumFalseMergeRate).toBe(0);
    const fixtures = generateP524SyntheticFixtures();
    const perfect = fixtures.map((fixture) => evaluateP524Fixture(fixture, fixture.expectedStates, fixture.expectedBassStates));
    const perfectInput = {
      aggregate: aggregateP524Metrics(perfect),
      fixtures: perfect,
      harmonicRhythmByFixture: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.expectedHarmonicRhythm])),
      legacyFallbackFixtures: ["K"],
      deterministic: true,
      rawMidiUnchanged: true,
      productionOutputsUnchanged: true,
      officialCandidate: p524OfficialBaseline,
      benchmark: measuredBenchmark,
    } as const;
    expect(decideP524Promotion(perfectInput)).toEqual({ status: "pass-to-integration", reasons: [] });

    for (const id of ["C", "D", "I"] as const) {
      const fixture = fixtures.find((entry) => entry.id === id);
      if (!fixture) throw new Error(`fixture ${id} missing`);
      const corruptedStates = fixture.expectedStates.map((state, index) => (
        id === "I" || index > 0
          ? { ...state, label: id === "I" ? "C/E" : fixture.expectedStates[0].label }
          : state
      ));
      const corrupted = evaluateP524Fixture(fixture, corruptedStates, fixture.expectedBassStates);
      const semanticFailure = perfect.map((entry) => entry.fixtureId === id ? corrupted : entry);
      expect(decideP524Promotion({
        ...perfectInput,
        aggregate: aggregateP524Metrics(semanticFailure),
        fixtures: semanticFailure,
      }).reasons).toContain(`semantic fixture ${id} has corrupted harmonic identity`);
    }

    const fixtureI = fixtures.find((entry) => entry.id === "I");
    if (!fixtureI) throw new Error("fixture I missing");
    const unsafeBass = evaluateP524Fixture(
      fixtureI,
      fixtureI.expectedStates,
      [
        fixtureI.expectedBassStates[0],
        { ...fixtureI.expectedBassStates[1], pitchClass: 0 },
      ],
    );
    const bassFailure = perfect.map((entry) => entry.fixtureId === "I" ? unsafeBass : entry);
    const bassDecision = decideP524Promotion({
      ...perfectInput,
      aggregate: aggregateP524Metrics(bassFailure),
      fixtures: bassFailure,
    });
    expect(bassDecision.reasons).toContain("Bass Lane result is not equivalent across exact A-K");
    expect(bassDecision.reasons).toContain("Bass Lane safety evidence contains unsupported stable states");
    expect(() => evaluateP524Fixture(
      fixtureI,
      fixtureI.expectedStates,
      undefined as unknown as typeof fixtureI.expectedBassStates,
    )).toThrow("explicit Bass Lane result");

    const fixtureA = fixtures.find((fixture) => fixture.id === "A");
    if (!fixtureA) throw new Error("fixture A missing");
    const flutterA = evaluateP524Fixture(fixtureA, [
      predictedState(0, 3.5, "C", [0, 4, 7]),
      predictedState(3.5, 8, "C", [0, 4, 7]),
    ], fixtureA.expectedBassStates);
    const fluttering = perfect.map((entry) => entry.fixtureId === "A" ? flutterA : entry);
    expect(decideP524Promotion({
      ...perfectInput,
      aggregate: aggregateP524Metrics(fluttering),
      fixtures: fluttering,
    }).reasons).toContain("product fixture A remains over-segmented");

    const fixtureC = fixtures.find((fixture) => fixture.id === "C");
    if (!fixtureC) throw new Error("fixture C missing");
    const falseMerge = evaluateP524Fixture(fixtureC, [predictedState(0, 8, "C", [0, 4, 7])], fixtureC.expectedBassStates);
    const failing = perfect.map((entry) => entry.fixtureId === "C" ? falseMerge : entry);
    const decision = decideP524Promotion({
      ...perfectInput,
      aggregate: aggregateP524Metrics(failing),
      fixtures: failing,
    });
    expect(decision.status).toBe("fail-stop-promotion");
    expect(decision.reasons).toContain("hard fixture C lost a true change");

    const fixtureJ = fixtures.find((fixture) => fixture.id === "J");
    if (!fixtureJ) throw new Error("fixture J missing");
    const prematureJ = evaluateP524Fixture(fixtureJ, [
      predictedState(0, 3.75, "G", [2, 7, 11]),
      predictedState(3.75, 8, "C", [0, 4, 7]),
    ], fixtureJ.expectedBassStates);
    const premature = perfect.map((entry) => entry.fixtureId === "J" ? prematureJ : entry);
    expect(decideP524Promotion({
      ...perfectInput,
      aggregate: aggregateP524Metrics(premature),
      fixtures: premature,
    }).reasons).toContain("hard fixture J stabilized before the ground-truth boundary");
  });

  it("requires exact safe A-K Harmonic Rhythm evidence and only K legacy fallback", () => {
    const fixtures = generateP524SyntheticFixtures();
    const metrics = fixtures.map((fixture) => evaluateP524Fixture(
      fixture,
      fixture.expectedStates,
      fixture.expectedBassStates,
    ));
    const validInput = {
      aggregate: aggregateP524Metrics(metrics),
      fixtures: metrics,
      harmonicRhythmByFixture: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.expectedHarmonicRhythm])),
      legacyFallbackFixtures: ["K"],
      deterministic: true,
      rawMidiUnchanged: true,
      productionOutputsUnchanged: true,
      officialCandidate: p524OfficialBaseline,
      benchmark: measuredBenchmark,
    } as const;
    const missingA = Object.fromEntries(
      Object.entries(validInput.harmonicRhythmByFixture).filter(([id]) => id !== "A"),
    );
    const allUnknown: Readonly<Record<string, "unknown">> = Object.fromEntries(
      fixtures.map((fixture) => [fixture.id, "unknown"]),
    );
    expect(decideP524Promotion({
      ...validInput,
      harmonicRhythmByFixture: missingA,
    }).reasons).toContain("Harmonic Rhythm evidence is not the exact safe A-K result");
    expect(decideP524Promotion({
      ...validInput,
      harmonicRhythmByFixture: allUnknown,
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      harmonicRhythmByFixture: { ...validInput.harmonicRhythmByFixture, E: 4 },
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      legacyFallbackFixtures: ["A", "K"],
    }).status).toBe("fail-stop-promotion");

    const decideCorruptRuntimeInput = (overrides: Record<string, unknown>) => decideP524Promotion({
      ...validInput,
      ...overrides,
    } as unknown as Parameters<typeof decideP524Promotion>[0]);
    for (const field of [
      "deterministic",
      "rawMidiUnchanged",
      "productionOutputsUnchanged",
    ] as const) {
      expect(decideCorruptRuntimeInput({ [field]: "true" }).status).toBe("fail-stop-promotion");
    }
    expect(decideCorruptRuntimeInput({
      harmonicRhythmByFixture: [],
    }).status).toBe("fail-stop-promotion");
    expect(decideCorruptRuntimeInput({ legacyFallbackFixtures: "K" }).status).toBe("fail-stop-promotion");
    expect(decideCorruptRuntimeInput({ legacyFallbackFixtures: [1] }).status).toBe("fail-stop-promotion");
    expect(decideCorruptRuntimeInput({ legacyFallbackFixtures: ["K", 1] }).status).toBe("fail-stop-promotion");
  });

  it("never throws for malformed or incomplete runtime promotion evidence", () => {
    const fixtures = generateP524SyntheticFixtures();
    const metrics = fixtures.map((fixture) => evaluateP524Fixture(
      fixture,
      fixture.expectedStates,
      fixture.expectedBassStates,
    ));
    const validInput = {
      aggregate: aggregateP524Metrics(metrics),
      fixtures: metrics,
      harmonicRhythmByFixture: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.expectedHarmonicRhythm])),
      legacyFallbackFixtures: ["K"],
      deterministic: true,
      rawMidiUnchanged: true,
      productionOutputsUnchanged: true,
      officialCandidate: p524OfficialBaseline,
      benchmark: measuredBenchmark,
    } as const;
    const sparseFixtures = new Array(1);
    const sparseWarmupDurations = new Array(3);
    const malformedInputs: readonly unknown[] = [
      null,
      undefined,
      false,
      "invalid",
      [],
      {},
      { ...validInput, aggregate: null },
      { ...validInput, aggregate: [] },
      { ...validInput, aggregate: { ...validInput.aggregate, falseMergeRate: Symbol("invalid") } },
      { ...validInput, fixtures: undefined },
      { ...validInput, fixtures: {} },
      { ...validInput, fixtures: [null] },
      { ...validInput, fixtures: [[]] },
      { ...validInput, fixtures: sparseFixtures },
      {
        ...validInput,
        fixtures: metrics.map((entry) => entry.fixtureId === "A"
          ? { ...entry, fragmentationRatio: Symbol("invalid") }
          : entry),
      },
      { ...validInput, harmonicRhythmByFixture: null },
      { ...validInput, harmonicRhythmByFixture: [] },
      { ...validInput, legacyFallbackFixtures: null },
      { ...validInput, officialCandidate: null },
      { ...validInput, officialCandidate: [] },
      { ...validInput, benchmark: null },
      { ...validInput, benchmark: [] },
      { ...validInput, benchmark: {} },
      { ...validInput, benchmark: { ...measuredBenchmark, warmupDurationsMs: null } },
      { ...validInput, benchmark: { ...measuredBenchmark, warmupDurationsMs: sparseWarmupDurations } },
      { ...validInput, benchmark: { ...measuredBenchmark, sampleDurationsMs: {} } },
      { ...validInput, benchmark: { ...measuredBenchmark, sampleRatios: "1,1,1,1,1,1,1" } },
    ];
    const decideMalformed = (input: unknown) => decideP524Promotion(
      input as P524PromotionInput,
    );
    malformedInputs.forEach((input) => {
      expect(() => decideMalformed(input)).not.toThrow();
      expect(decideMalformed(input).status).toBe("fail-stop-promotion");
    });
  });

  it("requires measured locked benchmark provenance and execution counts", () => {
    const fixtures = generateP524SyntheticFixtures();
    const metrics = fixtures.map((fixture) => evaluateP524Fixture(
      fixture,
      fixture.expectedStates,
      fixture.expectedBassStates,
    ));
    const validInput = {
      aggregate: aggregateP524Metrics(metrics),
      fixtures: metrics,
      harmonicRhythmByFixture: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.expectedHarmonicRhythm])),
      legacyFallbackFixtures: ["K"],
      deterministic: true,
      rawMidiUnchanged: true,
      productionOutputsUnchanged: true,
      officialCandidate: p524OfficialBaseline,
      benchmark: measuredBenchmark,
    } as const;
    const fabricatedBenchmarks = [
      { ...measuredBenchmark, medianRatio: 0 },
      { ...measuredBenchmark, maximumSampleMs: 0 },
      { ...measuredBenchmark, measured: false },
      { ...measuredBenchmark, warmupCount: 0 },
      { ...measuredBenchmark, sampleCount: 0 },
      { ...measuredBenchmark, warmupDurationsMs: [] },
      { ...measuredBenchmark, sampleDurationsMs: [] },
      { ...measuredBenchmark, sampleRatios: [] },
      { ...measuredBenchmark, timeoutMs: 0 },
      { ...measuredBenchmark, timeoutEnforced: false },
      { ...measuredBenchmark, timedOut: true },
      { ...measuredBenchmark, provenance: "fabricated" },
      { ...measuredBenchmark, sourceFixture: "A" },
      { ...measuredBenchmark, repetitions: 0 },
      { ...measuredBenchmark, noteCount: 0 },
    ];
    fabricatedBenchmarks.forEach((benchmark) => {
      expect(decideP524Promotion({ ...validInput, benchmark }).status).toBe("fail-stop-promotion");
    });
  });

  it("fails closed for incomplete, duplicate, corrupt, non-finite, and out-of-range metrics", () => {
    const fixtures = generateP524SyntheticFixtures();
    const metrics = fixtures.map((fixture) => evaluateP524Fixture(fixture, fixture.expectedStates, fixture.expectedBassStates));
    const validInput = {
      aggregate: aggregateP524Metrics(metrics),
      fixtures: metrics,
      harmonicRhythmByFixture: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture.expectedHarmonicRhythm])),
      legacyFallbackFixtures: ["K"],
      deterministic: true,
      rawMidiUnchanged: true,
      productionOutputsUnchanged: true,
      officialCandidate: p524OfficialBaseline,
      benchmark: measuredBenchmark,
    } as const;
    expect(decideP524Promotion({ ...validInput, fixtures: metrics.slice(0, -1) }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({ ...validInput, fixtures: [...metrics.slice(0, -1), metrics[0]] }).status).toBe("fail-stop-promotion");
    const fabricatedA = {
      ...metrics[0],
      groundTruthStates: 2,
      detectedStates: 2,
      fragmentationRatio: 1,
      expectedChanges: 1,
      detectedChanges: 1,
      matchedChanges: 1,
      changePrecision: 1,
      changeRecall: 1,
      falseMergeRate: 0,
      overSegmentationRate: 0,
      matchedStateIdentities: 2,
      identityErrorRate: 0,
    };
    const fabricatedCardinality = [fabricatedA, ...metrics.slice(1)];
    expect(() => aggregateP524Metrics(fabricatedCardinality)).toThrow("invalid metrics");
    expect(decideP524Promotion({
      ...validInput,
      fixtures: fabricatedCardinality,
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      fixtures: metrics.map((entry) => entry.fixtureId === "A"
        ? { ...entry, changeRecall: Number.POSITIVE_INFINITY }
        : entry),
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      aggregate: { ...validInput.aggregate, changeRecall: Number.NaN },
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      officialCandidate: { ...p524OfficialBaseline, rootAt1: Number.POSITIVE_INFINITY },
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      officialCandidate: { ...p524OfficialBaseline, boundaryRecall: -0.01 },
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      officialCandidate: { ...p524OfficialBaseline, rootAt1: undefined as unknown as number },
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      benchmark: { ...measuredBenchmark, medianRatio: Number.NaN, maximumSampleMs: -1 },
    }).status).toBe("fail-stop-promotion");
    expect(decideP524Promotion({
      ...validInput,
      benchmark: { ...measuredBenchmark, timedOut: "false" as unknown as boolean },
    }).status).toBe("fail-stop-promotion");
  });
});
