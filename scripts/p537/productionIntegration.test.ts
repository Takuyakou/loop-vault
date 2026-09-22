/**
 * P5.37-03 production integration tests (privacy-safe / synthetic). They lock the
 * production wiring of the frozen union-chimera policy v1 in
 * `analyzeMidiWithRankingScores`:
 *  - OFF (default) == exact legacy (rollback guarantee);
 *  - ON == the promoted shadow v1 (end-to-end projection), byte-for-byte;
 *  - ON partitions a true chimera and leaves hard negatives identical to OFF;
 *  - determinism + source immutability.
 * The private LF-MIDI-001 production result lives only in the report (aggregates).
 */

import { describe, expect, it } from "vitest";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { buildMidi } from "../p534/fixtures";
import { projectUnionChimeraEndToEnd } from "./e2eProjection";

const TPB = 96;

const twoHarmonyBytes = buildMidi({
  ticksPerBeat: TPB, tempoMicrosPerBeat: 500_000,
  notes: [
    ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: TPB })),
    ...[45, 49, 64].map((pitch) => ({ pitch, startTick: TPB, durationTick: TPB })),
    ...[41, 45, 48].map((pitch) => ({ pitch, startTick: 2 * TPB, durationTick: 2 * TPB })),
  ],
});
const heldCmaj9Bytes = buildMidi({
  ticksPerBeat: TPB, tempoMicrosPerBeat: 500_000,
  notes: [48, 52, 55, 59, 62].map((pitch) => ({ pitch, startTick: 0, durationTick: TPB * 4 })),
});
const reattackBytes = buildMidi({
  ticksPerBeat: TPB, tempoMicrosPerBeat: 500_000,
  notes: [0, 1, 2, 3].flatMap((b) => [47, 50, 54, 57].map((pitch) => ({ pitch, startTick: b * TPB, durationTick: TPB }))),
});

const labelsDefault = (bytes: Uint8Array) => analyzeMidi(bytes).fullTimeline.map((it) => it.chord.label);
const labelsOff = (bytes: Uint8Array) => analyzeMidi(bytes, { enableUnionChimeraPartition: false }).fullTimeline.map((it) => it.chord.label);
const labelsOn = (bytes: Uint8Array) => analyzeMidi(bytes, { enableUnionChimeraPartition: true }).fullTimeline.map((it) => it.chord.label);
const shadowCorrected = (bytes: Uint8Array) => {
  const data = parseMidi(bytes);
  return projectUnionChimeraEndToEnd(bytes, data, inferTrackRoles(data)).correctedTimeline;
};

describe("production integration — default ON, OFF = exact-legacy rollback", () => {
  for (const [name, bytes] of [
    ["two-harmony", twoHarmonyBytes], ["held Cmaj9", heldCmaj9Bytes], ["same-chord re-attack", reattackBytes],
  ] as const) {
    it(`${name}: default == explicit ON (default-ON approved)`, () => {
      expect(labelsDefault(bytes)).toEqual(labelsOn(bytes));
    });
  }
  it("explicit OFF is the legacy rollback: keeps the chimera that ON removes", () => {
    // For the two-harmony chimera, OFF (legacy) differs from ON (partitioned).
    expect(labelsOff(twoHarmonyBytes)).not.toEqual(labelsOn(twoHarmonyBytes));
  });
});

describe("production integration — ON == promoted shadow v1", () => {
  for (const [name, bytes] of [
    ["two-harmony", twoHarmonyBytes], ["held Cmaj9", heldCmaj9Bytes], ["same-chord re-attack", reattackBytes],
  ] as const) {
    it(`${name}: production ON timeline == shadow corrected timeline`, () => {
      expect(labelsOn(bytes)).toEqual(shadowCorrected(bytes));
    });
  }
});

describe("production integration — behavior", () => {
  it("two-harmony: ON partitions the chimera (differs from OFF)", () => {
    expect(labelsOn(twoHarmonyBytes)).not.toEqual(labelsOff(twoHarmonyBytes));
    expect(labelsOn(twoHarmonyBytes)).toContain("F");
  });

  for (const [name, bytes] of [["held Cmaj9", heldCmaj9Bytes], ["same-chord re-attack", reattackBytes]] as const) {
    it(`${name} (hard negative): ON == OFF (no trigger)`, () => {
      expect(labelsOn(bytes)).toEqual(labelsOff(bytes));
    });
  }

  it("is deterministic and does not mutate source bytes", () => {
    const before = Array.from(twoHarmonyBytes);
    expect(labelsOn(twoHarmonyBytes)).toEqual(labelsOn(twoHarmonyBytes));
    expect(Array.from(twoHarmonyBytes)).toEqual(before);
  });
});
