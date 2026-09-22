import { describe, expect, it } from "vitest";

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { formatProgressionText } from "../../src/domain/progressionText";
import type { ChordTimelineItem } from "../../src/domain/types";
import { progressionFixture } from "../p534/fixtures";
import {
  buildPresentationGroupingShadow,
  harmonicIdentitySnapshot,
  recoverSourceTimelineItems,
} from "./presentationGroupingShadow";
import {
  buildPresentationGroupingShadowV2,
  PRESENTATION_GROUPING_POLICY_V2,
  type PresentationGroupingCandidateId,
} from "./presentationGroupingShadowV2";

function manualItem(
  sourceGroup: number,
  durationBeats: number,
  index: number,
  beat = 1,
): ChordTimelineItem {
  const root = index % 12;
  return {
    eventId: `v2-manual-${index}`,
    bar: sourceGroup,
    beat,
    durationBeats,
    chord: { root, quality: "maj", tensions: [], label: `V2-${index}` },
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

function timelineFromStarts(
  starts: readonly Array<number | readonly [number, number]>,
): ChordTimelineItem[] {
  return starts.map((start, index) => {
    const [bar, beat] = Array.isArray(start) ? start : [start, 1];
    const next = starts[index + 1];
    const nextBar = next === undefined
      ? bar + 2
      : (Array.isArray(next) ? next[0] : next);
    const nextBeat = next === undefined
      ? beat
      : (Array.isArray(next) ? next[1] : 1);
    return manualItem(bar, Math.max(0.5, nextBar - bar + nextBeat - beat), index, beat);
  });
}

function manualShadow(
  sourceGroupCount: number,
  starts: readonly Array<number | readonly [number, number]>,
) {
  return buildPresentationGroupingShadowV2({
    sourceMeter: "1/4",
    sourceBeatsPerGroup: 1,
    sourceGroupCount,
    timeline: timelineFromStarts(starts),
    legacyBlocks: [],
  });
}

function candidateApplied(
  shadow: ReturnType<typeof manualShadow>,
  id: PresentationGroupingCandidateId,
): boolean {
  return shadow.evidence.candidateDecisions.find((candidate) => candidate.id === id)!.applies;
}

function shadowOf(numerator: 1 | 2 | 3 | 4) {
  const bytes = progressionFixture(numerator, 4);
  const source = parseMidi(bytes);
  const analysis = analyzeMidi(bytes);
  const input = {
    sourceMeter: source.timeSignature ?? "4/4",
    sourceBeatsPerGroup: beatsPerBar(source.timeSignature),
    sourceGroupCount: source.totalBars,
    timeline: analysis.fullTimeline,
    legacyBlocks: analysis.blockCandidates,
  };
  return {
    source,
    analysis,
    input,
    v1: buildPresentationGroupingShadow(input),
    v2: buildPresentationGroupingShadowV2(input),
  };
}

describe("P5.38 Family-A presentation grouping Shadow v2", () => {
  it("selects V2-C from synthetic positives without consulting private evidence", () => {
    const positives = [
      manualShadow(12, [1, 3, 5, 7, 9, 11]),
      manualShadow(12, [1, 2, 4, 7, 8, 10]),
      manualShadow(12, [[1, 1.5], [3, 1.25], [6, 1.75], [8, 1.5], [11, 1.2]]),
      manualShadow(12, [1, 2, 5, 7, 10, 12]),
      manualShadow(12, [[1, 1], [1, 1.5], [4, 1], [4, 1.5], [7, 1], [7, 1.5], [10, 1], [10, 1.5]]),
    ];

    for (const shadow of positives) {
      expect(shadow.applied).toBe(true);
      expect(candidateApplied(shadow, "V2-B")).toBe(true);
      expect(candidateApplied(shadow, "V2-C")).toBe(true);
      expect(shadow.evidence.counterfactualReducesFormattedGroups).toBe(true);
      expect(shadow.evidence.counterfactualReducesDashes).toBe(true);
    }
  });

  it("rejects genuine, sparse, long-held, bursty, short, and alternating-density 1/4", () => {
    const hardNegatives = {
      genuine: manualShadow(12, Array.from({ length: 12 }, (_, index) => index + 1)),
      longHeld: manualShadow(24, [1, 13]),
      sparse: manualShadow(24, [1, 7, 13, 19]),
      bursty: manualShadow(24, [1, 3, 5, 7, 9, 11]),
      short: manualShadow(6, [1, 3, 5]),
      alternating: manualShadow(16, [1, 2, 3, 9, 10, 11]),
    };

    for (const shadow of Object.values(hardNegatives)) {
      expect(shadow.applied).toBe(false);
      expect(candidateApplied(shadow, "V2-C")).toBe(false);
    }
    expect(hardNegatives.genuine.reasonCodes)
      .toEqual(["genuine-one-beat-meter-preserved"]);
    expect(candidateApplied(hardNegatives.sparse, "V2-A")).toBe(true);
    expect(candidateApplied(hardNegatives.bursty, "V2-A")).toBe(true);
    expect(candidateApplied(hardNegatives.alternating, "V2-A")).toBe(true);
  });

  it("keeps 4/4, 3/4, and 2/4 on exact legacy topology", () => {
    for (const numerator of [4, 3, 2] as const) {
      const { analysis, v2 } = shadowOf(numerator);
      expect(v2.applied).toBe(false);
      expect(v2.reasonCodes).toEqual(["legacy-meter-topology"]);
      expect(v2.formattedText).toBe(formatProgressionText(analysis.fullTimeline));
      expect(v2.projectedBlocks.map((block) => ({
        span: block.sourceGroupSpan,
        summary: block.summaryText,
        signature: block.structuredSignature,
      }))).toEqual(analysis.blockCandidates.map((candidate) => ({
        span: {
          startSourceGroup: candidate.startBar,
          endSourceGroup: candidate.endBar,
        },
        summary: candidate.summaryText,
        signature: candidate.structuredSignature,
      })));
    }
  });

  it("reuses v1 projection architecture while preserving source identity and coordinates", () => {
    const { source, analysis, input, v1, v2 } = shadowOf(1);
    const timelineBefore = structuredClone(analysis.fullTimeline);
    const identityBefore = harmonicIdentitySnapshot(
      analysis.fullTimeline,
      beatsPerBar(source.timeSignature),
    );

    expect(v1.applied).toBe(true);
    expect(v2.applied).toBe(true);
    expect(v2.groups).toEqual(v1.groups);
    expect(v2.formattedCells).toEqual(v1.formattedCells);
    expect(v2.projectedBlocks).toEqual(v1.projectedBlocks);
    expect(analysis.fullTimeline).toEqual(timelineBefore);
    expect(harmonicIdentitySnapshot(analysis.fullTimeline, 1)).toEqual(identityBefore);
    expect(recoverSourceTimelineItems(v2.groups, input.timeline)).toEqual(input.timeline);
  });

  it("is deterministic and bounded by the frozen v2 policy", () => {
    const { input } = shadowOf(1);
    const first = buildPresentationGroupingShadowV2(input);
    const second = buildPresentationGroupingShadowV2(input);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.projectedBlocks.length)
      .toBeLessThanOrEqual(PRESENTATION_GROUPING_POLICY_V2.maximumProjectedBlocks);
  });
});
