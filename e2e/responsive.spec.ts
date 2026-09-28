import { expect, test } from "@playwright/test";
import {
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  loadMidiForPreAnalysis,
  openApp,
  openVault,
  waitForSidebarSettled,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

test("1024x720でShell、Capture、結果、Vaultが横にはみ出さない", async ({ page }) => {
  await openApp(page);
  await assertNoHorizontalOverflow(page);
  await expect(page.locator("[data-global-actions]")).toBeVisible();

  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 11 }), "responsive-11-voice.mid");
  await assertNoHorizontalOverflow(page);
  await analyzeCurrentMidi(page);
  await assertNoHorizontalOverflow(page);

  await openVault(page);
  await assertNoHorizontalOverflow(page);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`${viewport.width}x${viewport.height} breakpoint stays overflow-safe`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page);
    await assertNoHorizontalOverflow(page);
    await page.locator('[data-nav="capture"]').click();
    await assertNoHorizontalOverflow(page);
    await expect(page.locator("[data-global-actions]")).toBeVisible();
  });
}

test("P8.9-09b header volume knob is always visible and follows an up/down drag", async ({ page }) => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await openApp(page);
    const knob = page.getByRole("slider", { name: "マスター音量" });
    await expect(knob).toBeVisible();
    const group = (await page.locator(".lv-volume-group").boundingBox())!;
    expect(group.height, `${width}px`).toBeLessThanOrEqual(31);
    expect(group.x + group.width, `${width}px`).toBeLessThanOrEqual(width);
  }
  const knob = page.getByRole("slider", { name: "マスター音量" });
  await knob.focus();
  await page.keyboard.press("Home");
  await expect(knob).toHaveAttribute("aria-valuenow", "0");
  const box = (await knob.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[data-volume-tooltip]")).toHaveText("音量 0%");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 75, { steps: 5 });
  await expect(knob).toHaveAttribute("aria-valuenow", "50");
  await expect(knob).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(knob).not.toHaveAttribute("data-dragging", /.*/);
  await knob.dblclick();
  await expect(knob).toHaveAttribute("aria-valuenow", "100");
});

test("P8.9-09b sidebar never scrolls sideways and keeps icons in place while it animates open and closed", async ({ page }) => {
  const iconCenters = () => page.locator(".lv-sidebar .lv-nav-item svg").evaluateAll((icons) =>
    icons.map((icon) => Math.round(icon.getBoundingClientRect().left + icon.getBoundingClientRect().width / 2)));
  const overflow = () => page.locator(".lv-sidebar").evaluate((aside) => {
    const nav = aside.querySelector<HTMLElement>(".lv-sidebar-nav")!;
    return { aside: aside.scrollWidth - aside.clientWidth, nav: nav.scrollWidth - nav.clientWidth };
  });
  for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await openApp(page);
    const sidebar = page.locator("[data-sidebar]");
    const startCollapsed = (await sidebar.getAttribute("data-sidebar")) === "collapsed";
    const before = await iconCenters();
    expect(await overflow(), `${width} start`).toEqual({ aside: 0, nav: 0 });
    await page.getByRole("button", { name: startCollapsed ? "サイドバーを広げる" : "サイドバーを狭める" }).click();
    await expect(sidebar).toHaveAttribute("data-sidebar-animating", "true");
    const near = (centers: number[]) => centers.every((center, index) => Math.abs(center - before[index]!) <= 1);
    expect(near(await iconCenters()), `${width} icons while animating`).toBe(true);
    await waitForSidebarSettled(page);
    await expect(sidebar).toHaveAttribute("data-sidebar", startCollapsed ? "expanded" : "collapsed");
    const after = await iconCenters();
    expect(near(after), `${width} icons after toggle`).toBe(true);
    expect(await overflow(), `${width} toggled`).toEqual({ aside: 0, nav: 0 });
    const logo = (await page.locator(".lv-titlebar-brand img").boundingBox())!;
    expect(Math.abs(logo.x + logo.width / 2 - before[0]!), `${width} logo`).toBeLessThanOrEqual(1);
    // Collapsed tooltips appear beside the icon without widening the nav.
    const collapsedNow = !startCollapsed;
    if (collapsedNow) {
      await page.locator('[data-nav="vault"]').hover();
      const tip = page.locator('[data-nav="vault"] .lv-tooltip');
      await expect(tip).toHaveCSS("opacity", "1");
      const tipBox = (await tip.boundingBox())!;
      const item = (await page.locator('[data-nav="vault"]').boundingBox())!;
      expect(tipBox.x).toBeGreaterThan(64);
      expect(Math.abs(tipBox.y + tipBox.height / 2 - (item.y + item.height / 2))).toBeLessThanOrEqual(2);
      expect(await overflow(), `${width} tooltip`).toEqual({ aside: 0, nav: 0 });
    }
    // Put the remembered state back for the next size.
    await page.getByRole("button", { name: startCollapsed ? "サイドバーを狭める" : "サイドバーを広げる" }).click();
    await waitForSidebarSettled(page);
    await page.evaluate(() => localStorage.clear());
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole("button", { name: "サイドバーを狭める" }).click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
});
