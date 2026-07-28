import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../src/domain/chords";
import {
  buildRootConfidenceRow,
  selectRootConfidenceBand,
  softmaxEntropy,
  wilsonInterval,
  type ConfidenceBandResult,
} from "./rootConfidence";

describe("Phase 4.5 root confidence calibration", () => {
  it("uses normalized margin and entropy instead of raw margin as a threshold", () => {
    const row = buildRootConfidenceRow({
      fileId: "f",
      eventId: "e",
      scenarioId: "V01",
      variant: "clean",
      expected: "Cmaj7",
      rawWindow: {
        bar: 1,
        beat: 1,
        durationBeats: 2,
        totalWeight: 1,
        melodyWeight: 0,
        noteCount: 4,
        candidates: [
          { chord: makeChordSymbol(0, "maj7"), rawScore: 1.2, qualityCoverage: 1 },
          { chord: makeChordSymbol(7, "dom7"), rawScore: 0.8 },
        ],
      },
      currentTop3RootRescue: true,
      oracleCanonicalGain: false,
      oracleRootLoss: false,
    });
    expect(row.rawMargin).toBeCloseTo(0.4);
    expect(row.normalizedMargin).toBeCloseTo(0.2);
    expect(row.rootCorrect).toBe(true);
  });

  it("computes a conservative Wilson interval", () => {
    const interval = wilsonInterval(98, 100);
    expect(interval.lower).toBeLessThan(0.95);
    expect(interval.upper).toBeGreaterThan(0.98);
  });

  it("entropy decreases as one root dominates", () => {
    expect(softmaxEntropy([1, 0, 0], 0.1))
      .toBeLessThan(softmaxEntropy([1, 0.9, 0.8], 0.1));
  });

  it("selects the widest preregistered passing band", () => {
    const base = {
      rootCorrectCount: 100,
      rootAccuracy: 1,
      wilson95: { lower: 0.96, upper: 1 },
      top3RootRescueRate: 0,
      allocationEligibleCount: 100,
      expectedCanonicalGains: 8,
      expectedRootLosses: 1,
      rootLossToGainRatio: 0.125,
      gatePass: true,
    };
    const results: ConfidenceBandResult[] = [
      {
        ...base,
        band: { kind: "root-entropy-lte", rootEntropyThreshold: 1 },
        eventCount: 100,
      },
      {
        ...base,
        band: { kind: "normalized-margin-gte", normalizedMarginThreshold: 0.1 },
        eventCount: 80,
      },
    ];
    expect(selectRootConfidenceBand(results)?.eventCount).toBe(100);
  });
});
