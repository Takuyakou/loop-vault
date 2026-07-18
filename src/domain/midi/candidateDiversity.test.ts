import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordQuality } from "../types";
import type { ChordCandidateScore } from "./candidates";
import { chordPitchSet, selectDiverseAlternatives } from "./candidateDiversity";

describe("candidate diversity", () => {
  it("uses five alternative slots while preserving root, quality, bass-root and pitch-set diversity", () => {
    const primary = score(0, "six", 10);
    const candidates = [
      score(5, "maj", 9.9),
      score(0, "maj7", 9.8),
      score(7, "dom7", 9.7),
      score(9, "min7", 9.6, 0),
      score(11, "dim", 9.5),
      primary,
    ];

    const result = selectDiverseAlternatives(candidates, {
      primary,
      bassPitchClass: 7,
    });

    expect(result.map((candidate) => candidate.chord.label)).toEqual(["F", "Cmaj7", "G7", "Am7/C", "Bdim"]);
    expect(result).toHaveLength(5);
    expect([primary, ...result]).toHaveLength(6);
  });

  it("deduplicates canonical chords, limits the internal pool to Top-8 and uses stable tie order", () => {
    const primary = score(0, "maj", 10);
    const duplicate = { ...score(2, "min", 9), chord: { ...makeChordSymbol(2, "min"), label: "D minor" } };
    const result = selectDiverseAlternatives([
      primary,
      score(2, "min", 9),
      duplicate,
      score(1, "maj", 9),
      score(3, "maj", 9),
      score(4, "maj", 8),
      score(5, "maj", 7),
      score(6, "maj", 6),
      score(7, "maj", 5),
      score(8, "maj", 4),
      score(9, "maj", 99),
    ], { primary });

    expect(new Set(result.map((candidate) => `${candidate.chord.root}:${candidate.chord.quality}`)).size)
      .toBe(result.length);
    expect(result[0].chord.label).toBe("A");
    expect(result).toHaveLength(5);
  });

  it("recognizes equivalent pitch sets and slash-bass hypotheses such as C6 and Am7/C", () => {
    const c6 = score(0, "six", 10);
    const am7OverC = score(9, "min7", 8, 0);

    expect(chordPitchSet(c6.chord)).toEqual(chordPitchSet(am7OverC.chord));
    expect(selectDiverseAlternatives([c6, am7OverC], {
      primary: c6,
      bassPitchClass: 0,
    }).map((candidate) => candidate.chord.label)).toEqual(["Am7/C"]);
  });

  it("fills missing categories by stable score order", () => {
    const primary = score(0, "maj", 10);
    const result = selectDiverseAlternatives([
      primary, score(2, "min", 9), score(5, "maj", 8), score(7, "dom7", 7), score(11, "dim", 1),
    ], { primary });

    expect(result.map((candidate) => candidate.chord.label)).toEqual(["Dm", "F", "G7", "Bdim"]);
  });
});

function score(root: number, quality: ChordQuality, totalScore: number, bass?: number): ChordCandidateScore {
  return {
    chord: makeChordSymbol(root, quality, [], bass),
    templateScore: totalScore,
    coreCoverageScore: 1,
    extensionCoverageScore: 0,
    bassCompatibilityScore: 0,
    slashCompatibilityScore: 0,
    keyCompatibilityScore: 0,
    foreignNotePenalty: 0,
    missingCoreTonePenalty: 0,
    ambiguityPenalty: 0,
    totalScore,
    evidence: [],
  };
}
