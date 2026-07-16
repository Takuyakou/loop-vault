import { describe, expect, it } from "vitest";
import { appCopy } from "./i18n";

describe("status control copy", () => {
  it("provides complete Japanese pipeline and confirmation copy", () => {
    const copy = appCopy.ja.detail.statusControl;

    expect(copy.current(appCopy.ja.status.loop)).toBe("現在: ループ");
    expect(copy.next(appCopy.ja.status.arrange)).toBe("展開へ進む");
    expect(copy.restore(appCopy.ja.status.mix)).toBe("ミックスへ復帰");
    expect(copy.uncomplete).toBe("完成を解除してミックスへ");
    expect(copy.carryTitle).toBe("移動後も次の一手を持ち越しますか？");
    expect(copy.keepAndContinue).toBe("持ち越して移動");
  });

  it("provides complete English pipeline and confirmation copy", () => {
    const copy = appCopy.en.detail.statusControl;

    expect(copy.current(appCopy.en.status.loop)).toBe("Current: Loop");
    expect(copy.next(appCopy.en.status.arrange)).toBe("Move to Arrange");
    expect(copy.restore(appCopy.en.status.mix)).toBe("Restore to Mix");
    expect(copy.uncomplete).toBe("Reopen in Mix");
    expect(copy.carryTitle).toBe("Keep the Next Action after this move?");
    expect(copy.clearAndContinue).toBe("Clear and move");
  });
});
