import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import {
  composeQuickChordCandidates,
  composeRepairQuickChordCandidates,
  quickChordCandidate,
  type QuickCandidateSource,
} from "./quickCandidates";

const current = makeChordSymbol(0, "maj7");
const candidate = (
  labelRoot: number,
  source: QuickCandidateSource,
  rank: number,
  bass?: number,
) => quickChordCandidate({
  chord: makeChordSymbol(labelRoot, source === "smoothConnection" ? "min7" : "dom7", [], bass),
  source,
  sourceScore: 1 - rank / 10,
  sourceRank: rank,
});

describe("quick chord candidate composer", () => {
  it("composes Analyzer 3 + Smooth 1 + Style 1 without cross-source score comparison", () => {
    const result = composeQuickChordCandidates({
      currentChord: current,
      analyzerCandidates: [candidate(2, "analyzer", 0), candidate(4, "analyzer", 1), candidate(5, "analyzer", 2)],
      smoothCandidates: [candidate(7, "smoothConnection", 0)],
      styleCandidates: [candidate(9, "authorReferenceFit", 0)],
    });
    expect(result.map((item) => item.primarySource)).toEqual([
      "analyzer", "analyzer", "analyzer", "smoothConnection", "authorReferenceFit",
    ]);
  });

  it("fills missing Analyzer slots with Context before Smooth and Style", () => {
    const result = composeQuickChordCandidates({
      currentChord: current,
      analyzerCandidates: [candidate(2, "analyzer", 0)],
      contextCandidates: [
        candidate(4, "harmonicContext", 0),
        candidate(5, "harmonicContext", 1),
        candidate(6, "harmonicContext", 2),
      ],
      smoothCandidates: [candidate(7, "smoothConnection", 0)],
      styleCandidates: [candidate(9, "authorReferenceFit", 0)],
    });
    expect(result).toHaveLength(5);
    expect(result.map((item) => item.primarySource)).toEqual([
      "analyzer", "harmonicContext", "harmonicContext", "smoothConnection", "authorReferenceFit",
    ]);
  });

  it("does not invent missing source candidates and uses Analyzer fallback", () => {
    const result = composeQuickChordCandidates({
      currentChord: current,
      analyzerCandidates: Array.from({ length: 5 }, (_, index) => candidate(index + 1, "analyzer", index)),
    });
    expect(result).toHaveLength(5);
    expect(result.every((item) => item.primarySource === "analyzer")).toBe(true);
  });

  it("removes current, merges duplicate sources, and preserves slash-bass variants", () => {
    const duplicateChord = makeChordSymbol(7, "dom7");
    const duplicateAnalyzer = quickChordCandidate({
      chord: duplicateChord,
      source: "analyzer",
      sourceScore: 0.9,
      sourceRank: 0,
    });
    const duplicateSmooth = quickChordCandidate({
      chord: duplicateChord,
      source: "smoothConnection",
      sourceScore: 10,
      sourceRank: 0,
    });
    const slash = candidate(7, "analyzer", 1, 11);
    const result = composeQuickChordCandidates({
      currentChord: current,
      analyzerCandidates: [
        quickChordCandidate({ chord: current, source: "analyzer", sourceScore: 1, sourceRank: 0 }),
        duplicateAnalyzer,
        slash,
      ],
      smoothCandidates: [duplicateSmooth],
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.sources).toEqual(["analyzer", "smoothConnection"]);
    expect(result[1]?.chord.bass).toBe(11);
  });

  it("is deterministic", () => {
    const input = {
      currentChord: current,
      analyzerCandidates: [candidate(7, "analyzer", 0), candidate(2, "analyzer", 1)],
      smoothCandidates: [candidate(5, "smoothConnection", 0)],
    };
    expect(composeQuickChordCandidates(input)).toEqual(composeQuickChordCandidates(input));
  });

  it("fills analyzer-free editing slots with Context 3 + Smooth 1 + Style 1", () => {
    const result = composeRepairQuickChordCandidates({
      currentChord: current,
      contextCandidates: Array.from({ length: 4 }, (_, index) => (
        candidate(index + 1, "harmonicContext", index)
      )),
      smoothCandidates: Array.from({ length: 6 }, (_, index) => (
        candidate(index + 7, "smoothConnection", index)
      )),
      styleCandidates: [candidate(6, "authorReferenceFit", 0)],
    });
    expect(result).toHaveLength(5);
    expect(result.map((item) => item.primarySource)).toEqual([
      "harmonicContext", "harmonicContext", "harmonicContext", "smoothConnection", "authorReferenceFit",
    ]);
  });

  it("fills all five slots without pretending an unavailable Style candidate exists", () => {
    const result = composeRepairQuickChordCandidates({
      currentChord: current,
      contextCandidates: Array.from({ length: 5 }, (_, index) => (
        candidate(index + 1, "harmonicContext", index)
      )),
      smoothCandidates: [candidate(7, "smoothConnection", 0)],
    });
    expect(result).toHaveLength(5);
    expect(result.some((item) => item.primarySource === "smoothConnection")).toBe(true);
    expect(result.some((item) => item.primarySource === "authorReferenceFit")).toBe(false);
  });
});
