/**
 * P5.35-03 promotion-gate evidence (privacy-safe, synthetic only). Runs the
 * P5.35-02 shadow policy against the corrected P5.34 semantic corpus (S01–S07) to
 * prove the shadow re-ranking does NOT regress legitimate harmony. The private
 * LF-MIDI-001 fixture is evaluated separately by a local, uncommitted script (its
 * privacy-safe aggregates live only in the P5.35-03 report), never here.
 *
 * The evaluated policy is the frozen P5.35-02 shadow method at full carryover
 * removal (carryoverAttenuation = 0) — the strongest attenuation, chosen only
 * because it passes every gate, not because it best fixes any one fixture.
 */

import { describe, expect, it } from "vitest";

import { SEMANTIC_ORACLE } from "../p534/semanticOracle";
import { shadowRankWindows } from "./shadowRanking";
import type { MidiSongData } from "../../src/domain/midi/types";

const TPB = 96;

/** A single simultaneous chord (all pitches attack at 0 for 2 beats). */
function chordSong(pitches: number[]): MidiSongData {
  return {
    notes: pitches.map((pitch) => ({ pitch, startTick: 0, durationTick: 2 * TPB, velocity: 100, trackIndex: 0 })),
    ticksPerBeat: TPB,
    timeSignature: "4/4",
    totalBars: 1,
    tracks: [],
    controlChanges: [],
  };
}

const POLICY = { carryoverAttenuation: 0 } as const;

describe("P5.35-03 Gate B/C — corrected P5.34 corpus does not regress under shadow", () => {
  // Each corpus entry is a single sounded harmony: it has no prior-chord
  // carryover, so the shadow histogram must equal the legacy histogram and the
  // shadow top-1 must equal the legacy top-1. A change here would be a regression.
  for (const entry of SEMANTIC_ORACLE) {
    it(`${entry.id} (${entry.expectedLabel ?? "representability-limited"}) is untouched by shadow`, () => {
      const r = shadowRankWindows(chordSong(entry.pitches), new Map(), POLICY);
      const w0 = r.windows[0];
      expect(w0.carriedPcs).toEqual([]); // no carryover detected in a single harmony
      expect(w0.changed).toBe(false); // legacy top-1 == shadow top-1
      expect(r.carriedContributionCount).toBe(0);
    });
  }

  it("S05 C/E slash bass is preserved (Gate G) — shadow keeps the legacy label", () => {
    const s05 = SEMANTIC_ORACLE.find((e) => e.id === "S05")!;
    const r = shadowRankWindows(chordSong(s05.pitches), new Map(), POLICY);
    expect(r.windows[0].shadowChord).toBe(r.windows[0].legacyChord);
  });

  it("S01 Abmaj9 rich extended harmony is not simplified (Gate F)", () => {
    const s01 = SEMANTIC_ORACLE.find((e) => e.id === "S01")!;
    const r = shadowRankWindows(chordSong(s01.pitches), new Map(), POLICY);
    // Whatever the legacy top-1 family is, the shadow must not simplify it away.
    expect(r.windows[0].shadowChord).toBe(r.windows[0].legacyChord);
    expect(r.windows[0].changed).toBe(false);
  });
});
