import { describe, expect, it } from "vitest";

import type { CandidateChordEvent } from "../../src/domain/midi/candidateBlock";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { formatProgressionText } from "../../src/domain/progressionText";
import type { ChordTimelineItem } from "../../src/domain/types";
import { progressionFixture } from "../p534/fixtures";
import {
  buildPresentationBlockCells,
  buildPresentationGroupingShadow,
  harmonicIdentitySnapshot,
  PRESENTATION_GROUPING_POLICY_V1,
  recoverSourceTimelineItems,
  type PresentationGroup,
} from "./presentationGroupingShadow";

function shadowOf(bytes: Uint8Array) {
  const source = parseMidi(bytes);
  const analysis = analyzeMidi(bytes);
  return {
    source,
    analysis,
    shadow: buildPresentationGroupingShadow({
      sourceMeter: source.timeSignature ?? "4/4",
      sourceBeatsPerGroup: beatsPerBar(source.timeSignature),
      sourceGroupCount: source.totalBars,
      timeline: analysis.fullTimeline,
      legacyBlocks: analysis.blockCandidates,
    }),
  };
}

function manualItem(
  sourceGroup: number,
  durationBeats: number,
  index: number,
  beat = 1,
): ChordTimelineItem {
  const root = index % 12;
  return {
    eventId: `manual-${index}`,
    bar: sourceGroup,
    beat,
    durationBeats,
    chord: { root, quality: "maj", tensions: [], label: `C${index}` },
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

function manualShadow(
  timeline: readonly ChordTimelineItem[],
  sourceGroupCount = 8,
) {
  return buildPresentationGroupingShadow({
    sourceMeter: "1/4",
    sourceBeatsPerGroup: 1,
    sourceGroupCount,
    timeline,
    legacyBlocks: [],
  });
}

describe("P5.38-01 presentation grouping shadow", () => {
  it("keeps 4/4, 3/4, and 2/4 on exact legacy topology", () => {
    for (const numerator of [4, 3, 2] as const) {
      const { source, analysis, shadow } = shadowOf(progressionFixture(numerator, 4));
      expect(shadow.applied).toBe(false);
      expect(shadow.reasonCodes).toEqual(["legacy-meter-topology"]);
      expect(shadow.groups).toHaveLength(source.totalBars);
      expect(shadow.formattedText).toBe(formatProgressionText(analysis.fullTimeline));
      expect(shadow.projectedBlocks.map((block) => ({
        start: block.sourceGroupSpan.startSourceGroup,
        end: block.sourceGroupSpan.endSourceGroup,
        summary: block.summaryText,
        signature: block.structuredSignature,
      }))).toEqual(analysis.blockCandidates.map((candidate) => ({
        start: candidate.startBar,
        end: candidate.endBar,
        summary: candidate.summaryText,
        signature: candidate.structuredSignature,
      })));
    }
  });

  it("improves the frozen pathological 1/4 synthetic without a fixed four-beat grid", () => {
    const { source, analysis, shadow } = shadowOf(progressionFixture(1, 4));
    expect(shadow.applied).toBe(true);
    expect(shadow.reasonCodes).toEqual([
      "fragmentation-detected",
      "presentation-projection-applied",
    ]);
    expect(shadow.evidence).toMatchObject({
      sourceGroupCount: 8,
      legacyFormattedGroupCount: 7,
      legacyDashCount: 3,
    });
    expect(shadow.groups).toHaveLength(4);
    expect(shadow.formattedCells).toHaveLength(4);
    expect(shadow.formattedCells.filter((cell) => cell.text === "-")).toHaveLength(0);
    expect(shadow.groups.map((group) => group.absoluteEndBeat - group.absoluteStartBeat))
      .toEqual([2, 2, 2, 2]);
    expect(source.timeSignature).toBe("1/4");
    expect(source.totalBars).toBe(8);
    expect(analysis.fullTimeline).toHaveLength(4);
  });

  it("fails closed for a genuine one-harmony-per-bar 1/4 progression", () => {
    const timeline = Array.from({ length: 8 }, (_, index) => manualItem(index + 1, 1, index));
    const shadow = manualShadow(timeline);
    expect(shadow.applied).toBe(false);
    expect(shadow.reasonCodes).toEqual(["genuine-one-beat-meter-preserved"]);
    expect(shadow.groups).toHaveLength(8);
    expect(shadow.formattedCells.every((cell) => cell.kind === "event-start")).toBe(true);
  });

  it("fails closed for empty, sparse, long-held, and rapid one-beat topologies", () => {
    expect(manualShadow([]).reasonCodes).toEqual(["insufficient-fragmentation-evidence"]);
    expect(manualShadow([manualItem(1, 4, 0), manualItem(5, 4, 1)]).applied).toBe(false);
    expect(manualShadow([manualItem(1, 8, 0)]).applied).toBe(false);
    expect(manualShadow(
      Array.from({ length: 8 }, (_, index) => manualItem(index + 1, 1, index)),
    ).applied).toBe(false);
  });

  it("uses resolved event starts for syncopated and uneven presentation spans", () => {
    const timeline = [
      manualItem(1, 1.5, 0, 1.5),
      manualItem(3, 2.25, 1, 1.2),
      manualItem(5, 1.6, 2, 1.75),
      manualItem(8, 1.5, 3, 1),
    ];
    const shadow = manualShadow(timeline, 10);
    expect(shadow.applied).toBe(true);
    expect(shadow.groups.map((group) => group.absoluteStartBeat)).toEqual([0, 0.5, 2.2, 4.75, 7]);
    expect(shadow.groups.map((group) => group.absoluteEndBeat - group.absoluteStartBeat))
      .not.toContain(4);
  });

  it("keeps '-', carry-in sustain, and no-overlap as three distinct meanings", () => {
    const source = manualItem(1, 2, 0);
    const event: CandidateChordEvent = {
      sourceEventId: source.eventId,
      relativeStartBeat: 0,
      durationBeats: 2,
      sourceDurationBeats: 2,
      carriedIn: false,
      bar: 1,
      beat: 1,
      chord: source.chord,
      identityKey: "test",
      confidence: 1,
      warnings: [],
      source,
    };
    const groups: PresentationGroup[] = [0, 1, 2].map((index) => ({
      groupIndex: index,
      absoluteStartBeat: index,
      absoluteEndBeat: index + 1,
      containedTimelineItemIds: index === 0 ? ["event:manual-0"] : [],
      sourceGroupSpan: { startSourceGroup: index + 1, endSourceGroup: index + 1 },
    }));
    expect(buildPresentationBlockCells([event], groups, 0).map((cell) => [cell.kind, cell.text]))
      .toEqual([
        ["event-start", "C0"],
        ["carry-in-sustain", "—"],
        ["no-overlap", "N.C."],
      ]);
    expect(manualShadow([
      manualItem(1, 1, 0),
      manualItem(3, 1, 1),
    ]).formattedCells[1]).toMatchObject({
      kind: "no-event-start",
      text: "-",
    });
  });

  it("preserves harmonic identity and source-coordinate round trip without mutation", () => {
    const { source, analysis } = shadowOf(progressionFixture(1, 4));
    const beforeTimeline = structuredClone(analysis.fullTimeline);
    const beforeIdentity = harmonicIdentitySnapshot(
      analysis.fullTimeline,
      beatsPerBar(source.timeSignature),
    );
    const shadow = buildPresentationGroupingShadow({
      sourceMeter: source.timeSignature ?? "4/4",
      sourceBeatsPerGroup: beatsPerBar(source.timeSignature),
      sourceGroupCount: source.totalBars,
      timeline: analysis.fullTimeline,
      legacyBlocks: analysis.blockCandidates,
    });
    expect(analysis.fullTimeline).toEqual(beforeTimeline);
    expect(harmonicIdentitySnapshot(analysis.fullTimeline, 1)).toEqual(beforeIdentity);
    expect(recoverSourceTimelineItems(shadow.groups, analysis.fullTimeline))
      .toEqual(analysis.fullTimeline);
    expect(shadow.projectedBlocks.every((block) => block.events.every((event) =>
      analysis.fullTimeline.includes(event.source)))).toBe(true);
  });

  it("is byte-deterministic and bounded by the frozen policy", () => {
    const { source, analysis } = shadowOf(progressionFixture(1, 4));
    const input = {
      sourceMeter: source.timeSignature ?? "4/4",
      sourceBeatsPerGroup: beatsPerBar(source.timeSignature),
      sourceGroupCount: source.totalBars,
      timeline: analysis.fullTimeline,
      legacyBlocks: analysis.blockCandidates,
    };
    const first = buildPresentationGroupingShadow(input);
    const second = buildPresentationGroupingShadow(input);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.projectedBlocks.length)
      .toBeLessThanOrEqual(PRESENTATION_GROUPING_POLICY_V1.maximumProjectedBlocks);
  });
});
