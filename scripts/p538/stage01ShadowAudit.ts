import { performance } from "node:perf_hooks";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { structuredSignature } from "../../src/domain/midi/candidateBlock";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";
import type { ChordTimelineItem } from "../../src/domain/types";
import {
  buildPresentationGroupingShadow,
  harmonicIdentitySnapshot,
  recoverSourceTimelineItems,
  type PresentationGroupingShadowResult,
} from "./presentationGroupingShadow";

export interface DistributionAggregate {
  minimum: number;
  median: number;
  maximum: number;
}

export interface Stage01ShadowAggregate {
  policyId: string;
  sourceMeter: string;
  sourceBeatsPerGroup: number;
  sourceGroupCount: number;
  timelineItemCount: number;
  legacyFormattedGroupCount: number;
  legacyDashCount: number;
  legacyBlockCandidateCount: number;
  occupiedStartRatio: number;
  dashRatio: number;
  multiSourceGroupSpanRatio: number;
  applied: boolean;
  reasonCodes: string[];
  presentationGroupCount: number;
  projectedFormattedGroupCount: number;
  projectedDashCount: number;
  projectedBlockCandidateCount: number;
  presentationGroupBeatSpans: DistributionAggregate;
  timelineStartsPerPresentationGroup: DistributionAggregate;
  blockCellKinds: {
    eventStart: number;
    carryInSustain: number;
    noOverlap: number;
  };
  harmonicIdentityDifferenceCount: number;
  sourceCoordinateRoundTrip: boolean;
  blockTopologyCoherent: boolean;
  deterministic: boolean;
  projectionElapsedMilliseconds: number;
}

/** Privacy-safe Stage01 aggregate: no path, filename, raw notes, or chord text. */
export function stage01ShadowAggregate(bytes: Uint8Array): Stage01ShadowAggregate {
  const sourceBytesBefore = Uint8Array.from(bytes);
  const sourceBefore = parseMidi(bytes);
  const analysis = analyzeMidi(bytes);
  const sourceBeatsPerGroup = beatsPerBar(sourceBefore.timeSignature);
  const timelineBefore = structuredClone(analysis.fullTimeline);
  const identityBefore = harmonicIdentitySnapshot(analysis.fullTimeline, sourceBeatsPerGroup);
  const input = {
    sourceMeter: sourceBefore.timeSignature ?? "4/4",
    sourceBeatsPerGroup,
    sourceGroupCount: sourceBefore.totalBars,
    timeline: analysis.fullTimeline,
    legacyBlocks: analysis.blockCandidates,
  };
  const startedAt = performance.now();
  const shadow = buildPresentationGroupingShadow(input);
  const projectionElapsedMilliseconds = Number((performance.now() - startedAt).toFixed(3));
  const repeated = buildPresentationGroupingShadow(input);
  const identityAfter = harmonicIdentitySnapshot(analysis.fullTimeline, sourceBeatsPerGroup);
  const sourceAfter = parseMidi(bytes);

  return {
    policyId: shadow.policyId,
    sourceMeter: input.sourceMeter,
    sourceBeatsPerGroup,
    sourceGroupCount: input.sourceGroupCount,
    timelineItemCount: input.timeline.length,
    legacyFormattedGroupCount: shadow.evidence.legacyFormattedGroupCount,
    legacyDashCount: shadow.evidence.legacyDashCount,
    legacyBlockCandidateCount: analysis.blockCandidates.length,
    occupiedStartRatio: shadow.evidence.occupiedStartRatio,
    dashRatio: shadow.evidence.dashRatio,
    multiSourceGroupSpanRatio: shadow.evidence.multiSourceGroupSpanRatio,
    applied: shadow.applied,
    reasonCodes: shadow.reasonCodes,
    presentationGroupCount: shadow.groups.length,
    projectedFormattedGroupCount: shadow.formattedCells.length,
    projectedDashCount: shadow.formattedCells.filter((cell) => cell.text === "-").length,
    projectedBlockCandidateCount: shadow.projectedBlocks.length,
    presentationGroupBeatSpans: distribution(shadow.groups.map(
      (group) => group.absoluteEndBeat - group.absoluteStartBeat,
    )),
    timelineStartsPerPresentationGroup: distribution(shadow.groups.map(
      (group) => group.containedTimelineItemIds.length,
    )),
    blockCellKinds: blockCellKindCounts(shadow),
    harmonicIdentityDifferenceCount: differenceCount(identityBefore, identityAfter),
    sourceCoordinateRoundTrip: sourceCoordinatesRoundTrip(
      shadow,
      analysis.fullTimeline,
      timelineBefore,
    ) && bytesEqual(sourceBytesBefore, bytes) && JSON.stringify(sourceAfter) === JSON.stringify(sourceBefore),
    blockTopologyCoherent: projectedBlocksAreCoherent(shadow),
    deterministic: stableProjectionJson(repeated) === stableProjectionJson(shadow),
    projectionElapsedMilliseconds,
  };
}

function sourceCoordinatesRoundTrip(
  shadow: PresentationGroupingShadowResult,
  timeline: readonly ChordTimelineItem[],
  timelineBefore: readonly ChordTimelineItem[],
): boolean {
  const recovered = recoverSourceTimelineItems(shadow.groups, timeline);
  return JSON.stringify(timeline) === JSON.stringify(timelineBefore)
    && JSON.stringify(recovered) === JSON.stringify(timeline);
}

function projectedBlocksAreCoherent(shadow: PresentationGroupingShadowResult): boolean {
  return shadow.projectedBlocks.every((block) => {
    const duration = block.absoluteEndBeat - block.absoluteStartBeat;
    const timingIsBounded = block.events.every((event, index) =>
      event.relativeStartBeat >= 0
      && event.durationBeats > 0
      && event.relativeStartBeat + event.durationBeats <= duration + 1e-9
      && (index === 0
        || event.relativeStartBeat >= block.events[index - 1]!.relativeStartBeat));
    const cellsMatchSummary = block.summaryText
      === `| ${block.cells.map((cell) => cell.text).join(" | ")} |`;
    return block.startGroupIndex <= block.endGroupIndex
      && block.absoluteStartBeat < block.absoluteEndBeat
      && timingIsBounded
      && structuredSignature(block.events) === block.structuredSignature
      && cellsMatchSummary;
  });
}

function blockCellKindCounts(shadow: PresentationGroupingShadowResult) {
  const cells = shadow.projectedBlocks.flatMap((block) => block.cells);
  return {
    eventStart: cells.filter((cell) => cell.kind === "event-start").length,
    carryInSustain: cells.filter((cell) => cell.kind === "carry-in-sustain").length,
    noOverlap: cells.filter((cell) => cell.kind === "no-overlap").length,
  };
}

function stableProjectionJson(shadow: PresentationGroupingShadowResult): string {
  return JSON.stringify({
    policyId: shadow.policyId,
    applied: shadow.applied,
    reasonCodes: shadow.reasonCodes,
    evidence: shadow.evidence,
    groups: shadow.groups,
    formattedCells: shadow.formattedCells,
    formattedText: shadow.formattedText,
    projectedBlocks: shadow.projectedBlocks,
  });
}

function differenceCount(left: readonly unknown[], right: readonly unknown[]): number {
  const length = Math.max(left.length, right.length);
  let count = 0;
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) count += 1;
  }
  return count;
}

function distribution(values: readonly number[]): DistributionAggregate {
  if (values.length === 0) return { minimum: 0, median: 0, maximum: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    minimum: Number(sorted[0]!.toFixed(6)),
    median: Number(median.toFixed(6)),
    maximum: Number(sorted[sorted.length - 1]!.toFixed(6)),
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
