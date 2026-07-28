import { describe, expect, it } from "vitest";
import type { CandidateFunnelRow } from "./candidateFunnel";
import { classifyTop3Miss, summarizeMissTaxonomy } from "./missTaxonomy";

function row(overrides: Partial<CandidateFunnelRow>): CandidateFunnelRow {
  return {
    fileId: "V01_clean",
    eventId: "e01",
    startBeat: 0,
    endBeat: 4,
    expected: "Cmaj9",
    expectedRoot: 0,
    detectedRank1: "Cmaj7",
    displayedCandidates: ["Cmaj7", "G7"],
    rawCandidateCount: 252,
    canonicalCandidateCount: 252,
    eligibleCandidateCount: 252,
    sameRootCandidateCount: 21,
    funnel: {
      "raw-generation": true,
      "canonical-dedup": true,
      eligibility: true,
      "same-root-pool": true,
      "same-root-rank": true,
      "global-rank": true,
      "allocated-top3": false,
    },
    sameRootRank: 2,
    globalRank: 4,
    displayedRank: null,
    firstDropStage: "allocated-top3",
    dropReason: "allocation",
    ...overrides,
  };
}

const context = {
  scenarioId: "V01",
  scenarioSlug: "test",
  variant: "clean" as const,
};

describe("Phase 4.5 miss taxonomy", () => {
  it("keeps pipeline loss primary and musical differences secondary", () => {
    const classified = classifyTop3Miss(row({}), context);
    expect(classified.primaryCategory).toBe("alternative-root-allocation-loss");
    expect(classified.secondaryCategories).toContain("tension-under");
  });

  it("classifies missing raw identities before musical differences", () => {
    const classified = classifyTop3Miss(row({
      expected: "A7b9",
      detectedRank1: "A7",
      firstDropStage: "raw-generation",
      funnel: {
        "raw-generation": false,
        "canonical-dedup": false,
        eligibility: false,
        "same-root-pool": false,
        "same-root-rank": false,
        "global-rank": false,
        "allocated-top3": false,
      },
      sameRootRank: null,
      globalRank: null,
    }), context);
    expect(classified.primaryCategory).toBe("candidate-not-generated");
    expect(classified.secondaryCategories).toContain("tension-under");
  });

  it("makes primary counts sum exactly to the miss count", () => {
    const classified = [
      classifyTop3Miss(row({}), context),
      classifyTop3Miss(row({
        firstDropStage: "raw-generation",
        funnel: {
          "raw-generation": false,
          "canonical-dedup": false,
          eligibility: false,
          "same-root-pool": false,
          "same-root-rank": false,
          "global-rank": false,
          "allocated-top3": false,
        },
      }), context),
    ];
    const summary = summarizeMissTaxonomy(classified);
    expect(Object.values(summary.primaryCounts).reduce((sum, value) => sum + value, 0))
      .toBe(summary.missCount);
  });
});
