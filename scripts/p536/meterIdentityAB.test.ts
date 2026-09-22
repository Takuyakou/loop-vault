/**
 * P5.36-02 meter-normalized identity A/B tests (shadow/diagnostic). They assert
 * that changing ONLY the diagnostic meter view (1/4 -> 4/4) does not change legacy
 * fixed-2-beat chord identity for synthetic controls, that window membership is
 * preserved, that any histogram difference is a per-window scalar that cancels in
 * scoring, and that the diagnostic is source-immutable and deterministic.
 */

import { describe, expect, it } from "vitest";

import { meterIdentityAB } from "./meterIdentityAB";
import { layeredExtendedChord, sameChordReattack, song, trueTwoHarmony } from "./fixtures";
import type { MidiSongData } from "../../src/domain/midi/types";

const BEAT = 96;

/** Re-view a fixture under 1/4 meter (the LF-MIDI-001 topology) without touching notes. */
function as14(data: MidiSongData, totalBars = 1): MidiSongData {
  return { ...data, timeSignature: "1/4", totalBars };
}

const cEslash = song([{ pitch: 40, startTick: 0, durationTick: 2 * BEAT }, // E bass
  ...[60, 64, 67].map((pitch) => ({ pitch, startTick: 0, durationTick: 2 * BEAT }))]); // C E G
const bm7 = song([47, 50, 54, 57].map((pitch) => ({ pitch, startTick: 0, durationTick: 2 * BEAT })));

// A 1/4 progression spanning several 2-beat windows, so odd windows exercise the
// beatPositionFactor difference (1.5 in 1/4 vs 1.2 in 4/4) — a per-window scalar.
const progression14: MidiSongData = as14(song([
  ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: 2 * BEAT })), // C  win0
  ...[45, 48, 52].map((pitch) => ({ pitch, startTick: 2 * BEAT, durationTick: 2 * BEAT })), // Am win1
  ...[41, 45, 48].map((pitch) => ({ pitch, startTick: 4 * BEAT, durationTick: 2 * BEAT })), // F  win2
  ...[43, 47, 50].map((pitch) => ({ pitch, startTick: 6 * BEAT, durationTick: 2 * BEAT })), // G  win3
], 8), 8);

describe("meterIdentityAB — synthetic controls (meter view alone does not move identity)", () => {
  for (const [name, data] of [
    ["same-chord re-attack", as14(sameChordReattack)],
    ["true two-harmony", as14(trueTwoHarmony)],
    ["layered extended chord", as14(layeredExtendedChord)],
    ["C/E slash", as14(cEslash)],
    ["representable Bm7", as14(bm7)],
  ] as const) {
    it(`${name}: identity + membership unchanged 1/4 -> 4/4`, () => {
      const r = meterIdentityAB(data);
      expect(r.membershipAllEqual).toBe(true);
      expect(r.identityAllEqual).toBe(true);
    });
  }

  it("multi-window 1/4 progression: membership + identity equal; histogram differs only by a per-window scalar", () => {
    const r = meterIdentityAB(progression14);
    expect(r.membershipAllEqual).toBe(true);
    expect(r.identityAllEqual).toBe(true);
    // The scalar cancels in scoring, so identity holds even where the raw histogram is not bit-equal.
    expect(r.histogramAllProportional).toBe(true);
    const scaledWindow = r.windows.find((w) => !w.histogramEqual && w.contributionCountA > 0);
    expect(scaledWindow).toBeDefined(); // at least one odd window has a 1.2/1.5 scale
    expect(scaledWindow!.identityEqual).toBe(true);
  });
});

describe("meterIdentityAB — invariants", () => {
  it("never mutates the source data", () => {
    const before = JSON.stringify(progression14);
    meterIdentityAB(progression14);
    expect(JSON.stringify(progression14)).toBe(before);
  });

  it("is deterministic across runs", () => {
    const a = meterIdentityAB(progression14);
    const b = meterIdentityAB(progression14);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
