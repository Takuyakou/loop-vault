import { expect, test, type Page } from "@playwright/test";
import { openTextCapture } from "./helpers/app";
import { homeFixture } from "./helpers/p12DojoHome";

/**
 * P24-07 items 1–7. The photos go to p89-generated/P24-07/.
 */
const AT = "2026-11-17T00:00:00.000Z";
const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

const MAIN = [
  "| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |",
  "| Dm7 G7 | Cmaj7 Am7 |",
].join("\n");

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const animations = typeof document.getAnimations === "function" ? document.getAnimations() : [];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  await page.waitForTimeout(60);
}

test("1: the band has two setting buttons with a window each (mouse and keyboard)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = captureOf(page);
  const meter = capture.getByTestId("text-progression-meter");
  const key = capture.getByTestId("text-progression-key");
  await expect(meter).toHaveAttribute("aria-haspopup", "listbox");
  await expect(meter.getByText("拍子")).toBeVisible();
  await expect(key.getByText("キー")).toBeVisible();
  // The old bold labels outside the buttons are gone.
  await expect(capture.locator("label", { hasText: /^拍子$/ })).toHaveCount(0);
  await expect(capture.locator("label", { hasText: /^キー$/ })).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: "p89-generated/P24-07/T-band-1440.png" });

  // Mouse: open and pick.
  await meter.click();
  await expect(capture.getByTestId("text-progression-meter-list")).toBeVisible();
  await expect(capture.getByTestId("text-progression-meter-list").getByRole("option")).toHaveCount(12);
  await capture.getByTestId("text-progression-meter-list").locator('[data-value="3/4"]').click();
  await expect(meter).toHaveAttribute("data-value", "3/4");
  await expect(meter.getByTestId("text-progression-meter-value")).toHaveText("3/4");
  // The key window lists the automatic, the unset and the keys in the old order.
  await key.click();
  const keyOptions = capture.getByTestId("text-progression-key-list").getByRole("option");
  await expect(keyOptions.first()).toHaveText(/自動|未確定/);
  await settle(page);
  await page.screenshot({ path: "p89-generated/P24-07/T-key-open-1440.png" });
  await page.keyboard.press("Escape");
  await expect(capture.getByTestId("text-progression-key-list")).toHaveCount(0);

  // Keyboard: Enter opens, arrows move, Enter picks, Esc closes.
  await meter.focus();
  await page.keyboard.press("Enter");
  await expect(capture.getByTestId("text-progression-meter-list")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(meter).toHaveAttribute("data-value", "4/4");
  await meter.click();
  await page.keyboard.press("Escape");
  await expect(capture.getByTestId("text-progression-meter-list")).toHaveCount(0);

  // Clicking outside closes the window.
  await meter.click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(capture.getByTestId("text-progression-meter-list")).toHaveCount(0);
});

test("2: the empty preview is four dotted bars and no 「書き方の早見」", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  await expect(captureOf(page).getByTestId("text-empty-bar")).toHaveCount(4);
  await expect(captureOf(page).getByText("書き方の早見")).toHaveCount(0);
  await expect(captureOf(page).getByTestId("text-writing-guide")).toHaveCount(0);
  await page.screenshot({ path: "p89-generated/P24-07/T-empty-1440.png" });
});

test("3: a card deletes from its menu, from Delete over it and from the chosen card; Ctrl+Z restores", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = captureOf(page);
  await inputOf(page).fill("| C | F | G | Am |");
  // Right-click the second card: one red 削除.
  const card = capture.getByTestId("text-preview-band").nth(1);
  await card.click({ button: "right" });
  const menu = capture.getByTestId("text-card-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText("削除");
  await expect(menu.getByRole("menuitem")).toHaveCSS("color", "rgb(238, 107, 115)");
  await page.screenshot({ path: "p89-generated/P24-07/T-card-menu-1440.png" });
  await menu.getByRole("menuitem").click();
  await expect(inputOf(page)).toHaveValue("| C | G | Am |");
  // Ctrl+Z in the input puts it back.
  await inputOf(page).focus();
  await page.keyboard.press("Control+z");
  await expect(inputOf(page)).toHaveValue("| C | F | G | Am |");
  // Delete over a card (hover only).
  await capture.getByTestId("text-preview-band").first().hover();
  await page.keyboard.press("Delete");
  await expect(inputOf(page)).toHaveValue("| F | G | Am |");
  // Delete on the chosen card when the caret is not in the input (the card's selection puts it there;
  // clicking the footer's summary takes it out and moves the pointer away from the card).
  await capture.getByTestId("text-preview-band").nth(1).click();
  await capture.getByTestId("text-progression-capability-summary").click();
  await page.mouse.move(5, 700);
  await page.keyboard.press("Backspace");
  await expect(inputOf(page)).toHaveValue("| F | Am |");
  // Undo once puts the deleted card back.
  await inputOf(page).focus();
  await page.keyboard.press("Control+z");
  await expect(inputOf(page)).toHaveValue("| F | G | Am |");
});

test("3: rests and unreadable cards delete by the same rule", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = captureOf(page);
  await inputOf(page).fill("| C _ | G |");
  await capture.getByTestId("text-preview-rest").click({ button: "right" });
  await capture.getByTestId("text-card-menu").getByRole("menuitem").click();
  await expect(inputOf(page)).toHaveValue("| C | G |");
  await inputOf(page).fill("| C Xm7 | G |");
  await capture.getByTestId("text-preview-card-error").click({ button: "right" });
  await capture.getByTestId("text-card-menu").getByRole("menuitem").click();
  await expect(inputOf(page)).toHaveValue("| C | G |");
});

test("4+5: the save row has no 「?」 list and no explanation sentences", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = captureOf(page);
  await inputOf(page).fill(MAIN);
  await expect(capture.getByTestId("text-progression-capability-details")).toHaveCount(0);
  await expect(capture.getByTestId("text-progression-capabilities")).toHaveCount(0);
  await expect(capture.getByTestId("text-progression-capability-summary")).not.toContainText("注記");
  await expect(capture.getByTestId("text-progression-key")).toHaveAttribute("data-value", "auto");
  // No feature-availability sentence (the key-pending one is gone too).
  await expect(capture.locator(".lv-text-save-reason")).toHaveCount(0);
  await expect(capture.getByText("保存後にキーを決めると使えます")).toHaveCount(0);
  await page.screenshot({ path: "p89-generated/P24-07/T-save-row-1440.png" });
});

test("6: 「詳細編集」 is hidden where no inspector opens (manual candidate editor)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  await inputOf(page).fill("| Cmaj7 Dm7 |");
  await captureOf(page).getByTestId("text-progression-convert").click();
  const editor = page.getByTestId("manual-candidate-editor");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "すばやく編集" }).first().click();
  const quick = page.locator("[data-quick-chord-editor]");
  await expect(quick).toBeVisible();
  await expect(quick.getByText("詳細編集")).toHaveCount(0);
  await page.screenshot({ path: "p89-generated/P24-07/Q-quick-editor-manual-1440.png" });
});

test("6: 「詳細編集」 is hidden in the correction workspace too", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p104=normal");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
  await page.getByTestId("correction-card").first().click();
  await page.keyboard.press("F2");
  const quick = page.locator("[data-quick-chord-editor]");
  await expect(quick).toBeVisible();
  await expect(quick.getByText("詳細編集")).toHaveCount(0);
  await page.screenshot({ path: "p89-generated/P24-07/Q-quick-editor-correction-1440.png" });
});

test("7: the three resume bands and their Enter share one rect at 1280/1440/1920", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
  await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), {
    version: 1,
    entries: [
      { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at: AT },
      { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at: AT },
    ],
  });
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
  }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
  // One finished 度数 attempt gives Bass Practice its band.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="bass-practice"]').click();
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await view.getByTestId("degree-show-answer").click();
  await view.locator("[data-review-rating='good']").click();
  await view.getByTestId("degree-next").click();
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();

  for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    const rects: Record<string, { band: number[]; button: number[] }> = {};
    // Bass Practice
    await page.goto("/");
    await page.locator('[data-nav="bass-practice"]').click();
    await page.getByTestId("bass-home-resume").waitFor();
    rects.bp = await bandAndButton(page, "bass-home-resume", "bass-home-resume-open");
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-07/R-bp-${size.width}.png` });
    // Chord Dojo
    await page.goto("/");
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByTestId("home-resume").waitFor();
    rects.cd = await bandAndButton(page, "home-resume", "home-resume-go");
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-07/R-cd-${size.width}.png` });
    // Voicing Loop
    await page.goto("/?p527Status=vl15-picker");
    await page.locator('[data-nav="voicing-loop"]').click();
    await page.getByTestId("voicing-loop-resume").waitFor();
    rects.vl = await bandAndButton(page, "voicing-loop-resume", "voicing-loop-resume-go");
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-07/R-vl-${size.width}.png` });
    for (const part of ["band", "button"] as const) {
      const values = [rects.bp![part], rects.cd![part], rects.vl![part]];
      expect(values[1], `${size.width} ${part} cd/bp`).toEqual(values[0]);
      expect(values[2], `${size.width} ${part} vl/bp`).toEqual(values[0]);
    }
  }
});

async function bandAndButton(page: Page, bandTestId: string, buttonTestId: string) {
  return {
    band: await page.getByTestId(bandTestId).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    }),
    button: await page.getByTestId(buttonTestId).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    }),
  };
}
