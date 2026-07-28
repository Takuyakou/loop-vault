import { describe, expect, it } from "vitest";
import type { MidiSongData, TimedNote } from "../../src/domain/midi/types";
import {
  analyzePhase48EventEvidence,
  buildPhase48EvidenceNotes,
} from "./eventEvidence";

describe("Phase 4.8 event evidence", () => {
  it("keeps note-instance provenance for a complete overlapping A7(b9)", () => {
    const data = song([
      note(57, 0, 1920),
      note(61, 0, 1920),
      note(64, 0, 1920),
      note(67, 0, 1920),
      note(70, 0, 1920),
    ]);
    const evidence = analyzePhase48EventEvidence(
      buildPhase48EvidenceNotes(data, "fixture"),
      9,
      0,
      4,
    );

    expect(evidence.completeCore).toBe(true);
    expect(evidence.strictOverlapRatio).toBe(1);
    expect(evidence.e1Eligible).toBe(true);
    expect(evidence.e2Eligible).toBe(true);
    expect(evidence.e3Eligible).toBe(true);
    expect(evidence.evidenceClass).toBe("strong");
    expect(evidence.flatNineNotes[0]?.noteInstanceId)
      .toContain("fixture:n4");
  });

  it("reports P5 omission separately without treating it as a complete core", () => {
    const data = song([
      note(57, 0, 1920),
      note(61, 0, 1920),
      note(67, 0, 1920),
      note(70, 0, 960),
    ]);
    const evidence = analyzePhase48EventEvidence(
      buildPhase48EvidenceNotes(data, "p5-omit"),
      9,
      0,
      4,
    );

    expect(evidence.completeCore).toBe(false);
    expect(evidence.p5OmittedCore).toBe(true);
    expect(evidence.e1Eligible).toBe(false);
    expect(evidence.e2Eligible).toBe(true);
    expect(evidence.evidenceClass).toBe("weak");
  });

  it("does not promote a late, short passing b9", () => {
    const data = song([
      note(57, 0, 1920),
      note(61, 0, 1920),
      note(64, 0, 1920),
      note(67, 0, 1920),
      note(70, 1680, 120),
    ]);
    const evidence = analyzePhase48EventEvidence(
      buildPhase48EvidenceNotes(data, "passing"),
      9,
      0,
      4,
    );

    expect(evidence.e1Eligible).toBe(true);
    expect(evidence.e2Eligible).toBe(false);
    expect(evidence.e3Eligible).toBe(false);
  });
});

function song(notes: TimedNote[]): MidiSongData {
  return {
    notes,
    timeSignature: "4/4",
    ticksPerBeat: 480,
    totalBars: 1,
    tracks: [{
      index: 0,
      name: "Piano Chords",
      channel: 0,
      program: 0,
      roleHint: "harmony",
    }],
    controlChanges: [],
  };
}

function note(
  pitch: number,
  startTick: number,
  durationTick: number,
): TimedNote {
  return {
    pitch,
    startTick,
    durationTick,
    velocity: 0.8,
    trackIndex: 0,
    channel: 0,
    program: 0,
    programExplicit: true,
  };
}
