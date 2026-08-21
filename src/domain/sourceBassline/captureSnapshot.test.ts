import { describe, expect, it } from "vitest";
import type { AnalysisSession } from "../midi/preAnalysis/types";
import {
  assessManualSourceBasslineCapture,
  assessSourceBasslineCapture,
  sourceBasslineAnalysisAuthority,
  sourceBasslineAuthorizationKey,
  sourceBasslineCandidateVoices,
  sourceBasslineNoteFacts,
} from "./captureSnapshot";

function session(): AnalysisSession {
  return {
    id: "session",
    masterSourceId: "source-a",
    sources: [{
      id: "source-a",
      displayName: "Synthetic source",
      smfType: 1,
      ppq: 7,
      durationBeats: 8,
      durationTick: 56,
      tempoMap: [{ beat: 0, bpm: 120 }],
      timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }],
      bytes: new Uint8Array(),
      visible: true,
      muted: false,
    }],
    voices: [bassVoice()],
    notes: [
      note(36, 0, 7, 0),
      note(43, 7, 7, 1),
      note(40, 7, 14, 2),
      note(38, 49, 7, 3),
    ],
    controlChanges: [],
    preset: "custom",
    warnings: [],
  };
}

function bassVoice() {
  return {
    id: "bass-voice",
    sourceId: "source-a",
    trackIndex: 0,
    channel: 0,
    programNumbers: [33],
    dominantProgram: 33,
    gmProgramName: "Electric Bass",
    displayName: "Bass candidate",
    hasProgramChanges: false,
    isDrum: false,
    noteCount: 3,
    minPitch: 36,
    maxPitch: 43,
    autoRole: "bass" as const,
    autoRoleConfidence: 0.9,
    assignedRole: "bass" as const,
    included: true,
    visible: true,
    muted: false,
    solo: false,
  };
}

function note(pitch: number, startTick: number, durationTick: number, index: number) {
  return {
    sourceId: "source-a",
    voiceId: "bass-voice",
    trackIndex: 0,
    channel: 0,
    pitch,
    velocity: 0.8,
    startBeat: startTick / 7,
    durationBeats: durationTick / 7,
    startTick,
    durationTick,
    ticksPerQuarter: 7,
    program: 33,
    programExplicit: true,
    sourceEventIndex: index,
  };
}

const candidate = { id: "candidate", startBar: 1, endBar: 2, chords: [] };

function authority(value: AnalysisSession): string {
  const result = sourceBasslineAnalysisAuthority(value);
  if (!result) throw new Error("Synthetic session must expose analysis authority.");
  return result;
}

describe("Capture source bassline snapshot", () => {
  it("offers only explicitly included, non-drum, non-duplicate bass Voices", () => {
    const value = session();
    value.voices.push({ ...value.voices[0]!, id: "excluded", included: false });
    value.voices.push({ ...value.voices[0]!, id: "duplicate", duplicateOf: "bass-voice" });
    value.voices.push({ ...value.voices[0]!, id: "harmony", assignedRole: "harmony" });
    expect(sourceBasslineCandidateVoices(value).map((voice) => voice.id)).toEqual(["bass-voice"]);
  });

  it("accepts only exact complete-bar manual ranges", () => {
    const value = session();
    expect(assessManualSourceBasslineCapture(
      value,
      candidate,
      { startBeat: 1, endBeat: 4 },
      4,
      "bass-voice",
      authority(value),
    ).snapshot).toBeDefined();
    const partial = assessManualSourceBasslineCapture(
      value,
      candidate,
      { startBeat: 2, endBeat: 4 },
      4,
      "bass-voice",
      authority(value),
    );
    expect(partial.reason).toBe("range-ineligible");
    expect(partial.snapshot).toBeUndefined();
  });

  it("never silently selects a Voice", () => {
    const value = session();
    expect(assessSourceBasslineCapture(value, candidate, "", authority(value))).toMatchObject({
      reason: "select-voice",
    });
  });

  it("builds an all-note odd-PPQ snapshot only from raw tick authority", () => {
    const value = session();
    const result = assessSourceBasslineCapture(
      value,
      candidate,
      "bass-voice",
      authority(value),
    );
    expect(result.reason).toBeUndefined();
    expect(result.snapshot?.notes).toHaveLength(4);
    expect(result.snapshot?.notes[1]?.start).toEqual({ numerator: 1, denominator: 1 });
    expect(result.hasSimultaneousNotes).toBe(true);
    expect(result.hasOverlappingNotes).toBe(true);
    expect(JSON.stringify(result.snapshot)).not.toMatch(/source-a|Synthetic source|displayName|voiceId|raw bytes/i);
  });

  it("uses the exact source end so a trailing Bass rest remains capturable", () => {
    const value = session();
    value.voices.push({
      ...bassVoice(),
      id: "harmony-voice",
      assignedRole: "harmony",
      displayName: "Harmony",
    });
    value.notes[3] = { ...value.notes[3]!, voiceId: "harmony-voice" };
    const result = assessSourceBasslineCapture(
      value,
      candidate,
      "bass-voice",
      authority(value),
    );
    expect(result.reason).toBeUndefined();
    expect(result.snapshot?.notes).toHaveLength(3);
    expect(result.snapshot?.length).toEqual({ numerator: 8, denominator: 1 });
  });

  it("reports an empty selected range without treating it as a schema failure", () => {
    const value = session();
    value.sources[0]!.durationTick = 63;
    value.notes = [note(36, 0, 7, 0), note(38, 56, 7, 1)];
    expect(assessSourceBasslineCapture(
      value,
      { ...candidate, startBar: 2, endBar: 2 },
      "bass-voice",
      authority(value),
    )).toMatchObject({ reason: "empty", noteCount: 0 });
  });

  it("fails closed when raw tick or exact source duration authority is absent", () => {
    const missingNoteTick = session();
    missingNoteTick.notes[0] = { ...missingNoteTick.notes[0]!, startTick: undefined };
    expect(assessSourceBasslineCapture(
      missingNoteTick,
      candidate,
      "bass-voice",
      authority(missingNoteTick),
    )).toMatchObject({ reason: "timing-unavailable" });

    const missingSourceEnd = session();
    missingSourceEnd.sources[0]!.durationTick = undefined;
    expect(assessSourceBasslineCapture(
      missingSourceEnd,
      candidate,
      "bass-voice",
      authority(missingSourceEnd),
    )).toMatchObject({ reason: "timing-unavailable" });
  });

  it("accepts a provable master-source range in a multi-source session and rejects ambiguity", () => {
    const multiple = session();
    multiple.sources.push({
      ...multiple.sources[0]!,
      id: "source-b",
      displayName: "Synthetic overlay",
    });
    expect(assessSourceBasslineCapture(
      multiple,
      candidate,
      "bass-voice",
      authority(multiple),
    ).snapshot).toBeDefined();

    const ambiguous = session();
    ambiguous.sources.push({ ...ambiguous.sources[0]!, id: "source-b" });
    ambiguous.voices.push({ ...bassVoice(), id: "bass-b", sourceId: "source-b" });
    ambiguous.notes.push({ ...note(35, 0, 7, 4), sourceId: "source-b", voiceId: "bass-b" });
    expect(assessSourceBasslineCapture(
      ambiguous,
      candidate,
      "bass-b",
      authority(ambiguous),
    )).toMatchObject({ reason: "source-misaligned" });

    const mismatched = session();
    expect(assessSourceBasslineCapture(
      mismatched,
      candidate,
      "bass-voice",
      "wrong-analysis",
    )).toMatchObject({ reason: "analysis-mismatch" });
  });

  it("rejects meter changes, ranges beyond the source, and notes beyond the exact source end", () => {
    const meter = session();
    meter.sources[0]!.timeSignatures.push({ beat: 4, numerator: 3, denominator: 4 });
    expect(assessSourceBasslineCapture(
      meter,
      candidate,
      "bass-voice",
      authority(meter),
    ).reason).toBe("meter-ineligible");

    const beyond = session();
    expect(assessSourceBasslineCapture(
      beyond,
      { ...candidate, endBar: 3 },
      "bass-voice",
      authority(beyond),
    ).reason).toBe("range-ineligible");

    const inconsistent = session();
    inconsistent.sources[0]!.durationTick = 55;
    expect(assessSourceBasslineCapture(
      inconsistent,
      candidate,
      "bass-voice",
      authority(inconsistent),
    ).reason).toBe("timing-unavailable");
  });

  it("binds opt-in to chord, timing, Voice, and analysis fingerprints", () => {
    const withChord = {
      ...candidate,
      chords: [{
        eventId: "event-1",
        bar: 1,
        beat: 1,
        durationBeats: 4,
        chord: { root: 0, quality: "maj" as const, tensions: [], label: "C" },
        confidence: 1,
        alternatives: [],
        warnings: [],
      }],
    };
    const original = sourceBasslineAuthorizationKey(withChord, "bass-voice", "analysis-a");
    expect(original).toContain('"selectedVoiceId":"bass-voice"');
    expect(original).toContain('"label":"C"');
    expect(sourceBasslineAuthorizationKey(
      {
        ...withChord,
        chords: [{ ...withChord.chords[0]!, durationBeats: 2 }],
      },
      "bass-voice",
      "analysis-a",
    )).not.toBe(original);
    expect(sourceBasslineAuthorizationKey(
      {
        ...withChord,
        chords: [{
          ...withChord.chords[0]!,
          chord: { ...withChord.chords[0]!.chord, root: 2, label: "D" },
        }],
      },
      "bass-voice",
      "analysis-a",
    )).not.toBe(original);
    expect(sourceBasslineAuthorizationKey(withChord, "other-voice", "analysis-a"))
      .not.toBe(original);
    expect(sourceBasslineAuthorizationKey(withChord, "bass-voice", "analysis-b"))
      .not.toBe(original);
  });
  it("computes exact simultaneous and running-overlap facts deterministically near the note cap", () => {
    const notes = Array.from({ length: 8_192 }, (_, index) => ({
      pitch: 36 + (index % 24),
      start: { numerator: index === 1 ? 0 : index, denominator: 1 },
      duration: { numerator: index === 0 ? 8_192 : 1, denominator: 1 },
      velocity: 0.5,
      continuesFromBefore: false,
      continuesAfterEnd: false,
    }));
    const first = sourceBasslineNoteFacts(notes);
    const second = sourceBasslineNoteFacts(notes);
    expect(first).toEqual({ simultaneous: true, overlap: true });
    expect(second).toEqual(first);
  });
});