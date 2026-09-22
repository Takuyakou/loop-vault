import { describe, expect, it } from "vitest";

import { progressionFixture } from "../p534/fixtures";
import { stage01ShadowAggregate } from "./stage01ShadowAudit";

describe("P5.38-01 privacy-safe shadow aggregate", () => {
  it("reports frozen synthetic parity and improvement without chord transcription", () => {
    const aggregates = [4, 3, 2, 1].map((numerator) =>
      stage01ShadowAggregate(progressionFixture(numerator, 4)));
    expect(aggregates.map((aggregate) => ({
      meter: aggregate.sourceMeter,
      applied: aggregate.applied,
      sourceGroups: aggregate.sourceGroupCount,
      legacyFormatted: aggregate.legacyFormattedGroupCount,
      projectedFormatted: aggregate.projectedFormattedGroupCount,
      legacyDashes: aggregate.legacyDashCount,
      projectedDashes: aggregate.projectedDashCount,
      identityDiffs: aggregate.harmonicIdentityDifferenceCount,
      roundTrip: aggregate.sourceCoordinateRoundTrip,
      blocksCoherent: aggregate.blockTopologyCoherent,
      deterministic: aggregate.deterministic,
    }))).toEqual([
      {
        meter: "4/4", applied: false, sourceGroups: 2,
        legacyFormatted: 2, projectedFormatted: 2,
        legacyDashes: 0, projectedDashes: 0,
        identityDiffs: 0, roundTrip: true, blocksCoherent: true, deterministic: true,
      },
      {
        meter: "3/4", applied: false, sourceGroups: 3,
        legacyFormatted: 3, projectedFormatted: 3,
        legacyDashes: 0, projectedDashes: 0,
        identityDiffs: 0, roundTrip: true, blocksCoherent: true, deterministic: true,
      },
      {
        meter: "2/4", applied: false, sourceGroups: 4,
        legacyFormatted: 4, projectedFormatted: 4,
        legacyDashes: 0, projectedDashes: 0,
        identityDiffs: 0, roundTrip: true, blocksCoherent: true, deterministic: true,
      },
      {
        meter: "1/4", applied: true, sourceGroups: 8,
        legacyFormatted: 7, projectedFormatted: 4,
        legacyDashes: 3, projectedDashes: 0,
        identityDiffs: 0, roundTrip: true, blocksCoherent: true, deterministic: true,
      },
    ]);
    const serialized = JSON.stringify(aggregates);
    expect(serialized).not.toContain('"formattedText"');
    expect(serialized).not.toContain('"summaryText"');
    expect(serialized).not.toContain('"chord"');
    expect(serialized).not.toContain('"filename"');
    expect(serialized).not.toContain('"path"');
  });
});
