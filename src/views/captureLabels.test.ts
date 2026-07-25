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
    // `ambiguous-bass` fires on a close overall score, not on bass evidence, so
    // the label says that rather than describing a bass problem that may not
    // exist. The key itself is unchanged for compatibility with saved memos.
    expect(warningLabel("ambiguous-bass", "ja")).toBe("候補が僅差");
    expect(warningLabel("sparse-notes", "en")).toBe("Sparse notes; review recommended");
    expect(warningLabel("unknown-warning-key", "en")).toBe("Unknown Warning Key");
  });

  it("labels the warning the analyzer actually emits for sparse windows", () => {
    // The analyzer emits `sparse-evidence`; the map previously only knew
    // `sparse-notes`, so the Japanese UI showed humanised English.
    expect(warningLabel("sparse-evidence", "ja")).toBe("音数が少ないため要確認");
    expect(warningLabel("sparse-evidence", "en")).toBe("Sparse notes; review recommended");
  });

  it("explains the phase4 warnings rather than only flagging them", () => {
    expect(warningLabel("missing-quality-defining-tone", "ja"))
      .toBe("3rdなど和音を決める音が鳴っていない");
    expect(warningLabel("ambiguous-quality", "ja")).toBe("メジャーかマイナーか判別しにくい");
  });
});
