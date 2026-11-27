import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/** P25 V24: the fixes the lead's check 4 asked for (palette, band, help, transport). */
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |";

async function textCapture(page: Page, width = 1440, height = 900, text = PROGRESSION) {
  await page.setViewportSize({ width, height });
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await page.evaluate(() => document.fonts.ready);
  return capture;
}

test("V24-1/2 the palette shows the card's degrees and chord names", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| C7 |");
  await capture.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await expect(palette).toBeVisible();
  const first = palette.getByTestId("text-suggestion-preview").first();
  // The degree is a roman numeral (not the old semitone+1 number) and the name uses ♯/♭.
  await expect(first.locator("span").first()).toHaveText(/[ⅠⅡⅢⅣⅤⅥⅦ]/);
  const keyChord = palette.getByTestId("text-key-chord-preview").first();
  await expect(keyChord.locator("span").first()).toHaveText(/[ⅠⅡⅢⅣⅤⅥⅦ]/);
  // C7 never comes back (same root), so the old C7sus4 candidate is gone.
  await expect(palette.getByTestId("text-suggestion-preview").filter({ hasText: "C7sus4" })).toHaveCount(0);
});

test("V24-5/6 the palette is inside the preview and the open bar is one cell", async ({ page }) => {
  for (const [width, height] of [[1024, 720], [1280, 720], [1440, 900]] as const) {
    const capture = await textCapture(page, width, height);
    await capture.getByTestId("text-suggestion-ghost").click();
    const palette = page.getByRole("dialog", { name: "次のコード" });
    await expect(palette).toBeVisible();
    await page.waitForTimeout(450);
    const preview = capture.getByTestId("standard-text-preview-scroll");
    const [box, frame] = await Promise.all([palette.boundingBox(), preview.boundingBox()]);
    expect(box).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(frame!.x + 13.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(frame!.x + frame!.width - 13.5);
    // V26-1: the sides are the preview's frame; the height is the working area (to 12px above the window's bottom).
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) - 12 + 0.5);
    // A 2-beat chord stays in the open bar: one dashed cell holding the card and the remaining +.
    await palette.getByRole("button", { name: "2 拍 2" }).click();
    await palette.getByTestId("text-suggestion-add").first().click();
    const cell = capture.getByTestId("text-suggestion-ghost");
    const cellBox = (await cell.boundingBox())!;
    const card = cell.locator("[data-pending='true']").first();
    const plus = cell.getByRole("button", { name: "次のコードを足す" });
    const cardBox = (await card.boundingBox())!;
    const plusBox = (await plus.boundingBox())!;
    expect(cardBox.x).toBeGreaterThanOrEqual(cellBox.x);
    expect(plusBox.x + plusBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 0.5);
    await page.keyboard.press("Escape");
    await capture.getByTestId("text-progression-input").fill("");
  }
});

test("V24-8 the help face reaches the window bottom and its inside scrolls", async ({ page }) => {
  const capture = await textCapture(page);
  await capture.getByTestId("text-help").click();
  const face = page.getByTestId("text-help-face");
  await expect(face).toBeVisible();
  await page.waitForTimeout(250);
  const box = (await face.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(901);
  expect(box.y + box.height).toBeGreaterThanOrEqual(888);
  await face.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(face.getByText("元に戻す(入力欄の外でも)")).toBeVisible();
});

test("V24-9 the band's header items do not overlap", async ({ page }) => {
  const capture = await textCapture(page, 1024, 720);
  await capture.locator("[data-testid='text-preview-band']").first().click();
  const head = page.getByTestId("text-dock-head");
  await expect(head).toBeVisible();
  for (const [width, height] of [[768, 640], [1024, 720], [1280, 720], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const boxes = await head.evaluate((element) => [...element.children]
      .map((child) => child.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        expect(overlap, `${width}: ${i} and ${j} overlap`).toBe(false);
      }
    }
  }
});

test("V24-11 the transport has no 「1 / N 小節」; the playhead line marks the bar", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, Array.from({ length: 8 }, () => "| Cmaj7 |").join("\n"));
  await expect(capture.getByTestId("text-transport-position")).toHaveCount(0);
  await capture.getByTestId("text-transport-primary").click();
  await expect(capture.locator("[data-testid='extended-text-bar'][data-playhead-visible='true']").first()).toBeVisible();
});

async function loop(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await page.getByLabel("カウントイン").selectOption("0");
  return page.getByTestId("voicing-loop-transport-primary");
}

test("V25-8 Space starts and pauses wherever the focus is, and presses nothing", async ({ page }) => {
  const primary = await loop(page);
  await expect(primary).toContainText("開始");
  await expect(page.getByRole("button", { name: "開始", exact: true })).toHaveAttribute("title", "開始・一時停止(Space)");
  const fingering = page.getByRole("switch", { name: "おすすめ運指を表示", exact: true });
  const card = page.getByTestId("voicing-loop-event").nth(2);
  const places = [
    { name: "a switch", focus: () => fingering.focus() },
    { name: "a card", focus: () => card.focus() },
    { name: "a plain button", focus: () => page.getByRole("button", { name: "覚える（Voicing表示）" }).focus() },
  ];
  for (const place of places) {
    await place.focus();
    const checkedBefore = await fingering.getAttribute("aria-checked");
    const pressedBefore = await card.getAttribute("aria-pressed");
    await page.keyboard.press("Space");
    await expect(primary, place.name).toContainText("一時停止");
    await page.keyboard.press("Space");
    await expect(primary, place.name).toContainText("再開");
    // The focused button was not pressed by the Space.
    expect(await fingering.getAttribute("aria-checked"), place.name).toBe(checkedBefore);
    expect(await card.getAttribute("aria-pressed"), place.name).toBe(pressedBefore);
  }
  // Inside the 「形 ▼」 menu (it needs 自動生成).
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await page.getByTestId("voicing-loop-shape-button").click();
  const menu = page.getByTestId("voicing-loop-shape-menu");
  await menu.getByRole("switch").first().focus();
  const smooth = await menu.getByRole("switch").first().getAttribute("aria-checked");
  await page.keyboard.press("Space");
  await expect(primary).toContainText("一時停止");
  expect(await menu.getByRole("switch").first().getAttribute("aria-checked")).toBe(smooth);
  await page.keyboard.press("Escape");
});

test("V25-8 Space works while the loop is playing (it keeps re-rendering); Enter still presses; Shift does nothing", async ({ page }) => {
  const primary = await loop(page);
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect(primary).toContainText("一時停止");
  await page.waitForTimeout(400);
  await page.keyboard.press("Space");
  await expect(primary).toContainText("再開");
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
  await expect(primary).toContainText("再開");
  // Enter on the focused switch presses it.
  const fingering = page.getByRole("switch", { name: "おすすめ運指を表示", exact: true });
  const before = await fingering.getAttribute("aria-checked");
  await fingering.focus();
  await page.keyboard.press("Enter");
  await expect(fingering).not.toHaveAttribute("aria-checked", before!);
});

test("V25-10 Space does nothing inside a text field", async ({ page }) => {
  const primary = await loop(page);
  // A text field that really exists (the BPM field, or else the Ctrl+K search); no field fails the test.
  let input = page.locator("input[type='text']:visible, input[type='number']:visible, input:not([type]):visible, textarea:visible").first();
  if (await input.count() === 0) {
    await page.keyboard.press("Control+k");
    input = page.getByRole("dialog", { name: "探す" }).locator("input").first();
  }
  await expect(input).toBeVisible();
  await input.focus();
  await expect(input).toBeFocused();
  await page.keyboard.press("Space");
  await expect(primary).toContainText("開始");
  await page.keyboard.press("Escape");
});
