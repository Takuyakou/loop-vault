import type { VoiceRole } from "../../src/domain/midi/types";
import type { P5211NoteRoleMetrics } from "./noteRoleFixtures";

export const p5211PromotionContractVersion = "p5211-note-role-promotion-v1";

export const p5211EligibleVoiceRoles = Object.freeze([
  "harmony",
  "pad",
  "mixed",
] as const satisfies readonly VoiceRole[]);

export const p5211NoteContributionMultipliers = Object.freeze({
  harmonic: 1,
  uncertain: 0.9,
  "melody-like": 0.25,
});

export const p5211PromotionThresholds = Object.freeze({
  protectedHarmonicRetention: 1,
  melodyLikePrecision: 0.95,
  harmonicRetention: 0.99,
  melodyLikeRecall: 0.6,
  uncertainNonSuppression: 0.9,
  maximumOfficialExactAtOneDecline: 0.0025,
  maximumBenchmarkMedianRatio: 2,
  maximumBenchmarkSampleMs: 2_000,
});

export interface P5211OfficialChordSafetyMetrics {
  readonly rootAtOne: number;
  readonly qualityAtOne: number;
  readonly exactAtOne: number;
  readonly boundaryPrecision: number;
  readonly boundaryRecall: number;
}

export interface P5211PromotionInput {
  readonly noteMetrics: P5211NoteRoleMetrics;
  readonly deterministic: boolean;
  readonly officialBaseline: P5211OfficialChordSafetyMetrics;
  readonly officialCandidate: P5211OfficialChordSafetyMetrics;
  readonly benchmark: {
    readonly medianRatio: number;
    readonly maximumSampleMs: number;
    readonly timedOut: boolean;
  };
  readonly productionOutputsUnchanged: boolean;
}

export interface P5211PromotionDecision {
  readonly status: "pass-to-integration" | "fail-stop-promotion";
  readonly reasons: readonly string[];
}

export function decideP5211ShadowPromotion(input: P5211PromotionInput): P5211PromotionDecision {
  const reasons: string[] = [];
  const threshold = p5211PromotionThresholds;
  if (!input.deterministic) reasons.push("shadow evaluation is not deterministic");
  if (!input.productionOutputsUnchanged) reasons.push("shadow stages changed production output");
  if (input.noteMetrics.evaluatedNotes !== input.noteMetrics.totalNotes) {
    reasons.push("synthetic ground truth is incomplete");
  }
  if (input.noteMetrics.protectedHarmonicRetention < threshold.protectedHarmonicRetention) {
    reasons.push("protected harmonic retention regressed");
  }
  if (input.noteMetrics.melodyLikePrecision < threshold.melodyLikePrecision) {
    reasons.push("melody-like precision is below the locked floor");
  }
  if (input.noteMetrics.harmonicRetention < threshold.harmonicRetention) {
    reasons.push("harmonic retention is below the locked floor");
  }
  if (input.noteMetrics.melodyLikeRecall < threshold.melodyLikeRecall) {
    reasons.push("melody-like recall is below the locked floor");
  }
  if (input.noteMetrics.uncertainNonSuppression < threshold.uncertainNonSuppression) {
    reasons.push("uncertain notes are suppressed too aggressively");
  }
  if (input.officialCandidate.rootAtOne < input.officialBaseline.rootAtOne) {
    reasons.push("official Root@1 regressed");
  }
  if (input.officialCandidate.qualityAtOne < input.officialBaseline.qualityAtOne) {
    reasons.push("official Quality@1 regressed");
  }
  if (input.officialCandidate.boundaryPrecision < input.officialBaseline.boundaryPrecision) {
    reasons.push("official boundary precision regressed");
  }
  if (input.officialCandidate.boundaryRecall < input.officialBaseline.boundaryRecall) {
    reasons.push("official boundary recall regressed");
  }
  if (input.officialCandidate.exactAtOne
    < input.officialBaseline.exactAtOne - threshold.maximumOfficialExactAtOneDecline) {
    reasons.push("official Exact@1 exceeded the locked decline allowance");
  }
  if (input.benchmark.timedOut) reasons.push("benchmark timed out");
  if (input.benchmark.medianRatio > threshold.maximumBenchmarkMedianRatio) {
    reasons.push("benchmark median exceeded the locked ratio");
  }
  if (input.benchmark.maximumSampleMs > threshold.maximumBenchmarkSampleMs) {
    reasons.push("benchmark sample exceeded the locked hard limit");
  }
  if (Object.values(p5211NoteContributionMultipliers).some((value) => value <= 0)) {
    reasons.push("a note contribution multiplier is zero");
  }
  return {
    status: reasons.length === 0 ? "pass-to-integration" : "fail-stop-promotion",
    reasons,
  };
}
