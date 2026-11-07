import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P17-01 report screenshots. Daily runs (test:full included) write under p89-generated, which git does not track;
 * UPDATE_REPORT_SCREENSHOTS=1 writes into the tracked docs/reports folder instead (run it explicitly to refresh the report). */
const dir = process.env.UPDATE_REPORT_SCREENSHOTS === "1" ? "docs/reports/p17-01" : "p89-generated/report-screenshots/p17-01";

async function capture(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
}

test("P17-01 screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture(page, "plain-8");
  await page.getByTestId("correction-card").nth(1).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "カードの操作" })).toBeVisible();
  await page.screenshot({ path: `${dir}/capture-menu-1440x900.png` });
  await page.keyboard.press("Escape");
  await page.getByTestId("correction-card").nth(1).click();
  await page.keyboard.press("Delete");
  await page.screenshot({ path: `${dir}/capture-after-delete-1440x900.png` });

  await page.setViewportSize({ width: 1280, height: 720 });
  await capture(page, "melody-track-8");
  await page.locator('[data-testid="correction-card"][data-review]').first().click();
  await expect(page.getByTestId("correction-review-reason").first()).toBeVisible();
  await page.screenshot({ path: `${dir}/capture-panel-1280x720.png` });
  await page.setViewportSize({ width: 1660, height: 1035 });
  await page.screenshot({ path: `${dir}/capture-panel-1660x1035.png` });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?p104=normal");
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
  await page.getByTestId("correction-card").nth(1).click({ button: "right" });
  await expect(page.getByRole("menu", { name: "カードの操作" })).toBeVisible();
  await page.screenshot({ path: `${dir}/progression-menu-1280x720.png` });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${dir}/progression-panel-1280x720.png` });
});
