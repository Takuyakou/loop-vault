import { expect, test, type Page } from "@playwright/test";
import { openApp, openBassPractice } from "./helpers/app";

/**
 * P23-62 S6: a PC with no input device. Only the permission prompt is auto-accepted — no fake device is added — so
 * Chromium has no audio input; the take cannot record and the stage offers 「録らずに評価する」 instead.
 */
// The permission is granted, but there is no device to use (the fake device flag is deliberately absent).
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream"] } });

const degree = (page: Page) => page.getByTestId("degree-echo-view");

async function openDegree(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await openBassPractice(page, "度数");
  await expect(degree(page)).toBeVisible();
}

test("S6 度数: the take cannot record and the player rates it instead", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDegree(page);
  const view = degree(page);
  await view.locator("[data-testid='degree-listen']").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 20_000 });
  await view.locator("[data-testid='degree-record']").click();
  await expect(view).toContainText("うまく録れませんでした", { timeout: 20_000 });
  // Chromium's no-device failure arrives as a recorder start error (the auto channel resolves to mono-sum).
  await expect(view).toContainText("録音を始められませんでした。");
  await view.getByRole("button", { name: "録らずに評価する" }).click();
  await expect(view).toHaveAttribute("data-stage-step", "2");
  await expect(view).toHaveAttribute("data-practice-state", "review");
});
