import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

/**
 * P23-18: the small Live MIDI window, checked in the browser preview (no MIDI device in the test browser).
 */
const preview = (page: Page) => page.getByTestId("live-midi-web-preview");
const mini = (page: Page) => preview(page).locator(".lv-live-mini");

const settle = (page: Page) => page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
  .map((animation) => animation.finished.catch(() => undefined))));

async function openPreview(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="live-midi"]').click();
  await expect(preview(page)).toBeVisible();
  await settle(page);
}

test("L1 the mini window fits the preview box", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);
  const box = (await preview(page).boundingBox())!;
  const inside = (await mini(page).boundingBox())!;
  expect(inside.y + inside.height).toBeLessThanOrEqual(box.y + box.height + 1);
  expect(inside.height).toBeLessThanOrEqual(260);
});

test("L2 the no-device screen still shows the keys and a disabled save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);
  await expect(page.getByTestId("live-midi-mini-no-device")).toBeVisible();
  const box = (await preview(page).boundingBox())!;
  for (const testId of ["live-midi-mini-keys", "live-midi-mini-save"]) {
    const target = page.getByTestId(testId);
    await expect(target).toBeVisible();
    const inside = (await target.boundingBox())!;
    expect(inside.y + inside.height, testId).toBeLessThanOrEqual(box.y + box.height + 1);
  }
  await expect(page.getByTestId("live-midi-mini-save")).toBeDisabled();
});

test("L3 the back button closes the preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);
  await page.getByRole("button", { name: "メイン画面を表示" }).click();
  await expect(preview(page)).toHaveCount(0);
});

test("L4 the preview has no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPreview(page);
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious");
  const summary = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 12).map((node) => node.target.join(" > ")),
    count: violation.nodes.length,
  }));
  expect(blocking, `live-midi preview: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
});

test("L5 the preview fits a 768×640 window", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await openPreview(page);
  await assertNoHorizontalOverflow(page);
});
