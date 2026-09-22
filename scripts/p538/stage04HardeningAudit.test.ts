import { describe, expect, it } from "vitest";

import { progressionFixture } from "../p534/fixtures";
import { stage04HardeningAggregate } from "./stage04HardeningAudit";

describe("P5.38-04 hardening aggregate", () => {
  it("connects promoted presentation consumers while preserving rollback and source truth", () => {
    const aggregate = stage04HardeningAggregate(progressionFixture(1, 4), 3);

    expect(aggregate).toMatchObject({
      consumerEffectiveness: true,
      consumerFormattedTextMatches: true,
      consumerPresentationGroupCount: 4,
      consumerCardCount: 4,
      consumerSourceReferencesExact: true,
      blockTopologyCoherent: true,
      defaultEqualsExplicitOn: true,
      explicitOffHasNoProjection: true,
      sourceTruthUnchanged: true,
      sourceCandidatesUnchanged: true,
      promotedShadowParity: true,
      deterministic: true,
    });
    expect(aggregate.performance.iterations).toBe(3);
    expect(aggregate.performance.offMedianMs).toBeGreaterThanOrEqual(0);
    expect(aggregate.performance.onMedianMs).toBeGreaterThanOrEqual(0);
  });
});
