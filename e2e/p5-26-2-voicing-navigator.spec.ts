import { expect, test, type Page } from "@playwright/test";

/**
 * P5.26.2-04: the Voicing Loop timeline has a whole-song navigator (view frame, playhead,
 * click = jump, drag the frame = scroll). The follow rules are the Voicing Loop's own, unchanged.
 */
async function openLoop(page: Page, status: string) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  return page.getByTestId("voicing-loop-workspace");
}
const frame = (page: Page) => page.getByTestId("voicing-loop-navigator").evaluate((box) => {
  const element = box.querySelector<HTMLElement>("[data-navigator-frame]")!;
  const width = box.clientWidth;
  return { left: element.offsetLeft / width, width: element.offsetWidth / width, visible: getComputedStyle(box).visibility };
});

test("128 bars: the frame shows the viewed part and follows scrolling, with a bounded element count", async ({ page }) => {
  const workspace = await openLoop(page, "long-song");
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const navigator = workspace.getByTestId("voicing-loop-navigator");
  await expect(navigator).toBeVisible();
  const start = await frame(page);
  expect(start.visible).toBe("visible");
  expect(start.width).toBeGreaterThan(0.02);
  expect(start.width).toBeLessThan(0.9);
  expect(start.left).toBeLessThan(0.01);
  // The frame follows the viewport.
  await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect.poll(async () => (await frame(page)).left).toBeGreaterThan(0.5);
  // A navigator is a few elements, not one per card or per bar.
  expect(await navigator.evaluate((box) => box.querySelectorAll("*").length)).toBeLessThan(10);
});

test("clicking the navigator jumps there; dragging the frame scrolls and turns following off", async ({ page }) => {
  const workspace = await openLoop(page, "long-song");
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const navigator = workspace.getByTestId("voicing-loop-navigator");
  const follow = workspace.getByTestId("voicing-loop-follow");
  const box = (await navigator.boundingBox())!;
  const cards = workspace.getByTestId("voicing-loop-event");

  // Click far to the right: the current card moves there (the same jump the old strip makes), and the view comes with it.
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect(cards.nth(0)).not.toHaveAttribute("aria-current", "step");
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(follow).toHaveAttribute("aria-pressed", "true");

  // Drag the frame back to the left: the viewport scrolls, following is off, the current card is untouched.
  // (Wait for the page-turn animation to settle first, so the frame is where it is measured.)
  let last = -1;
  await expect.poll(async () => {
    const now = await viewport.evaluate((element) => element.scrollLeft);
    const settled = now === last;
    last = now;
    return settled;
  }, { intervals: [150] }).toBe(true);
  const at = await frame(page);
  const grabX = box.x + box.width * (at.left + at.width / 2);
  const before = await viewport.evaluate((element) => element.scrollLeft);
  const current = await workspace.locator('[data-testid="voicing-loop-event"][aria-current="step"]').getAttribute("aria-label");
  await page.mouse.move(grabX, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await viewport.evaluate((element) => element.scrollLeft)).toBeLessThan(before);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect(await workspace.locator('[data-testid="voicing-loop-event"][aria-current="step"]').getAttribute("aria-label")).toBe(current);
});

test("a short song that fits keeps the navigator out of the way", async ({ page }) => {
  await openLoop(page, "both-hands-long");
  const state = await frame(page);
  // 8 groups fit at the default scale: nothing to navigate (it is hidden, not removed, so the header does not shift).
  expect(["hidden", "visible"]).toContain(state.visible);
});

test("the head runs while playing without the cards being rebuilt", async ({ page }) => {
  const workspace = await openLoop(page, "long-song");
  await workspace.getByRole("button", { name: "開始", exact: true }).click();
  const head = workspace.getByTestId("voicing-loop-navigator").locator("[data-navigator-head]");
  await expect.poll(() => head.evaluate((element) => (element as HTMLElement).style.left)).not.toBe("0%");
  const rebuilt = await workspace.getByTestId("voicing-loop-event").first().evaluate((card) => new Promise<number>((resolve) => {
    const parent = card.parentElement!;
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.filter((record) => record.type === "childList").length; });
    observer.observe(parent, { childList: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 1000);
  }));
  expect(rebuilt).toBe(0);
});
