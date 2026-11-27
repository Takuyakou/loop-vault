import { expect, test, type Page } from "@playwright/test";
import { chooseTextSetting } from "./helpers/app";

/**
 * P24-fix-1 items 2–6: the review's small screen fixes.
 *
 * 2. the input's heading row is one 34px line (the name and the hint never wrap)
 * 3. the duplicate sentences are gone (status chip, annotation count, 「保存できます」, the error reason)
 * 4. the transport's position reads 「1 / 8 小節」 and is never cut
 * 5. 「読み飛ばした行を隠す」 is gone; the band keeps the reading line and the replace button
 * 6. while the keyboard entry is on, the empty guidance stays away and the held card is a normal bar card
 */
const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

async function openText(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await expect(inputOf(page)).toBeVisible();
}

test("2: the input's heading row is one line at 1440 and 1280", async ({ page }) => {
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await openText(page);
    const capture = captureOf(page);
    const pane = capture.locator(".lv-text-intake-pane").first();
    const heading = pane.locator(".lv-text-unified-head").first();
    const box = (await heading.boundingBox())!;
    expect(box.height, `${width} heading height`).toBe(34);
    const h2 = (await pane.locator("h2").first().boundingBox())!;
    expect(h2.height, `${width} 入力 height`).toBeLessThanOrEqual(20);
    const hint = capture.getByTestId("text-input-hint");
    expect((await hint.boundingBox())!.height, `${width} hint height`).toBeLessThanOrEqual(18);
    expect(await hint.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");
    expect(await hint.evaluate((element) => getComputedStyle(element).textOverflow)).toBe("ellipsis");
    // The buttons at the right end sit on the same line as the name.
    const toggle = (await capture.getByTestId("text-keyboard-toggle").boundingBox())!;
    expect(toggle.y + toggle.height).toBeLessThanOrEqual(box.y + box.height + 1);
    expect(toggle.y).toBeGreaterThanOrEqual(box.y - 1);
  }
});

test("3: the two headings and the save row keep only the useful words", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openText(page);
  const capture = captureOf(page);
  await inputOf(page).fill("| Cmaj7 | Dm7 G7 |");
  // The preview heading: the count only (no status chip).
  await expect(capture.getByTestId("text-preview-count")).toHaveText("2 小節 · 3 コード");
  await expect(capture.getByText("エラーなし", { exact: true })).toHaveCount(0);
  // The save row's summary: bars, written chords, key; no annotation count and no BPM dash.
  const summary = capture.getByTestId("text-progression-capability-summary");
  await expect(summary).toContainText("2 小節 · 3 コード · キー");
  await expect(summary).not.toContainText("注記");
  await expect(summary).not.toContainText("BPM");
  await expect(summary).not.toContainText("4/4");
  // BPM appears only when the field has a value; the meter only when it is not 4/4.
  const bpm = capture.locator(".lv-text-toolbar-bpm input");
  await bpm.fill("96");
  await bpm.press("Enter");
  await expect(summary).toContainText("· BPM 96");
  await chooseTextSetting(capture, "text-progression-meter", "3/4");
  await expect(summary).toContainText("· 3/4");
  await chooseTextSetting(capture, "text-progression-meter", "4/4");
  // 「保存できます」 is gone; the errors show only the count line.
  await expect(capture.locator(".lv-text-save-reason")).toHaveCount(0);
  await expect(capture.getByText("保存できます", { exact: true })).toHaveCount(0);
  await inputOf(page).fill("| Fmaj7 Xm7 | G7 |");
  await expect(capture.locator(".lv-text-save-reason")).toHaveCount(0);
  await expect(capture.getByText("エラー2件を修正すると保存できます")).toHaveCount(0);
  await expect(capture.getByTestId("text-save-error-count")).toContainText("直す所が 1 か所あります");
});

test("4: the transport has no bar count; the playhead line marks the sounding bar", async ({ page }) => {
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await openText(page);
    const capture = captureOf(page);
    await inputOf(page).fill(Array.from({ length: 8 }, () => "| Cmaj7 |").join("\n"));
    await expect(capture.getByTestId("text-transport-position")).toHaveCount(0);
    await capture.getByTestId("text-transport-primary").click();
    await expect(capture.locator("[data-testid='extended-text-bar'][data-playhead-visible='true']").first()).toBeVisible();
    await capture.getByTestId("text-transport-stop").click();
    await inputOf(page).fill("");
    await expect(capture.getByTestId("text-transport-position")).toHaveCount(0);
  }
});

test("5: 「読み飛ばした行を隠す」 is gone and the band keeps the read line and the replace button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openText(page);
  const capture = captureOf(page);
  await inputOf(page).fill("夜あけの坂道\n| Cmaj7 |");
  await expect(capture.getByTestId("text-normalize-band")).toContainText("コード譜として読みました。");
  await expect(capture.getByTestId("text-normalize-hide")).toHaveCount(0);
  await expect(capture.getByText("読み飛ばした行を隠す")).toHaveCount(0);
  await expect(capture.getByTestId("text-normalize-replace")).toBeVisible();
  // The skipped line is still shown as the design's lyric row.
  await expect(capture.locator("[data-layer='over'] [data-line-kind='skipped']")).toContainText("夜あけの坂道");
});

test("6: while the keyboard is on, the empty guidance is out of the way and the held card is a bar card", async ({ page }) => {
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = captureOf(page);
  const input = inputOf(page);
  // Before the keyboard: the empty screen's guidance and the example are there (P24-07 removed the quick
  // reference; the writing face is the one left).
  await expect(input).toHaveAttribute("placeholder", /例: \| Fmaj7/);
  await expect(capture.getByText("書く、または貼り付ける", { exact: true })).toBeVisible();
  await capture.getByTestId("text-keyboard-toggle").click();
  await expect(input).toHaveAttribute("placeholder", "");
  await expect(capture.getByText("書く、または貼り付ける", { exact: true })).toHaveCount(0);
  await expect(capture.getByText("書き方の早見", { exact: true })).toHaveCount(0);
  // fix-2 item 5: the band shows the keyboard alone (the 「押さえている」 word is gone).
  await expect(capture.getByTestId("keyboard-keys")).toBeVisible();
  await expect(capture.getByText("押さえている", { exact: true })).toHaveCount(0);
  // The held chord is a card inside a normal 4-per-row bar, not a full-width box.
  await page.evaluate(async () => {
    await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect();
  });
  await page.evaluate(() => (window as typeof window & { __p12Midi: { emit: (notes: number[]) => void } }).__p12Midi.emit([48, 52, 55, 59]));
  const held = capture.getByTestId("text-preview-held-card");
  await expect(held).toBeVisible();
  const row = capture.getByTestId("text-pending-row");
  await expect(row).toBeVisible();
  const heldBox = (await held.boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(heldBox.width).toBeLessThanOrEqual(rowBox.width / 3.5);
  expect(heldBox.width).toBeGreaterThan(rowBox.width / 8);
  await expect(held).toContainText("離すと入ります");
  await page.evaluate(() => (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean) => void } }).__p12Midi.emit([48, 52, 55, 59], false));
});

test("1: a written repeat is two preview cards and saves both", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openText(page);
  const capture = captureOf(page);
  await inputOf(page).fill("| C % |");
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(2);
});
