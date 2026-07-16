import type { GoldMetrics } from "./realMetrics";

export function goldGuardFailures(legacy: GoldMetrics, candidate: GoldMetrics): string[] {
  const failures: string[] = [];
  if (candidate.rootAccuracy < legacy.rootAccuracy) failures.push("root-accuracy-regressed");
  if (candidate.qualityAccuracy < legacy.qualityAccuracy) failures.push("quality-accuracy-regressed");
  if (candidate.exactAccuracy < legacy.exactAccuracy) failures.push("exact-accuracy-regressed");
  if (candidate.boundaryPrecision < legacy.boundaryPrecision) failures.push("boundary-precision-regressed");
  if (candidate.boundaryRecall < legacy.boundaryRecall) failures.push("boundary-recall-regressed");
  if (candidate.correctionCost > legacy.correctionCost) failures.push("correction-cost-increased");
  if (candidate.operationCorrectionCost.mean > legacy.operationCorrectionCost.mean) {
    failures.push("operation-correction-cost-increased");
  }
  return failures;
}

export function realMidiEvaluationExitCode(
  guardFailures: readonly string[],
  voiceAwareGuardFailures: readonly string[],
  missingSourceCount: number,
): 0 | 1 {
  return guardFailures.length > 0 || voiceAwareGuardFailures.length > 0 || missingSourceCount > 0 ? 1 : 0;
}
