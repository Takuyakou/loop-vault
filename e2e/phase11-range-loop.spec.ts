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
