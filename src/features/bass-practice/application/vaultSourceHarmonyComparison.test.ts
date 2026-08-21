import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../../domain/chords";
import { extractSourceBasslineSnapshot } from "../../../domain/sourceBassline";
import type { SavedProgressionBlock } from "../../../domain/types";
import { compareSourceBasslineCurrentHarmony } from "./vaultPickerCandidates";

const sourceId = "synthetic-source";
const snapshot = extractSourceBasslineSnapshot({
  selectedSourceId: sourceId,
  selectedVoiceId: "synthetic-bass",
  range: { authority: "raw-integer-ticks", constantMeterProven: true, barAlignmentProven: true, sourceId, startTick: 0, endTick: 16, sourceEndTick: 16, ticksPerQuarter: 4, meter: { numerator: 4, denominator: 4 } },
  notes: [{ sourceId, voiceId: "synthetic-bass", pitch: 40, velocity: 0.8, startTick: 0, durationTick: 4, ticksPerQuarter: 4 }],
  capturedHarmony: {
    authority: "raw-integer-ticks",
    sourceId,
    rangeStartTick: 0,
    rangeEndTick: 16,
    ticksPerQuarter: 4,
    spans: [{ sourceId, startTick: 0, durationTick: 16, ticksPerQuarter: 4, chord: makeChordSymbol(0, "maj7") }],
  },
});

function block(chord = makeChordSymbol(0, "maj7"), durationBeats = 4): SavedProgressionBlock {
  return {
    id: "block-a",
    summaryText: "Synthetic",
    chords: [{ bar: 1, beat: 1, durationBeats, chord, confidence: 1, alternatives: [], warnings: [] }],
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-08-21T00:00:00.000Z",
    analyzerVersion: "synthetic",
  };
}

describe("Source Bassline captured/current harmony comparison", () => {
  it("uses the canonical captured-harmony signature for match and mismatch", () => {
    expect(compareSourceBasslineCurrentHarmony(block(), snapshot)).toBe("match");
    expect(compareSourceBasslineCurrentHarmony(block(makeChordSymbol(2, "min7")), snapshot)).toBe("mismatch");
  });

  it("does not reconstruct non-integer or unsupported current timing", () => {
    expect(compareSourceBasslineCurrentHarmony(block(makeChordSymbol(0, "maj7"), 3.5), snapshot)).toBe("comparison-unavailable");
    expect(compareSourceBasslineCurrentHarmony({ ...block(), timeSignature: "3/4" }, snapshot)).toBe("comparison-unavailable");
    expect(compareSourceBasslineCurrentHarmony(block(), { ...snapshot, capturedHarmony: undefined })).toBe("comparison-unavailable");
  });
});