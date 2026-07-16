import { describe, expect, it } from "vitest";
import {
  cleanRegressionGuard,
  dirtyImprovementStatus,
  parseCliOptions,
  shouldFailStrictExit,
  strictOverallGuard,
} from "./evaluate-voice-aware-reranker";

const baseline = {
  rootAt1: 0.5,
  rootAt3: 0.7,
  qualityAt1: 0.6,
  qualityAt3: 0.8,
  exactAt1: 0.2,
  exactAt3: 0.3,
  correctionProxyPerCase: 4,
  correctionProxyTotal: 40,
  boundaryPrecision: 1,
  boundaryRecall: 1,
};

describe("voice-aware evaluation guard", () => {
  it("passes only when clean top-1, boundaries, and correction proxy do not regress", () => {
    expect(cleanRegressionGuard(baseline, baseline, true)).toEqual({ passed: true, failures: [] });
    expect(cleanRegressionGuard(
      baseline,
      { ...baseline, rootAt1: 0.49, correctionProxyPerCase: 4.1 },
      false,
    )).toEqual({
      passed: false,
      failures: [
        "clean Root@1 regressed",
        "clean boundaries differ from legacy",
        "clean correction proxy/case regressed",
      ],
    });
  });

  it("reports dirty improvement without hiding regressions", () => {
    expect(dirtyImprovementStatus(baseline, { ...baseline, rootAt1: 0.51 })).toBe("improved");
    expect(dirtyImprovementStatus(baseline, baseline)).toBe("unchanged");
    expect(dirtyImprovementStatus(baseline, { ...baseline, qualityAt1: 0.59 })).toBe("regressed");
    expect(dirtyImprovementStatus(baseline, { ...baseline, rootAt3: 0.69 })).toBe("regressed");
    expect(dirtyImprovementStatus(
      baseline,
      { ...baseline, rootAt1: 0.51, qualityAt1: 0.59 },
    )).toBe("mixed");
  });

  it("fails the strict overall guard for any dirty regression", () => {
    const cleanGuard = { passed: true, failures: [] };
    const result = strictOverallGuard(cleanGuard, true, {
      type0: "improved",
      jitter: "regressed",
      sustain: "mixed",
    });

    expect(result).toEqual({
      status: "failed",
      passed: false,
      failures: [
        "dirty category regressed: jitter (regressed)",
        "dirty category regressed: sustain (mixed)",
      ],
    });
    expect(shouldFailStrictExit(result, false)).toBe(true);
    expect(shouldFailStrictExit(result, true)).toBe(false);
  });

  it("fails when dirty evaluation has no improved category", () => {
    const result = strictOverallGuard({ passed: true, failures: [] }, true, {
      combined: "unchanged",
      jitter: "unchanged",
    });

    expect(result).toMatchObject({
      status: "failed",
      passed: false,
      failures: ["dirty improvement requirement not met"],
    });
  });

  it("passes only with clean, deterministic, non-regressing dirty improvement", () => {
    const result = strictOverallGuard({ passed: true, failures: [] }, true, {
      type0: "improved",
      combined: "unchanged",
    });

    expect(result).toEqual({ status: "passed", passed: true, failures: [] });
    expect(shouldFailStrictExit(result, false)).toBe(false);
  });

  it("validates CLI value flags", () => {
    expect(parseCliOptions(["--limit-per-category", "2"]).limitPerCategory).toBe(2);
    expect(parseCliOptions(["--report-only"]).reportOnly).toBe(true);
    expect(() => parseCliOptions(["--dirty"])).toThrow(/requires a value/);
    expect(() => parseCliOptions(["--report-only", "--report-only"])).toThrow(/Duplicate flag/);
    expect(() => parseCliOptions(["--unknown", "x"])).toThrow(/Unknown flag/);
  });
});
