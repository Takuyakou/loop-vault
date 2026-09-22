import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import {
  buildPresentationGrouping,
  harmonicIdentitySnapshot,
} from "../../src/domain/midi/presentationGrouping";
import { beatsPerBar } from "../../src/domain/midi/timing";

export interface Stage03ProductionAggregate {
  policyId: string;
  sourceMeter: string;
  sourceGroupCount: number;
  timelineItemCount: number;
  legacyPresentationGroupCount: number;
  legacyDashCount: number;
  legacyBlockCount: number;
  applied: boolean;
  reasonCodes: string[];
  productionPresentationGroupCount: number;
  productionDashCount: number;
  productionBlockCount: number;
  harmonicIdentityDifferenceCount: number;
  sourceTruthUnchanged: boolean;
  sourceCandidatesUnchanged: boolean;
  promotedShadowParity: boolean;
  deterministic: boolean;
}

/**
 * Privacy-safe production aggregate. It emits no filename, path, bytes, raw
 * notes, chord labels, formatted text, summaries, checksum, or fingerprint.
 */
export function stage03ProductionAggregate(bytes: Uint8Array): Stage03ProductionAggregate {
  const sourceBytesBefore = Uint8Array.from(bytes);
  const sourceBefore = parseMidi(bytes);
  const legacy = analyzeMidi(bytes, { enablePresentationGrouping: false });
  const production = analyzeMidi(bytes, { enablePresentationGrouping: true });
  const repeated = analyzeMidi(bytes, { enablePresentationGrouping: true });
  const projection = production.presentationGrouping!;
  const sourceBeatsPerGroup = beatsPerBar(sourceBefore.timeSignature);
  const promoted = buildPresentationGrouping({
    sourceMeter: sourceBefore.timeSignature ?? "4/4",
    sourceBeatsPerGroup,
    sourceGroupCount: sourceBefore.totalBars,
    timeline: legacy.fullTimeline,
    legacyBlocks: legacy.blockCandidates,
  });
  const beforeIdentity = harmonicIdentitySnapshot(legacy.fullTimeline, sourceBeatsPerGroup);
  const afterIdentity = harmonicIdentitySnapshot(production.fullTimeline, sourceBeatsPerGroup);
  const sourceAfter = parseMidi(bytes);

  return {
    policyId: projection.policyId,
    sourceMeter: sourceBefore.timeSignature ?? "4/4",
    sourceGroupCount: sourceBefore.totalBars,
    timelineItemCount: production.fullTimeline.length,
    legacyPresentationGroupCount: projection.evidence.legacyFormattedGroupCount,
    legacyDashCount: projection.evidence.legacyDashCount,
    legacyBlockCount: legacy.blockCandidates.length,
    applied: projection.applied,
    reasonCodes: projection.reasonCodes,
    productionPresentationGroupCount: projection.groups.length,
    productionDashCount: projection.formattedCells.filter((cell) => cell.text === "-").length,
    productionBlockCount: projection.projectedBlocks.length,
    harmonicIdentityDifferenceCount: differenceCount(beforeIdentity, afterIdentity),
    sourceTruthUnchanged:
      bytesEqual(sourceBytesBefore, bytes)
      && JSON.stringify(sourceAfter) === JSON.stringify(sourceBefore)
      && production.timeSignature === legacy.timeSignature
      && production.totalBars === legacy.totalBars
      && production.bpm === legacy.bpm,
    sourceCandidatesUnchanged:
      JSON.stringify(production.fullTimeline) === JSON.stringify(legacy.fullTimeline)
      && JSON.stringify(production.blockCandidates) === JSON.stringify(legacy.blockCandidates),
    promotedShadowParity: JSON.stringify(projection) === JSON.stringify(promoted),
    deterministic:
      JSON.stringify(repeated.presentationGrouping) === JSON.stringify(projection),
  };
}

function differenceCount(left: readonly unknown[], right: readonly unknown[]): number {
  const length = Math.max(left.length, right.length);
  let count = 0;
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) count += 1;
  }
  return count;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
