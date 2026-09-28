import { expect, test, type Page } from "@playwright/test";
import { createSavedProgression, openApp, openVault } from "./helpers/app";

// P8.9-04: an empty Vault's Home shows only the first-capture guide, so Bass Practice opens from the sidebar.
async function openBassPracticeFromHome(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("degree-echo-view")).toBeVisible();
}

async function saveOneDegreeReview(page: Page): Promise<void> {
  const view = page.getByTestId("degree-echo-view");
  const primary = view.locator("[data-primary-action]");
  await primary.click();
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "singing");
  await expect(primary).toBeEnabled({ timeout: 10_000 });
  await primary.click();
  await primary.click();
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "review");
  await view.locator("[data-review-rating='good']").click();
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "transfer-offer");
}

test("production defaults expose and start every shipped Bass Practice mode without test flag injection", async ({ page }) => {
  test.setTimeout(60_000);
  await openBassPracticeFromHome(page);
  await expect(page.getByRole("tab", { name: "Degree Echo" })).toBeVisible();
  await page.getByRole("tab", { name: "Rhythm Echo" }).click();
  const rhythm = page.getByTestId("rhythm-echo-view");
  await expect(rhythm).toBeVisible();
  await rhythm.locator("[data-primary-action]").click();
  await expect(rhythm).not.toHaveAttribute("data-practice-state", "ready");

  await page.getByRole("tab", { name: "Bassline Echo" }).click();
  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await bassline.getByTestId("bassline-listen").click();
  await expect(bassline.getByTestId("bassline-listen")).toHaveText(/^(停止)$/, { timeout: 10_000 });
  await bassline.getByTestId("bassline-listen").click();
  await bassline.getByRole("button", { name: /^(レビュー)$/ }).click();
  await expect(bassline.getByTestId("record-accompaniment")).toBeVisible();
  await expect(bassline.getByTestId("chord-context-history-save")).toBeVisible();

  await page.getByRole("tab", { name: "Degree Echo" }).click();
  await saveOneDegreeReview(page);

  // P8.9-04: the saved review survives a reload and counts in Home's 今日の練習
  // (shown once the Vault has a progression; the browser Vault is in memory, so save one after the reload).
  await page.reload();
  await createSavedProgression(page, "Home practice card");
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("bass-practice-home-card")).toContainText(/今日 [1-9]\d*問/);
});

test("Vault Detail opens Bass Practice in the production default", async ({ page }) => {
  test.setTimeout(45_000);
  await openApp(page);
  await createSavedProgression(page, "P5.16 production activation");
  await openVault(page);
  const row = page.locator(".lv-vault-row").first();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await detail.getByRole("button", { name: /練習する/ }).click();
  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await expect(bassline.getByTestId("bassline-source")).toContainText(/Vault進行/);
});
