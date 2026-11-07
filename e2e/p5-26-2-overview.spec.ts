import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/**
 * P5.26.2-01 (rev1): the saved progression's 「曲全体」 is the same strip as the import screen's
 * (view window, playhead, click/drag to move), not a row of buttons that pick a version.
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

const overview = (page: Page) => page.getByTestId("correction-overview");
const scroller = (page: Page) => page.getByTestId("correction-timeline-scroll");
const scrollLeft = (page: Page) => scroller(page).evaluate((element) => element.scrollLeft);
/** The view window as fractions of the strip (left edge, right edge). */
const windowFractions = (page: Page) => overview(page).evaluate((strip) => {
  const view = strip.querySelector<HTMLElement>(".lv-cw-ov-view")!;
  const width = strip.clientWidth;
  return { left: view.offsetLeft / width, right: (view.offsetLeft + view.offsetWidth) / width };
});

test.describe("P5.26.2-01 the saved progression's whole-song strip", () => {
  test("is the strip (cards, view window), not a row of version buttons", async ({ page }) => {
    await openSavedLong(page);
    const strip = overview(page);
    await expect(strip).toBeVisible();
    await expect(strip.getByRole("button")).toHaveCount(0);
    await expect(strip.locator(".lv-cw-ov-view")).toHaveCount(1);
    // The strip draws every card of the song (the roll only draws what is in view).
    await expect(strip.locator(".lv-cw-ov-card")).toHaveCount(70);
    const view = await windowFractions(page);
    expect(view.right - view.left).toBeGreaterThan(0);
    expect(view.right).toBeLessThanOrEqual(1.001);
  });

  test("the window follows the roll's scrolling, and a click or drag on the strip moves the roll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSavedLong(page);
    const roll = scroller(page);
    const room = await roll.evaluate((element) => element.scrollWidth - element.clientWidth);
    test.skip(room < 200, "the roll fits the viewport at this size");

    // Roll → window.
    await roll.evaluate((element) => { element.scrollLeft = 0; });
    const start = await windowFractions(page);
    await roll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(async () => (await windowFractions(page)).left).toBeGreaterThan(start.left + 0.1);

    // Strip click → roll: the window centres on the click.
    await roll.evaluate((element) => { element.scrollLeft = 0; });
    const box = (await overview(page).boundingBox())!;
    const before = await scrollLeft(page);
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(before);
    // Scrolling eases in; the window settles with its centre on the click.
    await expect.poll(async () => { const now = await windowFractions(page); return (now.left + now.right) / 2; }).toBeGreaterThan(0.5);
    const settled = await windowFractions(page);
    expect((settled.left + settled.right) / 2).toBeLessThan(0.7);

    // Strip drag → roll keeps moving.
    const from = await scrollLeft(page);
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await scrollLeft(page)).toBeGreaterThan(from);
  });

  test("playing draws the strip's playhead without redrawing the cards, and a manual scroll stops following", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSavedLong(page);
    const workspace = page.getByTestId("correction-workspace");
    await page.getByTestId("correction-play-song").click();
    const head = page.getByTestId("correction-overview-playhead");
    await expect(head).toBeVisible();
    // Cards are not replaced or restructured while the head runs (attributes of the sounding card aside).
    const changes = await workspace.getByTestId("correction-card").first().evaluate((card) => new Promise<number>((resolve) => {
      const cards = card.closest(".lv-cw-cards")!;
      let count = 0;
      const observer = new MutationObserver((records) => { count += records.filter((record) => record.type === "childList").length; });
      observer.observe(cards, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(count); }, 1200);
    }));
    expect(changes).toBe(0);
    const x1 = await head.evaluate((element) => (element as HTMLElement).style.transform);
    await page.waitForTimeout(400);
    const x2 = await head.evaluate((element) => (element as HTMLElement).style.transform);
    expect(x2).not.toBe(x1);

    const follow = workspace.getByRole("button", { name: "追従", exact: true });
    await expect(follow).toHaveAttribute("aria-pressed", "true");
    const roll = scroller(page).boundingBox();
    const at = (await roll)!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.wheel(0, 200);
    await expect(follow).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("correction-play-song").click();
  });

  test("the version can still be switched from the header, and a saved progression has no review marks", async ({ page }) => {
    await openSavedLong(page);
    const select = page.getByRole("combobox", { name: "この曲の進行", exact: true });
    expect(await select.locator("option").count()).toBeGreaterThan(1);
    const title = page.getByTestId("progression-title");
    const first = await title.textContent();
    await select.selectOption({ index: (await select.evaluate((element: HTMLSelectElement) => element.selectedIndex)) === 0 ? 1 : 0 });
    await expect(title).not.toHaveText(first ?? "");
    await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
    await expect(overview(page).getByRole("button")).toHaveCount(0);
    // Saved cards are authored (P10.4): no review mark on the strip, no review navigation.
    await expect(overview(page).locator(".lv-cw-ov-mark")).toHaveCount(0);
    await expect(page.getByTestId("correction-review-count")).toHaveCount(0);
    await page.locator("body").press("]"); // does nothing, does not throw
    await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
  });
});

test.describe("P5.26.2-01 the import screen's strip is unchanged", () => {
  test("it still has its cards, view window and review marks", async ({ page }) => {
    await importScenario(page, "plain-8");
    const strip = overview(page);
    await expect(strip.locator(".lv-cw-ov-view")).toHaveCount(1);
    await expect(strip.locator(".lv-cw-ov-card")).toHaveCount(8);
    await expect(strip.locator(".lv-cw-ov-seg").first()).toBeVisible();
  });

  test("a 300-bar song's strip stays a few hundred elements (measured, reported)", async ({ page }) => {
    await importScenario(page, "long-300");
    const counts = await overview(page).evaluate((strip) => ({
      total: strip.querySelectorAll("*").length,
      cards: strip.querySelectorAll(".lv-cw-ov-card").length,
      segments: strip.querySelectorAll(".lv-cw-ov-seg").length,
      marks: strip.querySelectorAll(".lv-cw-ov-mark").length,
    }));
    console.log(`P5.26.2-01 strip elements at 300 bars: ${JSON.stringify(counts)}`);
    expect(counts.total).toBeLessThan(1000);
  });
});
