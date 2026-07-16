import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordCandidateScore, ScoredSegment } from "./candidates";
import { decodeTwoPass } from "./decoder";

function candidate(label: "C" | "G", score: number): ChordCandidateScore {
  const chord = label === "C" ? makeChordSymbol(0, "maj") : makeChordSymbol(7, "maj");
  return { chord, templateScore: score, coreCoverageScore: score, extensionCoverageScore: 0,
    bassCompatibilityScore: 0, slashCompatibilityScore: 0, keyCompatibilityScore: 0,
    foreignNotePenalty: 0, missingCoreTonePenalty: 0, ambiguityPenalty: 0, totalScore: score, evidence: [] };
}
function segment(startBeat: number, endBeat: number, chord: ChordCandidateScore): ScoredSegment {
  return { segment: { startBeat, endBeat, durationBeats: endBeat - startBeat, startBoundaryStrength: 1,
    endBoundaryStrength: 1, noteOverlaps: [] }, candidates: [chord] };
}

describe("two-pass DAG decoder", () => {
  it("prefers one stable segment over unnecessary short repeats", () => {
    const input = [segment(0, 1, candidate("C", 0.8)), segment(1, 2, candidate("C", 0.8)), segment(0, 2, candidate("C", 0.8))];
    expect(decodeTwoPass(input, 4)).toHaveLength(1);
  });

  it("keeps a supported real chord change and is deterministic", () => {
    const input = [segment(0, 2, candidate("C", 0.4)), segment(0, 1, candidate("C", 0.9)), segment(1, 2, candidate("G", 0.9))];
    expect(decodeTwoPass(input, 4).map((entry) => entry.candidate.chord.label)).toEqual(["C", "G"]);
    expect(decodeTwoPass(input, 4)).toEqual(decodeTwoPass(input, 4));
  });
});
