import type { AdvisorValidationResult } from "./types";

export interface AdvisorEvaluationSummary {
  total: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
}

export function summarizeAdvisorEvaluations(results: readonly AdvisorValidationResult[]): AdvisorEvaluationSummary {
  const accepted = results.filter((result) => result.success).length;
  return {
    total: results.length,
    accepted,
    rejected: results.length - accepted,
    acceptanceRate: results.length ? accepted / results.length : 0,
  };
}
