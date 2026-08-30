import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { countP524OneToOneBoundaryMatches } from "../p524/harmonicFragmentMetrics";
import {
  buildP526EightBarPreparedData,
  generateP526Fixtures,
  inheritedP524Fixtures,
  p526ExpectedEightBarTruth,
} from "./fixtures";
import {
  captureP526CurrentActual,
  deriveP526FallbackEvidence,
  p526CurrentStructuredSnapshot,
  p526SyntheticMidiHeader,
  stateCountsByBar,
} from "./baseline";
import { runP526DenseMixedBenchmarkEnforced } from "./benchmark";
import { evaluateP526EightBarBaseline, p526BoundaryToleranceBeats } from "./metrics";
import {
  decideP526TrackAPromotion,
  p526FlagsContract,
  p526PerformancePolicy,
  p526PrivacyPolicy,
  p526PromotionContract,
} from "./promotionContract";

describe("P5.26-00 fixtures and structured baseline", () => {
  it("inherits the exact authoritative P5.24 A-K generator", () => {
    expect(inheritedP524Fixtures().map((fixture) => fixture.id)).toEqual([
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K",
    ]);
  });

  it("locks L-Q note-derived canonical sets, bass evidence, and hard false merges", () => {
    const fixtures = generateP526Fixtures();
    expect(fixtures.map((fixture) => [fixture.id, fixture.expectedDecision, fixture.falseMergeIsHardFail])).toEqual([
      ["L", "same", false], ["M", "split", true], ["N", "same", false],
      ["O", "split", true], ["P", "same", false], ["Q", "split", true],
    ]);
    for (const fixture of fixtures) {
      const notesByState = fixture.expectedLabels.map((_, index) => fixture.expectedLabels.length === 1
        ? fixture.notes
        : fixture.notes.filter((note) => index === 0 ? note.startBeat < 2 : note.startBeat >= 2));
      expect(notesByState.map(pitchClassSet), fixture.id).toEqual(fixture.expectedCanonicalPitchClasses);
      fixture.expectedStructuralBassPitchClasses.forEach((pitchClass, index) => {
        expect(notesByState[index]?.filter((note) => note.expectedLane === "bass")
          .some((note) => note.pitch % 12 === pitchClass), fixture.id).toBe(true);
      });
    }
  });

  it("distinguishes P stable upper structure from Q true G#7 to F#13", () => {
    const fixtures = generateP526Fixtures();
    const p = fixtures.find((fixture) => fixture.id === "P")!;
    const q = fixtures.find((fixture) => fixture.id === "Q")!;
    const upperHalves = (notes: typeof p.notes) => [0, 1].map((half) => pitchClassSet(notes.filter((note) => (
      note.expectedLane === "upper" && (half === 0 ? note.startBeat < 2 : note.startBeat >= 2)
    ))));
    expect(upperHalves(p.notes)[0]).toEqual(upperHalves(p.notes)[1]);
    expect(upperHalves(q.notes)[0]).not.toEqual(upperHalves(q.notes)[1]);
    expect(pitchClassSet(q.notes.filter((note) => note.startBeat >= 2))).toEqual([1, 3, 4, 6, 10]);
  });

  it("locks layered truth and derives state counts from timelines", () => {
    expect(p526ExpectedEightBarTruth.map((state) => state.surfaceLabel)).toEqual([
      "E6/9", "G#7(b13)", "C#m9", "Cmaj7", "Bm9", "E13", "Amaj9", "Am6",
      "E/G#", "C#7(b9)", "F#m9", "Amaj7/B",
    ]);
    expect(stateCountsByBar(p526ExpectedEightBarTruth)).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
    const bar2 = p526ExpectedEightBarTruth[1]!;
    expect(bar2).toMatchObject({ rootPitchClass: 8, quality: "dom7", alteredTensions: ["b13"] });
    expect(bar2.pitchClasses).toContain(4);
  });

  it("captures deterministic production ChordSymbol state and explicit snapshot", () => {
    const first = captureP526CurrentActual();
    expect(first).toEqual(captureP526CurrentActual());
    expect(first).toEqual(p526CurrentStructuredSnapshot);
    expect(stateCountsByBar(first)).toEqual([1, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("measures six non-overlapping structured axes", () => {
    expect(evaluateP526EightBarBaseline(p526ExpectedEightBarTruth, p526CurrentStructuredSnapshot)).toEqual({
      segmentation: {
        matchedBoundaries: 11, expectedBoundaries: 11, detectedBoundaries: 14,
        precision: 11 / 14, recall: 1, f1: 0.88, overSegmentationRate: 0.25, falseMergeRate: 0,
      },
      canonicalIdentity: { matchedSlots: 13, eligibleSlots: 16, accuracy: 13 / 16 },
      structuralBass: { matchedSlots: 12, eligibleSlots: 13, accuracy: 12 / 13 },
      alteredTension: { matchedSlots: 10, eligibleSlots: 12, accuracy: 10 / 12 },
      surfaceSpelling: { matchedSlots: 9, eligibleSlots: 10, accuracy: 9 / 10 },
      exactSurfaceLabel: { matchedSlots: 9, eligibleSlots: 16, accuracy: 9 / 16 },
      exactFullBars: 3, stateCountBars: 5, totalBars: 8,
    });
  });

  it("never interprets E6/9 as slash bass and does not double-count a bass defect", () => {
    expect(p526ExpectedEightBarTruth[0]).toMatchObject({
      surfaceLabel: "E6/9", rootPitchClass: 4, structuralBassPitchClass: 4,
    });
    expect(p526ExpectedEightBarTruth[0]?.surfaceBass).toBeUndefined();
    const adversarial = p526CurrentStructuredSnapshot.map((state, index) => index === 0
      ? { ...state, chord: { ...state.chord, bass: 6 } }
      : state);
    const clean = evaluateP526EightBarBaseline(p526ExpectedEightBarTruth, p526CurrentStructuredSnapshot);
    const changed = evaluateP526EightBarBaseline(p526ExpectedEightBarTruth, adversarial);
    expect(changed.canonicalIdentity).toEqual(clean.canonicalIdentity);
    expect(changed.structuralBass.matchedSlots).toBe(clean.structuralBass.matchedSlots - 2);
    expect(changed.alteredTension.eligibleSlots).toBe(clean.alteredTension.eligibleSlots - 2);
  });

  it("reuses one-to-one boundary matching", () => {
    expect(countP524OneToOneBoundaryMatches([1, 1.2], [1.1], 0.25)).toBe(1);
    expect(p526BoundaryToleranceBeats).toBe(0.25);
  });

  it("derives fallback reasons from the fresh P5.24 production pipeline", () => {
    expect(deriveP526FallbackEvidence()).toEqual({
      harmonicRhythmStatus: "unknown",
      harmonicRhythmReason: "mixed-global-periodicity",
      consolidationStatus: "unavailable",
      consolidationReason: "unsupported-harmonic-identity",
      legacyFallback: true,
    });
  });
});

describe("P5.26-00 flags, promotion, policies, and executed evidence", () => {
  it("locks exact existing/future flags and OFF deep equality", () => {
    expect(p526FlagsContract).toMatchObject({
      existing: { name: "enableHarmonicStateConsolidation", enabledOnlyWhen: "literal true", default: false },
      futureTrackA: { name: "enableLocalHarmonicStateConsolidation", default: false },
      futureTrackB: { name: "enableKeyAwareChordSpelling", default: false },
      trackC: { mode: "shadow", defaultProductionPromotion: false, productionPromotionFlag: null },
    });
    const preparedData = buildP526EightBarPreparedData();
    const omitted = analyzeMidi(p526SyntheticMidiHeader, { preparedData, mode: "phase4-v1" });
    const falseFlag = analyzeMidi(p526SyntheticMidiHeader, {
      preparedData, mode: "phase4-v1", enableHarmonicStateConsolidation: false,
    });
    expect(falseFlag).toEqual(omitted);
    expect(JSON.stringify(falseFlag)).toBe(JSON.stringify(omitted));
  });

  it("fails promotion closed for each missing Track A safety gate", () => {
    const passing = {
      inheritedAKPass: true, addedLQPass: true, hardFalseMergeCount: 0,
      globalSufficientUnchanged: true, unknownFallback: true, deterministic: true,
      bounded: true, flagOffDeepEqual: true,
    } as const;
    expect(decideP526TrackAPromotion(passing)).toBe("promotable");
    for (const key of Object.keys(passing)) {
      expect(decideP526TrackAPromotion({
        ...passing, [key]: key === "hardFalseMergeCount" ? 1 : false,
      })).toBe("fail-stop-promotion");
    }
    expect(p526PromotionContract.trackC.acceptableTerminalState).toBe("SHADOW PASS — NOT PROMOTED");
  });

  it("separates privacy/performance policy locks from an executed dense mixed gate", { timeout: 35_000 }, async () => {
    expect(p526PrivacyPolicy).toMatchObject({
      realFixtureId: "p526-real-001", committedPrivateInputs: 0,
      allowPersonalAbsolutePaths: false, allowRawNoteDumps: false,
    });
    const executed = await runP526DenseMixedBenchmarkEnforced();
    expect(executed).toMatchObject({
      status: "completed", benchmarkComputationBudgetMs: 10_000, childProcessWatchdogMs: 30_000,
      timeoutEnforced: true, timedOut: false,
      warmupCount: 3, sampleCount: 7, repetitions: 4,
    });
    expect(p526PerformancePolicy.contextRadiusBars).toBe(1);
    expect(p526PerformancePolicy.maximumCandidateCellsPerBar).toBe(4);
    expect(executed.noteCount).toBeGreaterThan(1_000);
    expect(executed.computationElapsedMs).toBeLessThanOrEqual(p526PerformancePolicy.benchmarkComputationBudgetMs);
    expect(executed.outerProcessElapsedMs).toBeLessThanOrEqual(p526PerformancePolicy.childProcessWatchdogMs);
    expect(executed.maximumSampleMs).toBeLessThanOrEqual(p526PerformancePolicy.maximumSampleMs);
    expect(executed.medianRatio).toBeLessThanOrEqual(p526PerformancePolicy.maximumMedianRatio);
  });
});

function pitchClassSet(notes: readonly { readonly pitch: number }[]): readonly number[] {
  return [...new Set(notes.map((note) => ((note.pitch % 12) + 12) % 12))].sort((left, right) => left - right);
}
