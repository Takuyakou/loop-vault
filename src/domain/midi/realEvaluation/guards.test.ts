import { describe, expect, it } from "vitest";
import type { GoldMetrics } from "./realMetrics";
import { goldGuardFailures, realMidiEvaluationExitCode } from "./guards";

const baseline: GoldMetrics = {
  caseCount: 1,
  durationBeats: 4,
  rootAccuracy: 0.8,
  rootTop3Accuracy: 0.9,
  qualityAccuracy: 0.7,
  qualityTop3Accuracy: 0.8,
  tetradAccuracy: 0.7,
  exactAccuracy: 0.6,
  exactTop3Accuracy: 0.75,
  strongAlternativeAccuracy: 0.7,
  weakAlternativeAccuracy: 0.8,
  top3Accuracy: 0.75,
  boundaryPrecision: 1,
  boundaryRecall: 1,
  correctionCost: 1,
  operationCorrectionCost: {
    segmentCount: 1,
    total: 1,
    mean: 1,
    median: 1,
    p90: 1,
    byCost: { 0: 0, 1: 1, 2: 0, 3: 0, 4: 0 },
    byCategory: {
      primary: 0,
      alternative: 1,
      "structure-editor": 0,
      "manual-input": 0,
      unrepresentable: 0,
    },
  },
};

describe("goldGuardFailures", () => {
  it("passes when every guarded metric is non-regressing", () => {
    expect(goldGuardFailures(baseline, baseline)).toEqual([]);
  });

  it("reports Exact@1 regression independently", () => {
    expect(goldGuardFailures(baseline, { ...baseline, exactAccuracy: 0.59 }))
      .toContain("exact-accuracy-regressed");
  });

  it("fails evaluation when any registered source is unresolved", () => {
    expect(realMidiEvaluationExitCode([], [], 0)).toBe(0);
    expect(realMidiEvaluationExitCode([], [], 1)).toBe(1);
    expect(realMidiEvaluationExitCode(["regressed"], [], 0)).toBe(1);
  });
});
