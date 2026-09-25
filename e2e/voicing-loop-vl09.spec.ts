import { expect, test, type Page } from "@playwright/test";

async function openVl09(page: Page) {
  await page.goto("/?p527Status=vl09-layout");
  await page.evaluate(() => document.fonts.ready);
  const navLoop = page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true });
  if (await navLoop.isVisible()) await navLoop.click();
  else {
    await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  return page.getByTestId("voicing-loop-workspace");
}

async function majorGeometry(page: Page) {
  return page.getByTestId("voicing-loop-workspace").evaluate((workspace) => {
    const ids = ["voicing-loop-current-next", "voicing-loop-timeline", "voicing-loop-detail",
      "voicing-loop-transport-primary", "voicing-loop-transport-midi-row"];
    return ids.map((id) => {
      const target = workspace.querySelector(`[data-testid='${id}']`);
      if (!target) throw new Error(`Missing region ${id}`);
      const { y, height } = target.getBoundingClientRect();
      return { y: y + window.scrollY, height };
    });
  });
}

test("VL-09 keeps major region geometry fixed across chord content and viewport sizes", async ({ page }) => {
  test.setTimeout(90_000);
  const viewports = [
    { width: 1920, height: 1080, zoom: 1 },
    { width: 1440, height: 900, zoom: 1 },
    { width: 1280, height: 800, zoom: 1 },
    { width: 1024, height: 768, zoom: 1 },
    { width: 900, height: 1200, zoom: 1 },
    { width: 1536, height: 864, zoom: 1.25 },
    { width: 1280, height: 800, zoom: 1.5 },
    { width: 1280, height: 800, zoom: 2 },
  ];
  for (const { width, height, zoom } of viewports) {
    await page.setViewportSize({ width, height });
    const workspace = await openVl09(page);
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await workspace.getByTestId("voicing-loop-current-panel").focus();
    const first = await majorGeometry(page);
    if (width === 1920 && zoom === 1) await page.screenshot({ path: ".local-evaluation/vl09/normal-maximized.png", fullPage: true });
    if (width === 1280 && zoom === 1) await page.screenshot({ path: ".local-evaluation/vl09/medium-window.png", fullPage: true });
    let previousIndex = 0;
    for (const index of [1, 2, 4, 7, 8]) {
      for (let step = previousIndex; step < index; step += 1) await page.keyboard.press("ArrowRight");
      previousIndex = index;
      const after = await majorGeometry(page);
      after.forEach((region, regionIndex) => {
        expect(Math.abs(region.y - first[regionIndex]!.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(region.height - first[regionIndex]!.height)).toBeLessThanOrEqual(2);
      });
    }
    await expect(workspace.getByTestId("voicing-loop-current-panel")).toBeVisible();
    await expect(workspace.getByTestId("voicing-loop-transport")).toBeVisible();
    if (width === 1920 && zoom === 1) {
      await page.screenshot({ path: ".local-evaluation/vl09/desktop.png", fullPage: true });
    }
  }
});

test("VL-09 timeline page turns, manual scrolling stays manual, and F restores follow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const workspace = await openVl09(page);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  for (const scale of [8, 12, 16]) {
    await workspace.getByRole("button", { name: String(scale), exact: true }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("f");
    await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("End");
    const scrollable = await viewport.evaluate((element) => element.scrollWidth > element.clientWidth + 2);
    if (!scrollable) continue;
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(async () => {
      const last = await workspace.getByTestId("voicing-loop-event").last().boundingBox();
      const view = await viewport.boundingBox();
      return last!.x + last!.width - (view!.x + view!.width);
    }).toBeLessThanOrEqual(2);
    const last = await workspace.getByTestId("voicing-loop-event").last().boundingBox();
    const view = await viewport.boundingBox();
    expect(last!.x).toBeGreaterThanOrEqual(view!.x - 2);
    if (scale === 8) await page.screenshot({ path: ".local-evaluation/vl09/right-edge-page-turn.png", fullPage: true });
    await viewport.evaluate((element) => { element.scrollLeft = 0; });
    await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
    await viewport.hover();
    await page.mouse.wheel(150, 0);
    await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("f");
    await expect(workspace.getByTestId("voicing-loop-follow")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: ".local-evaluation/vl09/page-turn.png", fullPage: true });
});

test("VL-09 source seven-note display is split between playable hands without editing source notes", async ({ page }) => {
  const workspace = await openVl09(page);
  const left = workspace.getByTestId("voicing-loop-left-hand");
  const right = workspace.getByTestId("voicing-loop-right-hand");
  await expect(left).toContainText("A4");
  await expect(right).toContainText("C6");
  await expect(workspace.getByTestId("voicing-loop-hand-assignment-unavailable")).toHaveCount(0);
  await page.screenshot({ path: ".local-evaluation/vl09/seven-note.png", fullPage: true });
});
