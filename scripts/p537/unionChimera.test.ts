/**
 * P5.37-01 (Option 2) union-chimera shadow tests. Privacy-safe / synthetic. They
 * lock the FROZEN policy (minBucketPcs = 3; trigger = winner-wins-neither-beat AND
 * buckets-different-identity AND support-spans-both AND both-buckets-analyzable):
 *  - the P5.36-03 true-two-harmony chimera triggers and restores two coherent states;
 *  - EVERY hard negative and the corrected corpus do NOT trigger (bounded, not a
 *    global 1-beat split);
 *  - determinism + source immutability.
 * The private LF-MIDI-001 evaluation lives only in the report (aggregates).
 */

import { describe, expect, it } from "vitest";

import { analyzeUnionChimera } from "./unionChimera";
import { SEMANTIC_ORACLE } from "../p534/semanticOracle";
import {
  arpeggiatedOneChord,
  layeredExtendedChord,
  rolledOneChord,
  sameChordReattack,
  song,
  structuralBassChange,
  syncopatedAttack,
  trueTwoHarmony,
} from "../p536/fixtures";
import {
  commonTone,
  contamination,
  heldHarmony,
  padSustain,
  unrearticulatedCommonTone,
} from "../p535/fixtures";
import type { MidiSongData } from "../../src/domain/midi/types";

const cEslash: MidiSongData = song([
  { pitch: 40, startTick: 0, durationTick: 192 },
  ...[60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 192 })),
]);

function chordSong(pitches: number[]): MidiSongData {
  return {
    notes: pitches.map((pitch) => ({ pitch, startTick: 0, durationTick: 192, velocity: 100, trackIndex: 0 })),
    ticksPerBeat: 96, timeSignature: "4/4", totalBars: 1, tracks: [], controlChanges: [],
  };
}

describe("union-chimera — positive (P5.36-confirmed mechanism)", () => {
  it("true two-harmony triggers and restores two coherent local states", () => {
    const r = analyzeUnionChimera(trueTwoHarmony, new Map());
    const w = r.windows[0]!;
    expect(w.triggered).toBe(true);
    expect(w.reason).toBe("union-chimera-detected");
    expect(w.winnerWinsNeitherBeat).toBe(true);
    expect(w.bucketsDifferentIdentity).toBe(true);
    expect(w.supportSpansBothBeats).toBe(true);
    // The W2 chimera partitions into the two beats' coherent single chords.
    expect(w.state0).not.toBeNull();
    expect(w.state1).not.toBeNull();
    expect(w.state0).not.toBe(w.state1);
    expect(w.state0).not.toBe(w.w2Winner);
  });
});

describe("union-chimera — hard negatives never trigger (bounded, not a 1-beat split)", () => {
  for (const [name, fx] of [
    ["same-chord re-attack", sameChordReattack],
    ["rolled one chord", rolledOneChord],
    ["arpeggiated one chord", arpeggiatedOneChord],
    ["layered extended (Cmaj9)", layeredExtendedChord],
    ["structural-bass change (same harmony)", structuralBassChange],
    ["syncopated late attack", syncopatedAttack],
    ["genuine C/E slash", cEslash],
    ["held maj9", heldHarmony],
    ["pad / long sustain", padSustain],
    ["re-articulated common tone", commonTone],
    ["unrearticulated common tone", unrearticulatedCommonTone],
    ["carryover contamination", contamination],
  ] as const) {
    it(`${name}: no window triggers`, () => {
      const r = analyzeUnionChimera(fx, new Map());
      expect(r.triggeredCount).toBe(0);
      expect(r.triggerRate).toBe(0);
    });
  }
});

describe("union-chimera — corrected corpus does not trigger", () => {
  for (const entry of SEMANTIC_ORACLE) {
    it(`${entry.id} (${entry.expectedLabel ?? "representability-limited"}) is untouched`, () => {
      const r = analyzeUnionChimera(chordSong(entry.pitches), new Map());
      expect(r.triggeredCount).toBe(0);
    });
  }
});

describe("union-chimera — invariants", () => {
  it("never mutates source data", () => {
    const before = JSON.stringify(trueTwoHarmony);
    analyzeUnionChimera(trueTwoHarmony, new Map());
    expect(JSON.stringify(trueTwoHarmony)).toBe(before);
  });

  it("is deterministic", () => {
    for (const fx of [trueTwoHarmony, layeredExtendedChord, contamination]) {
      expect(JSON.stringify(analyzeUnionChimera(fx, new Map()))).toBe(JSON.stringify(analyzeUnionChimera(fx, new Map())));
    }
  });
});
