import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import {
  addMidiSources,
  createAnalysisSession,
  removeMidiSource,
  selectedSessionNotes,
  updateAnalysisSessionVoice,
} from "./analysisSession";

describe("Phase 5.1 Analysis Session", () => {
  it("creates a single-source master session", () => {
    const result = createAnalysisSession([
      input("master", oneVoiceMidi(480, 0, 60)),
    ], "session-a");

    expect(result.issues).toEqual([]);
    expect(result.session).toMatchObject({
      id: "session-a",
      masterSourceId: "master",
      preset: "auto",
      latestSourceId: "master",
      warnings: [],
    });
    expect(result.session?.sources).toHaveLength(1);
    expect(result.session?.voices).toHaveLength(1);
  });

  it("adds multiple MIDI inputs in one deterministic operation", () => {
    const result = createAnalysisSession([
      input("master", oneVoiceMidi(480, 0, 60)),
      input("bass", oneVoiceMidi(960, 1, 36)),
      input("lead", oneVoiceMidi(240, 2, 72)),
    ]);

    expect(result.session?.sources.map((source) => source.id)).toEqual([
      "master",
      "bass",
      "lead",
    ]);
    expect(result.session?.notes.map((note) => note.startBeat)).toEqual([0, 0, 0]);
    expect(result.session?.notes.map((note) => note.durationBeats)).toEqual([1, 1, 1]);
  });

  it("preserves existing Voice state when another source is added", () => {
    const initial = createAnalysisSession([
      input("master", oneVoiceMidi(480, 0, 60)),
    ]).session!;
    const changed = updateAnalysisSessionVoice(
      initial,
      initial.voices[0].id,
      { assignedRole: "bass", visible: false, included: true },
    );

    const added = addMidiSources(changed, [
      input("lead", oneVoiceMidi(480, 1, 72)),
    ]).session!;

    expect(added.voices.find((voice) => voice.sourceId === "master")).toMatchObject({
      assignedRole: "bass",
      visible: false,
      included: true,
    });
  });

  it("warns about tempo, meter, duration, and start mismatches", () => {
    const master = midi(0, 480, [[
      setTempo(500_000),
      timeSignature(4, 4),
      noteOn(0, 60),
      noteOff(0, 60, 4800),
      endOfTrack(),
    ]]);
    const added = midi(0, 480, [[
      setTempo(600_000),
      timeSignature(3, 4),
      noteOn(1, 64, 960),
      noteOff(1, 64, 480),
      endOfTrack(),
    ]]);

    const session = createAnalysisSession([
      input("master", master),
      input("added", added),
    ]).session!;

    expect(session.warnings.map((warning) => warning.code)).toEqual([
      "duration-mismatch",
      "start-position-mismatch",
      "tempo-map-mismatch",
      "time-signature-mismatch",
    ]);
  });

  it("prefers an exact split Voice and excludes the all-in duplicate", () => {
    const allIn = midi(0, 480, [[
      noteOn(0, 48),
      noteOn(1, 60),
      noteOff(0, 48, 480),
      noteOff(1, 60),
      endOfTrack(),
    ]]);
    const split = oneVoiceMidi(960, 0, 48);
    const session = createAnalysisSession([
      input("all", allIn),
      input("split", split),
    ]).session!;

    const allBass = session.voices.find((voice) =>
      voice.sourceId === "all" && voice.channel === 0)!;
    const splitBass = session.voices.find((voice) =>
      voice.sourceId === "split")!;

    expect(allBass).toMatchObject({
      included: false,
      duplicateOf: splitBass.id,
      duplicateKind: "exact",
    });
    expect(splitBass.duplicateOf).toBeUndefined();
    expect(session.warnings.some((warning) =>
      warning.code === "exact-duplicate")).toBe(true);
    expect(selectedSessionNotes(session).filter((note) => note.pitch === 48)).toHaveLength(1);
  });

  it("warns on near duplicate without excluding either Voice", () => {
    const notes = Array.from({ length: 20 }, (_, index) => 48 + index % 5);
    const left = noteSequenceMidi(notes);
    const right = noteSequenceMidi([...notes.slice(0, -1), 72]);
    const session = createAnalysisSession([
      input("left", left),
      input("right", right),
    ]).session!;

    expect(session.warnings.some((warning) =>
      warning.code === "near-duplicate")).toBe(true);
    expect(session.voices.every((voice) => voice.duplicateOf === undefined)).toBe(true);
    expect(session.voices.every((voice) => voice.included)).toBe(true);
  });

  it("gives the same file a unique runtime source ID on repeated intake", () => {
    const bytes = oneVoiceMidi(480, 0, 60);
    const session = createAnalysisSession([
      { displayName: "same.mid", bytes },
      { displayName: "same.mid", bytes },
    ]).session!;

    expect(new Set(session.sources.map((source) => source.id)).size).toBe(2);
    expect(session.warnings.some((warning) =>
      warning.code === "exact-duplicate")).toBe(true);
  });

  it("removes a source and repairs master and duplicate selection", () => {
    const same = oneVoiceMidi(480, 0, 60);
    const session = createAnalysisSession([
      input("first", same),
      input("second", same),
    ]).session!;

    const removed = removeMidiSource(session, "first")!;

    expect(removed.masterSourceId).toBe("second");
    expect(removed.sources.map((source) => source.id)).toEqual(["second"]);
    expect(removed.voices[0].duplicateOf).toBeUndefined();
    expect(removed.voices[0].included).toBe(true);
    expect(removed.notes.every((note) => note.sourceId === "second")).toBe(true);
  });

  it("rejects empty, malformed, and format 2 inputs without losing valid sources", () => {
    const result = createAnalysisSession([
      input("valid", oneVoiceMidi(480, 0, 60)),
      input("empty", midi(0, 480, [[endOfTrack()]])),
      input("format2", midi(2, 480, [[endOfTrack()], [endOfTrack()]])),
      input("broken", Uint8Array.from([1, 2, 3])),
    ]);

    expect(result.session?.sources.map((source) => source.id)).toEqual(["valid"]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "empty-midi",
      "unsupported-format",
      "invalid-midi",
    ]);
  });

  it("keeps runtime display names without using them as identifiers", () => {
    const result = createAnalysisSession([{
      sourceId: "safe-id",
      displayName: "日本語の曲名.mid",
      bytes: oneVoiceMidi(480, 0, 60),
    }]).session!;

    expect(result.sources[0].displayName).toBe("日本語の曲名.mid");
    expect(result.sources[0].id).toBe("safe-id");
    expect(result.voices[0].id).not.toContain("日本語の曲名");
  });

  it("is deterministic", () => {
    const inputs = [
      input("master", oneVoiceMidi(480, 0, 60)),
      input("added", oneVoiceMidi(960, 1, 64)),
    ];

    expect(createAnalysisSession(inputs)).toEqual(createAnalysisSession(inputs));
  });
});

function input(sourceId: string, bytes: Uint8Array) {
  return { sourceId, displayName: `${sourceId}.mid`, bytes };
}

function oneVoiceMidi(
  ppq: number,
  channel: number,
  pitch: number,
): Uint8Array {
  return midi(0, ppq, [[
    noteOn(channel, pitch),
    noteOff(channel, pitch, ppq),
    endOfTrack(),
  ]]);
}

function noteSequenceMidi(pitches: readonly number[]): Uint8Array {
  const events: MidiEvent[] = [];
  for (const pitch of pitches) {
    events.push(noteOn(0, pitch));
    events.push(noteOff(0, pitch, 120));
  }
  events.push(endOfTrack());
  return midi(0, 480, [events]);
}

function midi(
  format: 0 | 1 | 2,
  ticksPerBeat: number,
  tracks: MidiEvent[][],
): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: { format, numTracks: tracks.length, ticksPerBeat },
    tracks,
  }));
}

function noteOn(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOn", channel, noteNumber, velocity: 100 };
}

function noteOff(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOff", channel, noteNumber, velocity: 0 };
}

function endOfTrack(deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "endOfTrack" };
}

function setTempo(microsecondsPerBeat: number, deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "setTempo", microsecondsPerBeat };
}

function timeSignature(
  numerator: number,
  denominator: number,
  deltaTime = 0,
): MidiEvent {
  return {
    deltaTime,
    meta: true,
    type: "timeSignature",
    numerator,
    denominator,
    metronome: 24,
    thirtyseconds: 8,
  };
}
