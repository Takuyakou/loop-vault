import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { analyzeMidi, analyzerVersion } from "./analysis";

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

describe("analyzeMidi", () => {
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
