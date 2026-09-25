import { expect, test, type Page } from "@playwright/test";

async function openLoop(page: Page, status = "vl09-layout") {
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  const nav = page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true });
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  return page.getByTestId("voicing-loop-workspace");
}
const position = (page: Page) => page.getByTestId("voicing-loop-timeline-viewport")
  .evaluate((element) => element.scrollLeft);

async function geometry(page: Page) {
  return page.getByTestId("voicing-loop-workspace").evaluate((workspace) =>
    ["voicing-loop-current-next", "voicing-loop-timeline", "voicing-loop-detail",
      "voicing-loop-transport-primary"].map((id) => {
      const rect = workspace.querySelector(`[data-testid='${id}']`)!.getBoundingClientRect();
      return { y: rect.y, height: rect.height };
    }));
}

test("VL-10 Follow changes only on manual input and seek restores page turn", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const workspace = await openLoop(page);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const follow = workspace.getByTestId("voicing-loop-follow");
  const cards = workspace.getByTestId("voicing-loop-event");
  await page.screenshot({ path: ".local-evaluation/vl10/page-turn-before.png", fullPage: true });
  await viewport.evaluate((element) => { element.scrollLeft = 123.5; });
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await viewport.hover();
  await page.mouse.wheel(120, 0);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await cards.nth(6).click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => position(page)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: ".local-evaluation/vl10/page-turn-after.png", fullPage: true });
  const card = await cards.nth(6).boundingBox();
  const frame = await viewport.boundingBox();
  expect(card!.x).toBeGreaterThanOrEqual(frame!.x - 3);
  expect(card!.x).toBeLessThanOrEqual(frame!.x + 18);
  await viewport.focus();
  await page.keyboard.press("PageDown");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("f");
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await viewport.hover();
  await page.mouse.wheel(180, 0);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await workspace.getByTestId("voicing-loop-overview").click({ position: { x: 180, y: 5 } });
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await viewport.hover();
  await page.mouse.wheel(180, 0);
  await workspace.getByTestId("voicing-loop-ruler").click({ position: { x: 120, y: 8 } });
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await workspace.locator("#voicing-loop-count-in").selectOption("0");
  await workspace.getByRole("button", { name: "開始" }).click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await workspace.getByRole("button", { name: "一時停止" }).click();
  await workspace.getByRole("button", { name: "再開" }).click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
});

test("VL-10 Next Move and Next Shape stay fixed at different cards and viewports", async ({ page }) => {
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
    const move = workspace.getByTestId("voicing-loop-next-move");
    const shape = workspace.getByTestId("voicing-loop-next-shape");
    await expect(move).toBeVisible();
    await expect(shape).toBeVisible();
    await expect(move).toContainText("次への動き");
    await expect(shape.getByTestId("voicing-loop-next-shape-keyboard")).toHaveCount(1);
    const before = await geometry(page);
    for (const index of [1, 4, 8, 12]) {
      await page.keyboard.press("Home");
      for (let i = 0; i < index; i++) await page.keyboard.press("ArrowRight");
      const after = await geometry(page);
      after.forEach((region, i) => {
        expect(Math.abs(region.y - before[i]!.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(region.height - before[i]!.height)).toBeLessThanOrEqual(2);
      });
    }
    if (width === 1920) {
      await page.screenshot({ path: ".local-evaluation/vl10/maximized.png", fullPage: true });
      await page.keyboard.press("Home");
      await page.screenshot({ path: ".local-evaluation/vl10/large-movement.png", fullPage: true });
      await page.screenshot({ path: ".local-evaluation/vl10/next-move.png", fullPage: true });
      await page.screenshot({ path: ".local-evaluation/vl10/next-shape.png", fullPage: true });
      const keepWorkspace = await openLoop(page, "vl10-keep");
      await expect(keepWorkspace.getByTestId("voicing-loop-next-move")).toContainText("維持");
      await page.screenshot({ path: ".local-evaluation/vl10/keep-transition.png", fullPage: true });
    }
    if (width === 1280 && zoom === 1) await page.screenshot({ path: ".local-evaluation/vl10/medium-window.png", fullPage: true });
  }
  const workspace = await openLoop(page, "vl10-distant");
  await expect(workspace.getByTestId("voicing-loop-next-shape")).toBeVisible();
  await page.keyboard.press("End");
  await expect(workspace.getByTestId("voicing-loop-next-shape-keyboard")).toHaveCount(2);
  await expect(workspace.getByTestId("voicing-loop-next-move")).toContainText("次への動き");
  await page.screenshot({ path: ".local-evaluation/vl10/distant-hands.png", fullPage: true });
});

test("VL-10 source preview is accessible and Follow page turns at scaling samples", async ({ page }) => {
  for (const zoom of [1, 1.25, 1.5]) {
    const workspace = await openLoop(page);
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    const shape = workspace.getByTestId("voicing-loop-next-shape");
    await expect(shape).toHaveAttribute("aria-label", /次の手の形.*左手.*右手/);
    await page.keyboard.press("End");
    await expect.poll(() => position(page)).toBeGreaterThan(0);
    await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
  }
});

test("VL-10 reduced motion keeps Follow and skips page-turn animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await openLoop(page);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const card = workspace.getByTestId("voicing-loop-event").nth(6);
  await card.click();
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
  const positions = await Promise.all([viewport.evaluate((element) => element.scrollLeft),
    card.evaluate((element) => element.getBoundingClientRect().left)]);
  const frame = await viewport.boundingBox();
  expect(positions[1]).toBeGreaterThanOrEqual(frame!.x - 2);
  expect(positions[1]).toBeLessThanOrEqual(frame!.x + 18);
  await page.waitForTimeout(300);
  expect(await position(page)).toBeCloseTo(positions[0], 0);
});
