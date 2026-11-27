import { expect, test, type Page } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P25 V35: the shape menu answers the pointer, the opened lists slide in and fade out, and the MIDI capture
 * screen says 「ドロップ」.
 */

async function openRuleFixture(page: Page) {
  await page.goto("/?p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  const sidebar = page.locator('[data-nav="voicing-loop"]');
  if (await sidebar.isVisible()) {
    await sidebar.click();
  } else {
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  return workspace;
}

test("V35 the shape menu's items answer hover", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspace = await openRuleFixture(page);
  await workspace.getByTestId("voicing-loop-shape-button").click();
  const menu = workspace.getByTestId("voicing-loop-shape-menu");
  await expect(menu).toHaveAttribute("data-presence", "shown");
  const item = menu.locator('[data-shape="shell"]');
  const before = await item.evaluate((element) => getComputedStyle(element).backgroundColor);
  await item.hover();
  await page.waitForTimeout(200);
  const after = await item.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(after).not.toBe(before);
});

test("V35 the opened list slides in, fades out, and skips the motion when asked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspace = await openRuleFixture(page);
  const countIn = workspace.locator("#voicing-loop-count-in");
  const list = page.locator("#lv-select-menu");
  await countIn.click();
  // The list is drawn hidden first (enter) and settles into its place.
  const early = await list.getAttribute("data-presence");
  expect(["enter", "shown"]).toContain(early);
  await expect(list).toHaveAttribute("data-presence", "shown", { timeout: 300 });
  await page.keyboard.press("Escape");
  await expect(list).toHaveAttribute("data-presence", "exit", { timeout: 150 });
  await expect(list).toHaveCount(0, { timeout: 400 });

  // With reduced motion the list goes at once (no leaving motion is left to watch).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await countIn.click();
  await expect(list).toHaveAttribute("data-presence", "shown", { timeout: 500 });
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0, { timeout: 300 });
});

test("V35 the text import's key list fades out where it was", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
  await capture.getByTestId("text-progression-key").click();
  const list = page.locator('[data-testid="text-progression-key-list"]');
  await expect(list).toBeVisible();
  // The 「enter」 frame is 4px higher and the 120ms move is still running while the attribute already says
  // 「shown」; the place to compare against is where the list has settled.
  await expect(list).toHaveAttribute("data-presence", "shown", { timeout: 2_000 });
  await expect.poll(async () => list.evaluate((node) => getComputedStyle(node).transform), { timeout: 2_000 }).toBe("none");
  // P25 V40: the leaving frame is read as it happens (a MutationObserver), not by waiting a fixed time —
  // a slow machine would otherwise run past the 100ms 「exit」 and the test would fail at random.
  type CloseState = { before: { left: number; top: number }; exit?: { left: number; top: number } };
  const started = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-testid="text-progression-key-list"]');
    if (node === null) return false;
    const box = node.getBoundingClientRect();
    const state: CloseState = { before: { left: box.left, top: box.top } };
    Object.assign(window, { __p25Close: state });
    const observer = new MutationObserver(() => {
      if (node.getAttribute("data-presence") !== "exit") return;
      const at = node.getBoundingClientRect();
      state.exit = { left: at.left, top: at.top };
      observer.disconnect();
    });
    observer.observe(node, { attributes: true, attributeFilter: ["data-presence"] });
    return true;
  });
  expect(started).toBe(true);
  await page.keyboard.press("Escape");
  const readClose = () => page.evaluate(() => {
    const state = (window as typeof window & { __p25Close?: CloseState }).__p25Close;
    return state === undefined ? undefined : { before: state.before, exit: state.exit };
  });
  await expect.poll(async () => (await readClose())?.exit !== undefined, { timeout: 1_000 }).toBe(true);
  const close = await readClose();
  expect(close?.exit).not.toBeUndefined();
  expect(Math.abs(close!.exit!.left - close!.before.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(close!.exit!.top - close!.before.top)).toBeLessThanOrEqual(1);
  await expect(list).toHaveCount(0, { timeout: 1_000 });
});

test("V35 the MIDI capture screen says ドロップ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="capture"]').click();
  const main = page.locator("#main-content");
  await expect(page.locator("[data-capture-midi-drop-zone]")).toBeVisible();
  await expect(main).toContainText("曲の MIDI をドロップすると鳴っている音からコードを読み取ります。");
  await expect(main).toContainText("MIDI をドロップ");
  await expect(main).toContainText("MIDIファイルをここにドロップ");
  await expect(main).toContainText(".mid / .midi ・ この画面のどこにドロップしても読み込みます");
  await expect(main).not.toContainText("落とす");
});
