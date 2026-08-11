import { describe, expect, it } from "vitest";
import type { AnalysisSession, PreAnalysisNote } from "../../domain/midi/preAnalysis";
import { drawPianoRoll, harmonicCorePianoRollNotePreview } from "./PreAnalysisPianoRoll";

describe("harmonicCorePianoRollNotePreview", () => {
  it("fades melody-like notes inside one harmony Voice without mutating the session", () => {
    const session = textureSession();
    const before = JSON.stringify(session);

    const standard = harmonicCorePianoRollNotePreview(session, "standard");
    const harmonicCore = harmonicCorePianoRollNotePreview(session, "harmonic-core");

    expect(standard.weightedNoteCount).toBe(0);
    expect(harmonicCore.weightedNoteCount).toBe(6);
    expect(harmonicCore.classCounts["melody-like"]).toBe(3);
    expect(session.notes.slice(3).map((note) =>
      harmonicCore.multipliers.get(note))).toEqual([0.25, 0.25, 0.25]);
    expect(JSON.stringify(session)).toBe(before);
  });

  it("draws melody-like notes at the locked reduced opacity", () => {
    const session = textureSession();
    const preview = harmonicCorePianoRollNotePreview(session, "harmonic-core");
    const fills: Array<{ alpha: number; color: string }> = [];
    const context = fakeContext(fills);

    drawPianoRoll(context, 900, 290, {
      session,
      zoom: 1,
      viewportStartBeat: 0,
      playheadBeat: 0,
      showAnalysisTargetsOnly: true,
      voiceContributionPreset: "harmonic-core",
      notePreview: preview,
    }, { current: [] });

    const voiceFills = fills.filter((fill) => fill.color === "#2dd4bf");
    expect(voiceFills).toHaveLength(6);
    expect(voiceFills.slice(3).map((fill) => fill.alpha))
      .toEqual([0.2375, 0.2375, 0.2375]);
  });
  it("leaves excluded, bass, and Channel 10 notes outside the note preview", () => {
    const session = textureSession();
    session.voices[0] = {
      ...session.voices[0]!,
      assignedRole: "bass",
    };
    session.notes.push(note(9, 36, 0, 1));

    const preview = harmonicCorePianoRollNotePreview(session, "harmonic-core");

    expect(preview.weightedNoteCount).toBe(0);
    expect(preview.classCounts).toEqual({
      harmonic: 0,
      "melody-like": 0,
      uncertain: 0,
    });
  });
});

function textureSession(): AnalysisSession {
  return {
    id: "texture-preview",
    masterSourceId: "source",
    sources: [{
      id: "source",
      displayName: "fixture",
      smfType: 1,
      ppq: 480,
      durationBeats: 4,
      tempoMap: [{ beat: 0, bpm: 120 }],
      timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
      bytes: new Uint8Array(),
      visible: true,
      muted: false,
    }],
    voices: [{
      id: "voice",
      sourceId: "source",
      trackIndex: 0,
      channel: 0,
      programNumbers: [0],
      dominantProgram: 0,
      displayName: "Harmony",
      hasProgramChanges: false,
      isDrum: false,
      noteCount: 6,
      minPitch: 48,
      maxPitch: 76,
      averageDurationBeats: 2.25,
      averagePolyphony: 3,
      autoRole: "harmony",
      autoRoleConfidence: 1,
      assignedRole: "harmony",
      included: true,
      visible: true,
      muted: false,
      solo: false,
    }],
    notes: [
      note(0, 48, 0, 4),
      note(0, 55, 0, 4),
      note(0, 60, 0, 4),
      note(0, 72, 1, 0.5),
      note(0, 74, 2, 0.5),
      note(0, 76, 3, 0.5),
    ],
    controlChanges: [],
    preset: "auto",
    voiceContributionPreset: "standard",
    warnings: [],
  };
}

function fakeContext(fills: Array<{ alpha: number; color: string }>) {
  const context = {
    clearRect: () => undefined,
    fillRect() {
      fills.push({ alpha: context.globalAlpha, color: context.fillStyle });
    },
    fillText: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
  return context as unknown as CanvasRenderingContext2D;
}
function note(
  channel: number,
  pitch: number,
  startBeat: number,
  durationBeats: number,
): PreAnalysisNote {
  return {
    sourceId: "source",
    voiceId: "voice",
    trackIndex: 0,
    channel,
    pitch,
    velocity: 96,
    startBeat,
    durationBeats,
  };
}
