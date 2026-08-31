import { describe, expect, it } from "vitest";
import {
  estimateP526LocalHarmonicStateShadow,
  type P526LocalEvidenceCell,
  type P526LocalHarmonicStateShadowInput,
} from "../../src/domain/midi/harmonicState/localHarmonicStateShadow";

describe("P5.26-02 local harmonic state shadow edge cases", () => {
  it("selects true Local 8 from two-bar stability bounded by structural anchors", () => {
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 16,
      cells: [
        cell(0, 4, [0, 4, 7], 0), cell(4, 8, [2, 7, 11], 7),
        cell(8, 12, [2, 7, 11], 7), cell(12, 16, [0, 5, 9], 5),
      ],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("Local 8 fixture unexpectedly failed closed");
    expect(result.boundaries.map(({ beat, decision }) => [beat, decision])).toEqual([
      [4, "split-structural-change"], [8, "merge-same-state"], [12, "split-structural-change"],
    ]);
    expect(result.bars.map((bar) => [bar.quarterBeats, bar.source])).toEqual([
      [4, "local-stable"], [8, "local-override"], [8, "local-override"], [4, "local-stable"],
    ]);
    expect(result.bars[1]?.candidateScores[8]).toBe(0.9);
  });

  it("retains a supported Global 8 for a single-bar input", () => {
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4, cells: [cell(0, 4, [0, 4, 7], 0)],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 8 },
    });
    expect(result).toMatchObject({ status: "supported", legacyFallback: false });
    if (result.status === "supported") {
      expect(result.bars[0]).toMatchObject({
        quarterBeats: 8, source: "global-retained", arbitration: "global-retained",
        hysteresisReason: "single-bar-global-8",
      });
    }
  });

  it("does not infer Local 8 at a piece edge or from only one anchor", () => {
    const edgeOnly = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8,
      cells: [cell(0, 4, [0, 4, 7], 0), cell(4, 8, [0, 4, 7], 0)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(edgeOnly.status).toBe("supported");
    if (edgeOnly.status === "supported") {
      expect(edgeOnly.bars.map((bar) => [bar.quarterBeats, bar.source])).toEqual([
        [4, "local-stable"], [4, "local-stable"],
      ]);
    }
    const oneAnchor = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 12,
      cells: [
        cell(0, 4, [0, 4, 7], 0), cell(4, 8, [2, 7, 11], 7), cell(8, 12, [2, 7, 11], 7),
      ],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(oneAnchor.status).toBe("supported");
    if (oneAnchor.status === "supported") {
      expect(oneAnchor.bars.map((bar) => bar.quarterBeats)).toEqual([4, 4, 4]);
      expect(oneAnchor.bars.every((bar) => bar.source !== "local-override")).toBe(true);
    }
  });

  it("fails closed when upper evidence is empty or has zero persistence", () => {
    const results = [
      estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: 4, cells: [cell(0, 4, [], 0)],
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      }),
      estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: 4,
        cells: [{ ...cell(0, 4, [0, 4, 7], 0), upperPersistence: 0 }],
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      }),
    ];
    results.forEach((result) => {
      expect(result).toMatchObject({ status: "unknown", reason: "insufficient-local-evidence", legacyFallback: true });
      expect(result.bars).toEqual([]);
      expect(result.states).toEqual([]);
    });
  });

  it("routes valid but ambiguous normalized evidence to the legacy fallback", () => {
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 4, [0, 4, 7], 0, {
        normalizedBeatStrength: 0.49,
        pitchClassSupport: 0.49,
        temporalContinuity: 0.49,
        localRhythmSupport: 0.49,
      })],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(result).toEqual(expect.objectContaining({
      status: "unknown", reason: "ambiguous-local-evidence", legacyFallback: true,
      bars: [], states: [], boundaries: [],
    }));
  });

  it("fails closed for invalid metric ranges and exposes fused signals", () => {
    const valid = cell(0, 2, [0, 4, 7], 0);
    const invalid = { ...valid, pitchClassSupport: 1.1 };
    expect(estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4, cells: [invalid, cell(2, 4, [0, 4, 7], 0)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    })).toMatchObject({ status: "unknown", reason: "invalid-input", legacyFallback: true });
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4, cells: [valid, cell(2, 4, [0, 5, 9], 0)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.boundaries[0]?.signals).toEqual({ normalizedBeatStrength: 0.9, pitchClassSupport: 0.9, temporalContinuity: 0.9, localRhythmSupport: 0.9 });
    }
  });

  it("fails closed when any normalized field is missing from a persistent Bass change", () => {
    const fields = ["normalizedBeatStrength", "pitchClassSupport", "temporalContinuity", "localRhythmSupport"] as const;
    const strong = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 7)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(strong.status).toBe("supported");
    if (strong.status === "supported") expect(strong.boundaries[0]?.decision).toBe("split-structural-change");

    for (const field of fields) {
      const weakened = estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: 4,
        cells: [cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 7, { [field]: 0 })],
        globalHarmonicRhythm: { status: "supported", quarterBeats: 4 },
      });
      expect(weakened.status, field).toBe("supported");
      if (weakened.status === "supported") {
        expect(weakened.boundaries[0]?.decision, field).toBe("split-structural-change");
        expect(weakened.boundaries[0]?.signals[field], field).toBe(0.45);
      }
    }
  });

  it("exposes candidate scores and gap while hysteresis rejects a weak local override", () => {
    const weak = { normalizedBeatStrength: 0.6, pitchClassSupport: 0.6, temporalContinuity: 0.6, localRhythmSupport: 0.6 };
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [0, 4, 7], 0, weak), cell(2, 4, [2, 7, 11], 7, weak)],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 4 },
    });
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.bars[0]).toMatchObject({
        quarterBeats: 4,
        source: "global-retained",
        candidateScores: { 1: 0.2, 2: 0.6, 4: 0, 8: 0 },
        candidateGap: 0.39999999999999997,
        arbitration: "hysteresis-retained",
        hysteresisReason: "weak-isolated-candidate",
      });
    }
  });

  it("keeps a small persistent arrival on an upper tone as a structural inversion", () => {
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [1, 4, 8, 11], 9), cell(2, 4, [1, 4, 8, 11], 8)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.states).toHaveLength(2);
      expect(result.boundaries[0]).toMatchObject({
        decision: "split-structural-change",
        evidence: ["stable-upper-structure", "persistent-bass-change", "strong-metric-placement", "pitch-class-support", "temporal-continuity", "local-rhythm-support"],
      });
    }
  });

  it("retains structural Bass by merge reason and drops only weak passing evidence", () => {
    const cases = [
      {
        name: "weak passing Bass",
        cells: [cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 2, { bassPersistence: 0.4 })],
        expectedBass: [0],
      },
      {
        name: "weak then weak Bass",
        cells: [cell(0, 2, [0, 4, 7], 2, { bassPersistence: 0.4 }), cell(2, 4, [0, 4, 7], 0, { bassPersistence: 0.4 })],
        expectedBass: [],
      },
      {
        name: "persistent same-upper Bass",
        cells: [cell(0, 2, [0, 4, 7], 1), cell(2, 4, [0, 4, 7], 2)],
        expectedBass: [1, 2],
      },
      {
        name: "weak then persistent Bass",
        cells: [cell(0, 2, [0, 4, 7], 2, { bassPersistence: 0.4 }), cell(2, 4, [0, 4, 7], 0)],
        expectedBass: [0],
      },
    ];
    for (const fixture of cases) {
      const result = estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: 4, cells: fixture.cells,
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      });
      expect(result.status, fixture.name).toBe("supported");
      if (result.status === "supported") {
        expect(result.states, fixture.name).toHaveLength(1);
        expect(result.states[0]?.structuralBassPitchClasses, fixture.name).toEqual(fixture.expectedBass);
      }
    }

    const singleWeak = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 4, [0, 4, 7], 2, { bassPersistence: 0.4 })],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(singleWeak.status).toBe("supported");
    if (singleWeak.status === "supported") {
      expect(singleWeak.states[0]?.structuralBassPitchClasses).toEqual([]);
    }

    const inversion = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8,
      cells: [cell(0, 4, [4, 7], 0), cell(4, 8, [0, 4], 7)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(inversion.status).toBe("supported");
    if (inversion.status === "supported") {
      expect(inversion.states).toHaveLength(1);
      expect(inversion.states[0]?.structuralBassPitchClasses).toEqual([0, 7]);
      expect(inversion.boundaries[0]?.evidence).toContain("bar-scale-inversion");
    }
  });

  it("splits a persistent small Bass change at a structural bar boundary", () => {
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8,
      cells: [cell(0, 4, [0, 4, 7], 0), cell(4, 8, [0, 4, 7], 9)],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 4 },
    });
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.states).toHaveLength(2);
      expect(result.boundaries[0]).toMatchObject({
        beat: 4,
        decision: "split-structural-change",
        evidence: expect.arrayContaining(["stable-upper-structure", "persistent-bass-change"]),
      });
    }
  });

  it("fails the entire result closed when a valid bar has non-periodic Local splits", () => {
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 1, [0, 4, 7], 0), cell(1, 4, [2, 7, 11], 7)],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 4 },
    });
    expect(result).toMatchObject({
      status: "unknown", reason: "ambiguous-local-evidence", legacyFallback: true,
      bars: [], states: [], boundaries: [],
    });
    expect(result.operations).toMatchObject({
      inputCells: 2, bars: 1, candidateEvaluations: 4,
      barIndexCellVisits: 2, barIndexAssignments: 2, barLookups: 1, candidateCellVisits: 2,
    });
  });

  it("requires both threshold and margin for Local override, including mixed confidence", () => {
    const evidence = (value: number) => ({
      normalizedBeatStrength: value,
      pitchClassSupport: value,
      temporalContinuity: value,
      localRhythmSupport: value,
    });
    const evaluate = (left: number, right: number) => estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [0, 4, 7], 0, evidence(left)), cell(2, 4, [2, 7, 11], 7, evidence(right))],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 4 },
    });
    const below = evaluate(0.79, 0.79);
    expect(below.status).toBe("supported");
    if (below.status === "supported") {
      expect(below.bars[0]).toMatchObject({
        quarterBeats: 4, arbitration: "hysteresis-retained", hysteresisReason: "weak-isolated-candidate",
      });
      expect(below.bars[0]?.candidateScores[2]).toBeCloseTo(0.79);
    }
    for (const [name, result] of [["above", evaluate(0.81, 0.81)], ["mixed", evaluate(0.9, 0.7)]] as const) {
      expect(result.status, name).toBe("supported");
      if (result.status === "supported") {
        expect(result.bars[0], name).toMatchObject({ quarterBeats: 2, source: "local-override", arbitration: "local-strong" });
        expect(result.bars[0]!.candidateScores[1], name).toBeGreaterThan(0);
        expect(result.bars[0]!.candidateGap, name).toBeGreaterThanOrEqual(0.15);
      }
    }

    const retainedEight = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8,
      cells: [cell(0, 4, [0, 4, 7], 0), cell(4, 8, [0, 4, 7], 0)],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 8 },
    });
    expect(retainedEight.status).toBe("supported");
    if (retainedEight.status === "supported") {
      expect(retainedEight.bars.every((bar) => bar.quarterBeats === 8 && bar.source === "global-retained")).toBe(true);
      expect(retainedEight.bars.every((bar) => bar.candidateGap < 0.15)).toBe(true);
    }
  });

  it("recognizes next-bar approach and previous-bar departure independently", () => {
    const nextApproach = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 12,
      cells: [
        cell(0, 4, [1, 3, 6], 6), cell(4, 6, [0, 4, 7], 0),
        cell(6, 8, [0, 4], 7), cell(8, 12, [2, 5, 9], 5),
      ],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(nextApproach.status).toBe("supported");
    if (nextApproach.status === "supported") {
      expect(nextApproach.boundaries.find((boundary) => boundary.beat === 6)).toMatchObject({
        beat: 6, decision: "merge-same-state",
        evidence: ["same-pitch-material", "next-bar-approach", "pitch-class-support", "temporal-continuity"],
      });
    }

    // The previous bar departs from the same pitch material through an upper
    // re-voicing; the following cell has no bass evidence, so this case cannot
    // accidentally pass via the persistent-bass-change split rule.
    const previousDeparture = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 12,
      cells: [
        cell(0, 4, [0, 4, 7], 0), cell(4, 6, [0, 4], 2),
        cell(6, 8, [0, 2, 4], undefined), cell(8, 12, [0, 4, 7], 0),
      ],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(previousDeparture.status).toBe("supported");
    if (previousDeparture.status === "supported") {
      expect(previousDeparture.boundaries.find((boundary) => boundary.beat === 6)).toMatchObject({
        beat: 6, decision: "merge-same-state",
        evidence: ["same-pitch-material", "previous-bar-departure", "pitch-class-support", "temporal-continuity"],
      });
    }
  });

  it("indexes canonical cells once and reports linear work through the 4,096-bar maximum", () => {
    for (const barCount of [1, 2, 4, 4_096]) {
      const cells = Array.from({ length: barCount }, (_, index) => (
        cell(index * 4, (index + 1) * 4, [0, 4, 7], 0)
      ));
      const result = estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: barCount * 4, cells,
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      });
      expect(result.status, `${barCount} bars`).toBe("supported");
      if (result.status !== "supported") continue;

      expect(result.states, `${barCount} bars`).toEqual([{
        startBeat: 0,
        endBeat: barCount * 4,
        upperPitchClasses: [0, 4, 7],
        structuralBassPitchClasses: [0],
      }]);
      expect(result.bars, `${barCount} bars`).toHaveLength(barCount);
      expect(result.bars.every((bar) => bar.quarterBeats === 4), `${barCount} bars`).toBe(true);
      expect(result.operations, `${barCount} bars`).toMatchObject({
        inputCells: barCount,
        bars: barCount,
        candidateEvaluations: barCount * 4,
        barIndexCellVisits: barCount,
        barIndexAssignments: barCount,
        barLookups: barCount,
        candidateCellVisits: barCount,
        boundaryDecisions: barCount - 1,
        stateAssignments: barCount,
      });
      expect(result.operations.contextLookups).toBeLessThanOrEqual(Math.max(0, barCount - 2));
    }
  });

  it("does not double-count cells ending exactly at a bar boundary", () => {
    const cells = Array.from({ length: 8 }, (_, index) => (
      cell(index, index + 1, [0, 4, 7], 0)
    ));
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8, cells,
      globalHarmonicRhythm: { status: "supported", quarterBeats: 4 },
    });
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.bars).toHaveLength(2);
      expect(result.states).toEqual([{
        startBeat: 0, endBeat: 8,
        upperPitchClasses: [0, 4, 7], structuralBassPitchClasses: [0],
      }]);
      expect(result.operations).toMatchObject({
        inputCells: 8, bars: 2,
        barIndexCellVisits: 8, barIndexAssignments: 8,
        candidateCellVisits: 8,
      });
    }
  });

  it("canonicalizes shuffled cells without mutating caller input", () => {
    const canonicalCells = [
      cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 2),
      cell(4, 6, [0, 5, 9], 5), cell(6, 8, [2, 7, 11], 7),
    ];
    const shuffledInput: P526LocalHarmonicStateShadowInput = {
      meter: [4, 4], totalBeats: 8,
      cells: [canonicalCells[2]!, canonicalCells[0]!, canonicalCells[3]!, canonicalCells[1]!],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    };
    const before = structuredClone(shuffledInput);
    const canonicalResult = estimateP526LocalHarmonicStateShadow({ ...shuffledInput, cells: canonicalCells });
    expect(estimateP526LocalHarmonicStateShadow(shuffledInput)).toEqual(canonicalResult);
    expect(shuffledInput).toEqual(before);
  });

  it("fails closed for duplicate, overlapping, and gapped coverage", () => {
    const malformed = [
      [cell(0, 2, [0, 4, 7], 0), cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 0)],
      [cell(0, 3, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 0)],
      [cell(0, 1, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 0)],
    ];
    malformed.forEach((cells) => {
      expect(estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: 4, cells,
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      })).toMatchObject({ status: "unknown", reason: "invalid-input", legacyFallback: true });
    });
  });
});

function cell(
  startBeat: number,
  endBeat: number,
  upperPitchClasses: readonly number[],
  bassPitchClass: number | undefined,
  metrics: Partial<Pick<P526LocalEvidenceCell, "upperPersistence" | "bassPersistence" | "normalizedBeatStrength" | "pitchClassSupport" | "temporalContinuity" | "localRhythmSupport">> = {},
): P526LocalEvidenceCell {
  return {
    startBeat, endBeat, upperPitchClasses: [...upperPitchClasses].sort((left, right) => left - right),
    ...(bassPitchClass === undefined ? {} : { bassPitchClass: ((bassPitchClass % 12) + 12) % 12 }),
    upperPersistence: 0.9, bassPersistence: 0.9,
    normalizedBeatStrength: 0.9, pitchClassSupport: 0.9, temporalContinuity: 0.9, localRhythmSupport: 0.9,
    ...metrics,
  };
}
