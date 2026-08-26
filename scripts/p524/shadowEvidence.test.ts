import { describe, expect, it } from "vitest";
import {
  countP524UnsupportedBassEvidence,
  generateP524DenseBenchmarkNotes,
  generateP524SyntheticFixtures,
} from "./harmonicFragmentFixtures";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  toP524ShadowNotes,
  type P524BassLaneEvidence,
  type P524ShadowInput,
  type P524ShadowNote,
} from "./shadowEvidence";
import { runP524Stage01BenchmarkEnforced } from "./shadowEvidenceBenchmark";

const fixtures = generateP524SyntheticFixtures();

function shadowInput(fixture: (typeof fixtures)[number]): P524ShadowInput {
  return {
    notes: toP524ShadowNotes(fixture.notes),
    meter: fixture.meter,
    totalBeats: fixture.totalBeats,
  };
}

function cadenceInput(period: number, totalBeats: number): P524ShadowInput {
  const chords = [[52, 55, 60], [50, 55, 59]] as const;
  const notes: P524ShadowNote[] = [{
    id: "pedal",
    pitch: 36,
    startBeat: 0,
    durationBeats: totalBeats,
    velocity: 0.8,
  }];
  for (let beat = 0; beat < totalBeats; beat += 1) {
    const chord = chords[Math.floor(beat / period) % chords.length];
    chord.forEach((pitch, index) => notes.push({
      id: `upper-${beat}-${index}`,
      pitch,
      startBeat: beat,
      durationBeats: 0.85,
      velocity: 0.8,
    }));
  }
  return { notes, meter: [4, 4], totalBeats };
}

function stableTextureInput(totalBeats: number): P524ShadowInput {
  const notes: P524ShadowNote[] = [];
  for (let beat = 0; beat < totalBeats; beat += 1) {
    [36, 52, 55, 60].forEach((pitch, index) => notes.push({
      id: `stable-${beat}-${index}`,
      pitch,
      startBeat: beat,
      durationBeats: 0.85,
      velocity: 0.8,
    }));
  }
  return { notes, meter: [4, 4], totalBeats };
}

function mixedOneThenFourInput(): P524ShadowInput {
  const notes: P524ShadowNote[] = [{
    id: "mixed-pedal",
    pitch: 36,
    startBeat: 0,
    durationBeats: 12,
    velocity: 0.8,
  }];
  const chords = [[52, 55, 60], [50, 55, 59]] as const;
  for (let beat = 0; beat < 12; beat += 1) {
    const chordIndex = beat < 4 ? beat % 2 : beat < 8 ? 0 : 1;
    chords[chordIndex].forEach((pitch, index) => notes.push({
      id: `mixed-upper-${beat}-${index}`,
      pitch,
      startBeat: beat,
      durationBeats: 0.85,
      velocity: 0.8,
    }));
  }
  return { notes, meter: [4, 4], totalBeats: 12 };
}

describe("P5.24-01 Harmonic Rhythm shadow evidence", () => {
  it("returns exact supported A-J global evidence and only K fail-closed fallback", () => {
    const results = fixtures.map((fixture) => {
      const input = shadowInput(fixture);
      const bassLane = estimateP524BassLane(input);
      const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
      return {
        id: fixture.id,
        quarterBeats: harmonicRhythm.quarterBeats,
        status: harmonicRhythm.status,
        legacyFallback: harmonicRhythm.legacyFallback,
      };
    });
    expect(results).toEqual(fixtures.map((fixture) => ({
      id: fixture.id,
      quarterBeats: fixture.expectedHarmonicRhythm,
      status: fixture.id === "K" ? "unknown" : "supported",
      legacyFallback: fixture.id === "K",
    })));
    expect(results.filter((entry) => entry.legacyFallback).map((entry) => entry.id)).toEqual(["K"]);
  });

  it("infers 1/2/8-beat upper-texture periodicity over a pedal Bass independently of Bass changes", () => {
    for (const [period, totalBeats] of [[1, 8], [2, 8], [8, 16]] as const) {
      const input = cadenceInput(period, totalBeats);
      const bassLane = estimateP524BassLane(input);
      expect(bassLane.states).toEqual([{ startBeat: 0, endBeat: totalBeats, pitchClass: 0 }]);
      expect(estimateP524HarmonicRhythm(input, bassLane)).toMatchObject({
        status: "supported",
        quarterBeats: period,
        legacyFallback: false,
      });
    }
  });

  it("fails closed for unsupported 3/6-beat, mixed, non-4/4, and fractional global evidence", () => {
    for (const [period, totalBeats] of [[3, 12], [6, 12]] as const) {
      expect(estimateP524HarmonicRhythm(cadenceInput(period, totalBeats))).toMatchObject({
        status: "unknown",
        quarterBeats: "unknown",
        legacyFallback: true,
        reason: "unsupported-global-periodicity",
      });
    }
    const fixtureK = fixtures.find((fixture) => fixture.id === "K")!;
    expect(estimateP524HarmonicRhythm(shadowInput(fixtureK))).toMatchObject({
      status: "unknown",
      reason: "mixed-global-periodicity",
    });
    const nonFourFour = { ...shadowInput(fixtures[0]), meter: [3, 4] };
    expect(estimateP524HarmonicRhythm(nonFourFour)).toMatchObject({
      status: "unknown",
      reason: "unsupported-meter",
    });
    const fractional = { ...shadowInput(fixtures[0]), totalBeats: 7.5 };
    expect(estimateP524HarmonicRhythm(fractional)).toMatchObject({
      status: "unknown",
      reason: "invalid-input",
    });
  });

  it("fails closed for mixed one-beat then four-beat evidence and sparse long-span notes", { timeout: 10_000 }, () => {
    expect(estimateP524HarmonicRhythm(mixedOneThenFourInput())).toMatchObject({
      status: "unknown",
      quarterBeats: "unknown",
      legacyFallback: true,
      reason: "mixed-global-periodicity",
    });
    const sparseSource = cadenceInput(4, 100_000);
    const sparse = { ...sparseSource, notes: [sparseSource.notes[0], sparseSource.notes.at(-1)!] };
    expect(estimateP524HarmonicRhythm(sparse)).toMatchObject({
      status: "unknown",
      reason: "insufficient-global-evidence",
    });
  });

  it("rejects fabricated caller Bass timelines, candidates, and counters", () => {
    const input = stableTextureInput(12);
    const measured = estimateP524BassLane(input);
    expect(measured.status).toBe("supported");
    const unsupported: P524BassLaneEvidence = {
      ...measured,
      states: [
        { startBeat: 0, endBeat: 3, pitchClass: 0 },
        { startBeat: 3, endBeat: 6, pitchClass: 2 },
        { startBeat: 6, endBeat: 9, pitchClass: 4 },
        { startBeat: 9, endBeat: 12, pitchClass: 5 },
      ],
    };
    const fabricatedCandidates = { ...measured, candidates: [] };
    const fabricatedCounters = {
      ...measured,
      operations: {
        ...measured.operations,
        profileSweepCells: measured.operations.profileSweepCells + 1,
      },
    };
    for (const supplied of [unsupported, fabricatedCandidates, fabricatedCounters]) {
      expect(estimateP524HarmonicRhythm(input, supplied)).toMatchObject({
        status: "unknown",
        reason: "invalid-bass-lane",
      });
    }
  });

  it("is deterministic, order-independent, and leaves input untouched", () => {
    fixtures.forEach((fixture) => {
      const input = shadowInput(fixture);
      const before = structuredClone(input);
      const reversed = { ...input, notes: [...input.notes].reverse() };
      const firstBass = estimateP524BassLane(input);
      const reversedBass = estimateP524BassLane(reversed);
      expect(reversedBass).toEqual(firstBass);
      expect(estimateP524HarmonicRhythm(reversed, reversedBass))
        .toEqual(estimateP524HarmonicRhythm(input, firstBass));
      expect(input).toEqual(before);
    });
  });
});

describe("P5.24-01 Voice-internal Bass Lane shadow evidence", () => {
  it("matches exact locked A-K truth with zero unsupported evidence", () => {
    fixtures.forEach((fixture) => {
      const bassLane = estimateP524BassLane(shadowInput(fixture));
      expect(bassLane.status, fixture.id).toBe("supported");
      expect(bassLane.states, fixture.id).toEqual(fixture.expectedBassStates);
      expect(countP524UnsupportedBassEvidence(fixture.notes, bassLane.states), fixture.id).toBe(0);
      expect(bassLane.candidates.every((entry) => Number.isFinite(entry.combinedScore)), fixture.id).toBe(true);
    });
  });

  it("keeps walking/passing Bass transient and preserves pedal/inversion states", () => {
    const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const lane = (id: "B" | "G" | "H" | "I") => estimateP524BassLane(shadowInput(byId.get(id)!));
    expect(lane("B").states).toEqual([{ startBeat: 0, endBeat: 8, pitchClass: 0, transientPitchClasses: [2] }]);
    expect(lane("G").states).toEqual([{ startBeat: 0, endBeat: 8, pitchClass: 0 }]);
    expect(lane("H").states).toEqual([{
      startBeat: 0,
      endBeat: 8,
      pitchClass: 0,
      transientPitchClasses: [2, 4, 5, 7, 9, 11],
    }]);
    expect(lane("I").states).toEqual([
      { startBeat: 0, endBeat: 4, pitchClass: 4 },
      { startBeat: 4, endBeat: 8, pitchClass: 7 },
    ]);

    const passing = stableTextureInput(6);
    passing.notes.filter((note) => note.pitch === 36).forEach(() => undefined);
    const passingNotes = passing.notes.filter((note) => note.pitch !== 36);
    [36, 36, 38, 38, 36, 36].forEach((pitch, beat) => passingNotes.push({
      id: `passing-${beat}`,
      pitch,
      startBeat: beat,
      durationBeats: 0.85,
      velocity: 0.8,
    }));
    expect(estimateP524BassLane({ ...passing, notes: passingNotes }).states).toEqual([{
      startBeat: 0,
      endBeat: 6,
      pitchClass: 0,
      transientPitchClasses: [2],
    }]);
  });

  it("keeps repeated passing C-C/D-D-D/C-C-C transient without upper change context", () => {
    const upper = stableTextureInput(8).notes.filter((note) => note.pitch >= 48);
    const bass = [36, 36, 38, 38, 38, 36, 36, 36].map((pitch, beat) => ({
      id: `repeated-passing-${beat}`,
      pitch,
      startBeat: beat,
      durationBeats: 0.85,
      velocity: 0.8,
    }));
    expect(estimateP524BassLane({ notes: [...upper, ...bass], meter: [4, 4], totalBeats: 8 }).states)
      .toEqual([{ startBeat: 0, endBeat: 8, pitchClass: 0, transientPitchClasses: [2] }]);
  });

  it("requires persistent independent Bass evidence and rejects low upper-role traps", () => {
    const upperTexture = stableTextureInput(8).notes.filter((note) => note.pitch >= 48);
    const shortOutlier: P524ShadowInput = {
      meter: [4, 4],
      totalBeats: 8,
      notes: [...upperTexture, {
        id: "short-low-outlier",
        pitch: 36,
        startBeat: 1.5,
        durationBeats: 0.05,
        velocity: 0.8,
        rolePrior: "upper",
      }],
    };
    expect(estimateP524BassLane(shortOutlier)).toMatchObject({ status: "unavailable", states: [] });

    const repeatedUpper47: P524ShadowInput = {
      meter: [4, 4],
      totalBeats: 8,
      notes: Array.from({ length: 8 }, (_, beat) => ({
        id: `upper47-${beat}`,
        pitch: 47,
        startBeat: beat,
        durationBeats: 0.85,
        velocity: 0.8,
        rolePrior: "upper" as const,
      })),
    };
    expect(estimateP524BassLane(repeatedUpper47)).toMatchObject({ status: "unavailable", states: [] });
  });

  it("does not expand one sparse role-prior Bass note across the piece", () => {
    const notes = stableTextureInput(8).notes.filter((note) => note.pitch >= 48);
    notes.push({
      id: "single-role-prior-bass",
      pitch: 36,
      startBeat: 0,
      durationBeats: 0.25,
      velocity: 0.8,
      rolePrior: "bass",
    });
    const input: P524ShadowInput = { notes, meter: [4, 4], totalBeats: 8 };
    expect(estimateP524BassLane(input)).toMatchObject({
      status: "unavailable",
      states: [],
      reason: "insufficient-persistent-context",
    });

    const sparseAnchors: P524ShadowInput = {
      ...input,
      notes: [
        ...notes.filter((note) => note.id !== "single-role-prior-bass"),
        { id: "sparse-bass-start", pitch: 36, startBeat: 0, durationBeats: 0.25, velocity: 0.8, rolePrior: "bass" },
        { id: "sparse-bass-end", pitch: 36, startBeat: 7, durationBeats: 0.25, velocity: 0.8, rolePrior: "bass" },
      ],
    };
    expect(estimateP524BassLane(sparseAnchors)).toMatchObject({
      status: "unavailable",
      states: [],
      reason: "insufficient-persistent-context",
    });
  });

  it("uses combined evidence rather than the minimum pitch at an attack", () => {
    const input: P524ShadowInput = {
      meter: [4, 4],
      totalBeats: 4,
      notes: [
        { id: "short-low", pitch: 35, startBeat: 0, durationBeats: 0.05, velocity: 0.2, rolePrior: "upper" },
        { id: "supported-bass", pitch: 40, startBeat: 0, durationBeats: 4, velocity: 0.8, rolePrior: "bass" },
        { id: "upper", pitch: 52, startBeat: 0, durationBeats: 4, velocity: 0.8, rolePrior: "upper" },
      ],
    };
    expect(estimateP524BassLane(input).states).toEqual([{ startBeat: 0, endBeat: 4, pitchClass: 4 }]);
  });
});

describe("P5.24-01 fail-closed public wrappers", () => {
  it("returns unavailable/unknown without throwing for malformed input", () => {
    const valid = shadowInput(fixtures[0]);
    const malformed: readonly unknown[] = [
      null,
      undefined,
      false,
      [],
      {},
      { ...valid, notes: null },
      { ...valid, notes: [valid.notes[0], valid.notes[0]] },
      { ...valid, notes: [{ ...valid.notes[0], rolePrior: "lead" }] },
      { ...valid, notes: [{ ...valid.notes[0], durationBeats: Number.NaN }] },
      { ...valid, meter: [4] },
      { ...valid, meter: new Array<number>(2) },
      { ...valid, notes: new Array<P524ShadowNote>(1) },
    ];
    malformed.forEach((input) => {
      expect(() => estimateP524BassLane(input)).not.toThrow();
      expect(estimateP524BassLane(input)).toMatchObject({ status: "unavailable", states: [], reason: "invalid-input" });
      expect(() => estimateP524HarmonicRhythm(input)).not.toThrow();
      expect(estimateP524HarmonicRhythm(input)).toMatchObject({ status: "unknown", reason: "invalid-input" });
    });
  });

  it("rejects sparse nested Bass evidence and corrupt candidate diagnostics", () => {
    const input = shadowInput(fixtures[0]);
    const measured = estimateP524BassLane(input);
    const sparseCandidates = new Array<P524BassLaneEvidence["candidates"][number]>(measured.candidates.length);
    for (let index = 1; index < measured.candidates.length; index += 1) {
      sparseCandidates[index] = measured.candidates[index];
    }
    const sparseStates = new Array<P524BassLaneEvidence["states"][number]>(measured.states.length);
    const sparseTransient = new Array<number>(1);
    const malformed: readonly unknown[] = [
      { ...measured, candidates: sparseCandidates },
      { ...measured, states: sparseStates },
      {
        ...measured,
        candidates: measured.candidates.map((candidate, index) => (
          index === 0 ? { ...candidate, rolePrior: 0.25 } : candidate
        )),
      },
      {
        ...measured,
        candidates: measured.candidates.map((candidate, index) => (
          index === 0 ? { ...candidate, combinedScore: Number.NaN } : candidate
        )),
      },
      {
        ...measured,
        states: measured.states.map((state, index) => (
          index === 0 ? { ...state, transientPitchClasses: sparseTransient } : state
        )),
      },
    ];
    for (const bassLane of malformed) {
      expect(() => estimateP524HarmonicRhythm(input, bassLane)).not.toThrow();
      expect(estimateP524HarmonicRhythm(input, bassLane)).toMatchObject({
        status: "unknown",
        reason: "invalid-bass-lane",
      });
    }
  });

  it("rejects malformed caller Bass timelines without throwing", () => {
    const input = shadowInput(fixtures[0]);
    const malformedBass: readonly unknown[] = [
      null,
      {},
      { status: "supported", states: [] },
      { status: "supported", states: [{ startBeat: 1, endBeat: 8, pitchClass: 0 }], candidates: [], operations: {} },
      {
        status: "supported",
        states: [{ startBeat: 0, endBeat: 7, pitchClass: 0 }],
        candidates: [],
        operations: estimateP524BassLane(input).operations,
      },
    ];
    malformedBass.forEach((bassLane) => {
      expect(() => estimateP524HarmonicRhythm(input, bassLane)).not.toThrow();
      expect(estimateP524HarmonicRhythm(input, bassLane)).toMatchObject({
        status: "unknown",
        reason: "invalid-bass-lane",
      });
    });
  });
});

describe("P5.24-01 bounded shadow processing", () => {
  it("measures dense E x128 with explicit timeout and honest operation evidence", { timeout: 10_000 }, () => {
    const notes = generateP524DenseBenchmarkNotes(128);
    const input: P524ShadowInput = {
      notes: toP524ShadowNotes(notes),
      meter: [4, 4],
      totalBeats: 8 * 128,
    };
    const start = performance.now();
    const bassLane = estimateP524BassLane(input);
    const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
    const elapsedMs = performance.now() - start;
    expect(notes).toHaveLength(3_072);
    expect(bassLane.operations).toMatchObject({ inputNotes: notes.length });
    expect(harmonicRhythm.operations).toMatchObject({ inputNotes: notes.length });
    expect(Object.values(bassLane.operations).every(Number.isFinite)).toBe(true);
    expect(Object.values(harmonicRhythm.operations).every(Number.isFinite)).toBe(true);
    expect(harmonicRhythm).toMatchObject({ status: "supported", quarterBeats: 2, legacyFallback: false });
    expect(elapsedMs).toBeLessThan(10_000);
  });

  it("handles a long constant shuffled texture without spread limits", { timeout: 10_000 }, () => {
    const input = stableTextureInput(4_096);
    const reversed = { ...input, notes: [...input.notes].reverse() };
    const start = performance.now();
    const first = estimateP524BassLane(input);
    const second = estimateP524BassLane(reversed);
    expect(second).toEqual(first);
    expect(estimateP524HarmonicRhythm(input, first)).toMatchObject({ status: "supported", quarterBeats: 4 });
    expect(performance.now() - start).toBeLessThan(10_000);
  });

  it("uses event updates plus a bounded sweep for 100k-beat held overlap", { timeout: 10_000 }, () => {
    const input: P524ShadowInput = {
      notes: [
        { id: "held-bass", pitch: 36, startBeat: 0, durationBeats: 100_000, velocity: 0.8 },
        { id: "held-upper-c", pitch: 52, startBeat: 0, durationBeats: 100_000, velocity: 0.8 },
        { id: "held-upper-e", pitch: 55, startBeat: 0, durationBeats: 100_000, velocity: 0.8 },
        { id: "held-upper-g", pitch: 60, startBeat: 0, durationBeats: 100_000, velocity: 0.8 },
      ],
      meter: [4, 4],
      totalBeats: 100_000,
    };
    const start = performance.now();
    const bassLane = estimateP524BassLane(input);
    const harmonicRhythm = estimateP524HarmonicRhythm(input, bassLane);
    expect(bassLane.operations).toMatchObject({
      inputNotes: 4,
      profileEventUpdates: 12,
      profileSweepCells: 1_200_000,
    });
    expect(harmonicRhythm.operations).toMatchObject({
      inputNotes: 4,
      profileEventUpdates: 24,
      profileSweepCells: 2_400_000,
    });
    expect(harmonicRhythm).toMatchObject({
      status: "unknown",
      reason: "insufficient-global-evidence",
    });
    expect(performance.now() - start).toBeLessThan(10_000);
  });

  it("runs the locked benchmark behind an enforced 10-second child boundary", { timeout: 15_000 }, async () => {
    const outcome = await runP524Stage01BenchmarkEnforced();
    expect(outcome).toMatchObject({
      status: "completed",
      provenance: "p524-dense-synthetic-E-x128-v1",
      sourceFixture: "E",
      repetitions: 128,
      noteCount: 3_072,
      warmupCount: 3,
      sampleCount: 7,
      timeoutMs: 10_000,
      timeoutEnforced: true,
      timedOut: false,
    });
    if (outcome.status !== "completed") throw new Error("locked benchmark unexpectedly timed out");
    expect(outcome.warmupDurationsMs).toHaveLength(3);
    expect(outcome.sampleDurationsMs).toHaveLength(7);
    expect([...outcome.sampleDurationsMs].sort((left, right) => left - right)[3]).toBe(outcome.medianMs);
    expect(Math.max(...outcome.sampleDurationsMs)).toBe(outcome.maximumMs);
    expect([...outcome.warmupDurationsMs, ...outcome.sampleDurationsMs]
      .every((duration) => Number.isFinite(duration) && duration > 0 && duration < 2_000)).toBe(true);
  });

  it("terminates the benchmark child on an injected short timeout", { timeout: 2_000 }, async () => {
    const start = performance.now();
    const outcome = await runP524Stage01BenchmarkEnforced({ timeoutMs: 25, childDelayMs: 250 });
    expect(outcome).toMatchObject({
      status: "timed-out",
      timeoutMs: 25,
      timeoutEnforced: true,
      timedOut: true,
    });
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
