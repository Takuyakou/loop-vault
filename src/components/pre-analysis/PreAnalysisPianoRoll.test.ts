import { describe, expect, it } from "vitest";
import { normalizeNotes } from "../../domain/midi/normalize";
import { buildHarmonicCoreNoteWeights } from "../../domain/midi/harmonicCoreNoteWeights";
import { buildVoiceAwareRoleContext } from "../../domain/midi/voiceAwareReranker";
import { buildVoices, voiceId } from "../../domain/midi/voices";
import {
  buildSessionAnalysisRequest,
  type AnalysisSession,
  type PreAnalysisNote,
} from "../../domain/midi/preAnalysis";
import { harmonicCoreNoteMultipliers } from "./harmonicCorePreview";
import {
  MAX_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  PIANO_ROLL_RULER,
  drawPianoRoll,
  noteAlpha,
  noteColor,
  pianoRollLayout,
} from "./PreAnalysisPianoRoll";
import { ROLE_COLOR } from "./sessionView";

describe("harmonicCoreNoteMultipliers", () => {
  it("is the weight the analysis itself gives each note, and does not touch the session", () => {
    const session = textureSession();
    const before = JSON.stringify(session);
    const preview = harmonicCoreNoteMultipliers(session);

    // The analysis's own pipeline, called directly on its own input.
    const request = buildSessionAnalysisRequest({ ...session, voiceContributionPreset: "harmonic-core" });
    const prepared = request.options.preparedData!;
    const normalized = normalizeNotes(prepared);
    const context = buildVoiceAwareRoleContext(buildVoices(prepared), normalized, request.options.analysisInput);
    const evidence = normalized.filter((note) =>
      note.channel !== undefined
      && context.analysisInput.enabledVoiceIds.includes(voiceId(note.trackIndex, note.channel)));
    const direct = buildHarmonicCoreNoteWeights(evidence, context.roles);

    expect(preview.size).toBe(direct.summary.weightedNoteCount);
    expect(preview.size).toBeGreaterThan(0);
    expect([...preview.values()].sort()).toEqual([...direct.multipliers.values()].sort());
    expect(JSON.stringify(session)).toBe(before);
  });

  it("leaves bass, unused parts and Channel 10 out", () => {
    const session = textureSession();
    session.voices[0] = { ...session.voices[0]!, assignedRole: "bass" };
    session.notes.push(note(9, 36, 0, 1));
    expect(harmonicCoreNoteMultipliers(session).size).toBe(0);

    const unused = textureSession();
    unused.voices[0] = { ...unused.voices[0]!, assignedRole: "exclude", included: false };
    expect(harmonicCoreNoteMultipliers(unused).size).toBe(0);
  });
});

describe("pianoRollLayout", () => {
  it("sizes a row from the height: 6 to 16 px, fitted to the pitches in use ±2", () => {
    const session = textureSession(); // pitches 48 … 76 (29 rows + 4)
    const tall = pianoRollLayout(session, 700);
    expect(tall.rowHeight).toBe(MAX_ROW_HEIGHT);
    const middle = pianoRollLayout(session, 420);
    expect(middle.rowHeight).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT);
    expect(middle.rowHeight).toBeLessThanOrEqual(MAX_ROW_HEIGHT);
    expect(middle.contentHeight).toBe(420);
    const cramped = pianoRollLayout(session, 120);
    expect(cramped.rowHeight).toBe(MIN_ROW_HEIGHT);
    // Does not fit even at 6 px: the roll gets taller than the area and scrolls.
    expect(cramped.contentHeight).toBeGreaterThan(120);
    expect(cramped.contentHeight)
      .toBe(PIANO_ROLL_RULER + (cramped.maxPitch - cramped.minPitch + 1) * MIN_ROW_HEIGHT);
  });

  it("widens the range to fill a tall area, and leaves no empty space below", () => {
    const layout = pianoRollLayout(textureSession(), 900);
    const rows = layout.maxPitch - layout.minPitch + 1;
    expect(layout.rowHeight).toBe(MAX_ROW_HEIGHT);
    expect(PIANO_ROLL_RULER + rows * layout.rowHeight).toBeGreaterThan(900 - MAX_ROW_HEIGHT);
    expect(layout.minPitch).toBeLessThan(46);
    expect(layout.maxPitch).toBeGreaterThan(78);
  });
});

describe("drawPianoRoll", () => {
  it("paints each note in the colour of its part's role, and unused parts faintly", () => {
    const session = textureSession();
    const fills: Array<{ alpha: number; color: string }> = [];
    const context = fakeContext(fills);
    drawPianoRoll(context, 900, pianoRollLayout(session, 400), {
      session,
      pixelsPerBeat: 100,
      viewportStartBeat: 0,
    }, { current: [] });
    const notes = fills.filter((fill) => fill.color === ROLE_COLOR.chord);
    expect(notes).toHaveLength(6);
    expect(noteColor({ ...session.voices[0]!, assignedRole: "bass" })).toBe(ROLE_COLOR.bass);
    expect(noteColor({ ...session.voices[0]!, assignedRole: "melody-weak" })).toBe(ROLE_COLOR.melody);
    const off = { ...session.voices[0]!, assignedRole: "exclude" as const, included: false };
    expect(noteColor(off)).toBe(ROLE_COLOR.off);
    expect(noteAlpha(off, false, false)).toBeLessThan(noteAlpha(session.voices[0]!, false, false));
  });

  it("dims muted parts and, while one part is soloed, every other part", () => {
    const voice = textureSession().voices[0]!;
    expect(noteAlpha({ ...voice, muted: true }, false, false)).toBe(0.25);
    expect(noteAlpha(voice, true, false)).toBe(0.25);
    expect(noteAlpha({ ...voice, solo: true }, true, false)).toBeGreaterThan(0.5);
    // A weighted note follows its weight (never invisible).
    expect(noteAlpha(voice, false, false, 0.25)).toBeLessThan(noteAlpha(voice, false, false, 1));
    expect(noteAlpha(voice, false, false, 0)).toBeGreaterThan(0);
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
