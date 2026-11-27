import { expect, test, type Page } from "@playwright/test";
import { dropMidi, openApp, openCapture, waitForSidebarSettled } from "./helpers/app";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";

/**
 * P25-07 F1: the MIDI correction workspace's tool row is one line at 1280×720 with the sidebar open —
 * with the 要確認 buttons and with a range chip — and keeps its 1440 reading (the existing P23-58 B4).
 */
async function rowsOf(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".lv-cw-bar") as HTMLElement | null;
    if (!bar) return undefined;
    const groups = [...bar.querySelectorAll(".lv-cw-group")];
    return {
      rows: new Set(groups.map((group) => Math.round(group.getBoundingClientRect().top))).size,
      height: Math.round(bar.getBoundingClientRect().height),
      positionVisible: (() => {
        const time = bar.querySelector(".lv-cw-time") as HTMLElement | null;
        const box = time?.getBoundingClientRect();
        return Boolean(box && box.width > 0 && box.height > 0);
      })(),
    };
  });
}

async function openWorkspace(page: Page) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario("melody-track-8")), "p25-f1.mid");
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
  const closeButtons = page.locator("[data-toast-tone] .lv-toast-close");
  while (await closeButtons.count() > 0) await closeButtons.first().click();
}

test("P25-07 F1: one tool row at 1280×720, with the review buttons or a range chip", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openWorkspace(page);
  await waitForSidebarSettled(page);

  // With the 要確認 buttons (the fixture has review cards).
  await page.getByTestId("correction-control-bar").getByRole("button", { name: "次の要確認" }).click();
  await expect(page.locator('[data-testid="correction-card"][data-review][aria-pressed="true"]')).toHaveCount(1);
  const review = await rowsOf(page);
  expect(review?.rows).toBe(1);

  // With the range chip as well.
  const panelToggle = page.getByTestId("correction-panel-toggle");
  if (await panelToggle.isVisible()) await panelToggle.click();
  const recoToggle = page.getByTestId("correction-recommended-toggle");
  if (await recoToggle.getAttribute("aria-expanded") !== "true") await recoToggle.click();
  await page.getByTestId("correction-recommended").getByRole("button").first().click();
  await expect(page.getByTestId("correction-range-chip")).toBeVisible();
  const chip = await rowsOf(page);
  expect(chip?.rows).toBe(1);
  // One row means one control height (30px) plus the bar's own padding.
  expect(chip!.height).toBeLessThanOrEqual(50);
});

test("P25-07 F1: 1440 keeps the reading it had (one row, the position shown)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // The compressed step belongs to 1280 only: at 1440 the bar keeps its full words and the position.
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario("plain-8")), "p25-f1-1440.mid");
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
  await waitForSidebarSettled(page);
  const rows = await rowsOf(page);
  expect(rows?.rows).toBe(1);
  expect(rows?.positionVisible).toBe(true);
  expect(rows!.height).toBeLessThanOrEqual(50);
});
