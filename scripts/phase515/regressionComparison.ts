import type { z } from "zod";
import {
  existingCorpusBaselinesSchema,
  stableCanonicalJson,
} from "./lockContract";

export type ExistingCorpusBaselines = z.infer<
  typeof existingCorpusBaselinesSchema
>;

export interface RegressionIssue {
  corpusId: string;
  conditionId: string;
  metric: string;
  baseline: number | boolean;
  current: number | boolean;
}

const higherIsBetter = [
  "canonicalExact",
  "usableAccuracy",
  "rootAccuracy",
  "qualityAccuracy",
  "seventhAccuracy",
  "tensionAccuracy",
  "slashBassAccuracy",
  "rank1",
  "top3Canonical",
  "top3Root",
  "candidateRecall",
  "unionCandidateRecall",
  "candidateCatalogRescueCount",
  "rank2Or3RescueRate",
] as const;

/**
 * Stage-facing comparison API. It never reads a corpus or Holdout; callers pass
 * a current non-Holdout observation and the reviewed P5.15-00 baseline.
 */
export function compareExistingCorpusRegression(
  baselineInput: ExistingCorpusBaselines,
  currentInput: ExistingCorpusBaselines,
  tolerance = 0.02,
) {
  const baseline = existingCorpusBaselinesSchema.parse(baselineInput);
  const current = existingCorpusBaselinesSchema.parse(currentInput);
  const issues: RegressionIssue[] = [];
  if (stableCanonicalJson(baseline.aliases) !== stableCanonicalJson(current.aliases)) {
    throw new Error("Current evaluation aliases differ from the frozen baseline.");
  }
  const currentCorpora = new Map(current.corpora.map((item) => [item.id, item]));
  for (const frozenCorpus of baseline.corpora) {
    const observedCorpus = currentCorpora.get(frozenCorpus.id);
    if (!observedCorpus) {
      throw new Error(`Current evaluation is missing corpus ${frozenCorpus.id}.`);
    }
    if (
      observedCorpus.sourceKind !== frozenCorpus.sourceKind
      || observedCorpus.caseCount !== frozenCorpus.caseCount
      || observedCorpus.eventCount !== frozenCorpus.eventCount
    ) {
      throw new Error(
        `Current evaluation corpus contract differs for ${frozenCorpus.id}.`,
      );
    }
    const observedConditions = new Map(
      observedCorpus.conditions.map((item) => [item.id, item]),
    );
    for (const frozen of frozenCorpus.conditions) {
      const observed = observedConditions.get(frozen.id);
      if (!observed) {
        throw new Error(
          `Current evaluation is missing ${frozenCorpus.id}/${frozen.id}.`,
        );
      }
      for (const metric of higherIsBetter) {
        if (observed[metric] + tolerance < frozen[metric]) {
          issues.push({
            corpusId: frozenCorpus.id,
            conditionId: frozen.id,
            metric,
            baseline: frozen[metric],
            current: observed[metric],
          });
        }
      }
      for (const metric of ["manualInputRate", "catalogManualInputRate"] as const) {
        if (observed[metric] - tolerance > frozen[metric]) {
          issues.push({
            corpusId: frozenCorpus.id,
            conditionId: frozen.id,
            metric,
            baseline: frozen[metric],
            current: observed[metric],
          });
        }
      }
      for (const metric of [
        "correctionCostMean",
        "correctionsPerEightEvents",
      ] as const) {
        if (observed[metric] - tolerance > frozen[metric]) {
          issues.push({
            corpusId: frozenCorpus.id,
            conditionId: frozen.id,
            metric,
            baseline: frozen[metric],
            current: observed[metric],
          });
        }
      }
      if (observed.correctionCostTotal > frozen.correctionCostTotal) {
        issues.push({
          corpusId: frozenCorpus.id,
          conditionId: frozen.id,
          metric: "correctionCostTotal",
          baseline: frozen.correctionCostTotal,
          current: observed.correctionCostTotal,
        });
      }
      if (observed.duplicateCandidates > frozen.duplicateCandidates) {
        issues.push({
          corpusId: frozenCorpus.id,
          conditionId: frozen.id,
          metric: "duplicateCandidates",
          baseline: frozen.duplicateCandidates,
          current: observed.duplicateCandidates,
        });
      }
      if (observed.maxCandidatesPerEvent > frozen.maxCandidatesPerEvent) {
        issues.push({
          corpusId: frozenCorpus.id,
          conditionId: frozen.id,
          metric: "maxCandidatesPerEvent",
          baseline: frozen.maxCandidatesPerEvent,
          current: observed.maxCandidatesPerEvent,
        });
      }
      for (const metric of [
        "runtimeMs",
        "runtimePerFileP50Ms",
        "runtimePerFileP90Ms",
      ] as const) {
        if (observed[metric] > frozen[metric] * 1.25) {
          issues.push({
            corpusId: frozenCorpus.id,
            conditionId: frozen.id,
            metric,
            baseline: frozen[metric],
            current: observed[metric],
          });
        }
      }
      if (!observed.deterministic) {
        issues.push({
          corpusId: frozenCorpus.id,
          conditionId: frozen.id,
          metric: "deterministic",
          baseline: frozen.deterministic,
          current: observed.deterministic,
        });
      }
    }
  }
  compareVoicingGold(baseline, current, tolerance, issues);
  return {
    pass: issues.length === 0,
    tolerance,
    issues,
  };
}

function compareVoicingGold(
  baseline: ExistingCorpusBaselines,
  current: ExistingCorpusBaselines,
  tolerance: number,
  issues: RegressionIssue[],
) {
  const observedBySplit = new Map(
    current.voicingGold.map((item) => [item.split, item]),
  );
  const higher = [
    "voicingExactRate",
    "notePrecision",
    "noteRecall",
    "noteF1",
    "bassNoteAccuracy",
    "topNoteAccuracy",
    "registerExactRate",
    "representationTypeAccuracy",
    "simultaneousExactRate",
    "aggregateF1",
    "sourceVoicingUsableRate",
    "staleAfterChordEditAccuracy",
  ] as const;
  const lower = [
    "lowestNoteAbsoluteError",
    "highestNoteAbsoluteError",
    "octaveErrorRate",
    "simultaneousMissRate",
    "aggregatedAsSimultaneousRate",
    "distractorLeakRate",
    "melodyLeakRate",
    "passingToneLeakRate",
    "sustainCarryLeakRate",
    "voiceDuplicateLeakRate",
    "generatedFallbackRate",
    "requiresReviewRate",
  ] as const;
  for (const frozen of baseline.voicingGold) {
    const observed = observedBySplit.get(frozen.split);
    if (!observed) {
      throw new Error(`Current Voicing Gold is missing ${frozen.split}.`);
    }
    if (
      observed.fileCount !== frozen.fileCount
      || observed.eventCount !== frozen.eventCount
      || observed.metrics.events !== frozen.metrics.events
      || observed.condition !== frozen.condition
      || observed.policy !== frozen.policy
    ) {
      throw new Error(`Current Voicing Gold contract differs for ${frozen.split}.`);
    }
    for (const metric of higher) {
      const frozenValue = frozen.metrics[metric];
      const observedValue = observed.metrics[metric];
      if (
        frozenValue !== null
        && (observedValue === null || observedValue + tolerance < frozenValue)
      ) {
        issues.push({
          corpusId: "voicing-gold",
          conditionId: frozen.split,
          metric,
          baseline: frozenValue,
          current: observedValue ?? -1,
        });
      }
    }
    for (const metric of lower) {
      const frozenValue = frozen.metrics[metric];
      const observedValue = observed.metrics[metric];
      if (
        observedValue !== null
        && (frozenValue === null || observedValue - tolerance > frozenValue)
      ) {
        issues.push({
          corpusId: "voicing-gold",
          conditionId: frozen.split,
          metric,
          baseline: frozenValue ?? 0,
          current: observedValue,
        });
      }
    }
    for (const metric of ["extraNoteCount", "missingNoteCount"] as const) {
      if (observed.metrics[metric] > frozen.metrics[metric]) {
        issues.push({
          corpusId: "voicing-gold",
          conditionId: frozen.split,
          metric,
          baseline: frozen.metrics[metric],
          current: observed.metrics[metric],
        });
      }
    }
  }
}

export function invariantDeepEqual(
  baseline: unknown,
  current: unknown,
): boolean {
  return stableCanonicalJson(baseline) === stableCanonicalJson(current);
}
