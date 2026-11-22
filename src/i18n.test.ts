import { describe, expect, it } from "vitest";
import { appCopy } from "./i18n";

describe("Phase 3.6.4 terminology", () => {
  it("uses the approved Japanese product terms", () => {
    expect(appCopy.ja.nav.library).toBe("Vault");
    expect(appCopy.ja.library.idea).toBe("曲");
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
    expect(appCopy.ja.library.openIdea).toBe("曲を開く");
    expect(appCopy.ja.detail.nextActionPlaceholders).toHaveLength(4);
    expect(appCopy.ja.detail.nextActionPlaceholders).toContain("ベースを差し替える");
    expect(appCopy.ja.detail.capturedMidi).toBe("採集したMIDI");
    expect(appCopy.ja.detail.barRange(2, 5)).toBe("2–5小節");
  });
});

describe("P23-02 words", () => {
  it("no Japanese copy says Idea any more (the stage name aside)", () => {
    const found: string[] = [];
    const visit = (value: unknown, path: string) => {
      if (typeof value === "string") {
        if (value.includes("Idea") && path !== "status.idea") found.push(`${path}: ${value}`);
      } else if (typeof value === "function") {
        let text: unknown;
        try { text = (value as (...args: unknown[]) => unknown)(1); } catch { return; }
        if (typeof text === "string") visit(text, path);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}[${index}]`));
      } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key);
      }
    };
    visit(appCopy.ja, "");
    expect(found).toEqual([]);
  });
});
