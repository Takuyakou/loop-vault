import { normalizeChordLabel, chordIdentityKey } from "../../src/domain/chordIdentity";
import {
  buildCandidateEventsInBeatRange,
  noChordCell,
  structuredSignature,
  sustainCell,
  type CandidateChordEvent,
} from "../../src/domain/midi/candidateBlock";
import { formatProgressionText } from "../../src/domain/progressionText";
import type {
  ChordTimelineItem,
  ProgressionBlockCandidate,
} from "../../src/domain/types";

const EPSILON = 1e-9;
const BEAT_QUANTUM = 1_000_000;

/**
 * Frozen before LF-MIDI-001 evaluation. These values are topology signals,
 * not fixture identifiers: every condition must be observable at runtime.
 */
export const PRESENTATION_GROUPING_POLICY_V1 = Object.freeze({
  id: "p538-presentation-grouping-shadow-v1",
  applicableMeter: "1/4",
  minimumSourceGroups: 8,
  minimumTimelineItems: 4,
  maximumOccupiedStartRatio: 0.625,
  minimumDashRatio: 0.4,
  minimumMultiSourceGroupSpanRatio: 0.5,
  maximumProjectedBlocks: 16,
} as const);

export type PresentationGroupingReasonCode =
  | "legacy-meter-topology"
  | "fragmentation-detected"
  | "presentation-projection-applied"
  | "insufficient-fragmentation-evidence"
  | "genuine-one-beat-meter-preserved";

export interface SourceGroupSpan {
  startSourceGroup: number;
  endSourceGroup: number;
}

export interface PresentationGroup {
  groupIndex: number;
  absoluteStartBeat: number;
  absoluteEndBeat: number;
  containedTimelineItemIds: string[];
  sourceGroupSpan: SourceGroupSpan;
}

export type PresentationFormattedCellKind = "event-start" | "no-event-start";

export interface PresentationFormattedCell {
  groupIndex: number;
  kind: PresentationFormattedCellKind;
  text: string;
}

export type PresentationBlockCellKind =
  | "event-start"
  | "carry-in-sustain"
  | "no-overlap";

export interface PresentationBlockCell {
  groupIndex: number;
  kind: PresentationBlockCellKind;
  text: string;
}

export interface PresentationBlockProjection {
  sourceCandidateIndex: number;
  startGroupIndex: number;
  endGroupIndex: number;
  absoluteStartBeat: number;
  absoluteEndBeat: number;
  sourceGroupSpan: SourceGroupSpan;
  containedTimelineItemIds: string[];
  events: CandidateChordEvent[];
  structuredSignature: string;
  summaryText: string;
  cells: PresentationBlockCell[];
}

export interface FragmentationEvidence {
  sourceGroupCount: number;
  timelineItemCount: number;
  occupiedStartGroupCount: number;
  occupiedStartRatio: number;
  legacyFormattedGroupCount: number;
  legacyDashCount: number;
  dashRatio: number;
  multiSourceGroupSpanCount: number;
  multiSourceGroupSpanRatio: number;
}

export interface PresentationGroupingShadowInput {
  sourceMeter: string;
  sourceBeatsPerGroup: number;
  sourceGroupCount: number;
  timeline: readonly ChordTimelineItem[];
  legacyBlocks: readonly ProgressionBlockCandidate[];
}

export interface PresentationGroupingProjectionResult<
  PolicyId extends string = string,
  ReasonCode extends string = string,
  Evidence = FragmentationEvidence,
> {
  policyId: PolicyId;
  applied: boolean;
  reasonCodes: ReasonCode[];
  evidence: Evidence;
  groups: PresentationGroup[];
  formattedCells: PresentationFormattedCell[];
  formattedText: string;
  projectedBlocks: PresentationBlockProjection[];
}

export type PresentationGroupingShadowResult = PresentationGroupingProjectionResult<
  typeof PRESENTATION_GROUPING_POLICY_V1.id,
  PresentationGroupingReasonCode,
  FragmentationEvidence
>;

export interface PresentationGroupingProjectionDecision<
  PolicyId extends string,
  ReasonCode extends string,
  Evidence,
> {
  policyId: PolicyId;
  applied: boolean;
  reasonCodes: ReasonCode[];
  evidence: Evidence;
  maximumProjectedBlocks: number;
}

export interface HarmonicIdentitySnapshot {
  timelineItemId: string;
  identityKey: string;
  absoluteStartBeat: number;
  durationBeats: number;
  sourceGroup: number;
  sourceBeat: number;
  order: number;
}

export function buildPresentationGroupingShadow(
  input: PresentationGroupingShadowInput,
): PresentationGroupingShadowResult {
  const evidence = fragmentationEvidence(input);
  const reasonCodes = groupingReasonCodes(input, evidence);
  const applied = reasonCodes.includes("presentation-projection-applied");
  return buildPresentationGroupingProjection(input, {
    policyId: PRESENTATION_GROUPING_POLICY_V1.id,
    applied,
    reasonCodes,
    evidence,
    maximumProjectedBlocks: PRESENTATION_GROUPING_POLICY_V1.maximumProjectedBlocks,
  });
}

/**
 * Shared frozen projection architecture. Shadow policies decide only whether
 * to apply it; source coordinates and projection construction remain common.
 */
export function buildPresentationGroupingProjection<
  PolicyId extends string,
  ReasonCode extends string,
  Evidence,
>(
  input: PresentationGroupingShadowInput,
  decision: PresentationGroupingProjectionDecision<PolicyId, ReasonCode, Evidence>,
): PresentationGroupingProjectionResult<PolicyId, ReasonCode, Evidence> {
  const { applied } = decision;
  const groups = applied
    ? buildHarmonicPresentationGroups(input)
    : buildLegacyPresentationGroups(input);
  const formattedCells = applied
    ? buildPresentationFormattedCells(groups, input.timeline, input.sourceBeatsPerGroup)
    : cellsFromLegacyText(formatProgressionText(input.timeline));
  const formattedText = applied
    ? formatPresentationCells(formattedCells)
    : formatProgressionText(input.timeline);
  const projectedBlocks = applied
    ? buildProjectedBlocks(input, groups, decision.maximumProjectedBlocks)
    : buildLegacyBlockProjections(input, groups);

  return {
    policyId: decision.policyId,
    applied,
    reasonCodes: decision.reasonCodes,
    evidence: decision.evidence,
    groups,
    formattedCells,
    formattedText,
    projectedBlocks,
  };
}

export function harmonicIdentitySnapshot(
  timeline: readonly ChordTimelineItem[],
  sourceBeatsPerGroup: number,
): HarmonicIdentitySnapshot[] {
  return timeline.map((item, index) => ({
    timelineItemId: timelineItemRuntimeId(item, index),
    identityKey: identityKeyOf(item),
    absoluteStartBeat: absoluteStartBeat(item, sourceBeatsPerGroup),
    durationBeats: item.durationBeats,
    sourceGroup: item.bar,
    sourceBeat: item.beat,
    order: index,
  }));
}

export function recoverSourceTimelineItems(
  groups: readonly PresentationGroup[],
  timeline: readonly ChordTimelineItem[],
): ChordTimelineItem[] {
  const byId = new Map(
    timeline.map((item, index) => [timelineItemRuntimeId(item, index), item] as const),
  );
  return groups.flatMap((group) => group.containedTimelineItemIds)
    .map((id) => byId.get(id))
    .filter((item): item is ChordTimelineItem => item !== undefined)
    .sort((left, right) => timeline.indexOf(left) - timeline.indexOf(right));
}

export function buildPresentationBlockCells(
  events: readonly CandidateChordEvent[],
  groups: readonly PresentationGroup[],
  blockStartBeat: number,
): PresentationBlockCell[] {
  return groups.map((group) => {
    const relativeStart = group.absoluteStartBeat - blockStartBeat;
    const relativeEnd = group.absoluteEndBeat - blockStartBeat;
    const starting = events.filter((event) =>
      event.relativeStartBeat >= relativeStart - EPSILON
      && event.relativeStartBeat < relativeEnd - EPSILON);
    if (starting.length > 0) {
      return {
        groupIndex: group.groupIndex,
        kind: "event-start" as const,
        text: starting.map((event) => event.chord.label).join(" · "),
      };
    }
    const sustaining = events.some((event) =>
      event.relativeStartBeat < relativeStart - EPSILON
      && event.relativeStartBeat + event.durationBeats > relativeStart + EPSILON);
    return {
      groupIndex: group.groupIndex,
      kind: sustaining ? "carry-in-sustain" as const : "no-overlap" as const,
      text: sustaining ? sustainCell : noChordCell,
    };
  });
}

export function fragmentationEvidence(
  input: PresentationGroupingShadowInput,
): FragmentationEvidence {
  const legacyCells = cellsFromLegacyText(formatProgressionText(input.timeline));
  const occupiedStartGroupCount = new Set(input.timeline.map((item) => item.bar)).size;
  const multiSourceGroupSpanCount = input.timeline.filter(
    (item) => item.durationBeats > input.sourceBeatsPerGroup + EPSILON,
  ).length;
  return {
    sourceGroupCount: input.sourceGroupCount,
    timelineItemCount: input.timeline.length,
    occupiedStartGroupCount,
    occupiedStartRatio: ratio(occupiedStartGroupCount, input.sourceGroupCount),
    legacyFormattedGroupCount: legacyCells.length,
    legacyDashCount: legacyCells.filter((cell) => cell.kind === "no-event-start").length,
    dashRatio: ratio(
      legacyCells.filter((cell) => cell.kind === "no-event-start").length,
      legacyCells.length,
    ),
    multiSourceGroupSpanCount,
    multiSourceGroupSpanRatio: ratio(multiSourceGroupSpanCount, input.timeline.length),
  };
}

function groupingReasonCodes(
  input: PresentationGroupingShadowInput,
  evidence: FragmentationEvidence,
): PresentationGroupingReasonCode[] {
  if (
    input.sourceMeter !== PRESENTATION_GROUPING_POLICY_V1.applicableMeter
    || Math.abs(input.sourceBeatsPerGroup - 1) > EPSILON
  ) {
    return ["legacy-meter-topology"];
  }

  const fragmentationDetected =
    evidence.sourceGroupCount >= PRESENTATION_GROUPING_POLICY_V1.minimumSourceGroups
    && evidence.timelineItemCount >= PRESENTATION_GROUPING_POLICY_V1.minimumTimelineItems
    && evidence.occupiedStartRatio <= PRESENTATION_GROUPING_POLICY_V1.maximumOccupiedStartRatio
    && evidence.dashRatio >= PRESENTATION_GROUPING_POLICY_V1.minimumDashRatio
    && evidence.multiSourceGroupSpanRatio
      >= PRESENTATION_GROUPING_POLICY_V1.minimumMultiSourceGroupSpanRatio;
  if (fragmentationDetected) {
    return ["fragmentation-detected", "presentation-projection-applied"];
  }

  const genuineOneBeatTopology =
    evidence.timelineItemCount > 0
    && evidence.occupiedStartRatio >= 0.875
    && evidence.dashRatio === 0
    && evidence.multiSourceGroupSpanRatio <= 0.125;
  return genuineOneBeatTopology
    ? ["genuine-one-beat-meter-preserved"]
    : ["insufficient-fragmentation-evidence"];
}

function buildLegacyPresentationGroups(
  input: PresentationGroupingShadowInput,
): PresentationGroup[] {
  const refs = itemRefs(input.timeline, input.sourceBeatsPerGroup);
  return Array.from({ length: input.sourceGroupCount }, (_, index) => {
    const absoluteStartBeat = index * input.sourceBeatsPerGroup;
    const absoluteEndBeat = absoluteStartBeat + input.sourceBeatsPerGroup;
    return {
      groupIndex: index,
      absoluteStartBeat,
      absoluteEndBeat,
      containedTimelineItemIds: refs
        .filter((ref) => inRange(ref.absoluteStartBeat, absoluteStartBeat, absoluteEndBeat))
        .map((ref) => ref.id),
      sourceGroupSpan: {
        startSourceGroup: index + 1,
        endSourceGroup: index + 1,
      },
    };
  });
}

function buildHarmonicPresentationGroups(
  input: PresentationGroupingShadowInput,
): PresentationGroup[] {
  const refs = itemRefs(input.timeline, input.sourceBeatsPerGroup);
  const totalSourceBeats = input.sourceGroupCount * input.sourceBeatsPerGroup;
  const totalExtent = Math.max(
    totalSourceBeats,
    ...refs.map((ref) => ref.absoluteEndBeat),
    0,
  );
  const starts = [...new Set(refs.map((ref) => quantiseBeat(ref.absoluteStartBeat)))].sort(
    (left, right) => left - right,
  );
  if (starts.length === 0) return buildLegacyPresentationGroups(input);
  if (starts[0]! > EPSILON) starts.unshift(0);

  return starts.map((absoluteStartBeat, index) => {
    const absoluteEndBeat = starts[index + 1] ?? totalExtent;
    return {
      groupIndex: index,
      absoluteStartBeat,
      absoluteEndBeat,
      containedTimelineItemIds: refs
        .filter((ref) => inRange(ref.absoluteStartBeat, absoluteStartBeat, absoluteEndBeat))
        .map((ref) => ref.id),
      sourceGroupSpan: sourceGroupSpan(
        absoluteStartBeat,
        absoluteEndBeat,
        input.sourceBeatsPerGroup,
      ),
    };
  }).filter((group) => group.absoluteEndBeat > group.absoluteStartBeat + EPSILON);
}

function buildPresentationFormattedCells(
  groups: readonly PresentationGroup[],
  timeline: readonly ChordTimelineItem[],
  sourceBeatsPerGroup: number,
): PresentationFormattedCell[] {
  const refs = itemRefs(timeline, sourceBeatsPerGroup);
  return groups.map((group) => {
    const labels = refs.filter((ref) => inRange(
      ref.absoluteStartBeat,
      group.absoluteStartBeat,
      group.absoluteEndBeat,
    )).map((ref) => ref.item.chord.label);
    return {
      groupIndex: group.groupIndex,
      kind: labels.length > 0 ? "event-start" : "no-event-start",
      text: labels.length > 0 ? labels.join(" ") : "-",
    };
  });
}

function buildLegacyBlockProjections(
  input: PresentationGroupingShadowInput,
  groups: readonly PresentationGroup[],
): PresentationBlockProjection[] {
  return input.legacyBlocks.map((candidate, sourceCandidateIndex) => {
    const absoluteStartBeat = (candidate.startBar - 1) * input.sourceBeatsPerGroup;
    const absoluteEndBeat = candidate.endBar * input.sourceBeatsPerGroup;
    const events = candidate.events ?? buildCandidateEventsInBeatRange(
      input.timeline,
      absoluteStartBeat,
      absoluteEndBeat,
      input.sourceBeatsPerGroup,
    );
    const selectedGroups = groups.filter((group) =>
      group.absoluteStartBeat < absoluteEndBeat - EPSILON
      && group.absoluteEndBeat > absoluteStartBeat + EPSILON);
    const cells = buildPresentationBlockCells(events, selectedGroups, absoluteStartBeat);
    return {
      sourceCandidateIndex,
      startGroupIndex: candidate.startBar - 1,
      endGroupIndex: candidate.endBar - 1,
      absoluteStartBeat,
      absoluteEndBeat,
      sourceGroupSpan: {
        startSourceGroup: candidate.startBar,
        endSourceGroup: candidate.endBar,
      },
      containedTimelineItemIds: idsForEvents(events, input.timeline),
      events,
      structuredSignature: candidate.structuredSignature ?? structuredSignature(events),
      summaryText: candidate.summaryText,
      cells,
    };
  });
}

function buildProjectedBlocks(
  input: PresentationGroupingShadowInput,
  groups: readonly PresentationGroup[],
  maximumProjectedBlocks: number,
): PresentationBlockProjection[] {
  const projected: PresentationBlockProjection[] = [];
  const seen = new Set<string>();
  for (const [sourceCandidateIndex, candidate] of input.legacyBlocks
    .slice(0, maximumProjectedBlocks)
    .entries()) {
    const sourceStartBeat = (candidate.startBar - 1) * input.sourceBeatsPerGroup;
    const sourceEndBeat = candidate.endBar * input.sourceBeatsPerGroup;
    const selectedGroups = groups.filter((group) =>
      group.absoluteStartBeat < sourceEndBeat - EPSILON
      && group.absoluteEndBeat > sourceStartBeat + EPSILON);
    if (selectedGroups.length === 0) continue;
    const first = selectedGroups[0]!;
    const last = selectedGroups[selectedGroups.length - 1]!;
    const absoluteStartBeat = first.absoluteStartBeat;
    const absoluteEndBeat = last.absoluteEndBeat;
    const events = buildCandidateEventsInBeatRange(
      input.timeline,
      absoluteStartBeat,
      absoluteEndBeat,
      input.sourceBeatsPerGroup,
    );
    const signature = structuredSignature(events);
    const dedupeKey = `${quantiseBeat(absoluteStartBeat)}:${quantiseBeat(absoluteEndBeat)}:${signature}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const cells = buildPresentationBlockCells(events, selectedGroups, absoluteStartBeat);
    projected.push({
      sourceCandidateIndex,
      startGroupIndex: first.groupIndex,
      endGroupIndex: last.groupIndex,
      absoluteStartBeat,
      absoluteEndBeat,
      sourceGroupSpan: sourceGroupSpan(
        absoluteStartBeat,
        absoluteEndBeat,
        input.sourceBeatsPerGroup,
      ),
      containedTimelineItemIds: idsForEvents(events, input.timeline),
      events,
      structuredSignature: signature,
      summaryText: `| ${cells.map((cell) => cell.text).join(" | ")} |`,
      cells,
    });
  }
  return projected;
}

function idsForEvents(
  events: readonly CandidateChordEvent[],
  timeline: readonly ChordTimelineItem[],
): string[] {
  const idByItem = new Map(
    timeline.map((item, index) => [item, timelineItemRuntimeId(item, index)] as const),
  );
  return [...new Set(events.map((event) => idByItem.get(event.source)).filter(
    (id): id is string => id !== undefined,
  ))];
}

function cellsFromLegacyText(text: string): PresentationFormattedCell[] {
  if (!text) return [];
  return text.split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .map((cell, groupIndex) => ({
      groupIndex,
      kind: cell === "-" ? "no-event-start" as const : "event-start" as const,
      text: cell,
    }));
}

function formatPresentationCells(cells: readonly PresentationFormattedCell[]): string {
  const lines: string[] = [];
  for (let index = 0; index < cells.length; index += 4) {
    lines.push(`| ${cells.slice(index, index + 4).map((cell) => cell.text).join(" | ")} |`);
  }
  return lines.join("\n");
}

function itemRefs(
  timeline: readonly ChordTimelineItem[],
  sourceBeatsPerGroup: number,
) {
  return timeline.map((item, index) => {
    const start = absoluteStartBeat(item, sourceBeatsPerGroup);
    return {
      id: timelineItemRuntimeId(item, index),
      item,
      absoluteStartBeat: start,
      absoluteEndBeat: start + item.durationBeats,
    };
  });
}

function absoluteStartBeat(item: ChordTimelineItem, sourceBeatsPerGroup: number): number {
  return (item.bar - 1) * sourceBeatsPerGroup + item.beat - 1;
}

function identityKeyOf(item: ChordTimelineItem): string {
  const normalized = normalizeChordLabel(item.chord.label);
  return normalized ? chordIdentityKey(normalized) : `raw:${item.chord.label}`;
}

function timelineItemRuntimeId(item: ChordTimelineItem, index: number): string {
  return item.eventId ? `event:${item.eventId}` : `timeline:${index}`;
}

function sourceGroupSpan(
  absoluteStartBeat: number,
  absoluteEndBeat: number,
  sourceBeatsPerGroup: number,
): SourceGroupSpan {
  return {
    startSourceGroup: Math.floor(absoluteStartBeat / sourceBeatsPerGroup) + 1,
    endSourceGroup: Math.floor(
      Math.max(absoluteStartBeat, absoluteEndBeat - EPSILON) / sourceBeatsPerGroup,
    ) + 1,
  };
}

function inRange(value: number, start: number, end: number): boolean {
  return value >= start - EPSILON && value < end - EPSILON;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : 0;
}

function quantiseBeat(beat: number): number {
  return Math.round(beat * BEAT_QUANTUM) / BEAT_QUANTUM;
}
