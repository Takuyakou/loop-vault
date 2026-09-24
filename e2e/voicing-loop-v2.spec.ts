import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

async function openLoop(page: Page) {
  await page.goto("/?p527Status=both-hands-long");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  return page.getByTestId("voicing-loop-workspace");
}

test("VL-03 seeks by card, overview, ruler, and shortcuts without previewing", async ({ page }) => {
  const workspace = await openLoop(page);
  const cards = workspace.getByTestId("voicing-loop-event");
  const heading = workspace.getByTestId("voicing-loop-current-next").locator("h2");
  await cards.nth(5).click();
  await expect(cards.nth(5)).toHaveAttribute("aria-current", "step");
  await expect(heading).toHaveText("Dm7");
  await page.keyboard.press("Home");
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("End");
  await expect(cards.last()).toHaveAttribute("aria-current", "step");
  const firstWidth = (await cards.first().boundingBox())!.width;
  await workspace.getByRole("button", { name: "12", exact: true }).click();
  const mediumWidth = (await cards.first().boundingBox())!.width;
  await workspace.getByRole("button", { name: "16", exact: true }).click();
  const smallWidth = (await cards.first().boundingBox())!.width;
  expect(firstWidth).toBeGreaterThan(mediumWidth);
  expect(mediumWidth).toBeGreaterThan(smallWidth);
  await workspace.getByRole("button", { name: "8", exact: true }).click();
  const overview = workspace.getByTestId("voicing-loop-overview");
  await overview.click({ position: { x: (await overview.boundingBox())!.width * 0.5, y: 5 } });
  await expect(cards.nth(6)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("Home");
  const ruler = workspace.getByTestId("voicing-loop-ruler");
  await ruler.click({ position: { x: 145, y: 8 } });
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "step");
  const preview = workspace.getByTestId("voicing-loop-event-preview").nth(3);
  await preview.click();
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("m");
  await expect(workspace.getByTestId("voicing-loop-transport")).toContainText("メトロノーム: OFF");
  await page.keyboard.press("r");
  await expect(workspace.getByRole("checkbox", { name: "お手本音" })).not.toBeChecked();
});

test("VL-03 rollback OFF retains the prior card audition path", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lv-voicing-loop-v2", "off"));
  const workspace = await openLoop(page);
  const cards = workspace.getByTestId("voicing-loop-event");
  await cards.nth(1).click();
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("VL-05 keeps the transport reachable at 1280x720 and effective 200%", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const workspace = await openLoop(page);
  await expect(workspace.getByTestId("voicing-loop-transport")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
  await expect(workspace.getByTestId("voicing-loop-timeline")).toBeVisible();
});
