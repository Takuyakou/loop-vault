import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordCandidateScore } from "./candidates";
import { analyzeMidi } from "./analysis";
import { chooseLegacyBoundaryCandidate } from "./legacyBoundaryReranker";

describe("legacy-boundary hybrid reranker", () => {
  it("keeps legacy unless the hybrid candidate has clear evidence", () => {
    const legacy = score("C", 0.7);
    const close = score("Am", 0.8);
    const decision = chooseLegacyBoundaryCandidate(legacy, [close]);
    expect(decision.selected.chord.label).toBe("C");
    expect(decision.candidates.some((candidate) => candidate.chord.label === "C")).toBe(true);
  });

  it("replaces legacy only when every conservative threshold passes", () => {
    const legacy = score("C", 0.4);
    const clear = score("Am", 1.1);
    const decision = chooseLegacyBoundaryCandidate(legacy, [clear]);
    expect(decision.replacedLegacy).toBe(true);
    expect(decision.selected.chord.label).toBe("Am");
    expect(decision.candidates[0].chord.label).toBe("C");
  });

  it("retains legacy in the internal candidate set when eight higher-scored candidates exist", () => {
    const legacy = score("C", -1);
    const candidates = ["Db", "D", "Eb", "E", "F", "Gb", "G", "Ab"]
      .map((label, index) => score(label, 2 - index * 0.01));
    const decision = chooseLegacyBoundaryCandidate(legacy, candidates);

    expect(decision.candidates).toHaveLength(9);
    expect(decision.candidates.some((candidate) => candidate.chord.label === "C")).toBe(true);
    expect(decision.legacy).toBe(legacy);
  });

  it("preserves every legacy boundary and duration", () => {
    const input = midiBytes();
    const legacy = analyzeMidi(input, { mode: "legacy" });
    const reranked = analyzeMidi(input, { mode: "legacy-boundary-rerank" });
    expect(reranked.fullTimeline.map(position)).toEqual(legacy.fullTimeline.map(position));
    reranked.fullTimeline.forEach((item, index) => {
      const legacyLabel = legacy.fullTimeline[index].chord.label;
      expect(item.chord.label === legacyLabel || item.alternatives.some((alternative) => alternative.chord.label === legacyLabel)).toBe(true);
      expect(item.alternatives.length).toBeLessThanOrEqual(4);
    });
  });
});

function score(label: string, totalScore: number): ChordCandidateScore {
  return {
    chord: parseChordLabel(label)!,
    templateScore: totalScore,
    coreCoverageScore: 0.8,
    extensionCoverageScore: 0,
    bassCompatibilityScore: 0.2,
    slashCompatibilityScore: 0,
    keyCompatibilityScore: 0,
    foreignNotePenalty: 0.05,
    missingCoreTonePenalty: 0,
    ambiguityPenalty: 0,
    totalScore,
    evidence: [{ kind: "root-evidence", value: 0.2 }],
  };
}

function position(item: { bar: number; beat: number; durationBeats: number }) {
  return { bar: item.bar, beat: item.beat, durationBeats: item.durationBeats };
}

function midiBytes(): Uint8Array {
  const midi = new Midi();
  const track = midi.addTrack();
  [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]].forEach((chord, bar) =>
    chord.forEach((pitch) => track.addNote({ midi: pitch, ticks: bar * 1920, durationTicks: 1920, velocity: 0.8 })));
  return new Uint8Array(midi.toArray());
}
