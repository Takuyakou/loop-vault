// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultPreAnalysisSourceSelectionSettings,
  getPreAnalysisSourceSelectionSettings,
  needsPreAnalysisReview,
  setPreAnalysisSourceSelectionSettings,
  shouldOpenPreAnalysis,
} from "./preAnalysisSettings";

describe("pre-analysis source selection settings", () => {
  beforeEach(() => localStorage.clear());

  it("opens the inline preparation surface in both product profiles", () => {
    expect(shouldOpenPreAnalysis("accuracy-first")).toBe(true);
    expect(shouldOpenPreAnalysis("stable")).toBe(true);
  });

  it("opens complex all-in-one MIDI in Stable", () => {
    const allInOne = reviewSession({
      pitchedVoiceConfidences: [0.92, 0.88, 0.76],
      drumCount: 1,
    });

    expect(needsPreAnalysisReview(allInOne)).toBe(true);
    expect(shouldOpenPreAnalysis(
      "stable",
      defaultPreAnalysisSourceSelectionSettings,
      allInOne,
    )).toBe(true);
  });

  it("opens multiple sources or a low-confidence Voice in Stable", () => {
    expect(needsPreAnalysisReview(reviewSession({
      sourceCount: 2,
      pitchedVoiceConfidences: [0.9],
    }))).toBe(true);
    expect(needsPreAnalysisReview(reviewSession({
      pitchedVoiceConfidences: [0.44],
    }))).toBe(true);
  });

  it("uses a V2 Low confidence bucket even when legacy numeric confidence is high", () => {
    expect(needsPreAnalysisReview({
      sources: [{}],
      voices: [{
        isDrum: false,
        autoRoleConfidenceBucket: "low",
        autoRoleConfidence: 0.9,
      }],
    })).toBe(true);
  });
  it("keeps one high-confidence pitched Voice in compact presentation", () => {
    const simple = reviewSession({
      pitchedVoiceConfidences: [0.9],
    });

    expect(needsPreAnalysisReview(simple)).toBe(false);
    expect(shouldOpenPreAnalysis(
      "stable",
      defaultPreAnalysisSourceSelectionSettings,
      simple,
    )).toBe(true);
  });

  it("can always show the preparation screen in Stable", () => {
    setPreAnalysisSourceSelectionSettings({
      enablePreAnalysisSourceSelection: true,
      alwaysShowPreAnalysis: true,
    });
    expect(shouldOpenPreAnalysis("stable")).toBe(true);
  });

  it("provides an immediate rollback flag", () => {
    setPreAnalysisSourceSelectionSettings({
      enablePreAnalysisSourceSelection: false,
      alwaysShowPreAnalysis: true,
    });
    expect(shouldOpenPreAnalysis("accuracy-first")).toBe(false);
    expect(shouldOpenPreAnalysis("stable")).toBe(false);
    expect(getPreAnalysisSourceSelectionSettings()).toEqual({
      enablePreAnalysisSourceSelection: false,
      alwaysShowPreAnalysis: true,
    });
  });

  it("rejects invalid local data", () => {
    localStorage.setItem("loopvault.preAnalysisSourceSelection", "{broken");
    expect(getPreAnalysisSourceSelectionSettings())
      .toEqual(defaultPreAnalysisSourceSelectionSettings);
  });
});

function reviewSession({
  sourceCount = 1,
  pitchedVoiceConfidences,
  drumCount = 0,
}: {
  sourceCount?: number;
  pitchedVoiceConfidences: number[];
  drumCount?: number;
}) {
  return {
    sources: Array.from({ length: sourceCount }, () => ({})),
    voices: [
      ...pitchedVoiceConfidences.map((autoRoleConfidence) => ({
        isDrum: false,
        autoRoleConfidence,
      })),
      ...Array.from({ length: drumCount }, () => ({
        isDrum: true,
        autoRoleConfidence: 1,
      })),
    ],
  };
}
