import { Midi } from "@tonejs/midi";
import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { analyzeMidi, analyzerVersion } from "./analysis";
import { parseMidi } from "./parser";
import { parseRawSmf } from "./rawSmf";

function progressionMidiBytes(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [4, 4],
    measures: 0,
  });

  const track = midi.addTrack();
  track.name = "Piano chords";
  const chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ];

  chords.forEach((chord, index) => {
    chord.forEach((pitch) => {
      track.addNote({
        midi: pitch,
        ticks: index * 1920,
        durationTicks: 1920,
        velocity: 0.8,
      });
    });
  });

  return new Uint8Array(midi.toArray());
}

function publicSmfWithTempo(tempoMicroseconds?: number): Uint8Array {
  const events: MidiEvent[] = [
    ...(tempoMicroseconds === undefined ? [] : [{ deltaTime: 0, meta: true as const, type: "setTempo" as const,
      microsecondsPerBeat: tempoMicroseconds }]),
  ];
  for (let bar = 0; bar < 4; bar += 1) {
    const pitches = [60, 64, 67];
    for (const noteNumber of pitches) events.push({ deltaTime: 0, type: "noteOn", channel: 0, noteNumber, velocity: 100 });
    for (const [index, noteNumber] of pitches.entries()) events.push({
      deltaTime: index === 0 ? 1920 : 0, type: "noteOff", channel: 0, noteNumber, velocity: 0,
    });
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [events] }));
}

describe("analyzeMidi", () => {
  it.each([
    ["explicit 120", 500_000, 120, "SMF_META", 1],
    ["explicit 96", 625_000, 96, "SMF_META", 1],
    ["no tempo", undefined, 120, "SMF_DEFAULT", 0],
  ] as const)("uses %s through raw parser, import parser, and Product analyzer", (_name, microseconds, bpm, provenance, count) => {
    const bytes = publicSmfWithTempo(microseconds);
    const raw = parseRawSmf(bytes);
    const parsed = parseMidi(bytes);
    const analyzed = analyzeMidi(bytes);
    expect(raw.tempo).toBe(bpm);
    expect(parsed.tempo).toBe(bpm);
    expect(analyzed.bpm).toBe(bpm);
    expect(raw.tempoChanges).toHaveLength(count);
    expect(analyzed.tempoDiagnostics?.provenance).toBe(provenance);
    expect(parsed.tempoDiagnostics?.provenance).toBe(provenance);
  });

  it("returns deterministic progression analysis for the same MIDI bytes", () => {
    const bytes = progressionMidiBytes();
    const first = analyzeMidi(bytes, { fileName: "loop.mid" });
    const second = analyzeMidi(bytes, { fileName: "loop.mid" });

    expect(second).toEqual(first);
    expect(first.analyzerVersion).toBe(analyzerVersion);
    expect(first.analyzedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("keeps a full timeline and emits block candidates", () => {
    const result = analyzeMidi(progressionMidiBytes(), { fileName: "loop.mid" });

    expect(result.fullTimeline.length).toBeGreaterThan(0);
    expect(result.blockCandidates.length).toBeGreaterThan(0);
    expect(result.blockCandidates[0]).toMatchObject({
      startBar: 1,
      lengthBars: 4,
    });
  });
});
