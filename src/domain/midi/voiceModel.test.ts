import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import type { MidiEvent } from "midi-file";
import { buildHybridPipeline } from "./hybrid";
import { parseMidi } from "./parser";
import { parseRawSmf } from "./rawSmf";
import { beatsPerBar, tickToSeconds } from "./timing";
import type { MidiSongData } from "./types";
import { buildVoices, selectChordEvidenceNotes } from "./voices";

describe("raw SMF Voice model", () => {
  it("keeps Type 0 source track identity while separating channel Voices", () => {
    const bytes = smf(0, [[
      trackName("Combined"),
      programChange(0, 32),
      noteOn(0, 36),
      noteOn(1, 60),
      noteOff(0, 36, 240),
      noteOff(1, 60),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);
    const voices = buildVoices(song);

    expect(song.tracks).toEqual([{ index: 0, name: "Combined" }]);
    expect(song.notes.map((note) => [note.trackIndex, note.channel])).toEqual([[0, 0], [0, 1]]);
    expect(voices.map((voice) => voice.id)).toEqual(["0:0", "0:1"]);
  });

  it("uses the same Voice API for Type 1 source tracks", () => {
    const bytes = smf(1, [
      [trackName("Bass"), noteOn(0, 36), noteOff(0, 36, 480), endOfTrack()],
      [trackName("Keys"), noteOn(2, 60), noteOff(2, 60, 480), endOfTrack()],
    ]);

    const song = parseMidi(bytes);
    const voices = buildVoices(song);

    expect(song.notes.map((note) => note.trackIndex)).toEqual([0, 1]);
    expect(voices.map((voice) => ({ id: voice.id, trackName: voice.trackName }))).toEqual([
      { id: "0:0", trackName: "Bass" },
      { id: "1:2", trackName: "Keys" },
    ]);
  });

  it("retains channel 9 notes but excludes them from chord evidence", () => {
    const bytes = smf(0, [[
      noteOn(0, 60),
      noteOn(9, 36),
      noteOff(0, 60, 120),
      noteOff(9, 36),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);
    const voices = buildVoices(song);
    const percussion = voices.find((voice) => voice.channel === 9);

    expect(song.notes).toHaveLength(2);
    expect(percussion).toMatchObject({
      id: "0:9",
      inferredRole: "percussion",
      roleConfidence: 1,
      roleEvidence: { channelRule: { role: "percussion", confidence: 1 } },
    });
    expect(selectChordEvidenceNotes(song.notes).map((note) => note.channel)).toEqual([0]);
  });

  it("distinguishes implicit program 0 from an explicit Program Change 0", () => {
    const bytes = smf(0, [[
      noteOn(0, 60),
      noteOff(0, 60, 120),
      programChange(1, 0),
      noteOn(1, 64),
      noteOff(1, 64, 120),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);
    const implicit = song.notes.find((note) => note.channel === 0);
    const explicit = song.notes.find((note) => note.channel === 1);
    const voices = buildVoices(song);

    expect(implicit).toMatchObject({ program: 0, programExplicit: false });
    expect(explicit).toMatchObject({ program: 0, programExplicit: true });
    expect(voices.find((voice) => voice.id === "0:0")).toMatchObject({
      explicitPrograms: [],
      dominantProgram: 0,
      dominantProgramExplicit: false,
    });
    expect(voices.find((voice) => voice.id === "0:1")).toMatchObject({
      explicitPrograms: [{ program: 0, noteCount: 1, durationTicks: 120 }],
      dominantProgram: 0,
      dominantProgramExplicit: true,
    });
  });

  it("binds program state at Note On and pairs Note Off across Program Changes", () => {
    const bytes = smf(0, [[
      programChange(0, 5),
      noteOn(0, 60),
      programChange(0, 10, 120),
      noteOff(0, 60, 120),
      noteOn(0, 64),
      noteOff(0, 64, 120),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);
    const voice = buildVoices(song)[0];

    expect(song.notes).toEqual([
      expect.objectContaining({ pitch: 60, startTick: 0, durationTick: 240, program: 5, programExplicit: true }),
      expect.objectContaining({ pitch: 64, startTick: 240, durationTick: 120, program: 10, programExplicit: true }),
    ]);
    expect(song.tracks[0].program).toBeUndefined();
    expect(voice.explicitPrograms).toEqual([
      { program: 5, noteCount: 1, durationTicks: 240 },
      { program: 10, noteCount: 1, durationTicks: 120 },
    ]);
    expect(voice).toMatchObject({ dominantProgram: 5, dominantProgramExplicit: true });
  });

  it("does not project a later explicit Program onto earlier implicit notes", () => {
    const bytes = smf(0, [[
      noteOn(0, 60),
      noteOff(0, 60, 120),
      programChange(0, 5),
      noteOn(0, 64),
      noteOff(0, 64, 120),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);

    expect(song.tracks[0].program).toBeUndefined();
    expect(song.notes.map((note) => [note.program, note.programExplicit])).toEqual([
      [0, false],
      [5, true],
    ]);
  });

  it("aggregates dominant Program by Program before deriving explicitness", () => {
    const data: MidiSongData = {
      notes: [
        { pitch: 60, startTick: 0, durationTick: 300, velocity: 1, trackIndex: 0, channel: 0, program: 5, programExplicit: false },
        { pitch: 64, startTick: 300, durationTick: 100, velocity: 1, trackIndex: 0, channel: 0, program: 5, programExplicit: true },
        { pitch: 67, startTick: 400, durationTick: 400, velocity: 1, trackIndex: 0, channel: 0, program: 6, programExplicit: true },
      ],
      ticksPerBeat: 480,
      totalBars: 1,
      tracks: [{ index: 0, name: "" }],
      controlChanges: [],
    };

    expect(buildVoices(data)[0]).toMatchObject({
      dominantProgram: 5,
      dominantProgramExplicit: true,
    });
  });

  it("computes low/high shares against notes sounding at each onset", () => {
    const data: MidiSongData = {
      notes: [
        { pitch: 48, startTick: 0, durationTick: 960, velocity: 1, trackIndex: 0, channel: 0 },
        { pitch: 72, startTick: 480, durationTick: 480, velocity: 1, trackIndex: 0, channel: 1 },
      ],
      ticksPerBeat: 480,
      totalBars: 1,
      tracks: [{ index: 0, name: "" }],
      controlChanges: [],
    };

    const upperVoice = buildVoices(data).find((voice) => voice.channel === 1);

    expect(upperVoice).toMatchObject({ lowestVoiceShare: 0, highestVoiceShare: 1 });
  });

  it("uses denominator-aware bar lengths for 6/8", () => {
    const bytes = smf(0, [[
      timeSignature(6, 8),
      noteOn(0, 60),
      noteOff(0, 60, 2880),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);

    expect(beatsPerBar(song.timeSignature)).toBe(3);
    expect(song.totalBars).toBe(2);
    expect(buildHybridPipeline(bytes).beatsPerBar).toBe(3);
  });

  it("integrates full tempo chronology with 120 BPM before the first event", () => {
    const bytes = smf(0, [[
      noteOn(0, 60),
      setTempo(1_000_000, 480),
      setTempo(250_000, 480),
      noteOff(0, 60, 480),
      endOfTrack(),
    ]]);

    const song = parseMidi(bytes);

    expect(song.tempoChanges).toEqual([
      { tick: 480, bpm: 60 },
      { tick: 960, bpm: 240 },
    ]);
    expect(tickToSeconds(song, 1440)).toBeCloseTo(1.75, 8);
  });

  it("closes dangling Note On events at the deterministic track end", () => {
    const bytes = smf(0, [[noteOn(0, 60), endOfTrack(480)]]);

    expect(parseMidi(bytes).notes).toEqual([
      expect.objectContaining({ pitch: 60, startTick: 0, durationTick: 480 }),
    ]);
  });

  it("rejects format 2 independent timelines", () => {
    const bytes = smf(2, [[endOfTrack()], [endOfTrack()]]);

    expect(() => parseMidi(bytes)).toThrow(/format 2 is unsupported/i);
  });

  it("rejects SMPTE time division instead of guessing PPQ", () => {
    expect(() => parseMidi(smpteSmf())).toThrow(/SMPTE time division is unsupported/i);
  });

  it("parses running status and velocity-zero Note On release", () => {
    const bytes = smf(0, [[
      noteOn(0, 60),
      noteOn(0, 64),
      noteOnWithVelocity(0, 60, 0, 240),
      noteOnWithVelocity(0, 64, 0),
      endOfTrack(),
    ]], true);

    expect(parseMidi(bytes).notes.map((note) => [note.pitch, note.durationTick])).toEqual([
      [60, 240],
      [64, 240],
    ]);
  });

  it("pairs overlapping same-pitch notes independently by channel", () => {
    const bytes = smf(0, [[
      noteOn(0, 60),
      noteOn(1, 60),
      noteOff(0, 60, 120),
      noteOff(1, 60, 120),
      endOfTrack(),
    ]]);

    expect(parseMidi(bytes).notes.map((note) => [note.channel, note.durationTick])).toEqual([
      [0, 120],
      [1, 240],
    ]);
  });

  it("computes deterministic Voice features and identifiers", () => {
    const bytes = smf(0, [[
      programChange(3, 4),
      noteOn(3, 60),
      noteOn(3, 64),
      noteOn(3, 67),
      noteOff(3, 60, 480),
      noteOff(3, 64),
      noteOff(3, 67),
      endOfTrack(),
    ]]);

    const first = buildVoices(parseMidi(bytes));
    const second = buildVoices(parseMidi(bytes));

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      id: "0:3",
      channel: 3,
      noteCount: 3,
      pitchRange: [60, 67],
      medianPitch: 64,
      avgDurationTick: 480,
      noteDensity: 3,
      maxPolyphony: 3,
      simultaneousOnsetRatio: 1,
      lowestVoiceShare: 1 / 3,
      highestVoiceShare: 1 / 3,
      inferredRole: "mixed",
      roleConfidence: 0,
    });
  });

  it("returns identical raw source events for identical bytes", () => {
    const bytes = smf(0, [[noteOn(4, 72), noteOff(4, 72, 240), endOfTrack()]]);

    expect(parseRawSmf(bytes)).toEqual(parseRawSmf(bytes));
  });
});

function smf(format: 0 | 1 | 2, tracks: MidiEvent[][], running = false): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: { format, numTracks: tracks.length, ticksPerBeat: 480 },
    tracks,
  }, { running }));
}

function trackName(text: string, deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "trackName", text };
}

function programChange(channel: number, programNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "programChange", channel, programNumber };
}

function noteOn(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOn", channel, noteNumber, velocity: 100 };
}

function noteOnWithVelocity(channel: number, noteNumber: number, velocity: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOn", channel, noteNumber, velocity };
}

function noteOff(channel: number, noteNumber: number, deltaTime = 0): MidiEvent {
  return { deltaTime, type: "noteOff", channel, noteNumber, velocity: 0 };
}

function endOfTrack(deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "endOfTrack" };
}

function timeSignature(numerator: number, denominator: number, deltaTime = 0): MidiEvent {
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

function setTempo(microsecondsPerBeat: number, deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "setTempo", microsecondsPerBeat };
}

function smpteSmf(): Uint8Array {
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0xe7, 0x28,
    0x4d, 0x54, 0x72, 0x6b,
    0x00, 0x00, 0x00, 0x04,
    0x00, 0xff, 0x2f, 0x00,
  ]);
}
