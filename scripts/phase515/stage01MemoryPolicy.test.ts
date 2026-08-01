import { describe, expect, it } from "vitest";
import {
  evaluateStage01MemoryPair,
  linearSlope,
  memorySampleArithmeticValid,
  observedPeakRss,
  type Stage01MemoryPoint,
  type Stage01MemorySample,
} from "./stage01MemoryPolicy";

const MiB = 1024 * 1024;

function add(point: Stage01MemoryPoint, growth: Partial<Stage01MemoryPoint>): Stage01MemoryPoint {
  return {
    rssBytes: point.rssBytes + (growth.rssBytes ?? 0),
    heapUsedBytes: point.heapUsedBytes + (growth.heapUsedBytes ?? 0),
    externalBytes: point.externalBytes + (growth.externalBytes ?? 0),
  };
}

function subtract(left: Stage01MemoryPoint, right: Stage01MemoryPoint): Stage01MemoryPoint {
  return {
    rssBytes: left.rssBytes - right.rssBytes,
    heapUsedBytes: left.heapUsedBytes - right.heapUsedBytes,
    externalBytes: left.externalBytes - right.externalBytes,
  };
}

function sample(
  enabled: boolean,
  warmupGrowth: Partial<Stage01MemoryPoint> = {},
): Stage01MemorySample {
  const coldBefore = {
    rssBytes: 100 * MiB,
    heapUsedBytes: 20 * MiB,
    externalBytes: 2 * MiB,
  };
  const postWarmupGc = add(coldBefore, warmupGrowth);
  const warmupPeaks = Array.from({ length: 6 }, (_, index) => add(postWarmupGc, {
    rssBytes: index * 1024,
    heapUsedBytes: index * 512,
    externalBytes: index * 256,
  }));
  const postGcSeries = Array.from({ length: 25 }, () => ({ ...postWarmupGc }));
  const postGc = postGcSeries.at(-1)!;
  const peak = add(postWarmupGc, { rssBytes: MiB });
  return {
    enabled,
    warmupIterations: 6,
    measuredIterations: 24,
    gcExposed: true,
    coldBefore,
    warmupPeaks,
    postWarmupGc,
    warmupRetainedGrowth: subtract(postWarmupGc, coldBefore),
    before: postWarmupGc,
    peak,
    postGc,
    retainedGrowth: subtract(postGc, postWarmupGc),
    retainedSlopeBytesPerIteration: {
      rssBytes: linearSlope(postGcSeries.map((point) => point.rssBytes)),
      heapUsedBytes: linearSlope(postGcSeries.map((point) => point.heapUsedBytes)),
      externalBytes: linearSlope(postGcSeries.map((point) => point.externalBytes)),
    },
    postGcSeries,
    temporaryArtifactsCreated: 0,
  };
}

describe("Stage 01 cold-start and warm-up memory policy", () => {
  it("accepts raw cold-before, every warm-up observation, and post-warm-up GC arithmetic", () => {
    const value = sample(true, { rssBytes: 2 * MiB, heapUsedBytes: MiB });
    expect(memorySampleArithmeticValid(value)).toBe(true);

    value.warmupRetainedGrowth.heapUsedBytes += 1;
    expect(memorySampleArithmeticValid(value)).toBe(false);
  });

  it("rejects a huge feature-only initialization retention even when repeated analyses are flat", () => {
    const off = sample(false);
    const on = sample(true, { rssBytes: 64 * MiB, heapUsedBytes: 16 * MiB });
    const decision = evaluateStage01MemoryPair(off, on);

    expect(decision.offRetainedPass).toBe(true);
    expect(decision.onRetainedPass).toBe(true);
    expect(decision.transientPass).toBe(true);
    expect(decision.warmupRetainedComparisons.rssBytes).toMatchObject({
      comparisonMode: "ABSOLUTE_NEAR_ZERO",
      pass: false,
    });
    expect(decision.warmupRetainedPass).toBe(false);
    expect(decision.pairPass).toBe(false);
  });

  it("uses a relative ceiling when OFF warm-up retention is significant", () => {
    const off = sample(false, { rssBytes: 8 * MiB, heapUsedBytes: 2 * MiB });
    const passingOn = sample(true, { rssBytes: 10 * MiB, heapUsedBytes: 2.5 * MiB });
    const failingOn = sample(true, { rssBytes: 11 * MiB, heapUsedBytes: 3 * MiB });

    expect(evaluateStage01MemoryPair(off, passingOn).warmupRetainedComparisons.rssBytes)
      .toMatchObject({ comparisonMode: "SIGNIFICANT_GROWTH_RATIO", ratio: 1.25, pass: true });
    expect(evaluateStage01MemoryPair(off, failingOn).warmupRetainedComparisons.rssBytes)
      .toMatchObject({ comparisonMode: "SIGNIFICANT_GROWTH_RATIO", ratio: 1.375, pass: false });
  });

  it("rejects missing per-warm-up raw observations", () => {
    const value = sample(true);
    value.warmupPeaks.pop();
    expect(memorySampleArithmeticValid(value)).toBe(false);
  });

  it("rejects a huge warm-up transient peak and includes it in the RSS summary", () => {
    const off = sample(false);
    const on = sample(true);
    on.warmupPeaks[2] = { ...on.warmupPeaks[2]!, rssBytes: 300 * MiB };

    expect(observedPeakRss(on)).toBe(300 * MiB);
    expect(evaluateStage01MemoryPair(off, on)).toMatchObject({
      transientPass: false,
      pairPass: false,
    });
  });
});
