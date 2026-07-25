import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import type { MidiEvent } from "midi-file";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import { beatGridSignature, extractHybridBlocks } from "./blocks";
import { analyzeMidiHybrid } from "./hybrid";

describe("MIDI block meter contract", () => {
  it("extracts four 6/8 bars on a three-quarter-note grid", () => {
    const timeline = ["C", "Am", "F", "G"].map((label, index) => ({
      bar: index + 1,
      beat: 1,
      durationBeats: 3,
      chord: parseChordLabel(label)!,
      confidence: 0.9,
      alternatives: [],
      warnings: [],
    } satisfies ChordTimelineItem));

    expect(beatGridSignature(timeline, 1, 4, 3)).toEqual([
      "C", "C", "C",
      "Am", "Am", "Am",
      "F", "F", "F",
      "G", "G", "G",
    ]);
    expect(extractHybridBlocks(timeline, 4, 3)[0]).toMatchObject({
      startBar: 1,
      endBar: 4,
      summaryText: "| C | Am | F | G |",
    });
  });

  it("carries a parsed 6/8 meter into production block extraction", () => {
    const events: MidiEvent[] = [
      { deltaTime: 0, meta: true, type: "timeSignature", numerator: 6, denominator: 8, metronome: 24, thirtyseconds: 8 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 100 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 67, velocity: 100 },
      { deltaTime: 5760, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 64, velocity: 0 },
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 67, velocity: 0 },
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ];
    const bytes = Uint8Array.from(writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
      tracks: [events],
    }));

    const result = analyzeMidiHybrid(bytes);

    expect(result).toMatchObject({ totalBars: 4, timeSignature: "6/8" });
    // Two-bar windows were added in P4.0-04, so the four-bar block is located by
    // its length rather than by being first in the list.
    expect(result.blockCandidates.find((candidate) => candidate.lengthBars === 4))
      .toMatchObject({ startBar: 1, endBar: 4, lengthBars: 4 });
  });
});
