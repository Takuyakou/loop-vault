import { describe, expect, it } from "vitest";

import { progressionFixture } from "../p534/fixtures";
import { stage00DownstreamBaseline } from "./stage00Baseline";

describe("P5.38-00 current downstream meter baselines", () => {
  it("is deterministic and keeps source meter truth visible", () => {
    for (const numerator of [4, 3, 2, 1] as const) {
      const bytes = progressionFixture(numerator, 4);
      const first = stage00DownstreamBaseline(bytes);
      const second = stage00DownstreamBaseline(bytes);

      expect(second).toEqual(first);
      expect(first.sourceMeter).toBe(`${numerator}/4`);
      expect(first.sourceBeatsPerBar).toBe(numerator);
      expect(first.sourceNotes).toBe(16);
    }
  });

  it("freezes the current source-bar-derived downstream topology", () => {
    const baselines = [4, 3, 2, 1].map((numerator) =>
      stage00DownstreamBaseline(progressionFixture(numerator, 4)),
    );

    expect(baselines).toMatchInlineSnapshot(`
      [
        {
          "blockCandidateCount": 1,
          "dashCount": 0,
          "formattedBarCount": 2,
          "occupiedSourceBars": 2,
          "sourceBars": 2,
          "sourceBeatsPerBar": 4,
          "sourceMeter": "4/4",
          "sourceNotes": 16,
          "timelineItems": 4,
        },
        {
          "blockCandidateCount": 2,
          "dashCount": 0,
          "formattedBarCount": 3,
          "occupiedSourceBars": 3,
          "sourceBars": 3,
          "sourceBeatsPerBar": 3,
          "sourceMeter": "3/4",
          "sourceNotes": 16,
          "timelineItems": 4,
        },
        {
          "blockCandidateCount": 4,
          "dashCount": 0,
          "formattedBarCount": 4,
          "occupiedSourceBars": 4,
          "sourceBars": 4,
          "sourceBeatsPerBar": 2,
          "sourceMeter": "2/4",
          "sourceNotes": 16,
          "timelineItems": 4,
        },
        {
          "blockCandidateCount": 6,
          "dashCount": 3,
          "formattedBarCount": 7,
          "occupiedSourceBars": 4,
          "sourceBars": 8,
          "sourceBeatsPerBar": 1,
          "sourceMeter": "1/4",
          "sourceNotes": 16,
          "timelineItems": 4,
        },
      ]
    `);
  });
});
