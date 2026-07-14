import { describe, expect, it } from "vitest";
import { normalizeNotes, overlapWithSegment } from "./normalize";
import type { MidiSongData } from "./types";

function song(overrides: Partial<MidiSongData> = {}): MidiSongData {
  return { notes: [], ticksPerBeat: 480, totalBars: 1, tracks: [{ index: 0, name: "Piano" }], controlChanges: [], ...overrides };
}

describe("normalizeNotes", () => {
  it("extends a released note to pedal release without crossing a re-onset", () => {
    const data = song({
      notes: [
        { pitch: 60, startTick: 0, durationTick: 240, velocity: 0.8, trackIndex: 0 },
        { pitch: 60, startTick: 720, durationTick: 240, velocity: 0.8, trackIndex: 0 },
      ],
      controlChanges: [
        { trackIndex: 0, number: 64, tick: 120, value: 1 },
        { trackIndex: 0, number: 64, tick: 960, value: 0 },
      ],
    });
    expect(normalizeNotes(data)[0].sustainedEndBeat).toBe(1.5);
  });

  it("calculates duration overlap instead of onset presence", () => {
    const note = normalizeNotes(song({ notes: [{ pitch: 60, startTick: 240, durationTick: 480, velocity: 1, trackIndex: 0 }] }))[0];
    expect(overlapWithSegment(note, { startBeat: 0, endBeat: 1 }).overlapBeats).toBe(0.5);
  });
});
