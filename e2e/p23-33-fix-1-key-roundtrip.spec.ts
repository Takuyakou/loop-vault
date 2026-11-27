import { expect, test, type Page } from "@playwright/test";
import { openTextCapture, chooseTextSetting } from "./helpers/app";

/**
 * P23-33-fix-1: browser verification for automatic and manual keys across standard text,
 * extended text, Vault save, and screen navigation (Home -> Vault -> open again).
 * File persistence round-trip is verified by `src/store/vaultStore.test.ts`.
 */

async function openSavedProgressionFromVault(page: Page, name: string) {
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  const preview = page.getByTestId("vault-preview");
  if (!(await preview.isVisible())) {
    await row.click({ position: { x: 12, y: 12 } });
  }
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(name);
  await preview.getByRole("button", { name: /開いて編集/ }).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
  return page.locator("[data-progression-detail-view]");
}

async function leaveToHomeAndReopenFromVault(page: Page, name: string) {
  await page.locator('[data-nav="home"]').click();
  await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "ホーム");
  return openSavedProgressionFromVault(page, name);
}

test("K1: standard text C Am F G C infers C major automatically and keeps it after Vault save and navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("C Am F G C");
  await expect(capture.getByTestId("text-progression-key")).toHaveAttribute("data-value","auto");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("自動: C メジャー");
  await capture.getByTestId("text-progression-name").fill("K1 自動通常");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();

  const detail = await openSavedProgressionFromVault(page, "K1 自動通常");
  await expect(detail.locator(".lv-progression-fact").first()).toHaveText("Cメジャー");

  const detailAfterNav = await leaveToHomeAndReopenFromVault(page, "K1 自動通常");
  await expect(detailAfterNav.locator(".lv-progression-fact").first()).toHaveText("Cメジャー");
});

test("K2: the one grammar reads the extended chart and keeps its automatic key after Vault save and navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| Dm7 | G7 | Cmaj7 | Cmaj7 |");
  await expect(capture.getByTestId("text-progression-key")).toHaveAttribute("data-value","auto");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("\u81ea\u52d5: C \u30e1\u30b8\u30e3\u30fc");
  await capture.getByTestId("text-progression-name").fill("K2 \u81ea\u52d5\u62e1\u5f35");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/\u4fdd\u5b58\u3057\u307e\u3057\u305f/, { exact: true })).toBeVisible();

  const detail = await openSavedProgressionFromVault(page, "K2 \u81ea\u52d5\u62e1\u5f35");
  await expect(detail.locator(".lv-progression-fact").first()).toHaveText("C\u30e1\u30b8\u30e3\u30fc");

  const detailAfterNav = await leaveToHomeAndReopenFromVault(page, "K2 \u81ea\u52d5\u62e1\u5f35");
  await expect(detailAfterNav.locator(".lv-progression-fact").first()).toHaveText("C\u30e1\u30b8\u30e3\u30fc");
});

test("K3: manually chosen A minor is preserved without being overwritten by automatic inference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("C Am F G C");
  await chooseTextSetting(capture, "text-progression-key", "A minor");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("A マイナー");
  await capture.getByTestId("text-progression-name").fill("K3 手動キー");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();

  const detail = await openSavedProgressionFromVault(page, "K3 手動キー");
  await expect(detail.locator(".lv-progression-fact").first()).toHaveText("Aマイナー");

  const detailAfterNav = await leaveToHomeAndReopenFromVault(page, "K3 手動キー");
  await expect(detailAfterNav.locator(".lv-progression-fact").first()).toHaveText("Aマイナー");
});

test("K4: an undecidable C F# Bb E Ab stays 自動: 未確定 and saves without forcing a key", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = page.getByTestId("text-progression-capture");
  // P25 V39: relative keys are settled by the first chord; C Am F G is C major now.
  await capture.getByTestId("text-progression-input").fill("C Am F G");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("自動: C メジャー");
  await capture.getByTestId("text-progression-input").fill("Am F C G");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("自動: A マイナー");
  await capture.getByTestId("text-progression-input").fill("C F# Bb E Ab");
  await expect(capture.getByTestId("text-progression-key")).toHaveAttribute("data-value","auto");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("自動: 未確定");
  await capture.getByTestId("text-progression-name").fill("K4 未確定");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();

  const detail = await openSavedProgressionFromVault(page, "K4 未確定");
  await expect(detail.locator(".lv-progression-fact").first()).toHaveText("キー未設定");

  const detailAfterNav = await leaveToHomeAndReopenFromVault(page, "K4 未確定");
  await expect(detailAfterNav.locator(".lv-progression-fact").first()).toHaveText("キー未設定");
});
