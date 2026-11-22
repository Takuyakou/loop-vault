import { expect, test, type Page } from "@playwright/test";
import { createSavedProgression, openApp, openVault, openBassPractice } from "./helpers/app";
import { bassPracticeFromVault } from "./helpers/practice";

// P8.9-04: an empty Vault's Home shows only the first-capture guide, so Bass Practice opens from the sidebar.
// P23-25 P1: the sidebar path lands on the home that picks a practice; 度数 is its first card.
async function openBassPracticeFromHome(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator("[data-testid='bass-home-card'][data-mode='degree']")).toBeVisible();
}

/**
 * P23-62: 度数 on the shared stage — listen, play it without a take (no microphone is needed for this flow),
 * look at the answer, rate it, then move to the next phrase. The rating is what saves the attempt, so the
 * 今日 count the test checks afterwards depends on it.
 */
async function saveOneDegreeReview(page: Page): Promise<void> {
  const view = page.getByTestId("degree-echo-view");
  await expect(view).toHaveAttribute("data-practice-state", "ready");
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 20_000 });
  await expect(view.getByTestId("degree-record")).toBeEnabled();

  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review");
  await expect(view).toHaveAttribute("data-stage-step", "2");
  await expect(view.locator("[data-review-rating][aria-pressed='true']")).toHaveCount(0);

  await view.locator("[data-review-rating='good']").click();
  await expect(view.getByTestId("degree-next")).toBeEnabled();
  await view.getByTestId("degree-next").click();
  await expect(view).toHaveAttribute("data-practice-state", "ready", { timeout: 20_000 });
}

test("production defaults expose and start every shipped Bass Practice mode without test flag injection", async ({ page }) => {
  test.setTimeout(60_000);
  await openBassPracticeFromHome(page);
  await expect(page.locator("[data-testid='bass-home-card'][data-mode='degree']")).toBeVisible();

  // P23-62: リズム is on the shared stage; starting it means listening to the rhythm.
  await openBassPractice(page, "リズム");
  const rhythm = page.getByTestId("rhythm-echo-view");
  await expect(rhythm).toBeVisible();
  await expect(rhythm).toHaveAttribute("data-practice-state", "ready");
  await rhythm.getByTestId("rhythm-listen").click();
  await expect(rhythm).toHaveAttribute("data-practice-state", "heard", { timeout: 20_000 });
  await expect(rhythm.getByTestId("rhythm-record")).toBeEnabled();

  await openBassPractice(page, "コード進行のベース");
  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await bassline.getByTestId("bassline-listen").click();
  await expect(bassline.getByTestId("bassline-listen")).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await bassline.getByTestId("bassline-listen").click();
  await expect(bassline.getByTestId("bassline-listen")).toHaveAttribute("aria-label", "お手本を聴く");
  // P23-63: 録らずに弾く -> 答えを見る leads to 3 結果 (記録して次へ), while the accompaniment selector lives in 条件.
  await bassline.getByTestId("bassline-play-without-take").click();
  await expect(bassline).toHaveAttribute("data-stage-step", "1");
  await bassline.getByTestId("bassline-show-answer").click();
  await expect(bassline).toHaveAttribute("data-stage-step", "2");
  await expect(bassline.getByTestId("bassline-next")).toBeVisible();
  await page.getByTestId("bassline-conditions").click();
  await expect(page.getByTestId("chord-context-play-mode")).toBeVisible();
  await page.getByTestId("bassline-conditions").click();

  await openBassPractice(page, "度数");
  await saveOneDegreeReview(page);

  // P8.9-04: the saved review survives a reload and counts in Home's 今日の練習
  // (shown once the Vault has a progression; the browser Vault is in memory, so save one after the reload).
  await page.reload();
  await createSavedProgression(page, "Home practice card");
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("bass-practice-home-card")).toContainText(/今日 [1-9]\d* 回/);
});

test("Vault Detail opens Bass Practice in the production default", async ({ page }) => {
  test.setTimeout(45_000);
  await openApp(page);
  await createSavedProgression(page, "P5.16 production activation");
  await openVault(page);
  const row = page.locator(".lv-vault-row").first();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await bassPracticeFromVault(page, "P5.16 production activation");
  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await expect(page.getByTestId("bassline-conditions")).toContainText(/Vault進行/);
  await expect(page.getByTestId("bassline-progression-select")).toHaveValue("vault");
});
