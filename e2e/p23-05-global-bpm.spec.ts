import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openApp, openTextCapture } from "./helpers/app";
import { practiceFromVault } from "./helpers/practice";

/** P23-05: the one app-wide BPM in the header (G1–G3). P23-06: Voicing Loop and the Jazz listening play at it; the text intake keeps its own. */

const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [768, 640]] as const;
const value = (page: Page) => page.getByTestId("global-bpm-value");
const shown = async (page: Page) => Number(await value(page).getAttribute("aria-valuenow"));

/** Waits for the view fade (P23-03) and the sidebar so the measurement is of the settled screen. */
async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
}

async function go(page: Page, nav: string) {
  await page.locator(`[data-nav="${nav}"]`).click();
  await settle(page);
}

async function sidebar(page: Page, open: boolean) {
  const state = await page.locator("[data-sidebar]").getAttribute("data-sidebar");
  if ((state === "expanded") !== open) await page.getByRole("button", { name: open ? "サイドバーを広げる" : "サイドバーを狭める" }).click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", open ? "expanded" : "collapsed");
  await settle(page);
}

async function saveProgression(page: Page, bpm?: string) {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| C#m7 | F#7 | Bmaj7 | G#7 |");
  await capture.getByTestId("text-progression-key").selectOption("B major");
  await capture.getByTestId("text-progression-name").fill("P23-05 の進行");
  if (bpm) await capture.getByTestId("text-progression-bpm").fill(bpm);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText("保存しました")).toBeVisible();
}

async function openVoicingLoop(page: Page) {
  await go(page, "vault");
  await page.locator(".lv-vault-progression").first().click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
  await practiceFromVault(page, "Voicing Loop");
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible();
  await settle(page);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("G1: the BPM field is on every screen, right before the metronome", async ({ page }) => {
  await saveProgression(page);
  const check = async (label: string) => {
    await expect(value(page), label).toBeVisible();
    const bpm = (await value(page).boundingBox())!;
    const metronome = (await page.getByTestId("global-metronome").boundingBox())!;
    expect(bpm.x + bpm.width, label).toBeLessThanOrEqual(metronome.x);
    expect(metronome.x - (bpm.x + bpm.width), label).toBeLessThan(16);
    const order = await page.locator(".lv-app-header-actions > *").evaluateAll((children) =>
      children.map((child) => child.getAttribute("data-testid")));
    expect(order.indexOf("global-bpm") + 1, label).toBe(order.indexOf("global-metronome"));
  };
  for (const nav of ["home", "vault", "capture", "chord-dojo", "bass-practice", "settings"]) {
    await go(page, nav);
    await check(nav);
  }
  await openVoicingLoop(page);
  await check("voicing-loop");
});

test("G1: the wheel changes the value by 1 (Shift 5) and the page does not scroll", async ({ page }) => {
  await openApp(page);
  await settle(page);
  const scrollTop = () => page.evaluate(() => document.getElementById("main-content")!.scrollTop + document.documentElement.scrollTop);
  const before = await scrollTop();
  await value(page).hover();
  for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, -100);
  await expect.poll(() => shown(page)).toBe(123);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Shift");
  await expect.poll(() => shown(page)).toBe(118);
  expect(await scrollTop()).toBe(before);
});

test("G1: the list: a preset sets and closes, +5 keeps it open, Esc closes", async ({ page }) => {
  await openApp(page);
  await value(page).click();
  const popover = page.getByTestId("global-bpm-popover");
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "80", exact: true }).click();
  await expect.poll(() => shown(page)).toBe(80);
  await expect(popover).toBeHidden();
  await expect(value(page)).toBeFocused();
  await value(page).click();
  await popover.getByRole("button", { name: "5 上げる" }).click();
  await expect.poll(() => shown(page)).toBe(85);
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(value(page)).toBeFocused();
});

test("G1: double-click to type a number; text that is not a number keeps the value", async ({ page }) => {
  await openApp(page);
  await value(page).dblclick();
  const input = page.getByTestId("global-bpm-input");
  await expect(input).toBeFocused();
  await input.fill("97");
  await input.press("Enter");
  await expect.poll(() => shown(page)).toBe(97);
  await expect(input).toBeHidden();
  await value(page).dblclick();
  await input.fill("abc");
  await input.press("Enter");
  await expect.poll(() => shown(page)).toBe(97);
});

test("G2: the value stays after a reload and on another screen", async ({ page }) => {
  await openApp(page);
  await value(page).click();
  await page.getByTestId("global-bpm-popover").getByRole("button", { name: "80", exact: true }).click();
  await value(page).click();
  await page.getByTestId("global-bpm-popover").getByRole("button", { name: "5 上げる" }).click();
  await expect.poll(() => shown(page)).toBe(85);
  await page.reload();
  await expect.poll(() => shown(page)).toBe(85);
  await go(page, "vault");
  await expect.poll(() => shown(page)).toBe(85);
});

test("the text intake's BPM is its own", async ({ page }) => {
  await saveProgression(page);
  const textBpm = page.getByTestId("text-progression-bpm");
  await go(page, "capture");
  await expect(textBpm).toBeVisible();
  const textBefore = await textBpm.inputValue();
  await value(page).focus();
  await page.keyboard.press("PageUp");
  await expect.poll(() => shown(page)).toBe(130);
  expect(await textBpm.inputValue()).toBe(textBefore);
});

test("P23-06: Voicing Loop plays at the app-wide BPM; a saved BPM is offered as the song's", async ({ page }) => {
  await saveProgression(page, "96");
  await openVoicingLoop(page);
  // P23-32 K4: the practice has no BPM field of its own; the header's 共通 BPM is what it plays at.
  const loopBpm = page.getByTestId("global-bpm-value");
  const song = page.getByTestId("global-bpm-song");
  await expect(loopBpm).toHaveAttribute("aria-valuenow", "120");
  await expect(song).toHaveText("曲 96");
  await song.click();
  await expect.poll(() => shown(page)).toBe(96);
  await expect(loopBpm).toHaveAttribute("aria-valuenow", "96");
  await expect(song).toHaveCount(0);
  await value(page).focus();
  await page.keyboard.press("PageUp");
  await expect.poll(() => shown(page)).toBe(106);
  await expect(loopBpm).toHaveAttribute("aria-valuenow", "106");
  await expect(page.locator("#voicing-loop-bpm")).toHaveCount(0);
  await go(page, "vault");
  await expect(song).toHaveCount(0);
});

test("the header stays one 56px row at five sizes with the sidebar open and folded; G3 the Home date gives way below 900px", async ({ page }) => {
  await saveProgression(page);
  const screens: [string, () => Promise<void>][] = [
    ["home", () => go(page, "home")],
    ["voicing-loop", () => openVoicingLoop(page)],
  ];
  for (const [name, open] of screens) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open();
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      for (const side of [true, false]) {
        await sidebar(page, side);
        const label = `${name} ${width}x${height} ${side ? "open" : "folded"}`;
        const m = await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>(".lv-app-header")!;
          const kids = Array.from(document.querySelectorAll<HTMLElement>(".lv-app-header-actions > *"))
            .filter((child) => getComputedStyle(child).display !== "none")
            .map((child) => child.getBoundingClientRect());
          let overlap = 0;
          for (let i = 1; i < kids.length; i += 1) overlap = Math.max(overlap, kids[i - 1]!.right - kids[i]!.left);
          const subtitle = document.querySelector<HTMLElement>(".lv-app-header-subtitle");
          return {
            height: Math.round(header.getBoundingClientRect().height),
            page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            header: header.scrollWidth - header.clientWidth,
            overlap,
            subtitle: subtitle ? getComputedStyle(subtitle).display !== "none" : undefined,
          };
        });
        expect(m.height, label).toBe(56);
        expect(m.overlap, label).toBeLessThanOrEqual(0);
        // Voicing Loop at 768×640 with the sidebar open: the practice screen itself is 112px wider than the window, on master
        // too (not the header). Until the Voicing Loop guide handles it, this one case checks the header row alone.
        if (name === "voicing-loop" && width === 768 && side) expect(m.header, label).toBeLessThanOrEqual(0);
        else expect(m.page, label).toBeLessThanOrEqual(0);
        if (name === "home") expect(m.subtitle, label).toBe(width >= 900);
      }
    }
  }
});

test("the open list passes the axe check", async ({ page }) => {
  await openApp(page);
  await value(page).click();
  await expect(page.getByTestId("global-bpm-popover")).toBeVisible();
  await settle(page);
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking, JSON.stringify(blocking.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" > ")) })), null, 2)).toEqual([]);
});
