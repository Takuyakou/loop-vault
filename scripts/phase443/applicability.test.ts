import { describe, expect, it } from "vitest";
import type { SupportEvaluationRow } from "../phase442/supportEvaluation";
import { classifyApplicability } from "./applicability";

const base = {
  mode: "block",
  evidence: {
    productRole: "melody",
    roleConfidence: 1,
    hasHarmonyVoice: true,
    supportPitchCount: 1,
  },
} as Pick<SupportEvaluationRow, "mode" | "evidence">;

describe("Phase 4.4.3 applicability classification", () => {
  it("classifies supported melody events as H", () => {
    expect(classifyApplicability(base, {
      minimumRoleConfidence: 0.65,
    }).class).toBe("H");
  });

  it("classifies missing support as N after role eligibility passes", () => {
    expect(classifyApplicability({
      ...base,
      evidence: {
        ...base.evidence,
        hasHarmonyVoice: false,
        supportPitchCount: 0,
      },
    }, {
      minimumRoleConfidence: 0.65,
    }).class).toBe("N");
  });

  it("gives X precedence for all-channel-zero role diagnostics", () => {
    expect(classifyApplicability({
      ...base,
      mode: "allch0",
      evidence: {
        ...base.evidence,
        hasHarmonyVoice: false,
        supportPitchCount: 0,
      },
    }, {
      minimumRoleConfidence: 0.65,
    }).class).toBe("X");
  });
});
