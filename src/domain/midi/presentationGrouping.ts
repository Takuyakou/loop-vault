import {
  buildPresentationGroupingProjection,
  fragmentationEvidence,
  PRESENTATION_GROUPING_POLICY_V1,
  type FragmentationEvidence,
  type PresentationGroupingProjectionResult,
  type PresentationGroupingReasonCode,
  type PresentationGroupingShadowInput,
} from "./presentationGroupingCore";
import type { MidiProgressionAnalysis } from "../types";
import { beatsPerBar } from "./timing";

export {
  harmonicIdentitySnapshot,
  recoverSourceTimelineItems,
} from "./presentationGroupingCore";

/**
 * Frozen from the public-safe topology matrix before any LF-MIDI-001 v2 run.
 *
 * The policy uses integer structural relations rather than tuning the failed
 * v1 span-ratio threshold:
 * - at least four source groups have no harmonic start;
 * - source groups are no more than three times the occupied-start groups,
 *   matching the synthetic 1/2/3-group positive family;
 * - harmonic starts cover every contiguous quarter of the source extent;
 * - the unchanged counterfactual projection strictly reduces both formatted
 *   groups and legacy dash cells.
 */
export const PRESENTATION_GROUPING_POLICY_V2 = Object.freeze({
  id: "p538-presentation-grouping-shadow-v2",
  applicableMeter: "1/4",
  minimumSourceGroups: 8,
  minimumTimelineItems: 4,
  minimumOccupiedStartGroups: 4,
  minimumEmptyStartGroups: 4,
  maximumSourceGroupsPerOccupiedStartGroup: 3,
  coveragePartitionCount: 4,
  maximumProjectedBlocks: PRESENTATION_GROUPING_POLICY_V1.maximumProjectedBlocks,
} as const);

export type PresentationGroupingCandidateId = "V2-A" | "V2-B" | "V2-C";

export interface PresentationGroupingCandidateDecision {
  id: PresentationGroupingCandidateId;
  applies: boolean;
  failedConditions: string[];
}

export interface FragmentationEvidenceV2 extends FragmentationEvidence {
  emptyStartGroupCount: number;
  coveredPartitionCount: number;
  requiredCoveragePartitionCount: number;
  sourceGroupsWithinEventScale: boolean;
  counterfactualPresentationGroupCount: number;
  counterfactualDashCount: number;
  counterfactualReducesFormattedGroups: boolean;
  counterfactualReducesDashes: boolean;
  candidateDecisions: PresentationGroupingCandidateDecision[];
}

export type PresentationGroupingShadowV2Result = PresentationGroupingProjectionResult<
  typeof PRESENTATION_GROUPING_POLICY_V2.id,
  PresentationGroupingReasonCode,
  FragmentationEvidenceV2
>;

/** Runtime-only production result. A PresentationGroup is never a source bar. */
export type PresentationGroupingResult = PresentationGroupingShadowV2Result;

export function buildPresentationGrouping(
  input: PresentationGroupingShadowInput,
): PresentationGroupingResult {
  return buildPresentationGroupingShadowV2(input);
}

/**
 * Applies the promoted Family-A policy after harmonic analysis is complete.
 *
 * The returned projection is presentation-only. The source timeline, meter,
 * totalBars and selected legacy candidates remain the persistence/source truth.
 */
export function withPresentationGrouping(
  analysis: MidiProgressionAnalysis,
): MidiProgressionAnalysis {
  const sourceMeter = analysis.timeSignature ?? "4/4";
  const presentationGrouping = buildPresentationGrouping({
    sourceMeter,
    sourceBeatsPerGroup: beatsPerBar(sourceMeter),
    sourceGroupCount: analysis.totalBars,
    timeline: analysis.fullTimeline,
    legacyBlocks: analysis.blockCandidates,
  });
  return {
    ...analysis,
    presentationGrouping,
  };
}

export function buildPresentationGroupingShadowV2(
  input: PresentationGroupingShadowInput,
): PresentationGroupingShadowV2Result {
  const baseEvidence = fragmentationEvidence(input);
  const counterfactual = buildPresentationGroupingProjection(input, {
    policyId: PRESENTATION_GROUPING_POLICY_V2.id,
    applied: true,
    reasonCodes: [
      "fragmentation-detected",
      "presentation-projection-applied",
    ] satisfies PresentationGroupingReasonCode[],
    evidence: baseEvidence,
    maximumProjectedBlocks: PRESENTATION_GROUPING_POLICY_V2.maximumProjectedBlocks,
  });
  const occupiedStartGroups = occupiedSourceGroups(input);
  const emptyStartGroupCount = Math.max(
    0,
    input.sourceGroupCount - occupiedStartGroups.size,
  );
  const coveredPartitionCount = coveredSourcePartitions(
    occupiedStartGroups,
    input.sourceGroupCount,
    PRESENTATION_GROUPING_POLICY_V2.coveragePartitionCount,
  );
  const sourceGroupsWithinEventScale =
    input.sourceGroupCount
      <= occupiedStartGroups.size
        * PRESENTATION_GROUPING_POLICY_V2.maximumSourceGroupsPerOccupiedStartGroup;
  const counterfactualDashCount = counterfactual.formattedCells.filter(
    (cell) => cell.kind === "no-event-start",
  ).length;
  const counterfactualReducesFormattedGroups =
    counterfactual.groups.length < baseEvidence.legacyFormattedGroupCount;
  const counterfactualReducesDashes =
    counterfactualDashCount < baseEvidence.legacyDashCount;
  const candidateDecisions = compareTriggerCandidates({
    input,
    baseEvidence,
    occupiedStartGroupCount: occupiedStartGroups.size,
    emptyStartGroupCount,
    coveredPartitionCount,
    sourceGroupsWithinEventScale,
    counterfactualReducesFormattedGroups,
    counterfactualReducesDashes,
  });
  const evidence: FragmentationEvidenceV2 = {
    ...baseEvidence,
    emptyStartGroupCount,
    coveredPartitionCount,
    requiredCoveragePartitionCount:
      PRESENTATION_GROUPING_POLICY_V2.coveragePartitionCount,
    sourceGroupsWithinEventScale,
    counterfactualPresentationGroupCount: counterfactual.groups.length,
    counterfactualDashCount,
    counterfactualReducesFormattedGroups,
    counterfactualReducesDashes,
    candidateDecisions,
  };
  const selected = candidateDecisions.find((candidate) => candidate.id === "V2-C")!;
  const reasonCodes = selectedReasonCodes(input, evidence, selected);

  return buildPresentationGroupingProjection(input, {
    policyId: PRESENTATION_GROUPING_POLICY_V2.id,
    applied: selected.applies,
    reasonCodes,
    evidence,
    maximumProjectedBlocks: PRESENTATION_GROUPING_POLICY_V2.maximumProjectedBlocks,
  });
}

interface CandidateComparisonInput {
  input: PresentationGroupingShadowInput;
  baseEvidence: FragmentationEvidence;
  occupiedStartGroupCount: number;
  emptyStartGroupCount: number;
  coveredPartitionCount: number;
  sourceGroupsWithinEventScale: boolean;
  counterfactualReducesFormattedGroups: boolean;
  counterfactualReducesDashes: boolean;
}

function compareTriggerCandidates(
  comparison: CandidateComparisonInput,
): PresentationGroupingCandidateDecision[] {
  const meterConditions = meterAndMinimumConditions(comparison);
  const v1WithoutSpanConditions = [
    ...meterConditions,
    condition(
      comparison.baseEvidence.occupiedStartRatio
        <= PRESENTATION_GROUPING_POLICY_V1.maximumOccupiedStartRatio,
      "occupied-start-ratio",
    ),
    condition(
      comparison.baseEvidence.dashRatio
        >= PRESENTATION_GROUPING_POLICY_V1.minimumDashRatio,
      "legacy-dash-ratio",
    ),
  ];
  const structuralConditions = [
    ...meterConditions,
    condition(
      comparison.occupiedStartGroupCount
        >= PRESENTATION_GROUPING_POLICY_V2.minimumOccupiedStartGroups,
      "minimum-occupied-start-groups",
    ),
    condition(
      comparison.emptyStartGroupCount
        >= PRESENTATION_GROUPING_POLICY_V2.minimumEmptyStartGroups,
      "minimum-empty-start-groups",
    ),
    condition(
      comparison.sourceGroupsWithinEventScale,
      "source-group-event-scale",
    ),
    condition(
      comparison.coveredPartitionCount
        === PRESENTATION_GROUPING_POLICY_V2.coveragePartitionCount,
      "whole-extent-coverage",
    ),
  ];
  return [
    candidateDecision("V2-A", v1WithoutSpanConditions),
    candidateDecision("V2-B", structuralConditions),
    candidateDecision("V2-C", [
      ...structuralConditions,
      condition(
        comparison.counterfactualReducesFormattedGroups,
        "counterfactual-formatted-group-reduction",
      ),
      condition(
        comparison.counterfactualReducesDashes,
        "counterfactual-dash-reduction",
      ),
    ]),
  ];
}

function meterAndMinimumConditions(
  comparison: CandidateComparisonInput,
): Array<string | null> {
  return [
    condition(
      comparison.input.sourceMeter === PRESENTATION_GROUPING_POLICY_V2.applicableMeter
        && Math.abs(comparison.input.sourceBeatsPerGroup - 1) <= 1e-9,
      "one-beat-source-meter",
    ),
    condition(
      comparison.input.sourceGroupCount
        >= PRESENTATION_GROUPING_POLICY_V2.minimumSourceGroups,
      "minimum-source-groups",
    ),
    condition(
      comparison.input.timeline.length
        >= PRESENTATION_GROUPING_POLICY_V2.minimumTimelineItems,
      "minimum-timeline-items",
    ),
  ];
}

function selectedReasonCodes(
  input: PresentationGroupingShadowInput,
  evidence: FragmentationEvidenceV2,
  selected: PresentationGroupingCandidateDecision,
): PresentationGroupingReasonCode[] {
  if (
    input.sourceMeter !== PRESENTATION_GROUPING_POLICY_V2.applicableMeter
    || Math.abs(input.sourceBeatsPerGroup - 1) > 1e-9
  ) {
    return ["legacy-meter-topology"];
  }
  if (
    evidence.occupiedStartGroupCount === input.sourceGroupCount
    && evidence.legacyDashCount === 0
  ) {
    return ["genuine-one-beat-meter-preserved"];
  }
  return selected.applies
    ? ["fragmentation-detected", "presentation-projection-applied"]
    : ["insufficient-fragmentation-evidence"];
}

function occupiedSourceGroups(
  input: PresentationGroupingShadowInput,
): Set<number> {
  return new Set(input.timeline
    .map((item) => item.bar)
    .filter((sourceGroup) =>
      Number.isInteger(sourceGroup)
      && sourceGroup >= 1
      && sourceGroup <= input.sourceGroupCount));
}

function coveredSourcePartitions(
  occupiedStartGroups: ReadonlySet<number>,
  sourceGroupCount: number,
  partitionCount: number,
): number {
  if (sourceGroupCount <= 0) return 0;
  const covered = new Set<number>();
  for (const sourceGroup of occupiedStartGroups) {
    covered.add(Math.min(
      partitionCount - 1,
      Math.floor(((sourceGroup - 1) * partitionCount) / sourceGroupCount),
    ));
  }
  return covered.size;
}

function condition(passes: boolean, name: string): string | null {
  return passes ? null : name;
}

function candidateDecision(
  id: PresentationGroupingCandidateId,
  conditions: readonly (string | null)[],
): PresentationGroupingCandidateDecision {
  const failedConditions = conditions.filter(
    (conditionName): conditionName is string => conditionName !== null,
  );
  return {
    id,
    applies: failedConditions.length === 0,
    failedConditions,
  };
}
