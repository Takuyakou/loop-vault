import { expect, test } from "@playwright/test";
import {
  createSavedProgression,
  loadMidiForPreAnalysis,
  openApp,
  openVault,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

test("スキップリンク、主ナビゲーション、設定をキーボードだけで操作できる", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /メインコンテンツ|main content/i });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const capture = page.locator("nav").getByRole("button", { name: /コード採集|Capture/ });
  await capture.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-capture-stage="empty"]')).toBeVisible();

  const settings = page.getByRole("button", { name: /設定|Settings/ }).first();
  await settings.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /設定|Settings/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settings).toBeFocused();
});

test("ダイアログはフォーカスを閉じ込め、Escape後に起点へ戻す", async ({ page }) => {
  await openApp(page);
  const ideaButton = page.getByRole("button", { name: "Idea", exact: true });
  await ideaButton.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: /新しいIdea|Create idea/i });
  await expect(dialog).toBeVisible();
  const title = dialog.locator('input[name="idea-title"]');
  await expect(title).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: /閉じる|Close/ })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: /作成|Create/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(ideaButton).toBeFocused();
});

test("Voice選択、プリセット、Solo、解析、候補選択をキーボード操作できる", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 4 }), "keyboard-flow.mid");

  const details = page.getByRole("button", { name: /パート詳細|Part details/ });
  if (await details.getAttribute("aria-expanded") !== "true") {
    await details.focus();
    await page.keyboard.press("Enter");
  }
  const custom = page.locator('[data-analysis-preset="custom"]');
  await custom.focus();
  await page.keyboard.press("Enter");
  await expect(custom).toHaveAttribute("aria-checked", "true");

  const firstVoice = page.locator("[data-voice-id]").first();
  const solo = firstVoice.getByRole("button", { name: /Solo/ });
  await solo.focus();
  await page.keyboard.press("Enter");
  await expect(solo).toHaveAttribute("aria-pressed", "true");

  const role = firstVoice.getByRole("combobox");
  await role.focus();
  await role.selectOption("harmony");
  await expect(role).toHaveValue("harmony");

  const analyze = page.getByTestId("pre-analysis-analyze");
  await analyze.focus();
  await page.keyboard.press("Enter");
  await analyzeCurrentMidiResult(page);

  const candidate = page.locator("[data-candidate-toggle]").first();
  await candidate.focus();
  await page.keyboard.press("Enter");
  await expect(candidate).toHaveAttribute("aria-expanded", "true");
});

test("保存、Vault検索、詳細、Dojo開始をキーボードで辿れる", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Keyboard Saved Progression");
  await openVault(page);

  await page.locator("#main-content").focus();
  await page.keyboard.press("/");
  const search = page.getByRole("textbox", { name: /検索|Search/ });
  await expect(search).toBeFocused();
  await search.fill("Keyboard Saved");
  await page.keyboard.press("Escape");
  await expect(search).not.toBeFocused();

  const open = page.locator(".lv-vault-row").first()
    .getByRole("button", { name: /進行を開く|Open progression/ });
  await open.focus();
  await page.keyboard.press("Enter");
  const practice = page.locator("[data-progression-detail-view]")
    .getByRole("button", { name: /練習する|Practice/ });
  await practice.focus();
  await page.keyboard.press("Enter");
  const dojo = page.getByRole("tab", { name: "Chord Dojo" });
  await dojo.focus();
  await page.keyboard.press("ArrowLeft");
  const start = page.getByTestId("practice-start");
  await expect(start).toBeVisible();
  if (await start.isEnabled()) {
    await start.focus();
    await page.keyboard.press("Enter");
  }
});

async function analyzeCurrentMidiResult(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
  await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
}
