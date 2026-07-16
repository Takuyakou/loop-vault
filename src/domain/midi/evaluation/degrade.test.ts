import { parseMidi, writeMidi } from "midi-file";
import type { MidiData, MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { parseRawSmf } from "../rawSmf";
import {
  degradeMidi,
  deterministicDegradationSeed,
  midiDegradationRecipes,
} from "./degrade";

const fixture = Uint8Array.from(writeMidi({
  header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
  tracks: [
    [
      { deltaTime: 0, meta: true, type: "trackName", text: "Conductor" },
      { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
      { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
      { deltaTime: 1920, meta: true, type: "endOfTrack" },
    ],
    [
      { deltaTime: 0, meta: true, type: "trackName", text: "Piano" },
      { deltaTime: 0, type: "programChange", channel: 0, programNumber: 4 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 90 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 80 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 67, velocity: 80 },
      { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 64, velocity: 0 },
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 67, velocity: 0 },
      { deltaTime: 1440, meta: true, type: "endOfTrack" },
    ],
  ],
} satisfies MidiData));

describe("dirty MIDI degradation", () => {
  it("is byte-identical for every recipe with the same seed", () => {
    for (const recipe of midiDegradationRecipes) {
      expect(degradeMidi(fixture, recipe, 365)).toEqual(degradeMidi(fixture, recipe, 365));
    }
    expect(deterministicDegradationSeed(365, "case-a", "timing-jitter"))
      .toBe(deterministicDegradationSeed(365, "case-a", "timing-jitter"));
  });

  it("merges tracks into SMF format 0", () => {
    const midi = parseMidi(degradeMidi(fixture, "type0-merge", 1));
    expect(midi.header.format).toBe(0);
    expect(midi.tracks).toHaveLength(1);
  });

  it("preserves trailing rests and uses the maximum original EOT when merging", () => {
    expect(endOfTrackTicks(degradeMidi(fixture, "track-name-removal", 1))).toEqual([1920, 1920]);
    expect(endOfTrackTicks(degradeMidi(fixture, "type0-merge", 1))).toEqual([1920]);
  });

  it("adds a channel 9 GM drum overlay", () => {
    const events = absoluteEvents(degradeMidi(fixture, "gm-drums-overlay", 1));
    expect(events.some(({ event }) => channelOf(event) === 9 && event.type === "noteOn" && event.velocity > 0)).toBe(true);
  });

  it("keeps an overlay that extends beyond the original EOT", () => {
    const shortFixture = Uint8Array.from(writeMidi({
      header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 90 },
        { deltaTime: 500, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ]],
    } satisfies MidiData));

    expect(endOfTrackTicks(degradeMidi(shortFixture, "gm-drums-overlay", 1))).toEqual([500, 540]);
  });

  it("adds a separate lead melody with an explicit lead program", () => {
    const midi = parseMidi(degradeMidi(fixture, "lead-melody-overlay", 1));
    expect(midi.tracks.length).toBe(3);
    expect(midi.tracks.flat().some((event) => event.type === "programChange" && event.programNumber === 80)).toBe(true);
  });

  it("removes track names", () => {
    const midi = parseMidi(degradeMidi(fixture, "track-name-removal", 1));
    expect(midi.tracks.flat().some((event) => event.type === "trackName")).toBe(false);
  });

  it("removes program changes", () => {
    const midi = parseMidi(degradeMidi(fixture, "program-removal", 1));
    expect(midi.tracks.flat().some((event) => event.type === "programChange")).toBe(false);
  });

  it("makes every used channel explicitly program 0", () => {
    const degraded = degradeMidi(fixture, "all-program-0", 1);
    const programs = parseMidi(degraded).tracks.flat()
      .filter((event) => event.type === "programChange");
    expect(programs.length).toBeGreaterThan(0);
    expect(programs.every((event) => event.type === "programChange" && event.programNumber === 0)).toBe(true);
    expect(parseRawSmf(degraded).notes.every((note) => note.program === 0 && note.programExplicit)).toBe(true);
  });

  it("adds sustain controller extension", () => {
    const controllers = parseMidi(degradeMidi(fixture, "sustain-extension", 1)).tracks.flat()
      .filter((event) => event.type === "controller" && event.controllerType === 64);
    expect(controllers.map((event) => event.type === "controller" ? event.value : -1)).toEqual([127, 0]);
  });

  it("jitters paired note events while preserving duration", () => {
    const before = notePairs(fixture);
    const after = notePairs(degradeMidi(fixture, "timing-jitter", 8128));
    expect(after.some((pair, index) => pair.start !== before[index].start)).toBe(true);
    expect(after.map((pair) => pair.end - pair.start)).toEqual(before.map((pair) => pair.end - pair.start));
  });

  it("adds piano left-hand bass to the original Voice", () => {
    const midi = parseMidi(degradeMidi(fixture, "piano-left-hand-bass", 1));
    expect(midi.tracks).toHaveLength(2);
    const pitches = midi.tracks[1]
      .filter((event) => event.type === "noteOn" && event.velocity > 0)
      .map((event) => event.type === "noteOn" ? event.noteNumber : 127);
    expect(Math.min(...pitches)).toBeLessThan(60);
  });

  it("adds melody to the same track and channel", () => {
    const midi = parseMidi(degradeMidi(fixture, "same-channel-melody", 1));
    expect(midi.tracks).toHaveLength(2);
    const noteOns = midi.tracks[1].filter((event) => event.type === "noteOn" && event.velocity > 0);
    expect(noteOns.length).toBeGreaterThan(3);
    expect(new Set(noteOns.map(channelOf))).toEqual(new Set([0]));
  });

  it("combines structure, percussion, melody, metadata, sustain and jitter changes", () => {
    const midi = parseMidi(degradeMidi(fixture, "combined", 123));
    const events = midi.tracks.flat();
    expect(midi.header.format).toBe(0);
    expect(midi.tracks).toHaveLength(1);
    expect(events.some((event) => event.type === "trackName")).toBe(false);
    expect(events.some((event) => event.type === "programChange")).toBe(false);
    expect(events.some((event) => channelOf(event) === 9)).toBe(true);
    expect(events.some((event) => event.type === "controller" && event.controllerType === 64)).toBe(true);
  });
});

function absoluteEvents(bytes: Uint8Array): Array<{ trackIndex: number; tick: number; event: MidiEvent }> {
  return parseMidi(bytes).tracks.flatMap((track, trackIndex) => {
    let tick = 0;
    return track.map((event) => {
      tick += event.deltaTime;
      return { trackIndex, tick, event };
    });
  });
}

function notePairs(bytes: Uint8Array): Array<{ start: number; end: number }> {
  const active = new Map<string, number[]>();
  const pairs: Array<{ start: number; end: number }> = [];
  for (const { trackIndex, tick, event } of absoluteEvents(bytes)) {
    const channel = channelOf(event);
    if (channel === undefined || (event.type !== "noteOn" && event.type !== "noteOff")) continue;
    const key = `${trackIndex}:${channel}:${event.noteNumber}`;
    if (event.type === "noteOn" && event.velocity > 0) {
      const queue = active.get(key) ?? [];
      queue.push(tick);
      active.set(key, queue);
    } else {
      const start = active.get(key)?.shift();
      if (start !== undefined) pairs.push({ start, end: tick });
    }
  }
  return pairs;
}

function endOfTrackTicks(bytes: Uint8Array): number[] {
  return parseMidi(bytes).tracks.map((track) => {
    let tick = 0;
    let endOfTrackTick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "endOfTrack") endOfTrackTick = tick;
    }
    return endOfTrackTick;
  });
}

function channelOf(event: MidiEvent): number | undefined {
  return "channel" in event ? event.channel : undefined;
}
