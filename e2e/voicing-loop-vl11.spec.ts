import { expect, test, type Page } from "@playwright/test";

async function openLoop(page: Page, status = "vl09-layout") {
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  const nav = page.locator('[data-nav="voicing-loop"]');
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  return page.getByTestId("voicing-loop-workspace");
}

const scrollLeft = (page: Page) => page.getByTestId("voicing-loop-timeline-viewport")
  .evaluate((element) => element.scrollLeft);

test("VL-11 mouse card seek stays beneath the pointer; ruler, overview and keyboard still navigate", async ({ page }) => {
  const workspace = await openLoop(page);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const card = workspace.getByTestId("voicing-loop-event").nth(6);
  await viewport.evaluate((element) => {
    const card = element.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-event']")[6]!;
    element.scrollLeft = card.parentElement!.offsetLeft - element.clientWidth + 32;
  });
  const before = await scrollLeft(page);
  const cardBox = await card.boundingBox();
  const frame = await viewport.boundingBox();
  expect(cardBox).toBeTruthy();
  expect(frame).toBeTruthy();
  await page.mouse.click(Math.min(cardBox!.x + cardBox!.width - 8, frame!.x + frame!.width - 8), cardBox!.y + cardBox!.height / 2);
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(350);
  expect(await scrollLeft(page)).toBeCloseTo(before, 0);
  await expect(workspace.getByTestId("voicing-loop-position-metric")).toContainText("7 / ");

  await viewport.hover();
  await page.mouse.wheel(120, 0);
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "false");
  await workspace.getByTestId("voicing-loop-ruler").click({ position: { x: 25, y: 8 } });
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
  await viewport.hover();
  await page.mouse.wheel(120, 0);
  await workspace.getByTestId("voicing-loop-overview").click({ position: { x: 30, y: 6 } });
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("End");
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
  const last = workspace.getByTestId("voicing-loop-event").last();
  await last.focus();
  await expect(last).toBeFocused();
  const focused = await last.boundingBox();
  const visible = await viewport.boundingBox();
  expect(focused!.x + focused!.width).toBeGreaterThan(visible!.x);
  expect(focused!.x).toBeLessThan(visible!.x + visible!.width);
});

test("VL-11 fixed ten fingers, interval labels and hand surfaces remain within the strip", async ({ page }) => {
  test.setTimeout(90_000);
  for (const { width, height, zoom } of [
    { width: 1920, height: 1080, zoom: 1 },
    { width: 1280, height: 800, zoom: 1 },
    { width: 1536, height: 864, zoom: 1.25 },
    { width: 1280, height: 800, zoom: 1.5 },
  ]) {
    await page.setViewportSize({ width, height });
    const workspace = await openLoop(page);
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
    const strip = workspace.getByTestId("voicing-loop-next-move");
    const slots = strip.getByTestId("voicing-loop-finger-slot");
    await expect(slots).toHaveCount(10);
    expect(await slots.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-finger"))))
      .toEqual(["L5", "L4", "L3", "L2", "L1", "R1", "R2", "R3", "R4", "R5"]);
    const bounds = await strip.boundingBox();
    const last = await slots.last().boundingBox();
    expect(bounds!.height).toBeCloseTo(68 * zoom, 0);
    expect(last!.x + last!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    await expect(strip).not.toContainText(/\+\d+$/);
    await expect(slots.first()).toHaveAttribute("aria-label", /L5:/);
    const left = workspace.getByTestId("voicing-loop-left-hand");
    const nextLeft = workspace.getByTestId("voicing-loop-next-left-hand");
    await expect(left).toBeVisible();
    await expect(nextLeft).toBeVisible();
    const alphas = await Promise.all([left, nextLeft].map((element) => element.evaluate((node) => {
      const background = getComputedStyle(node).backgroundColor;
      return Number(background.match(/,\s*([\d.]+)\)$/)?.[1] ?? 0);
    })));
    expect(alphas[0]).toBeGreaterThan(alphas[1]!);
  }
});


test("VL-11 stopped card audition then Play holds the visible card until playback needs a turn", async ({ page }) => {
  test.setTimeout(20_000);
  const workspace = await openLoop(page);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  await workspace.locator("#voicing-loop-count-in").selectOption("0");
  const card = workspace.getByTestId("voicing-loop-event").nth(12);
  await card.click();
  await expect(workspace.getByTestId("voicing-loop-position-metric")).toContainText("13 / ");
  await viewport.evaluate((element) => {
    const card = element.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-event']")[12]!;
    element.scrollLeft = card.parentElement!.offsetLeft + card.clientWidth - element.clientWidth + 80;
  });
  const before = await scrollLeft(page);
  await page.waitForTimeout(300);
  expect(await scrollLeft(page)).toBeCloseTo(before, 0);
  await workspace.getByRole("button", { name: "開始" }).click();
  await page.waitForTimeout(200);
  expect(await scrollLeft(page)).toBeCloseTo(before, 0);
  await expect.poll(() => scrollLeft(page), { timeout: 7000 }).toBeGreaterThan(before + 50);
});
