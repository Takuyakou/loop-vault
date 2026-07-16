import { describe, expect, it } from "vitest";
import {
  candidateDiversitySnapshot,
  cleanRegressionGuard,
  dirtyImprovementStatus,
  evaluationExitCode,
  parseCliOptions,
  shouldFailStrictExit,
  strictOverallGuard,
} from "./evaluate-voice-aware-reranker";
import { makeChordSymbol } from "../src/domain/chords";
import type { EvaluationCaseInput } from "../src/domain/midi/evaluation/types";

const baseline = {
  rootAt1: 0.5,
  rootAt3: 0.7,
  qualityAt1: 0.6,
  qualityAt3: 0.8,
  exactAt1: 0.2,
  exactAt3: 0.3,
  correctionProxyPerCase: 4,
  correctionProxyTotal: 40,
  operationCorrectionCostMean: 2,
  boundaryPrecision: 1,
  boundaryRecall: 1,
};

describe("voice-aware evaluation guard", () => {
  it("passes only when clean top-1, boundaries, and both correction metrics do not regress", () => {
    expect(cleanRegressionGuard(baseline, baseline, true)).toEqual({ passed: true, failures: [] });
    expect(cleanRegressionGuard(
      baseline,
      { ...baseline, rootAt1: 0.49, correctionProxyPerCase: 4.1, operationCorrectionCostMean: 2.1 },
      false,
    )).toEqual({
      passed: false,
      failures: [
        "clean Root@1 regressed",
        "clean boundaries differ from legacy",
        "clean correction proxy/case regressed",
        "clean operation correction cost regressed",
      ],
    });
  });

  it("reports dirty improvement without hiding regressions", () => {
    expect(dirtyImprovementStatus(baseline, { ...baseline, rootAt1: 0.51 })).toBe("improved");
    expect(dirtyImprovementStatus(baseline, baseline)).toBe("unchanged");
    expect(dirtyImprovementStatus(baseline, { ...baseline, qualityAt1: 0.59 })).toBe("regressed");
    expect(dirtyImprovementStatus(baseline, { ...baseline, rootAt3: 0.69 })).toBe("regressed");
    expect(dirtyImprovementStatus(baseline, { ...baseline, operationCorrectionCostMean: 1.9 })).toBe("improved");
    expect(dirtyImprovementStatus(baseline, { ...baseline, operationCorrectionCostMean: 2.1 })).toBe("regressed");
    expect(dirtyImprovementStatus(
      baseline,
      { ...baseline, rootAt1: 0.51, qualityAt1: 0.59 },
    )).toBe("mixed");
  });

  it("fails the strict overall guard for any dirty regression", () => {
    const cleanGuard = { passed: true, failures: [] };
    const result = strictOverallGuard(cleanGuard, true, {
      type0: "improved",
      drums: "improved",
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
    expect(evaluationExitCode(result, false)).toBe(1);
    expect(evaluationExitCode(result, true)).toBe(0);
  });

  it("returns a failing exit code by default and suppresses it only for report generation", () => {
    const failed = {
      status: "failed" as const,
      passed: false,
      failures: ["operation correction cost regressed"],
    };
    expect(evaluationExitCode(failed, false)).toBe(1);
    expect(evaluationExitCode(failed, true)).toBe(0);
  });

  it("fails when dirty evaluation has no improved category", () => {
    const result = strictOverallGuard({ passed: true, failures: [] }, true, {
      combined: "unchanged",
      jitter: "unchanged",
    });

    expect(result).toMatchObject({
      status: "failed",
      passed: false,
      failures: [
        "dirty improvement requirement not met",
        "required dirty category did not improve: drums",
        "required dirty category did not improve: type0",
      ],
    });
  });

  it("requires both drums and type0 to improve", () => {
    expect(strictOverallGuard({ passed: true, failures: [] }, true, {
      drums: "unchanged",
      type0: "improved",
    })).toMatchObject({
      passed: false,
      failures: ["required dirty category did not improve: drums"],
    });

    expect(strictOverallGuard({ passed: true, failures: [] }, true, {
      drums: "improved",
      type0: "unchanged",
    })).toMatchObject({
      passed: false,
      failures: ["required dirty category did not improve: type0"],
    });
  });

  it("passes only with clean, deterministic, non-regressing dirty improvement", () => {
    const result = strictOverallGuard({ passed: true, failures: [] }, true, {
      type0: "improved",
      drums: "improved",
      combined: "unchanged",
    });

    expect(result).toEqual({ status: "passed", passed: true, failures: [] });
    expect(shouldFailStrictExit(result, false)).toBe(false);
    expect(evaluationExitCode(result, false)).toBe(0);
  });

  it("validates CLI value flags", () => {
    expect(parseCliOptions(["--limit-per-category", "2"]).limitPerCategory).toBe(2);
    expect(parseCliOptions(["--report-only"]).reportOnly).toBe(true);
    expect(() => parseCliOptions(["--dirty"])).toThrow(/requires a value/);
    expect(() => parseCliOptions(["--report-only", "--report-only"])).toThrow(/Duplicate flag/);
    expect(() => parseCliOptions(["--unknown", "x"])).toThrow(/Unknown flag/);
  });

  it("reports all-candidate coverage separately from strict Top-3 metrics", () => {
    const bytes = new Uint8Array([1]);
    const input: EvaluationCaseInput = {
      bytes,
      definition: {
        id: "candidate-report",
        title: "candidate report",
        midiPath: "candidate.mid",
        recipeFamily: "test",
        split: "holdout",
        category: ["chord-only"],
        difficulty: "hard",
        expected: {
          chordTimeline: [{
            startBeat: 0,
            endBeat: 4,
            primary: "Cmaj7",
            root: 0,
            quality: "maj7",
          }],
        },
      },
    };
    const analysis = {
      totalBars: 1,
      fullTimeline: [{
        bar: 1,
        beat: 1,
        durationBeats: 4,
        chord: makeChordSymbol(2, "min"),
        confidence: 0.8,
        alternatives: [
          { chord: makeChordSymbol(2, "min7"), confidence: 0.7 },
          { chord: makeChordSymbol(5, "maj"), confidence: 0.6 },
          { chord: makeChordSymbol(0, "maj7"), confidence: 0.5 },
        ],
        warnings: [],
      }],
      blockCandidates: [],
      analyzedAt: "1970-01-01T00:00:00.000Z",
      analyzerVersion: "test",
    };

    const result = candidateDiversitySnapshot([input], new Map([[bytes, analysis]]), {
      ...baseline,
      exactAt1: 0,
      exactAt3: 0,
    });

    expect(result.candidateCoverage).toBe(1);
    expect(result.manualInputProxyPerCase).toBe(0);
    expect(result.averageDisplayedCandidateCount).toBe(4);
    expect(result.duplicateRootRatio).toBeCloseTo(1 / 3, 6);
    expect(result.exactTop3MinusTop1Gap).toBe(0);
  });
});
