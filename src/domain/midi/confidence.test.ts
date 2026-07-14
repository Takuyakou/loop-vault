import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordCandidateScore } from "./candidates";
import { confidenceForDecoded } from "./confidence";
import type { DecodedSegment } from "./decoder";
import { mergeDecodedSegments } from "./merge";

function candidate(quality: "maj" | "maj7", score: number): ChordCandidateScore {
  return { chord: makeChordSymbol(0, quality), templateScore: score, coreCoverageScore: 0.7,
    extensionCoverageScore: 0, bassCompatibilityScore: 0.1, slashCompatibilityScore: 0,
    keyCompatibilityScore: 0, foreignNotePenalty: 0.1, missingCoreTonePenalty: 0,
    ambiguityPenalty: 0, totalScore: score, evidence: [] };
}
function decoded(start: number, end: number, primary: ChordCandidateScore, alternative: ChordCandidateScore, strength = 0.7): DecodedSegment {
  const scored = { segment: { startBeat: start, endBeat: end, durationBeats: end - start,
    startBoundaryStrength: strength, endBoundaryStrength: strength, noteOverlaps: [] }, candidates: [primary, alternative] };
  return { scored, candidate: primary, pathScore: primary.totalScore };
}

describe("merge and confidence", () => {
  it("marks a small candidate margin for review instead of 100 percent", () => {
    const result = confidenceForDecoded([decoded(0, 1, candidate("maj", 0.8), candidate("maj7", 0.78))], 0);
    expect(result.level).toBe("review");
    expect(result.value).toBeLessThan(1);
  });

  it("merges weak-boundary extension changes but keeps alternatives", () => {
    const path = [decoded(0, 1, candidate("maj", 0.9), candidate("maj7", 0.7)), decoded(1, 2, candidate("maj7", 0.9), candidate("maj", 0.7))];
    const merged = mergeDecodedSegments(path);
    expect(merged).toHaveLength(1);
    expect(merged[0].alternatives.length).toBeGreaterThan(0);
  });
});
