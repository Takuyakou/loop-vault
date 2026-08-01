import { describe, expect, it } from "vitest";
import {
  buildRuntimeObservationSummary,
  renderRuntimeObservationSummary,
} from "./runtimeSummary";

const stats = { median: 1, p95: 2, max: 3 };
const runtime = {
  threeMinute: {
    caseId: "36_long_three_minute_stability",
    runtimeMs: stats,
    maxObservedPostAnalysisRssBytes: 123,
    repeatedAnalysis: {
      iterations: 20,
      heapDeltaBytes: 4,
      rssDeltaBytes: 5,
      rssBytes: stats,
      heapUsedBytes: stats,
    },
  },
  fortyFileBatch: {
    status: "COMPLETED" as const,
    requested: 40,
    completed: 40,
    totalMs: 42,
    perFileMs: stats,
  },
  namedRuntimeOnly: {
    suran: { exists: true, runtimeMs: 6, path: "not-forwarded" },
    endless: { exists: false, path: "not-forwarded" },
    allInstruments: { exists: true, runtimeMs: 7, path: "not-forwarded" },
  },
  liveMidi: { confirmed: { p50: 0.1, p90: 0.2 } },
  chordDojo: { millisecondsPerOperation: stats },
};

describe("P5.15 baseline stdout contract", () => {
  it("prints current runtime observations as one privacy-safe JSON document", () => {
    const text = renderRuntimeObservationSummary(runtime);
    const parsed = JSON.parse(text);
    expect(text.endsWith("\n")).toBe(true);
    expect(parsed).toEqual(buildRuntimeObservationSummary(runtime));
    expect(parsed.mode).toBe("read-only-current-observations");
    expect(parsed.case36).toMatchObject({
      runtimeMs: stats,
      maxObservedPostAnalysisRssBytes: 123,
      repeatedMemory: { iterations: 20 },
    });
    expect(parsed.fortyFileBatch).toMatchObject({
      status: "COMPLETED",
      completed: 40,
    });
    expect(parsed.namedRuntimeOnly).toEqual({
      suran: { status: "COMPLETED", runtimeMs: 6 },
      endless: { status: "SKIPPED", runtimeMs: null },
      allInstruments: { status: "COMPLETED", runtimeMs: 7 },
    });
    expect(parsed.liveMidi).toBeDefined();
    expect(parsed.chordDojo).toBeDefined();
    expect(text).not.toMatch(/not-forwarded|(?:[A-Za-z]:[\\/])|file:\/\//i);
    expect(text.toLowerCase()).not.toContain("holdout");
  });

  it("labels explicit refresh output without claiming read-only mode", () => {
    expect(JSON.parse(renderRuntimeObservationSummary(runtime, "reviewed-write")).mode)
      .toBe("reviewed-write-current-observations");
    expect(JSON.parse(renderRuntimeObservationSummary(runtime, "candidate-write")).mode)
      .toBe("candidate-write-current-observations");
  });
});
