import { describe, expect, it } from "vitest";

import { progressionFixture } from "../p534/fixtures";
import { stage03ProductionAggregate } from "./stage03ProductionAudit";

describe("P5.38-03 production presentation aggregate", () => {
  it("matches promoted v2 while preserving source truth and meter controls", () => {
    const aggregates = [4, 3, 2, 1].map((numerator) =>
      stage03ProductionAggregate(progressionFixture(numerator, 4)));

    expect(aggregates.map((aggregate) => ({
      meter: aggregate.sourceMeter,
      applied: aggregate.applied,
      sourceGroups: aggregate.sourceGroupCount,
      legacyGroups: aggregate.legacyPresentationGroupCount,
      productionGroups: aggregate.productionPresentationGroupCount,
      legacyDashes: aggregate.legacyDashCount,
      productionDashes: aggregate.productionDashCount,
      identityDiffs: aggregate.harmonicIdentityDifferenceCount,
      sourceTruth: aggregate.sourceTruthUnchanged,
      sourceCandidates: aggregate.sourceCandidatesUnchanged,
      shadowParity: aggregate.promotedShadowParity,
      deterministic: aggregate.deterministic,
    }))).toEqual([
      {
        meter: "4/4", applied: false, sourceGroups: 2,
        legacyGroups: 2, productionGroups: 2,
        legacyDashes: 0, productionDashes: 0,
        identityDiffs: 0, sourceTruth: true, sourceCandidates: true,
        shadowParity: true, deterministic: true,
      },
      {
        meter: "3/4", applied: false, sourceGroups: 3,
        legacyGroups: 3, productionGroups: 3,
        legacyDashes: 0, productionDashes: 0,
        identityDiffs: 0, sourceTruth: true, sourceCandidates: true,
        shadowParity: true, deterministic: true,
      },
      {
        meter: "2/4", applied: false, sourceGroups: 4,
        legacyGroups: 4, productionGroups: 4,
        legacyDashes: 0, productionDashes: 0,
        identityDiffs: 0, sourceTruth: true, sourceCandidates: true,
        shadowParity: true, deterministic: true,
      },
      {
        meter: "1/4", applied: true, sourceGroups: 8,
        legacyGroups: 7, productionGroups: 4,
        legacyDashes: 3, productionDashes: 0,
        identityDiffs: 0, sourceTruth: true, sourceCandidates: true,
        shadowParity: true, deterministic: true,
      },
    ]);

    const serialized = JSON.stringify(aggregates);
    expect(serialized).not.toContain('"formattedText"');
    expect(serialized).not.toContain('"summaryText"');
    expect(serialized).not.toContain('"chord"');
    expect(serialized).not.toContain('"filename"');
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain('"fingerprint"');
  });
});
