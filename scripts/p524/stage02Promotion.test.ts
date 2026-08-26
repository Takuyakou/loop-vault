import { describe, expect, it } from "vitest";
import { runP524Stage02BenchmarkEnforced } from "./fragmentConsolidatorBenchmark";
import type { P524FreshOfficialEvidence } from "./officialEvidence";
import { p524OfficialBaseline } from "./promotionContract";
import { evaluateP524Stage02WithVerifiedOfficial } from "./stage02Promotion";

const verifiedOfficial: P524FreshOfficialEvidence = {
  status: "pass",
  reasons: [],
  metrics: p524OfficialBaseline,
  deterministic: true,
  codeCandidateCommit: "a".repeat(40),
  productionOutputsUnchanged: true,
};

describe("P5.24-02 promotion assembly after fresh official verification", () => {
  it("passes exact A-K with measured watchdog benchmark evidence", { timeout: 15_000 }, async () => {
    const benchmark = await runP524Stage02BenchmarkEnforced();
    if (benchmark.status !== "completed") throw new Error("benchmark timed out");
    const evidence = evaluateP524Stage02WithVerifiedOfficial(verifiedOfficial, benchmark);
    expect(evidence.decision).toEqual({ status: "pass-to-integration", reasons: [] });
    if (!("input" in evidence)) throw new Error("verified promotion input missing");
    expect(evidence.input.aggregate).toMatchObject({
      fixtureCount: 11,
      groundTruthStates: 24,
      detectedStates: 24,
      expectedChanges: 13,
      detectedChanges: 13,
      matchedChanges: 13,
      changePrecision: 1,
      changeRecall: 1,
      falseMergeRate: 0,
      overSegmentationRate: 0,
      identityErrorRate: 0,
      prematureStableChanges: 0,
      bassLaneFailureFixtures: 0,
      bassLaneSafetyViolations: 0,
    });
    expect(evidence.input.productionOutputsUnchanged).toBe(true);
    expect(evidence.input.officialCandidate).toEqual(p524OfficialBaseline);
    expect(evidence.input.benchmark).toMatchObject({
      measured: true, warmupCount: 3, sampleCount: 7,
      timeoutMs: 10_000, timeoutEnforced: true, timedOut: false,
      provenance: "p524-dense-synthetic-E-x128-v1", noteCount: 3_072,
    });
  });

  it("fails stop when production equality was not established by fresh evidence", { timeout: 15_000 }, async () => {
    const benchmark = await runP524Stage02BenchmarkEnforced();
    if (benchmark.status !== "completed") throw new Error("benchmark timed out");
    const outcome = evaluateP524Stage02WithVerifiedOfficial({
      ...verifiedOfficial,
      productionOutputsUnchanged: false,
    }, benchmark);
    expect(outcome.decision).toMatchObject({ status: "fail-stop-promotion" });
    expect(outcome).not.toHaveProperty("input");
  });

  it("enforces and observes an injected timeout", { timeout: 2_000 }, async () => {
    expect(await runP524Stage02BenchmarkEnforced({ timeoutMs: 25, childDelayMs: 250 })).toMatchObject({
      status: "timed-out", timeoutMs: 25, timeoutEnforced: true, timedOut: true,
    });
  });

  it("reports the actual custom timeout on successful completion", { timeout: 15_000 }, async () => {
    expect(await runP524Stage02BenchmarkEnforced({ timeoutMs: 9_000 })).toMatchObject({
      status: "completed", timeoutMs: 9_000, timeoutEnforced: true, timedOut: false,
    });
  });

});
