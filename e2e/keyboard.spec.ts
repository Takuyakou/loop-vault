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
  const skip = page.getByRole("link", { name: /メインコンテンツ/i });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const capture = page.locator('[data-nav="capture"]');
  await capture.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-capture-stage="empty"]')).toBeVisible();

  // P8.9-08: Settings is a screen, not a dialog.
  const settings = page.getByRole("button", { name: /設定/ }).first();
  await settings.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("settings-view")).toBeVisible();
  await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "設定");
});

test("ダイアログはフォーカスを閉じ込め、Escape後に起点へ戻す", async ({ page }) => {
  await openApp(page);
  // P8.9-08: Settings became a screen; its confirmation dialog carries the focus-trap check.
  await page.locator('[data-nav="settings"]').click();
  const settingsView = page.getByTestId("settings-view");
  await settingsView.locator("#settings-developer button[aria-expanded]").click();
  const opener = settingsView.getByRole("button", { name: "修正ログを削除" });
  await opener.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: /修正ログを削除/ });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole("button", { name: /キャンセル/ });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await expect(cancel).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Voice選択、プリセット、Solo、解析、保存する範囲の選択をキーボード操作できる", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 4 }), "keyboard-flow.mid");

  const details = page.getByRole("button", { name: /パート詳細/ });
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

  // P10.0-07: the workspace — a recommended range by keyboard opens the save form; → moves the card.
  const workspace = page.getByTestId("correction-workspace");
  const recommended = workspace.getByTestId("correction-recommended").getByRole("button").first();
  await recommended.focus();
  await page.keyboard.press("Enter");
  await expect(workspace.getByTestId("correction-save-form")).toBeVisible();
  const selected = workspace.locator('[data-testid="correction-card"][aria-pressed="true"]');
  const before = await selected.getAttribute("data-card-id");
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("ArrowRight");
  await expect(selected).not.toHaveAttribute("data-card-id", before ?? "");
});

test("保存、Vault検索、詳細、Dojo開始をキーボードで辿れる", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Keyboard Saved Progression");
  await openVault(page);

  await page.locator("#main-content").focus();
  await page.keyboard.press("/");
  const search = page.getByRole("textbox", { name: /検索/ });
  await expect(search).toBeFocused();
  await search.fill("Keyboard Saved");
  await page.keyboard.press("Escape");
  await expect(search).not.toBeFocused();

  const open = page.locator(".lv-vault-row").first()
    .getByRole("button", { name: /進行を開く/ });
  await open.focus();
  await page.keyboard.press("Enter");
  const practice = page.locator("[data-progression-detail-view]")
    .getByRole("button", { name: /練習する/ });
  await practice.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const dojo = page.locator('[data-nav="chord-dojo"]');
  await dojo.focus();
  await expect(dojo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dojo).toHaveAttribute("aria-current", "page");
  const start = page.getByTestId("practice-start");
  await expect(start).toBeVisible();
  if (await start.isEnabled()) {
    await start.focus();
    await page.keyboard.press("Enter");
  }
});

async function analyzeCurrentMidiResult(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
}
