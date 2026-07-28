import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import { analyzeMidi } from "./analysis";
import {
  ACCURACY_CANDIDATE_CATALOG_LIMIT,
  applyAccuracyCandidateUnion,
} from "./accuracyCandidateUnion";
import type { MidiAnalyzerMode } from "./types";

function item(
  labelIndex: number,
  alternatives: ChordTimelineItem["alternatives"] = [],
): ChordTimelineItem {
  return {
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: makeChordSymbol(labelIndex % 12, "maj"),
    confidence: 0.9,
    alternatives,
    warnings: [],
  };
}

function analysis(event: ChordTimelineItem): MidiProgressionAnalysis {
  return {
    totalBars: 1,
    timeSignature: "4/4",
    fullTimeline: [event],
    blockCandidates: [],
    analyzedAt: "1970-01-01T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

function source(mode: MidiAnalyzerMode, event: ChordTimelineItem) {
  return { mode, analysis: analysis(event) };
}

describe("Accuracy First candidate union", () => {
  it("preserves rank 1 and existing Top-3, then appends canonical unique candidates", () => {
    const original = item(0, [
      { chord: makeChordSymbol(2, "min"), confidence: 0.8 },
      { chord: makeChordSymbol(7, "dom7"), confidence: 0.7 },
    ]);
    const merged = applyAccuracyCandidateUnion(analysis(original), [
      source("legacy-boundary-rerank", item(9, [
        { chord: makeChordSymbol(2, "min"), confidence: 0.95 },
        { chord: makeChordSymbol(5, "maj7"), confidence: 0.6 },
      ])),
    ]).fullTimeline[0]!;

    expect(merged.chord).toEqual(original.chord);
    expect(merged.confidence).toBe(original.confidence);
    expect(merged.alternatives.slice(0, 2)).toEqual(original.alternatives);
    expect(merged.alternatives.map((entry) => entry.chord.label))
      .toEqual(["Dm", "G7", "A", "Fmaj7"]);
  });

  it("enforces the catalog cap, ignores zero-evidence candidates and is deterministic", () => {
    const sourceAlternatives = Array.from({ length: 80 }, (_, index) => ({
      chord: makeChordSymbol(
        index % 12,
        index % 2 === 0 ? "maj7" : "min7",
        index % 3 === 0 ? ["9"] : [],
        index % 5 === 0 ? (index + 4) % 12 : undefined,
      ),
      confidence: index === 0 ? 0 : 0.5,
    }));
    const input = analysis(item(0));
    const sources = [
      source("legacy-boundary-rerank", item(1, sourceAlternatives)),
      source("voice-aware-rerank-v1", item(3, sourceAlternatives)),
    ];
    const first = applyAccuracyCandidateUnion(input, sources);
    const second = applyAccuracyCandidateUnion(input, sources);

    expect(first).toEqual(second);
    expect(first.fullTimeline[0]!.alternatives.length)
      .toBeLessThanOrEqual(ACCURACY_CANDIDATE_CATALOG_LIMIT - 1);
    expect(first.fullTimeline[0]!.alternatives.every((entry) => entry.confidence > 0))
      .toBe(true);
    expect(new Set(first.fullTimeline[0]!.alternatives.map((entry) => entry.chord.label)).size)
      .toBe(first.fullTimeline[0]!.alternatives.length);
  });

  it("is rollbackable through AnalyzeMidiOptions and keeps deterministic primary output", () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]]
      .forEach((chord, index) => chord.forEach((pitch) => {
        track.addNote({
          midi: pitch,
          time: index * 2,
          duration: 1.9,
          velocity: 0.8,
        });
      }));
    const bytes = new Uint8Array(midi.toArray());
    const off = analyzeMidi(bytes, {
      mode: "phase4-v1",
      accuracyFirst: { enableAccuracyCandidateUnion: false },
    });
    const first = analyzeMidi(bytes, {
      mode: "phase4-v1",
      accuracyFirst: { enableAccuracyCandidateUnion: true },
    });
    const second = analyzeMidi(bytes, {
      mode: "phase4-v1",
      accuracyFirst: { enableAccuracyCandidateUnion: true },
    });

    expect(first).toEqual(second);
    expect(first.fullTimeline.map((entry) => entry.chord))
      .toEqual(off.fullTimeline.map((entry) => entry.chord));
    expect(first.fullTimeline.map((entry) => entry.alternatives.slice(0, 2)))
      .toEqual(off.fullTimeline.map((entry) => entry.alternatives.slice(0, 2)));
    expect(first.fullTimeline.every((entry) =>
      entry.alternatives.length <= ACCURACY_CANDIDATE_CATALOG_LIMIT - 1))
      .toBe(true);
    const firstBlockEvent = first.blockCandidates[0]?.events?.[0];
    if (firstBlockEvent) {
      const timelineEvent = first.fullTimeline.find((entry) =>
        entry.bar === firstBlockEvent.source.bar
        && entry.beat === firstBlockEvent.source.beat
        && entry.durationBeats === firstBlockEvent.source.durationBeats);
      expect(firstBlockEvent.source.alternatives).toEqual(timelineEvent?.alternatives);
    }
  });
});
