import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

async function openLoop(page: Page) {
  await page.goto("/?p527Status=both-hands-long");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  return page.getByTestId("voicing-loop-workspace");
}

const output = join("test-results", "p11-range");
mkdirSync(output, { recursive: true });

for (const width of [1920, 1444, 1280, 960]) {
  test(`P11-01 range states and timeline screenshots at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const workspace = await openLoop(page);
    const timeline = workspace.getByTestId("voicing-loop-timeline");
    const cards = timeline.getByTestId("voicing-loop-event");
    await expect(cards).toHaveCount(12);
    await timeline.screenshot({ path: join(output, `${width}-no-range.png`) });
    await cards.nth(1).click({ button: "right" });
    await expect(cards.nth(1)).toHaveAttribute("data-range", "pending-a");
    await timeline.screenshot({ path: join(output, `${width}-pending-a.png`) });
    await cards.nth(3).click({ button: "right" });
    await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
    await expect(cards.nth(0)).toHaveAttribute("data-range", "outside");
    await timeline.screenshot({ path: join(output, `${width}-a-b.png`) });
    await cards.nth(2).click({ button: "right", modifiers: ["Shift"] });
    await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("3〜3");
    await timeline.screenshot({ path: join(output, `${width}-one-card.png`) });
    await assertNoHorizontalOverflow(page);
  });
}

test("P11-01 keyboard context menu, pending Escape and range clear", async ({ page }) => {
  const workspace = await openLoop(page);
  const cards = workspace.getByTestId("voicing-loop-event");
  await cards.nth(1).focus();
  await page.keyboard.press("Shift+F10");
  await expect(cards.nth(1)).toHaveAttribute("data-range", "pending-a");
  await page.keyboard.press("Escape");
  await expect(workspace.getByTestId("voicing-loop-range-pending")).toHaveCount(0);
  await cards.nth(1).focus();
  await page.keyboard.press("ContextMenu");
  await expect(cards.nth(1)).toHaveAttribute("data-range", "pending-a");
  await cards.nth(1).click({ button: "right" });
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜2");
  await workspace.getByTestId("voicing-loop-range-chip").click();
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toHaveCount(0);
});


test("P11 acceptance: contextmenu after a focused control starts the range with Space", async ({ page }) => {
  const workspace = await openLoop(page);
  const cards = workspace.getByTestId("voicing-loop-event");
  await cards.nth(0).focus();
  await cards.nth(1).click({ button: "right" });
  await cards.nth(3).click({ button: "right" });
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  const focusBeforeSpace = await page.evaluate(() => ({ tag: document.activeElement?.tagName, testId: document.activeElement?.getAttribute("data-testid") }));
  test.info().annotations.push({ type: "focus-before-space", description: JSON.stringify(focusBeforeSpace) });
  await expect(workspace.getByTestId("voicing-loop-timeline-viewport")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "再開", exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
});


test("P11 acceptance: timeline right-click snapping, old range, Escape, one-card and permanent clear", async ({ page }) => {
  const workspace = await openLoop(page);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const cards = workspace.getByTestId("voicing-loop-event");
  const clear = workspace.getByRole("button", { name: "区間解除", exact: true });
  await expect(clear).toBeDisabled();
  async function mark(index: number, surface: "overview" | "ruler", shift = false) {
    await viewport.evaluate((element, ordinal) => {
      const card = element.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-event']")[ordinal]!;
      element.scrollLeft = card.parentElement!.offsetLeft + card.clientWidth / 2 - element.clientWidth / 2;
    }, index);
    const card = (await cards.nth(index).boundingBox())!;
    const area = (await workspace.getByTestId(`voicing-loop-${surface}`).boundingBox())!;
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(card.x + card.width / 2, area.y + area.height / 2, { button: "right" });
    if (shift) await page.keyboard.up("Shift");
  }
  await mark(3, "ruler");
  await expect(cards.nth(3)).toHaveAttribute("data-range", "pending-a");
  await expect(clear).toBeEnabled();
  await mark(1, "overview");
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  await mark(11, "ruler");
  await expect(cards.nth(11)).toHaveAttribute("data-range", "pending-a");
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  await page.keyboard.press("Escape");
  await expect(workspace.getByTestId("voicing-loop-range-pending")).toHaveCount(0);
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  await mark(11, "overview", true);
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toContainText("12〜12");
  await expect(viewport).toBeFocused();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
  await expect(cards.nth(11)).toHaveAttribute("aria-current", "step");
  await clear.click();
  await expect(clear).toBeDisabled();
  await expect(workspace.getByTestId("voicing-loop-range-chip")).toHaveCount(0);
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
  await mark(0, "overview");
  await expect(cards.nth(0)).toHaveAttribute("data-range", "pending-a");
  await clear.click();
  await expect(clear).toBeDisabled();
  await expect(cards.nth(0)).toHaveAttribute("data-range", "none");
});
