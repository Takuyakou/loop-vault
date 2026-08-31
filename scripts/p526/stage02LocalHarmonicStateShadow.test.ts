import { describe, expect, it } from "vitest";
import {
  estimateP526LocalHarmonicStateShadow,
  type P526LocalEvidenceCell,
  type P526LocalHarmonicStateShadowInput,
} from "../../src/domain/midi/harmonicState/localHarmonicStateShadow";
import { buildP526EightBarPreparedData, generateP526Fixtures } from "./fixtures";

describe("P5.26-02 local harmonic rhythm and Structural Bass shadow", () => {
  it("passes L-Q and preserves their hard-fail metadata semantics", () => {
    const results = generateP526Fixtures().map((fixture) => {
      const result = estimateP526LocalHarmonicStateShadow({
        meter: [4, 4],
        totalBeats: 4,
        cells: cellsFromFixtureNotes(fixture.notes, 4, 2),
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      });
      expect(result.status, fixture.id).toBe("supported");
      if (result.status !== "supported") throw new Error(`${fixture.id} unexpectedly failed closed`);
      expect(result.states.map((state) => uniquePitchClasses([...state.upperPitchClasses, ...state.structuralBassPitchClasses]))).toEqual(fixture.expectedCanonicalPitchClasses);
      expect(result.states.map((state) => state.structuralBassPitchClasses)).toEqual(
        fixture.expectedStructuralBassPitchClasses.map((pitchClass) => [pitchClass]),
      );
      return {
        id: fixture.id,
        decision: result.states.length === 1 ? "same" : "split",
        hardFailOnFalseMerge: fixture.falseMergeIsHardFail,
        falseMerge: fixture.falseMergeIsHardFail && result.states.length === 1,
      };
    });
    expect(results.map(({ id, decision }) => [id, decision])).toEqual([
      ["L", "same"], ["M", "split"], ["N", "same"],
      ["O", "split"], ["P", "same"], ["Q", "split"],
    ]);
    expect(results.filter((result) => result.falseMerge)).toEqual([]);
    expect(results.map(({ id, hardFailOnFalseMerge }) => [id, hardFailOnFalseMerge])).toEqual([
      ["L", false], ["M", true], ["N", false],
      ["O", true], ["P", false], ["Q", true],
    ]);
  });

  it("produces the locked 8-bar state counts with Bar 2/5/6 held as one state", () => {
    const prepared = buildP526EightBarPreparedData();
    const result = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4],
      totalBeats: 32,
      cells: cellsFromPreparedData(prepared, 2),
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("eight-bar shadow unexpectedly failed closed");
    expect(stateCountsByBar(result.states, 8)).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
    expect(result.bars.map((bar) => bar.quarterBeats)).toEqual([4, 4, 2, 2, 4, 4, 2, 2]);
    expect(result.boundaries.filter((entry) => [6, 18, 22].includes(entry.beat))).toMatchObject([
      { beat: 6, decision: "merge-same-state", evidence: ["stable-upper-structure", "pitch-class-support", "temporal-continuity", "local-rhythm-support"] },
      { beat: 18, decision: "merge-same-state", evidence: ["same-pitch-material", "next-bar-approach", "pitch-class-support", "temporal-continuity"] },
      { beat: 22, decision: "merge-same-state", evidence: ["same-pitch-material", "next-bar-approach", "pitch-class-support", "temporal-continuity"] },
    ]);
  });

  it("supports exactly 1/2/4/8/unknown and retains sufficient Global evidence", () => {
    expect(periodFor(changingCells(1), "unknown")).toMatchObject({ quarterBeats: 1, source: "local-override" });
    expect(periodFor(changingCells(2), "unknown")).toMatchObject({ quarterBeats: 2, source: "local-override" });
    expect(periodFor([cell(0, 4, [0, 4, 7], 0)], "unknown")).toMatchObject({
      quarterBeats: 4, source: "local-stable",
    });
    const globalEight = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8,
      cells: [cell(0, 4, [0, 4, 7], 0), cell(4, 8, [0, 4, 7], 0)],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 8 },
    });
    expect(globalEight.status).toBe("supported");
    if (globalEight.status === "supported") {
      expect(globalEight.bars.map((bar) => [bar.quarterBeats, bar.source])).toEqual([
        [8, "global-retained"], [8, "global-retained"],
      ]);
      expect(globalEight.states).toHaveLength(1);
    }
    const overriddenEight = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 8,
      cells: [
        cell(0, 2, [0, 4, 7], 0), cell(2, 4, [2, 7, 11], 7),
        cell(4, 6, [0, 5, 9], 5), cell(6, 8, [1, 4, 8], 1),
      ],
      globalHarmonicRhythm: { status: "supported", quarterBeats: 8 },
    });
    expect(overriddenEight.status).toBe("supported");
    if (overriddenEight.status === "supported") {
      expect(overriddenEight.bars.map((bar) => [bar.quarterBeats, bar.source])).toEqual([
        [2, "local-override"], [2, "local-override"],
      ]);
    }
    expect(estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4, cells: [cell(0, 4, [], undefined)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    })).toMatchObject({ status: "unknown", reason: "insufficient-local-evidence", legacyFallback: true });
    expect(periodFor([cell(0, 2, [0, 4, 7], 0), cell(2, 4, [2, 7, 11], 7)], 4)).toMatchObject({
      quarterBeats: 2, source: "local-override",
    });
  });

  it("splits a persistent same-upper slash state but merges a weak passing Bass", () => {
    const persistentSlash = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 7)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(persistentSlash.status).toBe("supported");
    if (persistentSlash.status === "supported") {
      expect(persistentSlash.states).toHaveLength(2);
      expect(persistentSlash.boundaries[0]).toMatchObject({
        decision: "split-structural-change",
        evidence: ["stable-upper-structure", "persistent-bass-change", "strong-metric-placement", "pitch-class-support", "temporal-continuity", "local-rhythm-support"],
      });
    }

    const passingBass = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [0, 4, 7], 0), { ...cell(2, 4, [0, 4, 7], 2), bassPersistence: 0.49 }],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(passingBass.status).toBe("supported");
    if (passingBass.status === "supported") {
      expect(passingBass.states).toHaveLength(1);
      expect(passingBass.states[0]?.structuralBassPitchClasses).toEqual([0]);
      expect(passingBass.boundaries[0]).toMatchObject({ decision: "merge-same-state" });
    }

    const ambiguousIdentityChange = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4,
      cells: [cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 5, 9], 0)],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    });
    expect(ambiguousIdentityChange.status).toBe("supported");
    if (ambiguousIdentityChange.status === "supported") {
      expect(ambiguousIdentityChange.states).toHaveLength(2);
      expect(ambiguousIdentityChange.boundaries[0]).toMatchObject({
        decision: "split-structural-change", evidence: ["persistent-upper-change", "strong-metric-placement", "pitch-class-support", "temporal-continuity", "local-rhythm-support"],
      });
    }
  });

  it("is deterministic, bounded, aggregate-only, and rejects excess candidate density", () => {
    const input: P526LocalHarmonicStateShadowInput = {
      meter: [4, 4], totalBeats: 8,
      cells: [
        cell(0, 2, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 2),
        cell(4, 6, [0, 5, 9], 5), cell(6, 8, [2, 7, 11], 7),
      ],
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    };
    const first = estimateP526LocalHarmonicStateShadow(input);
    expect(first).toEqual(estimateP526LocalHarmonicStateShadow(structuredClone(input)));
    expect(first.status).toBe("supported");
    if (first.status === "supported") {
      expect(first.operations).toEqual({
        inputCells: 4, bars: 2, candidateEvaluations: 8,
        barIndexCellVisits: 4,
        barIndexAssignments: 4,
        barLookups: 2,
        candidateCellVisits: 4,
        boundaryDecisions: 3, contextLookups: 2, stateAssignments: 4,
      });
      expect(first.operations.contextLookups).toBeLessThanOrEqual(first.operations.boundaryDecisions);
      expect(JSON.stringify(first)).not.toMatch(/(?:path|file|noteId|user)/i);
    }
    const denseCells = Array.from({ length: 5 }, (_, index) => (
      cell(index * 0.8, (index + 1) * 0.8, [0, 4, 7], 0)
    ));
    expect(estimateP526LocalHarmonicStateShadow({
      meter: [4, 4], totalBeats: 4, cells: denseCells,
      globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
    })).toMatchObject({ status: "unknown", reason: "unbounded-candidate-density", legacyFallback: true });
  });

  it("rejects unsupported meter, corrupt pitch classes, sparse arrays, and non-contiguous cells", () => {
    expect(estimateP526LocalHarmonicStateShadow({ meter: [3, 4] })).toMatchObject({
      status: "unknown", reason: "unsupported-meter",
    });
    const sparse = Array<P526LocalEvidenceCell>(1);
    for (const cells of [
      [cell(0, 4, [12], 0)],
      sparse,
      [cell(0, 1, [0, 4, 7], 0), cell(2, 4, [0, 4, 7], 0)],
    ]) {
      expect(estimateP526LocalHarmonicStateShadow({
        meter: [4, 4], totalBeats: 4, cells,
        globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" },
      })).toMatchObject({ status: "unknown", reason: "invalid-input", legacyFallback: true });
    }
  });
});

function periodFor(cells: readonly P526LocalEvidenceCell[], global: 1 | 2 | 4 | 8 | "unknown") {
  const result = estimateP526LocalHarmonicStateShadow({
    meter: [4, 4], totalBeats: 4, cells,
    globalHarmonicRhythm: global === "unknown"
      ? { status: "unknown", quarterBeats: "unknown" }
      : { status: "supported", quarterBeats: global },
  });
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw new Error("period fixture unexpectedly failed closed");
  return result.bars[0];
}

function changingCells(period: 1 | 2): readonly P526LocalEvidenceCell[] {
  const pitchSets = [[0, 4, 7], [2, 7, 11], [0, 5, 9], [1, 4, 8]] as const;
  return Array.from({ length: 4 / period }, (_, index) => (
    cell(index * period, (index + 1) * period, pitchSets[index] ?? pitchSets[0], index * 2)
  ));
}

function cellsFromFixtureNotes(
  notes: readonly { readonly pitch: number; readonly startBeat: number; readonly durationBeats: number; readonly velocity: number; readonly expectedLane: "bass" | "upper" }[],
  totalBeats: number,
  width: number,
): readonly P526LocalEvidenceCell[] {
  return cellsFromObservedNotes(notes.map((note) => ({
    pitch: note.pitch,
    startBeat: note.startBeat,
    durationBeats: note.durationBeats,
    lane: note.expectedLane,
    velocity: note.velocity,
  })), totalBeats, width);
}

function cellsFromPreparedData(
  prepared: ReturnType<typeof buildP526EightBarPreparedData>,
  width: number,
): readonly P526LocalEvidenceCell[] {
  return cellsFromObservedNotes(prepared.notes.map((note) => ({
    pitch: note.pitch,
    startBeat: note.startTick / prepared.ticksPerBeat,
    velocity: note.velocity,
    durationBeats: note.durationTick / prepared.ticksPerBeat,
    lane: note.trackIndex === 0 ? "bass" as const : "upper" as const,
  })), 32, width);
}

interface ObservedEvidenceNote {
  readonly pitch: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly lane: "bass" | "upper";
  readonly velocity: number;
}

function cellsFromObservedNotes(notes: readonly ObservedEvidenceNote[], totalBeats: number,
  width: number): readonly P526LocalEvidenceCell[] {
  return Array.from({ length: totalBeats / width }, (_, index) => {
    const startBeat = index * width;
    const endBeat = startBeat + width;
    const selected = notes.filter((note) => note.startBeat >= startBeat && note.startBeat < endBeat);
    const upper = selected.filter((note) => note.lane === "upper");
    const bass = selected.filter((note) => note.lane === "bass");
    const bassPitchClass = modalPitchClass(bass.map((note) => note.pitch));
    const upperOccupancy = averagePitchClassOccupancy(upper, startBeat, endBeat);
    const bassPersistence = bassPitchClass === undefined ? 0
      : pitchClassOccupancy(bass, bassPitchClass, startBeat, endBeat)
        * mean(bass.map((note) => note.velocity / 0.8));
    const metricNotes = bass.length > 0 ? bass : selected;
    const normalizedBeatStrength = metricNotes.length === 0 ? 0
      : mean(metricNotes.map((note) => isMetricBeat(note.startBeat) ? 1 : 0.8));
    const onsetSlots = new Set(selected.map((note) => note.startBeat)).size;
    return cell(
      startBeat,
      endBeat,
      uniquePitchClasses(upper.map((note) => note.pitch)),
      bassPitchClass,
      {
        upperPersistence: upperOccupancy,
        bassPersistence,
        normalizedBeatStrength,
        pitchClassSupport: upperOccupancy,
        temporalContinuity: upperOccupancy,
        localRhythmSupport: Math.min(1, onsetSlots / (width * 2)),
      },
    );
  });
}

function averagePitchClassOccupancy(notes: readonly ObservedEvidenceNote[], startBeat: number,
  endBeat: number): number {
  const pitchClasses = uniquePitchClasses(notes.map((note) => note.pitch));
  if (pitchClasses.length === 0) return 0;
  return mean(pitchClasses.map((pitchClass) => pitchClassOccupancy(notes, pitchClass, startBeat, endBeat)));
}

function pitchClassOccupancy(notes: readonly ObservedEvidenceNote[], pitchClass: number,
  startBeat: number, endBeat: number): number {
  const occupied = notes.filter((note) => ((note.pitch % 12) + 12) % 12 === pitchClass)
    .reduce((total, note) => total + Math.max(0,
      Math.min(endBeat, note.startBeat + note.durationBeats) - Math.max(startBeat, note.startBeat)), 0);
  return Math.min(1, occupied / (endBeat - startBeat));
}

function isMetricBeat(beat: number): boolean { return Math.abs(beat - Math.round(beat)) < 1e-9; }
function mean(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }

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

function modalPitchClass(pitches: readonly number[]): number | undefined {
  const counts = new Map<number, number>();
  pitches.forEach((pitch) => {
    const pitchClass = ((pitch % 12) + 12) % 12;
    counts.set(pitchClass, (counts.get(pitchClass) ?? 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0];
}

function uniquePitchClasses(pitches: readonly number[]): readonly number[] {
  return [...new Set(pitches.map((pitch) => ((pitch % 12) + 12) % 12))].sort((left, right) => left - right);
}

function stateCountsByBar(
  states: readonly { readonly startBeat: number; readonly endBeat: number }[],
  barCount: number,
): readonly number[] {
  return Array.from({ length: barCount }, (_, index) => {
    const start = index * 4;
    const end = start + 4;
    return states.filter((state) => state.startBeat < end && state.endBeat > start).length;
  });
}
