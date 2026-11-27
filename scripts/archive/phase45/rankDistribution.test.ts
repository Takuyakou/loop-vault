import { describe, expect, it } from "vitest";
import { summarizeRankDistribution } from "./rankDistribution";

describe("summarizeRankDistribution", () => {
  it("counts canonical ranks, misses, duplicates, MRR, and mean rank", () => {
    const result = summarizeRankDistribution([
      { expected: "Cmaj7", candidates: ["Cmaj7", "G7", "Dm7"] },
      { expected: "Dm7", candidates: ["C", "Dm7", "G7"] },
      { expected: "G7", candidates: ["C", "Dm7", "G7"] },
      { expected: "A7b9", candidates: ["A7", "A9", "C13/A"] },
      { expected: "Cmaj7", candidates: ["Cmaj7", "Cmaj7", "G7"] },
    ]);

    expect(result).toMatchObject({
      eventCount: 5,
      rank1: { count: 2, rate: 0.4 },
      rank2: { count: 1, rate: 0.2 },
      rank3: { count: 1, rate: 0.2 },
      outsideTop3: { count: 1, rate: 0.2 },
      correctCandidateAbsent: { count: 1, rate: 0.2 },
      canonicalEquivalentDuplicateCount: 1,
    });
    expect(result.mrr).toBeCloseTo((1 + 0.5 + 1 / 3 + 1) / 5);
    expect(result.correctCandidateMeanRank).toBe(1.75);
  });
});
