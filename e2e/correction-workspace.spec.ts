import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P10.0-02: the display-only correction workspace behind the developer switch. */

async function importScenario(page: Page, id: string, workspace: boolean) {
  if (workspace) await page.addInitScript(() => localStorage.setItem("loop-vault:p10-workspace:v1", "on"));
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
}

async function currentScreenChordNames(page: Page): Promise<string[]> {
  const details = page.locator("details").filter({ has: page.locator('[aria-label="コード進行"]') }).first();
  if (!(await details.getAttribute("open"))) await details.locator("summary").click();
  return details.locator('[aria-label="コード進行"] button strong').allTextContents();
}

test("P10.0-02 the workspace is off by default and the current screen is unchanged", async ({ page }) => {
  await importScenario(page, "melody-track-8", false);
  await expect(page.getByTestId("correction-workspace")).toHaveCount(0);
  await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
});

test("P10.0-02 shows the same cards as the current screen, moves between them and keeps saving on the current screen", async ({ page }) => {
  await importScenario(page, "melody-track-8", true);
  const workspace = page.getByTestId("correction-workspace");
  await expect(workspace).toBeVisible();
  const workspaceNames = await workspace.getByTestId("correction-card").locator(".lv-cw-card-name").allTextContents();

  // Song-wide suggestion for the melody voice; 閉じる hides it.
  const suggestion = workspace.getByTestId("correction-suggestion");
  await expect(suggestion).toContainText("メロディの Voice（Lead）");
  await suggestion.getByRole("button", { name: "閉じる" }).click();
  await expect(suggestion).toHaveCount(0);

  // ] / [ walk the review cards; ← / → walk all cards; the inspector follows.
  const name = workspace.getByTestId("correction-inspector-name");
  const selectedName = () => workspace.locator('[data-testid="correction-card"][aria-pressed="true"] .lv-cw-card-name').textContent();
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("Escape");
  const first = await name.textContent();
  expect(await selectedName()).toBe(first);
  await page.locator("body").press("ArrowRight");
  await expect(name).not.toHaveText(first ?? "");
  expect(await name.textContent()).toBe(await selectedName());
  await page.locator("body").press("ArrowLeft");
  await expect(name).toHaveText(first ?? "");
  const position = workspace.getByTestId("correction-review-position");
  const total = Number((await position.textContent())!.split("/")[1]!.trim());
  if (total > 1) {
    const before = await position.textContent();
    await page.locator("body").press("]");
    await expect(position).not.toHaveText(before ?? "");
    await page.locator("body").press("[");
    await expect(position).toHaveText(before ?? "");
  }

  // Back to the current screen for this import: same chords, and the save flow is there.
  await workspace.getByTestId("correction-use-current-screen").click();
  await expect(page.getByTestId("correction-workspace")).toHaveCount(0);
  expect(await currentScreenChordNames(page)).toEqual(workspaceNames);
  await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
  await page.locator("[data-candidate-toggle]").first().click();
  await expect(page.getByRole("button", { name: /Vaultに保存/, exact: true }).first()).toBeVisible();
});

test("P10.0-02 a long song opens at 16 bars and the page never scrolls sideways at 768x640", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await importScenario(page, "long-64", true);
  const workspace = page.getByTestId("correction-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("button", { name: "16小節", exact: true })).toHaveAttribute("aria-pressed", "true");
  const overflow = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    return Math.max(document.documentElement.scrollWidth - innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
  });
  expect(overflow).toBeLessThanOrEqual(0);
  const scroller = workspace.getByTestId("correction-timeline-scroll");
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await workspace.getByTestId("correction-card").count()).toBe(97);
});
