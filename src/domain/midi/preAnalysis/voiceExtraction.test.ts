import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { gmProgramName } from "./gmProgramNames";
import {
  createMidiSourceId,
  preScanMidiSource,
} from "./voiceExtraction";

describe("Phase 5.1 Voice extraction", () => {
  it("separates eleven channels in a Type 0 track without losing notes", () => {
    const events: MidiEvent[] = [trackName("All Instruments")];
    for (let channel = 0; channel < 11; channel += 1) {
      events.push(programChange(channel, channel === 9 ? 0 : channel));
      events.push(noteOn(channel, 36 + channel));
      events.push(noteOff(channel, 36 + channel, 120));
    }
    events.push(endOfTrack());
    const bytes = smf(0, [events]);

    const result = preScanMidiSource(bytes, {
      sourceId: "source-a",
      displayName: "runtime.mid",
    });

    expect(result.source.smfType).toBe(0);
    expect(result.voices).toHaveLength(11);
    expect(result.notes).toHaveLength(11);
    expect(result.voices.map((voice) => voice.id)).toEqual(
      Array.from({ length: 11 }, (_, channel) => `source-a:0:${channel}`),
    );
  });

  it("keeps same-channel Voices separate across Type 1 tracks", () => {
    const bytes = smf(1, [
      [trackName(midiUtf8Text("低音")), noteOn(0, 36), noteOff(0, 36, 480), endOfTrack()],
      [trackName(midiUtf8Text("和音")), noteOn(0, 60), noteOff(0, 60, 480), endOfTrack()],
    ]);

    const result = preScanMidiSource(bytes, {
      sourceId: "source-b",
      displayName: "runtime.mid",
    });

    expect(result.voices.map((voice) => voice.id)).toEqual([
      "source-b:0:0",
      "source-b:1:0",
    ]);
    expect(result.voices.map((voice) => voice.trackName)).toEqual(["低音", "和音"]);
  });

  it("marks channel 10 drums as excluded while retaining their notes", () => {
    const bytes = smf(0, [[
      noteOn(9, 36),
      noteOff(9, 36, 120),
      endOfTrack(),
    ]]);

    const result = preScanMidiSource(bytes, {
      sourceId: "drum-source",
      displayName: "runtime.mid",
    });

    expect(result.notes).toHaveLength(1);
    expect(result.voices[0]).toMatchObject({
      displayName: "Drums",
      isDrum: true,
      autoRole: "exclude",
      assignedRole: "exclude",
      included: false,
    });
  });

  it("reports all programs and uses the dominant GM name", () => {
    const bytes = smf(0, [[
      programChange(0, 4),
      noteOn(0, 60),
      noteOff(0, 60, 480),
      programChange(0, 5),
      noteOn(0, 64),
      noteOff(0, 64, 120),
      endOfTrack(),
    ]]);

    const result = preScanMidiSource(bytes, {
      sourceId: "program-source",
      displayName: "runtime.mid",
    });

    expect(result.voices[0]).toMatchObject({
      programNumbers: [4, 5],
      dominantProgram: 4,
      gmProgramName: "Electric Piano 1",
      displayName: "Electric Piano 1",
      hasProgramChanges: true,
    });
  });

  it("keeps empty tracks out of the Voice list", () => {
    const bytes = smf(1, [
      [trackName("Empty"), endOfTrack()],
      [noteOn(2, 67), noteOff(2, 67, 240), endOfTrack()],
    ]);

    const result = preScanMidiSource(bytes, {
      sourceId: "empty-track-source",
      displayName: "runtime.mid",
    });

    expect(result.voices).toHaveLength(1);
    expect(result.voices[0].trackIndex).toBe(1);
  });

  it("normalizes note timing and metadata to beats", () => {
    const bytes = smf(0, [[
      timeSignature(6, 8),
      setTempo(750_000),
      noteOn(0, 60, 240),
      noteOff(0, 60, 960),
      endOfTrack(),
    ]], 960);

    const result = preScanMidiSource(bytes, {
      sourceId: "timing-source",
      displayName: "runtime.mid",
    });

    expect(result.source).toMatchObject({
      ppq: 960,
      durationBeats: 1.25,
      tempoMap: [{ beat: 0, bpm: 80 }],
      timeSignatures: [{ beat: 0, numerator: 6, denominator: 8 }],
    });
    expect(result.notes[0]).toMatchObject({
      startBeat: 0.25,
      durationBeats: 1,
    });
  });

  it("is deterministic for IDs, Voice order, and statistics", () => {
    const bytes = smf(0, [[
      noteOn(2, 67),
      noteOn(0, 36),
      noteOff(2, 67, 240),
      noteOff(0, 36),
      endOfTrack(),
    ]]);
    const sourceId = createMidiSourceId(bytes);
    const options = { sourceId, displayName: "runtime.mid" };

    expect(preScanMidiSource(bytes, options)).toEqual(preScanMidiSource(bytes, options));
    expect(createMidiSourceId(bytes, 1)).toBe(`${sourceId.slice(0, -1)}1`);
  });

  it("rejects malformed MIDI instead of returning a partial scan", () => {
    expect(() => preScanMidiSource(
      Uint8Array.from([0, 1, 2, 3]),
      { sourceId: "broken", displayName: "runtime.mid" },
    )).toThrow();
  });

  it("resolves the complete GM range without out-of-range aliases", () => {
    expect(gmProgramName(0)).toBe("Acoustic Grand Piano");
    expect(gmProgramName(127)).toBe("Gunshot");
    expect(gmProgramName(-1)).toBeUndefined();
    expect(gmProgramName(128)).toBeUndefined();
  });
});

function smf(
  format: 0 | 1,
  tracks: MidiEvent[][],
  ticksPerBeat = 480,
): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: { format, numTracks: tracks.length, ticksPerBeat },
    tracks,
  }));
}

function trackName(text: string, deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "trackName", text };
}

function midiUtf8Text(text: string): string {
  return String.fromCharCode(...new TextEncoder().encode(text));
}

function programChange(
  channel: number,
  programNumber: number,
  deltaTime = 0,
): MidiEvent {
  return { deltaTime, type: "programChange", channel, programNumber };
}

function noteOn(
  channel: number,
  noteNumber: number,
  deltaTime = 0,
): MidiEvent {
  return { deltaTime, type: "noteOn", channel, noteNumber, velocity: 100 };
}

function noteOff(
  channel: number,
  noteNumber: number,
  deltaTime = 0,
): MidiEvent {
  return { deltaTime, type: "noteOff", channel, noteNumber, velocity: 0 };
}

function endOfTrack(deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "endOfTrack" };
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

function setTempo(
  microsecondsPerBeat: number,
  deltaTime = 0,
): MidiEvent {
  return { deltaTime, meta: true, type: "setTempo", microsecondsPerBeat };
}
