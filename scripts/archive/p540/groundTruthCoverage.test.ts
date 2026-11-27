import { describe, expect, it } from "vitest";

import type { ShadowRootRelativeIdentity } from "../p539/shadowRootRelativeIdentity";
import { exactRankingEvidence } from "../p539/shadowCandidateRanking";
import { buildCandidateScoreBreakdown } from "./candidateScoreBreakdown";
import { diagnoseGroundTruthCoverage } from "./groundTruthCoverage";

describe("P5.40-00 semantic and pitch-content coverage", () => {
  it("separates implicit ninth in legacy minor-11 from a literal explicit descriptor across roots", () => {
    for (let root = 0; root < 12; root += 1) {
      const identity: ShadowRootRelativeIdentity = {
        rootPitchClass: root,
        triad: "minor",
        seventh: "minor7",
        extensions: ["9", "11"],
        alterations: [],
        omissions: [],
      };
      const breakdown = buildCandidateScoreBreakdown(`SYNTHETIC-${root}`, exactRankingEvidence(identity));
      const coverage = diagnoseGroundTruthCoverage(breakdown, identity);
      expect(coverage.literalIdentityInBoundedGrammar).toBe(false);
      expect(coverage.literalSemanticRank).toBeNull();
      expect(coverage.pitchContentEquivalentRanks).toContain(1);
    }
  });

  it("finds an individually representable altered-slash identity absent from all frozen 276-candidate sets", () => {
    for (let root = 0; root < 12; root += 1) {
      const identity: ShadowRootRelativeIdentity = {
        rootPitchClass: root,
        triad: "major",
        seventh: "minor7",
        extensions: [],
        alterations: ["b13"],
        omissions: [],
        bassPitchClass: (root + 4) % 12,
      };
      const breakdown = buildCandidateScoreBreakdown(`SYNTHETIC-${root}`, exactRankingEvidence(identity));
      const coverage = diagnoseGroundTruthCoverage(breakdown, identity);
      expect(coverage.literalIdentityInBoundedGrammar).toBe(true);
      expect(coverage.literalSemanticRank).toBeNull();
      expect(coverage.pitchContentEquivalentRanks).toEqual([]);
      expect(breakdown.candidateVisits).toBe(276);
    }
  });
});
