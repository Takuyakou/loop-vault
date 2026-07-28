import { describe, expect, it } from "vitest";
import { decidePhase45, type DecisionInputs } from "./decisionLock";

const passing: DecisionInputs = {
  rank3Rate: 0,
  rawCandidateRecall: 0.95,
  canonicalCandidateRecall: 0.95,
  eligibleCandidateRecall: 0.95,
  sameRootCandidateRecall: 0.95,
  sameRootMeanRank: 2,
  allocationEditableShare: 0.6,
  ambiguousOrAnnotationShare: 0,
  oracleGain: 0.04,
  netRescueCount: 10,
  lostRootToGainedRatio: 0.2,
  correctionCostMeanDelta: -0.01,
  manualInputRequiredDelta: 0,
  highConfidenceBandExists: true,
  rank1ChangeCount: 0,
};

describe("Phase 4.5 decision lock", () => {
  it("allows allocation only when every allocation condition passes", () => {
    expect(decidePhase45(passing).decision).toBe("A-allocation");
  });

  it("routes an upstream recall failure to candidate generation", () => {
    const result = decidePhase45({
      ...passing,
      rawCandidateRecall: 0.78,
      eligibleCandidateRecall: 0.78,
    });
    expect(result.decision).toBe("B-candidate-generation");
    expect(result.allocationAllowed).toBe(false);
  });

  it("routes ambiguity-dominated inconclusive evidence to research stop", () => {
    const result = decidePhase45({
      ...passing,
      ambiguousOrAnnotationShare: 0.5,
      oracleGain: 0,
      highConfidenceBandExists: false,
    });
    expect(result.decision).toBe("C-stop-automatic-research");
  });
});
