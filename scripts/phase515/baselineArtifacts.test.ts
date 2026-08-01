import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  verifyFrozenHoldout,
} from "./holdoutLock";
import { partitionLockSchema } from "./lockContract";

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve("docs/phase5.15", name), "utf8"));
}

describe("Phase 5.15 frozen baseline artifacts", () => {
  it("recomputes Holdout inputs without opening analyzer results", async () => {
    const partition = partitionLockSchema.parse(readJson("00-partition-lock.json"));
    expect(partition.holdout.phase47FreshHoldout).toMatchObject({
      caseCount: 12,
      resultOpened: false,
    });
    expect(partition.holdout.phase47FreshHoldout.files).toHaveLength(12);
    expect(partition.holdout.phase47FreshHoldout.files.every((item) =>
      item.matchesManifest && item.actualByteLength > 0)).toBe(true);
    expect(partition.holdout.phase514RoundTripSubset).toMatchObject({
      selectionSize: 4,
      resultOpened: false,
    });
    for (const key of [
      "selectionSha256",
      "exportedMidiSha256",
      "exporterSourceSha256",
    ] as const) {
      expect(partition.holdout.phase514RoundTripSubset[key]).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(
      partition.holdout.phase514RoundTripSubset.exportedMidiByteLength,
    ).toBeGreaterThan(0);
    const verification = await verifyFrozenHoldout(resolve("."), partition.holdout);
    expect(verification.lockedHashesPreserved).toBe(true);
    expect(verification.phase514RoundTripSubset).toBe("VERIFIED");
  });

  it("measures case 36 determinism, percentiles, sampled RSS, and repeated memory", () => {
    const runtime = readJson("00-runtime-baseline.json") as {
      threeMinute: {
        caseId: string;
        runtimeMs: { median: number; p95: number; max: number };
        maxObservedPostAnalysisRssBytes: number;
        repeatedAnalysis: {
          iterations: number;
          rssBytes: { median: number; p95: number; max: number };
        };
      };
      gates: { deterministicRuntimeCase: boolean };
    };
    expect(runtime.threeMinute.caseId).toBe("36_long_three_minute_stability");
    expect(runtime.threeMinute.runtimeMs.p95).toBeGreaterThanOrEqual(
      runtime.threeMinute.runtimeMs.median,
    );
    expect(runtime.threeMinute.runtimeMs.max).toBeGreaterThanOrEqual(
      runtime.threeMinute.runtimeMs.p95,
    );
    expect(runtime.threeMinute.maxObservedPostAnalysisRssBytes).toBeGreaterThan(0);
    expect(runtime.threeMinute.repeatedAnalysis.iterations).toBe(20);
    expect(runtime.gates.deterministicRuntimeCase).toBe(true);
  });

  it("contains no absolute Windows paths in tracked baseline text", () => {
    const names = [
      "00-data-inventory.json",
      "00-partition-lock.json",
      "00-baseline-lock.json",
      "00-current-failure-matrix.json",
      "00-roundtrip-baseline.json",
      "00-runtime-baseline.json",
      "00-evaluation-contract.md",
      "00-repository-audit.md",
    ];
    for (const name of names) {
      expect(readFileSync(resolve("docs/phase5.15", name), "utf8"))
        .not.toMatch(/[A-Za-z]:[\\/]/);
    }
  });
});
