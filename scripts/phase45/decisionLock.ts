export type Phase45Decision =
  | "A-allocation"
  | "B-candidate-generation"
  | "C-stop-automatic-research";

export interface DecisionInputs {
  rank3Rate: number;
  rawCandidateRecall: number;
  canonicalCandidateRecall: number;
  eligibleCandidateRecall: number;
  sameRootCandidateRecall: number;
  sameRootMeanRank: number | null;
  allocationEditableShare: number;
  ambiguousOrAnnotationShare: number;
  oracleGain: number;
  netRescueCount: number;
  lostRootToGainedRatio: number | null;
  correctionCostMeanDelta: number;
  manualInputRequiredDelta: number;
  highConfidenceBandExists: boolean;
  rank1ChangeCount: number;
}

export interface DecisionLockResult {
  decision: Phase45Decision;
  allocationAllowed: boolean;
  failedAllocationConditions: string[];
  evidence: Record<string, { value: number | boolean | null; gate: string; pass: boolean }>;
}

export function decidePhase45(inputs: DecisionInputs): DecisionLockResult {
  const evidence = {
    rank3Contribution: metric(inputs.rank3Rate, "<= 0.01", inputs.rank3Rate <= 0.01),
    rawCandidateRecall: metric(
      inputs.rawCandidateRecall,
      ">= 0.90",
      inputs.rawCandidateRecall >= 0.9,
    ),
    canonicalCandidateRecall: metric(
      inputs.canonicalCandidateRecall,
      ">= 0.90",
      inputs.canonicalCandidateRecall >= 0.9,
    ),
    eligibleCandidateRecall: metric(
      inputs.eligibleCandidateRecall,
      ">= 0.90",
      inputs.eligibleCandidateRecall >= 0.9,
    ),
    sameRootCandidateRecall: metric(
      inputs.sameRootCandidateRecall,
      ">= 0.90",
      inputs.sameRootCandidateRecall >= 0.9,
    ),
    sameRootMeanRank: metric(
      inputs.sameRootMeanRank,
      "<= 3",
      inputs.sameRootMeanRank !== null && inputs.sameRootMeanRank <= 3,
    ),
    allocationEditableShare: metric(
      inputs.allocationEditableShare,
      ">= 0.50",
      inputs.allocationEditableShare >= 0.5,
    ),
    ambiguousOrAnnotationShare: metric(
      inputs.ambiguousOrAnnotationShare,
      "<= 0.20",
      inputs.ambiguousOrAnnotationShare <= 0.2,
    ),
    oracleGain: metric(inputs.oracleGain, ">= 0.03", inputs.oracleGain >= 0.03),
    netRescue: metric(inputs.netRescueCount, "> 0", inputs.netRescueCount > 0),
    lostRootToGainedRatio: metric(
      inputs.lostRootToGainedRatio,
      "<= 0.25",
      inputs.lostRootToGainedRatio !== null
        && inputs.lostRootToGainedRatio <= 0.25,
    ),
    correctionCostMeanDelta: metric(
      inputs.correctionCostMeanDelta,
      "< 0",
      inputs.correctionCostMeanDelta < 0,
    ),
    manualInputRequiredDelta: metric(
      inputs.manualInputRequiredDelta,
      "<= 0",
      inputs.manualInputRequiredDelta <= 0,
    ),
    highConfidenceBandExists: metric(
      inputs.highConfidenceBandExists,
      "true",
      inputs.highConfidenceBandExists,
    ),
    rank1ChangeCount: metric(
      inputs.rank1ChangeCount,
      "= 0",
      inputs.rank1ChangeCount === 0,
    ),
  };
  const allocationConditions = Object.entries(evidence)
    .filter(([name]) => name !== "ambiguousOrAnnotationShare")
    .filter(([, result]) => !result.pass)
    .map(([name]) => name);
  const candidateGenerationFailure = inputs.rawCandidateRecall < 0.9
    || inputs.eligibleCandidateRecall < 0.9
    || inputs.sameRootCandidateRecall < 0.9
    || inputs.oracleGain < 0.03;
  const researchStop = inputs.ambiguousOrAnnotationShare > 0.2
    && inputs.oracleGain < 0.03
    && !inputs.highConfidenceBandExists;
  const decision: Phase45Decision = researchStop
    ? "C-stop-automatic-research"
    : candidateGenerationFailure
      ? "B-candidate-generation"
      : allocationConditions.length === 0
        ? "A-allocation"
        : "C-stop-automatic-research";

  return {
    decision,
    allocationAllowed: decision === "A-allocation",
    failedAllocationConditions: allocationConditions,
    evidence,
  };
}

function metric(
  value: number | boolean | null,
  gate: string,
  pass: boolean,
) {
  return { value, gate, pass };
}
