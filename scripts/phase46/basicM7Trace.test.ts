import { describe, expect, it } from "vitest";
import { classifyBasicM7Trace, type BasicM7TraceSignals } from "./basicM7Trace";

const complete: BasicM7TraceSignals = {
  representable: true,
  rootHypothesisPresent: true,
  minorSeventhCoreGenerated: true,
  rootPositionGenerated: true,
  slashIdentityGenerated: false,
  canonicalRoundTrip: true,
  presentBeforeClamp: true,
  presentAfterBudget: true,
  evidenceSupportsGold: true,
};

describe("Phase 4.6 basic m7 trace classification", () => {
  it("identifies forced slash generation before evidence concerns", () => {
    expect(classifyBasicM7Trace({
      ...complete,
      rootPositionGenerated: false,
      slashIdentityGenerated: true,
    })).toBe("slash-only-generated");
  });

  it("keeps root and core failures separate", () => {
    expect(classifyBasicM7Trace({
      ...complete,
      rootHypothesisPresent: false,
    })).toBe("root-hypothesis-missing");
    expect(classifyBasicM7Trace({
      ...complete,
      minorSeventhCoreGenerated: false,
    })).toBe("core-not-generated");
  });
});
