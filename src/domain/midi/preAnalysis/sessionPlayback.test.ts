import { describe, expect, it } from "vitest";
import type { AnalysisSession } from "./types";
import { sessionPreviewNotes } from "./sessionPlayback";

describe("Phase 5.1 session playback", () => {
  it("solos one Voice independently from analysis inclusion", () => {
    const session = fixtureSession();
    session.voices[1].solo = true;
    session.voices[1].included = false;
    session.voices[1].assignedRole = "exclude";

    expect(sessionPreviewNotes(session)).toEqual([
      { pitch: 36, startBeat: 0, durationBeats: 4, velocity: 0.8 },
    ]);
  });

  it("honors source and Voice mute while visibility remains visual only", () => {
    const session = fixtureSession();
    session.voices[0].visible = false;
    session.voices[1].muted = true;
    expect(sessionPreviewNotes(session).map((note) => note.pitch))
      .toEqual([60]);

    session.sources[0].muted = true;
    expect(sessionPreviewNotes(session)).toEqual([]);
  });

  it("does not double exact duplicate Voices during ordinary playback", () => {
    const session = fixtureSession();
    session.voices.push({
      ...session.voices[0],
      id: "duplicate",
      duplicateOf: "harmony",
      duplicateKind: "exact",
    });
    session.notes.push({
      ...session.notes[0],
      voiceId: "duplicate",
    });

    expect(sessionPreviewNotes(session).map((note) => note.pitch))
      .toEqual([36, 60]);
  });

  it("starts at the current viewport and clips a held note", () => {
    expect(sessionPreviewNotes(fixtureSession(), 2)).toEqual([
      { pitch: 36, startBeat: 0, durationBeats: 2, velocity: 0.8 },
      { pitch: 60, startBeat: 0, durationBeats: 2, velocity: 0.8 },
    ]);
  });
});

function fixtureSession(): AnalysisSession {
  return {
    id: "session",
    masterSourceId: "source",
    sources: [{
      id: "source",
      displayName: "runtime.mid",
      smfType: 0,
      ppq: 480,
      durationBeats: 4,
      tempoMap: [{ beat: 0, bpm: 120 }],
      timeSignatures: [{
        beat: 0,
        numerator: 4,
        denominator: 4,
      }],
      bytes: new Uint8Array(),
      visible: true,
      muted: false,
    }],
    voices: [
      voice("harmony", 0, "harmony"),
      voice("bass", 1, "bass"),
    ],
    notes: [
      note("harmony", 60),
      note("bass", 36),
    ],
    controlChanges: [],
    preset: "auto",
    warnings: [],
  };
}

function voice(
  id: string,
  channel: number,
  role: "harmony" | "bass",
): AnalysisSession["voices"][number] {
  return {
    id,
    sourceId: "source",
    trackIndex: channel,
    channel,
    programNumbers: [0],
    displayName: id,
    hasProgramChanges: false,
    isDrum: false,
    noteCount: 1,
    autoRole: role,
    autoRoleConfidence: 0.9,
    assignedRole: role,
    included: true,
    visible: true,
    muted: false,
    solo: false,
  };
}

function note(
  voiceId: string,
  pitch: number,
): AnalysisSession["notes"][number] {
  return {
    sourceId: "source",
    voiceId,
    trackIndex: 0,
    channel: 0,
    pitch,
    velocity: 0.8,
    startBeat: 0,
    durationBeats: 4,
  };
}
