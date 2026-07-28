import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordVoicingMemory, VoicingSnapshot } from "../types";
import {
  timelineVoicingSourceStatus,
  voicingSourceStatus,
} from "./voicingSourceStatus";

const chord = parseChordLabel("Cmaj7")!;

describe("voicing source status", () => {
  it("distinguishes source MIDI, generated fallback, and review states", () => {
    expect(voicingSourceStatus(chord, {
      sourceVoicing: snapshot(),
    })).toEqual({ status: "source", reason: "source-ready" });
    expect(voicingSourceStatus(chord, undefined)).toEqual({
      status: "generated",
      reason: "source-missing",
    });
    expect(voicingSourceStatus(chord, {
      sourceVoicing: snapshot({ confidence: 0.5 }),
    })).toEqual({ status: "review", reason: "source-low-confidence" });
    expect(voicingSourceStatus(chord, {
      sourceVoicing: snapshot({ representation: "aggregated-note-set" }),
    })).toEqual({ status: "review", reason: "source-aggregated" });
  });

  it("uses generated when an edit makes the source voicing stale", () => {
    expect(voicingSourceStatus(parseChordLabel("Dm7")!, {
      sourceVoicing: snapshot(),
    })).toEqual({ status: "generated", reason: "source-stale" });
  });

  it("summarizes mixed timelines without hiding review or generated events", () => {
    const sourceMemory: ChordVoicingMemory = { sourceVoicing: snapshot() };
    const reviewMemory: ChordVoicingMemory = {
      sourceVoicing: snapshot({ confidence: 0.5 }),
    };
    expect(timelineVoicingSourceStatus([
      { chord, voicingMemory: sourceMemory },
      { chord },
    ]).status).toBe("generated");
    expect(timelineVoicingSourceStatus([
      { chord },
      { chord, voicingMemory: reviewMemory },
    ]).status).toBe("review");
  });
});

function snapshot(
  changes: Partial<VoicingSnapshot> = {},
): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source: "midi-extracted",
    representation: "simultaneous-voicing",
    midiNotes: [48, 60, 64, 67, 71],
    bassNote: 48,
    capturedForChordKey: "0:maj7:-:-",
    capturedForChordLabel: "Cmaj7",
    confidence: 0.9,
    ...changes,
  };
}
