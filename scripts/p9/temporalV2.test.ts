import { describe, expect, it } from "vitest";
import { parseMidi } from "../../src/domain/midi/parser";
import { encodeTemporalGoldMidi, temporalGoldCases } from "../p7/temporalGold";
import { encodeExpandedTemporal, expandedTemporalDev } from "./temporalExpandedGold";
import { buildTemporalSourceEvidence } from "./temporalSourceEvidence";
import { proposeTemporalHeads, selectTemporalBoundaries } from "./temporalV2";

function run(bytes: Uint8Array) {
  const before = new Uint8Array(bytes);
  const data = parseMidi(bytes);
  const proposals = proposeTemporalHeads(buildTemporalSourceEvidence(data));
  expect(bytes).toEqual(before);
  expect(proposals.ppq).toBe(data.ticksPerBeat);
  expect(proposals.sourceMeter).toBe(data.timeSignature);
  return {
    harmonic: selectTemporalBoundaries(proposals, "HARMONIC", "STRUCTURAL"),
    voicing: selectTemporalBoundaries(proposals, "VOICING", "STRUCTURAL"),
    note: selectTemporalBoundaries(proposals, "ORNAMENT_NOTE_EVENT", "STRUCTURAL"),
  };
}
describe("P9.2 research-only temporal heads", () => {
  it("preserves one-beat and half-beat passing harmonic changes", () => {
    for (const id of ["one-beat-passing-chord", "half-beat-passing-chord"]) {
      const source = temporalGoldCases.find((item) => item.id === id)!;
      const result = run(encodeTemporalGoldMidi(source));
      expect(result.harmonic).toEqual(expect.arrayContaining(source.harmonicSpans.slice(1).map((span) => span.startBeat)));
    }
  });
  it("preserves one-quarter source meter and offbeat half-beat passing event", () => {
    const source = expandedTemporalDev.find((item) => item.id === "one-quarter-half-beat-passing")!;
    const bytes = encodeExpandedTemporal(source);
    const data = parseMidi(bytes);
    expect(data.timeSignature).toBe("1/4");
    const result = run(bytes);
    expect(result.harmonic).toEqual(source.harmonic);
    expect(result.voicing).toEqual(source.voicing);
  });
  it("does not turn a same-chord re-strike or ghost bass into a harmonic card", () => {
    for (const id of ["long-same-chord-restrike", "ghost-bass-offbeat"]) {
      const source = expandedTemporalDev.find((item) => item.id === id)!;
      const result = run(encodeExpandedTemporal(source));
      expect(result.harmonic).toEqual([]);
      expect(result.note).toContain(source.noteEvents[0]);
    }
  });
  it("keeps voicing-only shifts distinct from harmonic changes", () => {
    const source = expandedTemporalDev.find((item) => item.id === "voicing-shift-no-harmony-change")!;
    const result = run(encodeExpandedTemporal(source));
    expect(result.harmonic).toEqual([]);
  });
  it("copies every raw note number and tick interval into research evidence", () => {
    const data = parseMidi(encodeExpandedTemporal(expandedTemporalDev[3]!));
    const evidence = buildTemporalSourceEvidence(data);
    expect(evidence.notes).toHaveLength(data.notes.length);
    for (const [index, raw] of data.notes.entries()) {
      expect(evidence.notes[index]?.pitch).toBe(raw.pitch);
      expect(evidence.notes[index]?.onsetTick).toBe(raw.startTick);
      expect(evidence.notes[index]?.offsetTick).toBe(raw.startTick + raw.durationTick);
    }
  });
  it("rejects invalid source PPQ and over-budget note evidence", () => {
    const source = parseMidi(encodeExpandedTemporal(expandedTemporalDev[0]!));
    expect(() => buildTemporalSourceEvidence({ ...source, ticksPerBeat: 0 })).toThrow();
    expect(() => buildTemporalSourceEvidence({ ...source, notes: Array(10001).fill(source.notes[0]) })).toThrow();
  });
});
