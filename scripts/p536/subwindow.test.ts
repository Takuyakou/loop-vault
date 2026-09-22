/**
 * P5.36-03 sub-window / score-decomposition tests. Shadow/diagnostic only.
 *
 * (1) Parity guard: the replica scorer's top-1 equals production `matchWindow`'s on
 *     every fixture window (proves the ranks used below are production-faithful).
 * (2) The `unionOnlyWinner` discriminator fires ONLY for a genuine two-harmony
 *     chimera and is FALSE for every over-split hard negative (same-chord
 *     re-attack, rolled/arpeggiated chord, layered extended chord, genuine slash,
 *     syncopation) — because in those the W2 winner also wins at least one beat.
 */

import { describe, expect, it } from "vitest";

import { buildWeightedWindows, matchWindow } from "../../src/domain/midi/legacy";
import { maxIndex, rankCandidates } from "./shadowScore";
import { analyzeSubwindows, type SubwindowResult } from "./subwindow";
import {
  arpeggiatedOneChord,
  layeredExtendedChord,
  rolledOneChord,
  sameChordReattack,
  song,
  structuralBassChange,
  syncopatedAttack,
  trueTwoHarmony,
} from "./fixtures";
import type { MidiSongData } from "../../src/domain/midi/types";

const cEslash: MidiSongData = song([
  { pitch: 40, startTick: 0, durationTick: 192 },
  ...[60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 192 })),
]);

const ALL = [
  sameChordReattack, rolledOneChord, arpeggiatedOneChord, layeredExtendedChord,
  trueTwoHarmony, structuralBassChange, syncopatedAttack, cEslash,
];

function w0(data: MidiSongData): SubwindowResult {
  const r = analyzeSubwindows(data, new Map());
  return r.windows[0]!;
}

describe("shadowScore — production parity guard (§6)", () => {
  it("replica top-1 equals production matchWindow top-1 on every fixture window", () => {
    let checked = 0;
    for (const d of ALL) {
      for (const dur of [2, 1] as const) {
        for (const w of buildWeightedWindows(d, new Map(), dur)) {
          if (w.totalWeight <= 0) continue;
          checked += 1;
          expect(rankCandidates(w.histogram, maxIndex(w.bassHistogram))[0].label).toBe(matchWindow(w).chord.label);
        }
      }
    }
    expect(checked).toBeGreaterThan(15);
  });
});

describe("subwindow — union-only winner discriminator", () => {
  it("true two-harmony is a union-only chimera (W2 winner wins neither beat)", () => {
    const w = w0(trueTwoHarmony);
    expect(w.unionOnlyWinner).toBe(true);
    expect(w.b0Winner).not.toBe(w.b1Winner); // distinct per-beat harmonies
    expect(w.w2Winner).not.toBe(w.b0Winner);
    expect(w.w2Winner).not.toBe(w.b1Winner);
    expect(w.w2WinnerRankInB0!).toBeGreaterThan(1);
    expect(w.w2WinnerRankInB1!).toBeGreaterThan(1);
    expect(w.winnerSupportSpansBothBeats).toBe(true); // chimera support
    expect(w.bassChange).toBe(true);
  });

  it("same-chord re-attack is NOT union-only (same harmony both beats)", () => {
    const w = w0(sameChordReattack);
    expect(w.unionOnlyWinner).toBe(false);
    expect(w.b0Winner).toBe(w.b1Winner);
  });

  it("rolled one chord is NOT union-only (W2 winner also wins a beat)", () => {
    expect(w0(rolledOneChord).unionOnlyWinner).toBe(false);
  });

  it("layered extended chord is NOT union-only, and keeps a held bass (over-split guard)", () => {
    const w = w0(layeredExtendedChord);
    expect(w.unionOnlyWinner).toBe(false);
    expect(w.bassChange).toBe(false);
  });

  it("genuine C/E slash is NOT union-only and stays a slash in every view", () => {
    const w = w0(cEslash);
    expect(w.unionOnlyWinner).toBe(false);
    expect(w.w2Winner).toContain("/");
    expect(w.b0Winner).toContain("/");
  });

  it("syncopated late attack is NOT union-only", () => {
    expect(w0(syncopatedAttack).unionOnlyWinner).toBe(false);
  });

  it("structural-bass change alone (same harmony) is NOT union-only", () => {
    expect(w0(structuralBassChange).unionOnlyWinner).toBe(false);
  });
});

describe("subwindow — invariants", () => {
  it("never mutates the source data", () => {
    const before = JSON.stringify(trueTwoHarmony);
    analyzeSubwindows(trueTwoHarmony, new Map());
    expect(JSON.stringify(trueTwoHarmony)).toBe(before);
  });

  it("is deterministic across runs", () => {
    for (const d of [trueTwoHarmony, layeredExtendedChord, rolledOneChord]) {
      expect(JSON.stringify(analyzeSubwindows(d, new Map()))).toBe(JSON.stringify(analyzeSubwindows(d, new Map())));
    }
  });
});
