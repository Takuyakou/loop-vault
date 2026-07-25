import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import { extractHybridBlocks } from "./blocks";
import { selectProgressionCandidates } from "./candidateSelection";
import { analyzeMidiWithRankingScores } from "./legacy";
import { beatsPerBar } from "./timing";
import { analyzeMidiVoiceAwareRerank } from "./voiceAwareReranker";

describe("internal MIDI ranking scores", () => {
  it("ranks distinct raw scores even when the UI confidences are clamped", () => {
    // Every bar reports a clamped confidence of 1, so only the internal ranking
    // scores can tell the first half of the piece from the second.
    const timeline = timelineWithConfidences([1, 1, 1, 1]);
    const blocks = extractHybridBlocks(timeline, 4, 4, [1.05, 1.05, 1.25, 1.25]);

    const weak = blocks.find((block) => block.startBar === 1 && block.lengthBars === 2);
    const strong = blocks.find((block) => block.startBar === 3 && block.lengthBars === 2);
    expect(weak).toBeDefined();
    expect(strong).toBeDefined();
    expect(weak!.confidence).toBe(0.92);
    expect(strong!.confidence).toBe(0.92);
    expect(strong!.selectionScore!).toBeGreaterThan(weak!.selectionScore!);

    // With both blocks in the same region the higher-scoring one is picked first.
    const selected = selectProgressionCandidates([
      { candidate: { ...weak!, id: "weak", startBar: 1, endBar: 2 }, dedupeKey: "weak", selectionScore: weak!.selectionScore! },
      { candidate: { ...strong!, id: "strong", startBar: 1, endBar: 2 }, dedupeKey: "strong", selectionScore: strong!.selectionScore! },
    ], 4);
    expect(selected[0]?.id).toBe("strong");
  });

  it("preserves the existing order when no internal scores are supplied", () => {
    const timeline = timelineWithConfidences([0.71, 0.72, 0.73, 0.74]);

    expect(extractHybridBlocks(timeline, 4))
      .toEqual(extractHybridBlocks(timeline, 4, 4, timeline.map((item) => item.confidence)));
  });

  it("keeps ranking scores outside the public analysis and serialized JSON", () => {
    const internal = analyzeMidiWithRankingScores(voiceAwareMidi());

    expect(internal.timelineRankingScores.some((score) => score > 1)).toBe(true);
    expect(new Set(internal.timelineRankingScores.map((score) => score.toPrecision(17))).size)
      .toBeGreaterThan(1);
    expect(internal.timelineRankingScores).toHaveLength(internal.analysis.fullTimeline.length);
    expect(JSON.stringify(internal.analysis)).not.toContain("rankingScore");
    expect(internal.analysis.fullTimeline.every(
      (item) => !("rankingScore" in item) && !("rawMatchScore" in item),
    )).toBe(true);
  });

  it("uses baseline legacy ranking scores for retained voice-aware intervals", () => {
    const bytes = voiceAwareMidi();
    const baseline = analyzeMidiWithRankingScores(bytes);
    const retained = analyzeMidiVoiceAwareRerank(bytes, {}, {
      thresholds: {
        minimumScoreLead: 100,
        minimumCoreCoverage: 0.62,
        minimumRootEvidence: 0.08,
        maximumForeignPenalty: 0.14,
        maximumMissingCorePenalty: 0.17,
      },
    });

    expect(retained.fullTimeline.every(
      (item) => item.warnings.includes("legacy-boundary-retained"),
    )).toBe(true);
    expect(retained.blockCandidates).toEqual(extractHybridBlocks(
      retained.fullTimeline,
      retained.totalBars,
      beatsPerBar(retained.timeSignature),
      baseline.timelineRankingScores,
    ));
  });

  it("keeps baseline legacy ranking scores when voice-aware replaces a chord", () => {
    const bytes = voiceAwareMidi();
    const baseline = analyzeMidiWithRankingScores(bytes);
    const replaced = analyzeMidiVoiceAwareRerank(bytes, {}, {
      thresholds: {
        minimumScoreLead: -100,
        minimumCoreCoverage: -100,
        minimumRootEvidence: -100,
        maximumForeignPenalty: 100,
        maximumMissingCorePenalty: 100,
      },
    });

    expect(replaced.fullTimeline.some(
      (item) => item.warnings.includes("voice-aware-reranked"),
    )).toBe(true);
    expect(replaced.blockCandidates).toEqual(extractHybridBlocks(
      replaced.fullTimeline,
      replaced.totalBars,
      beatsPerBar(replaced.timeSignature),
      baseline.timelineRankingScores,
    ));
    expect(JSON.stringify(replaced)).not.toContain("rankingScore");
  });
});

function timelineWithConfidences(confidences: readonly number[]): ChordTimelineItem[] {
  return ["C", "Dm", "Em", "F"].map((label, index) => ({
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: parseChordLabel(label)!,
    confidence: confidences[index],
    alternatives: [],
    warnings: [],
  }));
}

function voiceAwareMidi(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  const bass = midi.addTrack();
  bass.channel = 0;
  bass.instrument.number = 32;
  const harmony = midi.addTrack();
  harmony.channel = 1;
  harmony.instrument.number = 0;
  const melody = midi.addTrack();
  melody.channel = 2;
  melody.instrument.number = 80;
  const chords = [
    [48, 60, 64, 67],
    [45, 57, 60, 64],
    [53, 65, 69, 72],
    [55, 67, 71, 74],
  ];
  chords.forEach((pitches, bar) => {
    const ticks = bar * 1920;
    bass.addNote({ midi: pitches[0], ticks, durationTicks: 1920, velocity: 0.85 });
    pitches.slice(1).forEach((pitch) => {
      harmony.addNote({ midi: pitch, ticks, durationTicks: 1920, velocity: 0.8 });
    });
    melody.addNote({
      midi: pitches[3] + 12,
      ticks,
      durationTicks: 960,
      velocity: 0.65,
    });
  });
  return new Uint8Array(midi.toArray());
}
