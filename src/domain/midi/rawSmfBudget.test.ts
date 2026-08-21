import { describe, expect, it } from "vitest";
import type { MidiData } from "midi-file";
import { IntakeBudgetError } from "../../security/intakeBudgets";
import { assertRawSmfStructureBudget, type RawSmfStructureLimits } from "./rawSmf";

const limits: RawSmfStructureLimits = {
  maxTracks: 2,
  maxEvents: 3,
  maxNotes: 1,
  maxMetadataCodeUnitsPerEvent: 4,
  maxMetadataCodeUnitsTotal: 5,
  maxDurationBeats: 4,
};

function midi(tracks: MidiData["tracks"]): MidiData {
  return {
    header: { format: 1, numTracks: tracks.length, ticksPerBeat: 96 },
    tracks,
  };
}

describe("raw SMF structure budget", () => {
  it("accepts an exact-boundary structure deterministically", () => {
    const value = midi([[
      { deltaTime: 0, type: "trackName", meta: true, text: "bass" },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 36, velocity: 100 },
      { deltaTime: 384, type: "noteOff", channel: 0, noteNumber: 36, velocity: 0 },
    ]]);
    expect(() => assertRawSmfStructureBudget(value, limits)).not.toThrow();
    expect(() => assertRawSmfStructureBudget(value, limits)).not.toThrow();
  });

  it.each([
    ["tracks", midi([[], [], []])],
    ["events", midi([[
      { deltaTime: 0, type: "endOfTrack", meta: true },
      { deltaTime: 0, type: "endOfTrack", meta: true },
      { deltaTime: 0, type: "endOfTrack", meta: true },
      { deltaTime: 0, type: "endOfTrack", meta: true },
    ]])],
    ["notes", midi([[
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 36, velocity: 100 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 38, velocity: 100 },
    ]])],
    ["metadata", midi([[{ deltaTime: 0, type: "trackName", meta: true, text: "12345" }]])],
    ["duration", midi([[{ deltaTime: 385, type: "endOfTrack", meta: true }]])],
  ])("rejects an over-limit %s structure", (_name, value) => {
    expect(() => assertRawSmfStructureBudget(value, limits)).toThrow(IntakeBudgetError);
  });

  it("rejects invalid delta times", () => {
    const value = midi([[{ deltaTime: Number.NaN, type: "endOfTrack", meta: true }]]);
    expect(() => assertRawSmfStructureBudget(value, limits)).toThrow(IntakeBudgetError);
  });
});
