import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P17-02 report screenshots. Daily runs (test:full included) write under p89-generated, which git does not track;
 * UPDATE_REPORT_SCREENSHOTS=1 writes into the tracked docs/reports folder instead (run it explicitly to refresh the report). */
const dir = process.env.UPDATE_REPORT_SCREENSHOTS === "1" ? "docs/reports/p17-02" : "p89-generated/report-screenshots/p17-02";

async function clearToasts(page: Page) {
  for (let index = 0; index < 8; index += 1) {
    const closes = page.locator(".lv-toast-close");
    if (await closes.count() === 0) return;
    await closes.first().click();
  }
}

async function capture(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
  // The analysis notices would otherwise sit in the corner of the report photos.
  await page.waitForTimeout(400);
  await clearToasts(page);
}

const barNumber = (page: Page, bar: number) => page.getByTestId("correction-ruler").locator(".lv-cw-bar-no").filter({ hasText: new RegExp(`^${bar}$`) });

test("P17-02 screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture(page, "plain-8");
  await barNumber(page, 2).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "小節の操作" })).toBeVisible();
  await page.screenshot({ path: `${dir}/bar-menu-1440x900.png` });
  await page.getByTestId("correction-bar-cut").click();
  await expect(page.getByTestId("correction-card")).toHaveCount(7);
  await page.screenshot({ path: `${dir}/after-cut-1440x900.png` });

  await capture(page, "stabs-8");
  await page.getByTestId("correction-card").nth(0).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "カードの操作" })).toBeVisible();
  await page.screenshot({ path: `${dir}/card-menu-cut-1440x900.png` });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTestId("correction-card").nth(0).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "カードの操作" })).toBeVisible();
  await page.screenshot({ path: `${dir}/card-menu-cut-1280x720.png` });
});
