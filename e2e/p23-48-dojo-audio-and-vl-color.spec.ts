import { expect, test, type Page } from "@playwright/test";
import { openApp, chooseTextSetting } from "./helpers/app";
import { openDojo, type MidiControl } from "./helpers/p12";

/** P23-48: one key press sounds once in Chord Dojo. P23-48-fix-1: Voicing Loop keeps the base teal; Bass Practice's entry is purple. */

const TEAL = "rgb(66, 216, 198)";
const TEAL_SOFT = "rgb(18, 59, 58)";
const BP = "rgb(167, 156, 255)";
const RIGHT_HAND = "rgb(34, 211, 238)";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

async function countPianoStarts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as typeof window & { __p48Starts: number };
    w.__p48Starts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer && this.buffer.duration > 0.1) w.__p48Starts++;
      return start.apply(this, args);
    };
  });
}
const starts = (page: Page) => page.evaluate(() => (window as typeof window & { __p48Starts: number }).__p48Starts);
const emit = (page: Page, notes: number[], on = true) =>
  page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, on), { notes, on });

test("the guided course sounds a key once, and a list screen does not sound it", async ({ page }) => {
  await countPianoStarts(page);
  await openDojo(page);
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  await expect.poll(async () => {
    const before = await starts(page);
    await emit(page, [60]);
    await page.waitForTimeout(150);
    await emit(page, [60], false);
    return (await starts(page)) - before;
  }, { message: "the piano is ready in the guided course" }).toBe(1);
  const before = await starts(page);
  await emit(page, [64]);
  await page.waitForTimeout(300);
  expect(await starts(page) - before).toBe(1);
  await emit(page, [64], false);

  await page.reload();
  // P23-48: a reload lands on Home; the list screen is reached through the sidebar again.
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.evaluate(async () => { await (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.connect(); });
  await page.getByRole("button", { name: "型の一覧", exact: true }).click();
  await expect(page.locator(".dojo")).toHaveAttribute("data-dojo-screen", "choose");
  await expect(page.locator(".dojo")).toHaveAttribute("data-dojo-midi-audio", "off");
  const silent = await starts(page);
  await emit(page, [62]);
  await page.waitForTimeout(300);
  expect(await starts(page)).toBe(silent);
  await emit(page, [62], false);
});

test("the sidebar: Voicing Loop and Chord Dojo are teal, Bass Practice is purple", async ({ page }) => {
  await openApp(page);
  const bar = (nav: string) => page.locator(`[data-nav="${nav}"]`).evaluate((element) => getComputedStyle(element, "::before").backgroundColor);
  const mark = (nav: string) => page.locator(`[data-nav="${nav}"] .lv-nav-mark rect`).evaluate((element) => getComputedStyle(element).fill);
  await expect.poll(() => mark("voicing-loop")).toBe(TEAL_SOFT);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.locator('[data-nav="voicing-loop"]')).toHaveAttribute("aria-current", "page");
  expect(await bar("voicing-loop")).toBe(TEAL);
  expect(await mark("voicing-loop")).toBe(TEAL);
  await page.locator('[data-nav="chord-dojo"]').click();
  expect(await bar("chord-dojo")).toBe(TEAL);
  await page.locator('[data-nav="bass-practice"]').click();
  expect(await bar("bass-practice")).toBe(BP);
});

test("Voicing Loop keeps the base teal and the right hand is the keyboard's cyan", async ({ page }) => {
  // P23-48: the real picker with this saved progression, not the fixture's practice snapshot (P23-29's p528Direct).
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 | Dm7 | G7 |");
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await capture.getByTestId("text-progression-name").fill("明るい循環");
  await capture.getByTestId("text-progression-save").click();
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  const accent = () => workspace.evaluate((element) => getComputedStyle(element).getPropertyValue("--lv-accent").trim());
  expect(await accent()).toBe("#42d8c6");
  const primary = workspace.locator(".lv-button-primary").first();
  await expect(primary).toBeVisible();
  expect(await primary.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("rgb(82, 227, 209)");
  await page.keyboard.press("Enter");
  await expect(page.locator(".voicing-hand-right .voicing-hand-name").first()).toHaveCSS("color", RIGHT_HAND);
  await expect(page.locator(".voicing-hand-left .voicing-hand-name").first()).toHaveCSS("color", "rgb(245, 158, 11)");
  const topbarAccent = await page.locator(".lv-app-header").evaluate((element) => getComputedStyle(element).getPropertyValue("--lv-accent").trim());
  expect(topbarAccent).toBe("#42d8c6");
});

test("the Vault marks: VL and CD are both teal (CD is no longer Bass purple)", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| Dm7 | G7 | Cmaj7 |");
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await capture.getByTestId("text-progression-name").fill("ツーファイブ");
  await capture.getByTestId("text-progression-save").click();
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().click();
  await expect(page.locator('.lv-vault-go-mark[data-kind="vl"]')).toHaveCSS("color", TEAL);
  await expect(page.locator('.lv-vault-go-mark[data-kind="cd"]')).toHaveCSS("color", TEAL);
});
