import { describe, expect, test } from "vitest";
import { analyzeMidi } from "../midi/analysis";
import { makeChordSymbol } from "../chords";
import type {
  ChordQuality,
  ChordTimelineItem,
  SavedProgressionBlock,
} from "../types";
import { buildProgressionMidi } from ".";

describe("Progression MIDI export round trip", () => {
  test("keeps every stored quality analyzable without missing timeline coverage", () => {
    const qualities: readonly ChordQuality[] = [
      "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
      "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
      "add9", "six", "min6", "sixNine",
    ];
    const chords: ChordTimelineItem[] = qualities.map((quality, index) => ({
      eventId: `event-${index + 1}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol((index * 5) % 12, quality),
      confidence: 1,
      alternatives: [],
      warnings: [],
    }));
    const block: SavedProgressionBlock = {
      id: "round-trip",
      summaryText: "Round trip",
      chords,
      bpm: 120,
      timeSignature: "4/4",
      tags: [],
      capturedAt: "2026-07-30T00:00:00.000Z",
      analyzerVersion: "synthetic",
    };

    const analysis = analyzeMidi(buildProgressionMidi(block).bytes, {
      mode: "legacy",
      fileName: "round-trip.mid",
    });
    const actual = analysis.fullTimeline.map((item) => item.chord);
    const exact = chords.filter((item, index) => (
      item.chord.root === actual[index]?.root
      && item.chord.quality === actual[index]?.quality
    ));

    expect(actual).toHaveLength(qualities.length);
    expect(exact).toHaveLength(19);
    expect(actual[14]).toMatchObject({ root: chords[14]!.chord.root, quality: "add9" });
    expect(actual[15]).toMatchObject({ root: chords[15]!.chord.root, quality: "dom7sus4" });
  });
});
