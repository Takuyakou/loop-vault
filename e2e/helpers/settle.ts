import type { Locator, Page } from "@playwright/test";

/**
 * R-01 / test-stability-2: wait for the screen's state, never for a fixed time.
 * These helpers are used before reading a position, size, scroll offset or element count.
 */
const frame = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const same = (left: number, right: number) => Math.abs(left - right) <= 0.5;

/** Fonts loaded (when the API exists) and two paints. */
export async function settlePaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

/** A box that is the same on two consecutive frames (not a time-based wait). */
export async function settleBox(page: Page, locator: Locator): Promise<{ x: number; y: number; width: number; height: number } | null> {
  await settlePaint(page);
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await frame(page);
    const next = await locator.boundingBox();
    if (previous && next && same(previous.x, next.x) && same(previous.y, next.y) && same(previous.width, next.width) && same(previous.height, next.height)) return next;
    previous = next;
  }
  return previous;
}

/** A scroll offset that is the same on two consecutive frames (after a programmatic scroll or a drag). */
export async function settleScroll(page: Page, locator: Locator): Promise<{ left: number; top: number }> {
  await settlePaint(page);
  let previous = await locator.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await frame(page);
    const next = await locator.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
    if (same(previous.left, next.left) && same(previous.top, next.top)) return next;
    previous = next;
  }
  return previous;
}

/** A count that is the same on two consecutive paints (before asserting a count). */
export async function settleCount(page: Page, locator: Locator): Promise<number> {
  await settlePaint(page);
  let previous = await locator.count();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await frame(page);
    const next = await locator.count();
    if (previous === next) return next;
    previous = next;
  }
  return previous;
}
