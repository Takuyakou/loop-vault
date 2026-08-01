import { describe, expect, it } from "vitest";
import {
  boundaryMetrics,
  comparisonEligibility,
  comparisonPass,
  exactEventPass,
  noChordComparisonPass,
} from "./comparisonPolicy";

describe("Phase 5.15 comparison modes", () => {
  it("keeps exact timing exclusive to exact-event comparison", () => {
    const exact = comparisonEligibility("exact-event", "representable", false);
    const canonical = comparisonEligibility(
      "canonical-identity",
      "representable",
      false,
    );
    const probe = comparisonEligibility("probe-beat", "representable", false);
    expect(comparisonPass(exact, true, false)).toBe(false);
    expect(comparisonPass(canonical, true, false)).toBe(true);
    expect(comparisonPass(probe, true, false)).toBe(true);
    expect(exactEventPass(exact, true, false)).toBe(false);
    expect(exactEventPass(canonical, true, true)).toBe(false);
    expect(exact.exactEventMetricEligible).toBe(true);
    expect(canonical.exactEventMetricEligible).toBe(false);
  });

  it.each([
    ["02_shell_fifths_pickup_irregular", 1.53125, 1 / 96 + 1e-9],
    ["09_halfbeat_boundary_changes", 0.5, 1 / 480 + 1e-9],
    ["26_ppq96_equivalence", 0.5, 1 / 96 + 1e-9],
    ["27_ppq960_equivalence", 0.5, 1 / 960 + 1e-9],
  ])("scores a non-zero first onset as a boundary for %s", (_id, pickup, tolerance) => {
    expect(boundaryMetrics(
      [{ startBeat: pickup }, { startBeat: pickup + 2 }],
      [{ startBeat: pickup }, { startBeat: pickup + 2 }],
      tolerance,
    )).toMatchObject({ expected: 2, actual: 2, truePositive: 2, f1: 1 });
    expect(boundaryMetrics(
      [{ startBeat: pickup }, { startBeat: pickup + 2 }],
      [{ startBeat: 0 }, { startBeat: pickup + 2 }],
      tolerance,
    )).toMatchObject({ expected: 2, actual: 1, truePositive: 1 });
  });

  it("scores a one-tick pickup instead of treating it as clip origin", () => {
    const pickup = 1 / 480;
    expect(boundaryMetrics(
      [{ startBeat: pickup }],
      [{ startBeat: pickup }],
      pickup + 1e-9,
    )).toMatchObject({ expected: 1, actual: 1, truePositive: 1, f1: 1 });
    expect(boundaryMetrics(
      [{ startBeat: pickup }],
      [{ startBeat: 0 }],
      pickup + 1e-9,
    )).toMatchObject({ expected: 1, actual: 0, truePositive: 0, f1: 0 });
  });

  it("excludes N.C. and unsupported representability-aware rows", () => {
    expect(comparisonEligibility(
      "exact-event",
      "no-chord",
      false,
    ).identityMetricEligible).toBe(false);
    expect(comparisonEligibility(
      "representability-aware",
      "detector-vocabulary-unsupported",
      false,
    ).identityMetricEligible).toBe(false);
    expect(comparisonEligibility(
      "exact-event",
      "detector-vocabulary-unsupported",
      false,
    ).identityMetricEligible).toBe(true);
  });

  it("passes N.C. comparison exactly when the expected range is silent", () => {
    expect(noChordComparisonPass(true)).toBe(true);
    expect(noChordComparisonPass(false)).toBe(false);
  });

  it("does not count non-slash rows in slash accuracy", () => {
    expect(comparisonEligibility(
      "exact-event",
      "representable",
      false,
    ).slashMetricEligible).toBe(false);
    expect(comparisonEligibility(
      "exact-event",
      "representable",
      true,
    ).slashMetricEligible).toBe(true);
  });

  it("separates boundary-only and invariant-deep-equal policies", () => {
    const boundary = comparisonEligibility(
      "boundary-only",
      "representable",
      false,
    );
    const invariant = comparisonEligibility(
      "invariant-deep-equal",
      "representable",
      false,
    );
    expect(boundary).toMatchObject({
      identityMetricEligible: false,
      boundaryMetricEligible: true,
    });
    expect(invariant).toMatchObject({
      identityRule: "invariant-deep-equal",
      boundaryMetricEligible: false,
    });
    expect(comparisonPass(boundary, true, true)).toBeNull();
    expect(comparisonPass(invariant, true, true)).toBeNull();
  });

  it("matches adjacent tolerated onsets one-to-one and keeps all ratios <= 1", () => {
    const result = boundaryMetrics(
      [{ startBeat: 1 }, { startBeat: 1.2 }],
      [{ startBeat: 1.1 }],
      0.11,
    );
    expect(result).toEqual({
      expected: 2,
      actual: 1,
      truePositive: 1,
      precision: 1,
      recall: 0.5,
      f1: 0.666667,
    });
    expect(Math.max(result.precision, result.recall, result.f1)).toBeLessThanOrEqual(1);
  });

  it("uses maximum-cardinality matching at adjacent tolerance boundaries", () => {
    expect(boundaryMetrics(
      [{ startBeat: 1 }, { startBeat: 1.2 }],
      [{ startBeat: 0.9 }, { startBeat: 1.1 }],
      0.11,
    ).truePositive).toBe(2);
  });

  it("passes an ideal N.C. gap and fails a spurious chord inside that gap", () => {
    const expected = [
      { startBeat: 0, endBeat: 2 },
      { startBeat: 2, endBeat: 4 },
      { startBeat: 4, endBeat: 6 },
    ];
    const idealDetected = [
      { startBeat: 0, endBeat: 2 },
      { startBeat: 4, endBeat: 6 },
    ];
    expect(boundaryMetrics(expected, idealDetected, 1e-9)).toMatchObject({
      expected: 2,
      actual: 2,
      truePositive: 2,
      f1: 1,
    });
    expect(boundaryMetrics(expected, [
      ...idealDetected,
      { startBeat: 2.5, endBeat: 3 },
    ], 1e-9)).toMatchObject({
      expected: 2,
      actual: 4,
      truePositive: 2,
      precision: 0.5,
    });
  });
});
