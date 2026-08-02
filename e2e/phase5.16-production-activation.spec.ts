import { expect, test, type Page } from "@playwright/test";
import { createSavedProgression, openApp, openVault } from "./helpers/app";

async function openBassPracticeFromHome(page: Page): Promise<void> {
  await openApp(page);
  const card = page.getByTestId("bass-practice-home-card");
  await expect(card).toBeVisible();
  await card.getByRole("button").click();
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
  test.setTimeout(45_000);
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
  await bassline.getByRole("button", { name: "Review" }).click();
  await expect(bassline.getByText("Self-rated review")).toBeVisible();

  await page.getByRole("tab", { name: "Degree Echo" }).click();
  await saveOneDegreeReview(page);

  await page.locator("nav").getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByTestId("bass-practice-history")).toBeVisible();
  await page.reload();
  await page.locator("nav").getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByTestId("bass-practice-history")).toBeVisible();
});

test("Vault Detail opens Bass Practice in the production default", async ({ page }) => {
  test.setTimeout(45_000);
  await openApp(page);
  await createSavedProgression(page, "P5.16 production activation");
  await openVault(page);
  const row = page.locator(".lv-vault-row").first();
  await row.getByRole("button", { name: /Open progression|進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await detail.getByRole("button", { name: /Practice|練習する/ }).click();
  await expect(page.getByTestId("degree-echo-view")).toBeVisible();
});