import { describe, expect, it } from "vitest";

import { progressionFixture } from "../../../scripts/p534/fixtures";
import {
  buildPresentationGrouping,
  PRESENTATION_GROUPING_POLICY_V2,
} from "./presentationGrouping";
import { analyzeMidi } from "./analysis";
import { beatsPerBar } from "./timing";
import { formatProgressionText } from "../progressionText";

describe("P5.38 Family-A production presentation grouping", () => {
  it("keeps the runtime default and explicit OFF on the exact legacy result", () => {
    const bytes = progressionFixture(1, 4);
    const baseline = analyzeMidi(bytes);
    const explicitOff = analyzeMidi(bytes, { enablePresentationGrouping: false });

    expect(explicitOff).toEqual(baseline);
    expect(baseline).not.toHaveProperty("presentationGrouping");
    expect(explicitOff).not.toHaveProperty("presentationGrouping");
  });

  it("makes production ON byte-equivalent to the promoted shared v2 projection", () => {
    const bytes = progressionFixture(1, 4);
    const legacy = analyzeMidi(bytes);
    const production = analyzeMidi(bytes, { enablePresentationGrouping: true });
    const promoted = buildPresentationGrouping({
      sourceMeter: legacy.timeSignature ?? "4/4",
      sourceBeatsPerGroup: beatsPerBar(legacy.timeSignature),
      sourceGroupCount: legacy.totalBars,
      timeline: legacy.fullTimeline,
      legacyBlocks: legacy.blockCandidates,
    });

    expect(production.presentationGrouping).toEqual(promoted);
    expect(production.presentationGrouping?.policyId)
      .toBe(PRESENTATION_GROUPING_POLICY_V2.id);
    expect(JSON.stringify(production.presentationGrouping))
      .toBe(JSON.stringify(promoted));
  });

  it("projects only presentation consumers and preserves all source/save inputs", () => {
    const bytes = progressionFixture(1, 4);
    const legacy = analyzeMidi(bytes);
    const production = analyzeMidi(bytes, { enablePresentationGrouping: true });
    const projection = production.presentationGrouping!;

    expect(projection.applied).toBe(true);
    expect(projection.formattedText).not.toBe(formatProgressionText(legacy.fullTimeline));
    expect(projection.formattedCells.filter((cell) => cell.text === "-")).toHaveLength(0);
    expect(projection.projectedBlocks.every((block) =>
      block.summaryText === `| ${block.cells.map((cell) => cell.text).join(" | ")} |`
    )).toBe(true);

    expect(production.fullTimeline).toEqual(legacy.fullTimeline);
    expect(production.blockCandidates).toEqual(legacy.blockCandidates);
    expect(production.totalBars).toBe(legacy.totalBars);
    expect(production.timeSignature).toBe(legacy.timeSignature);
    expect(production.bpm).toBe(legacy.bpm);
    expect(JSON.stringify(production.blockCandidates))
      .not.toContain("presentationGrouping");
  });

  it("keeps 4/4, 3/4, and 2/4 text, summaries, and block topology exact", () => {
    for (const numerator of [4, 3, 2] as const) {
      const bytes = progressionFixture(numerator, 4);
      const legacy = analyzeMidi(bytes);
      const production = analyzeMidi(bytes, { enablePresentationGrouping: true });
      const projection = production.presentationGrouping!;

      expect(projection.applied).toBe(false);
      expect(projection.reasonCodes).toEqual(["legacy-meter-topology"]);
      expect(projection.formattedText).toBe(formatProgressionText(legacy.fullTimeline));
      expect(projection.projectedBlocks.map((block) => ({
        sourceCandidateIndex: block.sourceCandidateIndex,
        sourceGroupSpan: block.sourceGroupSpan,
        structuredSignature: block.structuredSignature,
        summaryText: block.summaryText,
      }))).toEqual(legacy.blockCandidates.map((candidate, sourceCandidateIndex) => ({
        sourceCandidateIndex,
        sourceGroupSpan: {
          startSourceGroup: candidate.startBar,
          endSourceGroup: candidate.endBar,
        },
        structuredSignature: candidate.structuredSignature,
        summaryText: candidate.summaryText,
      })));
      expect(production.fullTimeline).toEqual(legacy.fullTimeline);
      expect(production.blockCandidates).toEqual(legacy.blockCandidates);
    }
  });

  it("is deterministic and bounded on the production ON path", () => {
    const bytes = progressionFixture(1, 16);
    const first = analyzeMidi(bytes, { enablePresentationGrouping: true });
    const second = analyzeMidi(bytes, { enablePresentationGrouping: true });

    expect(JSON.stringify(second.presentationGrouping))
      .toBe(JSON.stringify(first.presentationGrouping));
    expect(first.presentationGrouping?.projectedBlocks.length)
      .toBeLessThanOrEqual(PRESENTATION_GROUPING_POLICY_V2.maximumProjectedBlocks);
  });
});
