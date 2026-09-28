import { describe, expect, it } from "vitest";
import { confidenceLabel, describeBlockMemo, shouldShowConfidence, warningLabel } from "./captureLabels";

describe("capture labels", () => {
  it("rounds confidence into user-facing labels", () => {
    expect(confidenceLabel(0.95)).toBe("高");
    expect(confidenceLabel(0.65)).toBe("中");
    expect(confidenceLabel(0.2)).toBe("要確認");
    expect(shouldShowConfidence(0.95)).toBe(false);
    expect(shouldShowConfidence(0.65)).toBe(true);
  });

  it("maps warning keys without leaking raw internal labels", () => {
    // `ambiguous-bass` fires on a close overall score, not on bass evidence, so
    // the label says that rather than describing a bass problem that may not
    // exist. The key itself is unchanged for compatibility with saved memos.
    expect(warningLabel("ambiguous-bass")).toBe("候補が僅差");
    expect(warningLabel("sparse-notes")).toBe("音数が少ないため要確認");
    // P8.9-09: unknown ids no longer leak as humanised English.
    expect(warningLabel("unknown-warning-key")).toBe("要確認");
    expect(warningLabel("入力内容を確認")).toBe("入力内容を確認");
    // Saved block memos made of analyzer ids read as reasons; hand-written memos stay.
    expect(describeBlockMemo("ambiguous-bass; sparse-evidence")).toBe("候補が僅差、音数が少ないため要確認");
    expect(describeBlockMemo("サビ前; ambiguous-bass")).toBe("サビ前; ambiguous-bass");
  });

  it("keeps a memo unchanged unless every part is a known warning id", () => {
    expect(describeBlockMemo("verse-2")).toBe("verse-2");
    expect(describeBlockMemo("ambiguous-bass; verse-2")).toBe("ambiguous-bass; verse-2");
    expect(describeBlockMemo("unknown-new-id")).toBe("unknown-new-id");
    expect(describeBlockMemo("constructor")).toBe("constructor");
    expect(describeBlockMemo("low-confidence")).toBe("コード候補が不安定");
  });

  it("labels the warning the analyzer actually emits for sparse windows", () => {
    // The analyzer emits `sparse-evidence`; the map previously only knew
    // `sparse-notes`, so the Japanese UI showed humanised English.
    expect(warningLabel("sparse-evidence")).toBe("音数が少ないため要確認");
    expect(warningLabel("sparse-evidence")).toBe("音数が少ないため要確認");
  });

  it("explains the phase4 warnings rather than only flagging them", () => {
    expect(warningLabel("missing-quality-defining-tone"))
      .toBe("3rdなど和音を決める音が鳴っていない");
    expect(warningLabel("ambiguous-quality")).toBe("メジャーかマイナーか判別しにくい");
  });
});
