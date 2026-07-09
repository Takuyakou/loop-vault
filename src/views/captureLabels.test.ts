import { describe, expect, it } from "vitest";
import { confidenceLabel, shouldShowConfidence, warningLabel } from "./captureLabels";

describe("capture labels", () => {
  it("rounds confidence into user-facing labels", () => {
    expect(confidenceLabel(0.95, "ja")).toBe("高");
    expect(confidenceLabel(0.65, "ja")).toBe("中");
    expect(confidenceLabel(0.2, "ja")).toBe("要確認");
    expect(shouldShowConfidence(0.95)).toBe(false);
    expect(shouldShowConfidence(0.65)).toBe(true);
  });

  it("maps warning keys without leaking raw internal labels", () => {
    expect(warningLabel("ambiguous-bass", "ja")).toBe("低音の解釈に注意");
    expect(warningLabel("sparse-notes", "en")).toBe("Sparse notes; review recommended");
    expect(warningLabel("unknown-warning-key", "en")).toBe("Unknown Warning Key");
  });
});
