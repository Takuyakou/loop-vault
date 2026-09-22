/**
 * P5.37-01 — meter-parameterization behavior guard + reuse-feasibility finding
 * (privacy-safe, synthetic only). It locks:
 *  (1) the beatsPerBar parameterization is behavior-preserving (default == {beatsPerBar:4});
 *  (2) the production analyzer path is UNCHANGED — 1/4 + flag ON still returns
 *      `unsupported-meter` (the gate removal is P5.37-03's job, post-promotion);
 *  (3) the shadow seam applies on dense 4/4 (correct C->Am split);
 *  (4) the FINDING: the meter-generalized engine falls back on non-4/4 (beatsPerBar=1)
 *      at its 4/4-shaped bar-period core (`ambiguous-local-evidence`), so a minimal
 *      parameterization does NOT make it operate on 1/4;
 *  (5) source immutability + determinism.
 */

import { describe, expect, it } from "vitest";

import {
  estimateLocalHarmonicStatesForShadow,
  prepareLocalHarmonicStateAnalyzerOptions,
} from "../../src/domain/midi/localHarmonicStateIntegration";
import type { MidiSongData } from "../../src/domain/midi/types";

const TPB = 96;
const BEAT = 96;

function song(notes: { pitch: number; startTick: number; durationTick: number }[], totalBars: number, timeSignature: string): MidiSongData {
  return {
    notes: notes.map((n) => ({ ...n, velocity: 0.78, trackIndex: 0 })),
    ticksPerBeat: TPB,
    timeSignature,
    totalBars,
    tracks: [],
    controlChanges: [],
  };
}

/** Two held chord regions (C major bass C, then A minor bass A), `regionBeats` each. */
function twoRegion(timeSignature: string, totalBars: number, regionBeats: number): MidiSongData {
  const rb = regionBeats * BEAT;
  return song([
    { pitch: 36, startTick: 0, durationTick: rb }, { pitch: 48, startTick: 0, durationTick: rb },
    { pitch: 52, startTick: 0, durationTick: rb }, { pitch: 55, startTick: 0, durationTick: rb },
    { pitch: 33, startTick: rb, durationTick: rb }, { pitch: 45, startTick: rb, durationTick: rb },
    { pitch: 48, startTick: rb, durationTick: rb }, { pitch: 52, startTick: rb, durationTick: rb },
  ], totalBars, timeSignature);
}

const dense44 = twoRegion("4/4", 2, 4);
const dense14 = twoRegion("1/4", 8, 4);

describe("P5.37-01 meter parameterization — behavior guards", () => {
  it("beatsPerBar parameterization is behavior-preserving (default == {beatsPerBar:4}) on 4/4", () => {
    const dflt = estimateLocalHarmonicStatesForShadow(new Uint8Array(), { preparedData: dense44 });
    const explicit = estimateLocalHarmonicStatesForShadow(new Uint8Array(), { preparedData: dense44, beatsPerBar: 4 });
    expect(JSON.stringify(dflt)).toBe(JSON.stringify(explicit));
  });

  it("shadow seam applies on dense 4/4 and splits the C->Am change", () => {
    const r = estimateLocalHarmonicStatesForShadow(new Uint8Array(), { preparedData: dense44 });
    expect(r.applied).toBe(true);
    expect(r.result?.status).toBe("supported");
    if (r.result?.status === "supported") {
      expect(r.result.states.length).toBe(2); // two coherent harmonic states
      expect(r.result.boundaries.some((b) => b.decision === "split-structural-change")).toBe(true);
    }
  });

  it("FINDING: the meter-generalized engine falls back on 1/4 (beatsPerBar=1) at its 4/4 bar-period core", () => {
    for (const neutralize of [false, true]) {
      const r = estimateLocalHarmonicStatesForShadow(new Uint8Array(), { preparedData: dense14, neutralizeBarPositionPrior: neutralize });
      expect(r.applied).toBe(false); // minimal parameterization is NOT sufficient for 1/4
      expect(r.beatsPerBar).toBe(1);
      expect(r.reason).toMatch(/ambiguous-local-evidence|insufficient-local-evidence/);
    }
  });

  it("PRODUCTION PATH UNCHANGED: 1/4 + flag ON still returns unsupported-meter", () => {
    const prep = prepareLocalHarmonicStateAnalyzerOptions(new Uint8Array(), {
      enableLocalHarmonicStateConsolidation: true,
      preparedData: dense14,
    } as never);
    expect(prep.applied).toBe(false);
    expect(prep.reason).toBe("unsupported-meter");
  });

  it("does not mutate the source data (incl. meter) and is deterministic", () => {
    const before = JSON.stringify(dense14);
    const a = estimateLocalHarmonicStatesForShadow(new Uint8Array(), { preparedData: dense14 });
    const b = estimateLocalHarmonicStatesForShadow(new Uint8Array(), { preparedData: dense14 });
    expect(JSON.stringify(dense14)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
