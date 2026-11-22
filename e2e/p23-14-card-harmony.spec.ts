import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { createSavedProgression, dropMidi, openApp, openCapture } from "./helpers/app";

/**
 * P23-14: the degree and the role colour of the chord cards (`.lv-cw-card`), in the correction workspace and on
 * the progression page.
 */
const ROLE_COLOURS = {
  T: "rgb(106, 168, 255)",
  SD: "rgb(245, 220, 74)",
  SDm: "rgb(245, 220, 74)",
  D: "rgb(255, 107, 125)",
} as const;

const settle = (page: Page) => page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
  .map((animation) => animation.finished.catch(() => undefined))));

async function importScenario(page: Page, id = "plain-8", options: { fresh?: boolean } = {}) {
  // `fresh: false` keeps the app as it is (a setting changed on the settings screen stays).
  if (options.fresh !== false) await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
  await settle(page);
}

test("E1 the cards show their degree and role", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importScenario(page);
  const marks = page.getByTestId("correction-card-harmony");
  expect(await marks.count()).toBeGreaterThan(0);
  const roles = await marks.evaluateAll((items) => items.map((item) => item.getAttribute("data-fn")));
  expect(roles.length).toBeGreaterThan(0);
  expect(roles.every((role) => role === "T" || role === "SD" || role === "SDm" || role === "D")).toBe(true);
});

test("E2 the colour sits on the degree only, not on the card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importScenario(page);
  const marks = page.getByTestId("correction-card-harmony");
  const count = await marks.count();
  for (let index = 0; index < count; index += 1) {
    const mark = marks.nth(index);
    const role = (await mark.getAttribute("data-fn")) as keyof typeof ROLE_COLOURS;
    await expect(mark).toHaveCSS("color", ROLE_COLOURS[role]);
    const card = page.getByTestId("correction-card").nth(index);
    const border = await card.evaluate((element) => getComputedStyle(element).borderTopColor);
    expect(border, `card ${index}`).not.toBe(ROLE_COLOURS[role]);
  }
});

test("E3 turning the degrees off keeps the dots", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.locator('[data-nav="settings"]').click();
  // P23-26 S4: the setting is the shared switch now (the same checked state, read from aria-checked).
  const toggle = page.getByRole("switch", { name: /コードカードに度数を表示/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await importScenario(page, "plain-8", { fresh: false });
  await expect(page.locator(".lv-cw-harmony-degree")).toHaveCount(0);
  expect(await page.locator(".lv-cw-harmony-dot").count()).toBeGreaterThan(0);
});

test("E4 a very narrow card does not show the mark", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // 64 bars: the narrowest cards are `tiny` (14–39px) already.
  await importScenario(page, "long-64");
  const tiny = page.locator("[data-testid='correction-card'][data-size='tiny']");
  await expect(tiny.first()).toBeVisible();
  const mark = tiny.first().getByTestId("correction-card-harmony");
  await expect(mark).toBeHidden();
});

test("E5 the progression page shows the degree too", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await createSavedProgression(page, "P23-14 Harmony");
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: "進行を開く" }).click();
  await expect(page.locator("[data-progression-detail-view]")).toBeVisible();
  await settle(page);
  expect(await page.getByTestId("correction-card-harmony").count()).toBeGreaterThan(0);
});

test("E6 the result screen has no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importScenario(page);
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious");
  const summary = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 8).map((node) => node.target.join(" > ")),
    count: violation.nodes.length,
  }));
  expect(blocking, `analysis: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
});
