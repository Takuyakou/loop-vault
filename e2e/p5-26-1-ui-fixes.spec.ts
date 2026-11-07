import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/**
 * P5.26.1: two UI fixes, written against the screens as they are now.
 * 01  Making a card longer keeps its chord name (a span edit offers the notes' reading, it never applies it).
 * 02  The long saved progression and the pre-save screen scroll, and nothing is pushed sideways at 320px.
 */

async function importScenario(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
}
async function openSavedLong(page: Page) {
  await page.goto("/?p104=long");
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
}

const cards = (page: Page) => page.getByTestId("correction-workspace").getByTestId("correction-card");
const names = (page: Page) => cards(page).evaluateAll((entries) => entries.map((entry) => entry.getAttribute("title")));

/** Where the workspace scrolls: the page column (down) and the piano roll (across). */
async function layout(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("#main-content") as HTMLElement;
    const roll = document.querySelector(".lv-cw-scroll") as HTMLElement;
    return {
      mainAcross: main.scrollWidth - main.clientWidth,
      mainDown: main.scrollHeight - main.clientHeight,
      documentAcross: document.documentElement.scrollWidth - innerWidth,
      rollAcross: roll.scrollWidth - roll.clientWidth,
    };
  });
}

test.describe("01 a longer card keeps its name", () => {
  test("dragging a boundary to make a card longer keeps both names; the notes' reading is offered, not applied", async ({ page }) => {
    await importScenario(page, "plain-8");
    const before = await names(page);
    const first = cards(page).first();
    const box = (await first.boundingBox())!;
    const beatPx = (box.width + 2) / 4;
    const handle = page.getByTestId("correction-boundary").first();
    await handle.scrollIntoViewIfNeeded();
    const at = (await handle.boundingBox())!;
    const start = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let step = 1; step <= 5; step += 1) await page.mouse.move(start.x + (beatPx * step) / 5, start.y);
    await page.mouse.up();
    await expect(first).toContainText("5拍");
    await expect(page.getByTestId("correction-edit-count")).toHaveText("直した回数 1");
    expect(await names(page)).toEqual(before);
    // The chosen card still says what it said, and the Inspector keeps the name.
    await first.click();
    await expect(page.getByTestId("correction-inspector-name")).toHaveText(before[0]!);
    // Undo brings the span back; the names were never different.
    await page.getByTestId("correction-undo").click();
    await expect(first).not.toContainText("5拍");
    expect(await names(page)).toEqual(before);
  });
});

test.describe("02 the editor scrolls and does not push sideways", () => {
  test("a long saved progression: no sideways overflow from 1440 down to 320, and everything is reachable", async ({ page }) => {
    await openSavedLong(page);
    for (const [width, height] of [[1440, 900], [768, 640], [480, 720], [320, 700]] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(200);
      const metrics = await layout(page);
      expect(metrics.documentAcross, `${width}px document`).toBeLessThanOrEqual(1);
      expect(metrics.mainAcross, `${width}px page column`).toBeLessThanOrEqual(1);
      expect(metrics.rollAcross, `${width}px piano roll scrolls across`).toBeGreaterThan(0);
    }
    // At 320px the page column scrolls down to the last controls, and the roll scrolls across to the last card.
    const metrics = await layout(page);
    expect(metrics.mainDown).toBeGreaterThan(0);
    await page.evaluate(() => { const roll = document.querySelector(".lv-cw-scroll") as HTMLElement; roll.scrollLeft = roll.scrollWidth; });
    const lastInView = await page.evaluate(() => {
      const roll = document.querySelector(".lv-cw-scroll") as HTMLElement;
      const all = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="correction-card"]'));
      const last = all[all.length - 1]!.getBoundingClientRect(), box = roll.getBoundingClientRect();
      return last.right > box.left && last.left < box.right;
    });
    expect(lastInView).toBe(true);
  });

  test("the arrow keys keep the chosen card in view at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openSavedLong(page);
    await cards(page).first().focus();
    await page.keyboard.press("Enter");
    for (let step = 0; step < 36; step += 1) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(40);
      const visible = await page.evaluate(() => {
        const roll = document.querySelector(".lv-cw-scroll") as HTMLElement;
        const chosen = document.querySelector('.lv-cw-card[aria-pressed="true"]') as HTMLElement | null;
        if (!chosen) return false;
        const box = roll.getBoundingClientRect(), at = chosen.getBoundingClientRect();
        return at.left >= box.left - 1 && at.right <= box.right + 1;
      });
      expect(visible, `after ${step + 1} presses`).toBe(true);
    }
  });

  test("the pre-save screen has no sideways overflow at 320px either", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await importScenario(page, "plain-8");
    await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
    const metrics = await layout(page);
    expect(metrics.documentAcross).toBeLessThanOrEqual(1);
    expect(metrics.mainAcross).toBeLessThanOrEqual(1);
  });
});
