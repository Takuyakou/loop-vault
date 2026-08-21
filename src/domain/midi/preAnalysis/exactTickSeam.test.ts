import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { preScanMidiSource } from "./voiceExtraction";

describe("pre-analysis exact tick seam", () => {
  it("carries parser ticks and source PPQ without reconstructing from beat floats", () => {
    const bytes = Uint8Array.from(writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: 7 },
      tracks: [[
        { deltaTime: 1, type: "noteOn", channel: 0, noteNumber: 36, velocity: 64 },
        { deltaTime: 3, type: "noteOff", channel: 0, noteNumber: 36, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ]],
    }));
    const scan = preScanMidiSource(bytes, {
      sourceId: "synthetic-source",
      displayName: "Synthetic",
    });

    expect(scan.notes[0]).toMatchObject({
      startTick: 1,
      durationTick: 3,
      ticksPerQuarter: 7,
      startBeat: 1 / 7,
      durationBeats: 3 / 7,
    });
  });
});
