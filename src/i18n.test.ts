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

});

describe("Phase 3.6.4 terminology", () => {
  it("uses the approved Japanese product terms", () => {
    expect(appCopy.ja.nav.library).toBe("Vault");
    expect(appCopy.ja.library.idea).toBe("Idea");
    expect(appCopy.ja.library.progression).toBe("進行");
    expect(appCopy.ja.home.nextAction).toBe("次の一手");
    expect(appCopy.ja.nav.capture).toBe("コード採集");
    expect(appCopy.ja.detail.assets).toBe("関連ファイル");
    expect(appCopy.ja.library.bars(8)).toBe("8小節");
    expect(appCopy.ja.library.all).toBe("すべて");
    expect(appCopy.ja.library.genre).toBe("ジャンル");
    expect(appCopy.ja.library.mood).toBe("ムード");
    expect(appCopy.ja.status.hold).toBe("保留");
    expect(appCopy.ja.status.abandoned).toBe("没");
  });

  it("localizes major placeholders and accessible labels", () => {
    expect(appCopy.ja.library.searchPlaceholder).toContain("タグで検索");
    expect(appCopy.ja.detail.placeholders.genre).toBe("ジャンル");
    expect(appCopy.ja.library.openIdea).toBe("Ideaを開く");
    expect(appCopy.ja.detail.nextActionPlaceholders).toHaveLength(4);
    expect(appCopy.ja.detail.nextActionPlaceholders).toContain("ベースを差し替える");
    expect(appCopy.ja.detail.capturedMidi).toBe("採集したMIDI");
    expect(appCopy.ja.detail.barRange(2, 5)).toBe("2–5小節");
  });
});
