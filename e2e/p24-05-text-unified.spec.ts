import { expect, test, type Page } from "@playwright/test";
import { openTextCapture, chooseTextSetting } from "./helpers/app";

/**
 * P24-05 05-c: the one text intake, end to end — the design's three screens (empty / pasted / errors),
 * the normalising band, the row faces, the two-way card selection, the error list and the photos.
 */
const MAIN = [
  "夜あけの坂道",
  "",
  "[Aメロ]",
  "| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |",
  "坂の上まで 風がのぼる",
  "まだ眠たい 街をぬけて",
  "",
  "[サビ]",
  "｜　Ｆmaj7　　G7 ｜　Em7　　Am7 ｜",
  "手をふるよ 朝のひかりに",
  "| Dm7 G7 | C△7 C7 |",
  "きみの声が まだ聞こえる",
].join("\n");

const ERRORS = [
  "| Dm7 G7 | Cmaj7 Am7 |",
  "| Fmaj7 Xm7 | G7 |",
  "| Em7 Am7 | Hm7 G7 |",
  "| Fmaj7 G7 | Cmaj7 |",
].join("\n");

const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

/** Hovers a line of the editor by its y position (the rows themselves do not take the pointer). */
async function hoverLine(page: Page, line: number) {
  const frame = captureOf(page).getByTestId("text-intake-editor");
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + Math.min(200, box.width / 2), box.y + 8 + 28 * (line - 0.5));
}

test("1: the empty screen shows the example and the writing face (four dotted bars, no quick reference)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  const input = inputOf(page);
  expect(await input.getAttribute("placeholder")).toBe("例: | Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |");
  await expect(capture.getByText("書く、または貼り付ける", { exact: true })).toBeVisible();
  await expect(capture.getByText("コード譜をそのまま貼っても読めます。歌詞の行は自動で読み飛ばします。", { exact: true })).toBeVisible();
  await expect(capture.getByTestId("text-empty-bar")).toHaveCount(4);
  // P24-07 item 2: the quick reference is gone; the same words are in the 「?」 help.
  await expect(capture.getByTestId("text-writing-guide")).toHaveCount(0);
  await expect(capture.getByText("書き方の早見")).toHaveCount(0);
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  await expect(capture.getByTestId("text-transport-primary")).toBeDisabled();
  // The design asks for no 「why it cannot be used」 sentence on the empty screen.
  await expect(capture.locator("#text-progression-save-reason")).toHaveCount(0);
  await expect(capture.getByTestId("text-save-blocked-hint")).toHaveCount(0);
  await expect(page.getByText("コードを入れると聴けます")).toHaveCount(0);
  await expect(page.getByText("コードを入れると保存できます")).toHaveCount(0);
});

test("2: the pasted lyric chart reads 5 skipped lines, 2 headings, 8 bars and 14 chords, and replaces in 5 lines", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await inputOf(page).fill(MAIN);
  const band = capture.getByTestId("text-normalize-band");
  await expect(band).toContainText("コード譜として読みました。");
  await expect(band).toContainText("歌詞らしい 5 行を読み飛ばし");
  await expect(capture.locator("[data-layer='over'] [data-line-kind='skipped']")).toHaveCount(5);
  await expect(capture.locator("[data-layer='over'] [data-line-kind='heading']")).toHaveCount(2);
  await expect(capture.getByTestId("text-preview-heading")).toHaveCount(2);
  await expect(capture.getByTestId("text-preview-heading").nth(0)).toHaveText("Aメロ");
  await expect(capture.getByTestId("text-preview-heading").nth(1)).toHaveText("サビ");
  await expect(capture.getByTestId("extended-text-bar")).toHaveCount(8);
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(14);
  await expect(capture.getByTestId("text-preview-count")).toHaveText("8 小節 · 14 コード");
  // The row faces and the legend (the design's input pane).
  await expect(capture.locator("[data-layer='over'] [data-line-kind='skipped']").first()).toContainText("歌詞");
  await expect(capture.locator("[data-layer='over'] [data-line-kind='heading']").first()).toContainText("見出し");
  await expect(capture.getByTestId("text-intake-legend")).toContainText("コードの行");
  await expect(capture.getByTestId("text-intake-legend")).toContainText("読み飛ばした行");
  await expect(capture.getByTestId("text-intake-legend")).toContainText("表記をそろえた所");
  // A normalised spelling keeps a dotted underline and the reading as its tooltip.
  await expect(capture.locator("[data-changed='true']").first()).toBeVisible();
  await expect(capture.locator("[data-changed='true'][title='読むときは Cmaj7']")).toHaveCount(1);
  // Replace with the cleaned text, then put the 12 lines back.
  await capture.getByTestId("text-normalize-replace").click();
  await expect(inputOf(page)).toHaveValue("[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |");
  await expect(capture.getByTestId("text-normalize-band")).toContainText("整えたテキストに置き換えました。");
  await expect(capture.getByTestId("text-normalize-band")).toContainText("12 行 → 5 行。音は変わっていません。");
  await capture.getByTestId("text-normalize-undo").click();
  await expect(inputOf(page)).toHaveValue(MAIN);
});

test("3: 「コードとして読む」 turns a skipped line into a code line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await inputOf(page).fill("夜あけ\n| C |");
  await expect(capture.locator("[data-layer='over'] [data-line-kind='skipped']")).toHaveCount(1);
  await hoverLine(page, 1);
  const readAsCode = capture.getByTestId("text-read-as-code");
  await expect(readAsCode).toBeVisible();
  await readAsCode.click();
  await expect(capture.locator("[data-layer='over'] [data-line-kind='skipped']")).toHaveCount(0);
  await expect(capture.locator("[data-layer='over'] [data-line-kind='code']")).toHaveCount(2);
  // The line is read now, so the grammar says why its words are not chords.
  await expect(capture.getByTestId("text-progression-diagnostics")).toContainText("「夜あけ」");
  await expect(inputOf(page)).toHaveValue("夜あけ\n| C |");
});

test("4: the preview card and the input's characters select each other", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  const input = inputOf(page);
  await input.fill("| Cmaj7 Am7 | Dm7 G7 |");
  const am = capture.getByTestId("text-preview-band").filter({ hasText: "Am7" });
  await am.click();
  expect(await input.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe("Am7");
  await expect(capture.locator("[data-layer='under'] [data-selected-token='true']").first()).toHaveText("Am7");
  // Clicking the typed characters selects the same card and its row.
  const token = capture.locator("[data-layer='over'] [data-mark='token']").filter({ hasText: /^Dm7$/ }).first();
  await token.click();
  expect(await input.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe("Dm7");
  await expect(capture.getByTestId("text-preview-band").filter({ hasText: "Dm7" })).toHaveAttribute("data-selected", "true");
  await expect(capture.getByTestId("text-progression-inspector-row")).toContainText("Dm7");
});

test("5: the two errors are named, only H→B can be fixed, and the readable cards still play", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await inputOf(page).fill(ERRORS);
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await expect(capture.getByTestId("text-progression-diagnostics")).toContainText("直す所が 2 か所あります");
  const items = capture.getByTestId("text-progression-diagnostics").locator("li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("2 行目 · 3 小節目");
  await expect(items.nth(0)).toContainText("Xm7");
  await expect(items.nth(0).getByTestId("text-diagnostic-fix")).toHaveCount(0);
  await expect(items.nth(1)).toContainText("3 行目 · 6 小節目");
  await expect(items.nth(1)).toContainText("Hm7");
  await expect(capture.getByTestId("text-preview-count")).toHaveText("8 小節のうち 6 小節は読めています");
  await expect(capture.getByTestId("text-preview-card-error")).toHaveCount(2);
  // The unreadable card shows 「読めません」; the readable Fmaj7 next to it still plays.
  await expect(capture.getByTestId("text-preview-card-error").first()).toContainText("読めません");
  await capture.getByTestId("text-preview-band").filter({ hasText: "Fmaj7" }).first().click();
  await expect(capture.getByTestId("text-progression-inspector-row")).toContainText("Fmaj7");
  // 「ここへ移動」 selects the typed text.
  await items.nth(0).getByTestId("text-diagnostic-move").click();
  expect(await inputOf(page).evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe("Xm7");
  // 「Bm7 に直す」 rewrites only that word.
  await items.nth(1).getByTestId("text-diagnostic-fix").click();
  await expect(inputOf(page)).toHaveValue("| Dm7 G7 | Cmaj7 Am7 |\n| Fmaj7 Xm7 | G7 |\n| Em7 Am7 | Bm7 G7 |\n| Fmaj7 G7 | Cmaj7 |");
  await expect(capture.getByTestId("text-progression-diagnostics")).toContainText("直す所が 1 か所あります");
  await expect(capture.getByTestId("text-preview-card-error")).toHaveCount(1);
  // The save line says how many places are left and the save stays closed.
  await expect(capture.getByTestId("text-save-error-count")).toHaveText("直す所が 1 か所あります");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
});

test("6: three and five chords in a bar are read (no error), equally divided", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await inputOf(page).fill("| C Dm G7 |\n| C Dm G7 F Am |");
  await expect(capture.getByTestId("text-progression-diagnostics")).toHaveCount(0);
  await expect(capture.getByTestId("extended-text-bar")).toHaveCount(2);
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(8);
  await expect(capture.getByTestId("text-progression-save")).toBeEnabled();
});

test("7: 3/4 can be chosen and saved", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  await chooseTextSetting(capture, "text-progression-meter", "3/4");
  await expect(capture.getByTestId("text-progression-meter")).toHaveAttribute("data-value","3/4");
  await inputOf(page).fill("| C | Dm |");
  await expect(capture.getByTestId("extended-text-bar")).toHaveCount(2);
  await expect(capture.getByTestId("text-progression-save")).toBeEnabled();
  await capture.getByTestId("text-progression-save").click();
  await expect(page.getByText("保存しました")).toBeVisible();
});

test("8: 「音を細かく直す」 is offered only for 4/4 with 1, 2 or 4 chords in a bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  const convert = () => capture.getByTestId("text-progression-convert");
  await inputOf(page).fill("| C Dm |");
  await expect(convert()).toBeEnabled();
  await inputOf(page).fill("| C Dm G7 |");
  await expect(convert()).toBeDisabled();
  await expect(convert()).toHaveAttribute("title", "この書き方では使えません(4/4 で 1 小節に 1・2・4 個の時に使えます)");
  await chooseTextSetting(capture, "text-progression-meter", "3/4");
  await inputOf(page).fill("| C |");
  await expect(convert()).toBeDisabled();
});

test("the photos: empty, pasted, errors and the long chart at 1440x900 and 1280x800", async ({ page }) => {
  test.setTimeout(300_000);
  // P24-fix-1 item 7: wait for fonts and every running animation (the mode switch was caught mid-move).
  const settle = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const animations = typeof document.getAnimations === "function" ? document.getAnimations() : [];
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
    await page.waitForTimeout(60);
  };
  const shot = async (path: string) => { await settle(); await page.screenshot({ path }); };
  const LONG = Array.from({ length: 32 }, (_value, index) => `| ${["Cmaj7", "Am7", "Dm7", "G7"][index % 4]} |`).join("\n");
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    const capture = await openTextCapture(page);
    await shot(`p89-generated/P24-05/D-empty-${size.width}.png`);
    await inputOf(page).fill(MAIN);
    await shot(`p89-generated/P24-05/D-pasted-${size.width}.png`);
    await inputOf(page).fill(ERRORS);
    await chooseTextSetting(capture, "text-progression-key", "C major");
    await shot(`p89-generated/P24-05/D-errors-${size.width}.png`);
    await inputOf(page).fill(LONG);
    await inputOf(page).evaluate((element: HTMLTextAreaElement) => { element.scrollTop = element.scrollHeight; });
    await capture.getByTestId("standard-text-preview-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await shot(`p89-generated/P24-05/D-long-${size.width}.png`);
  }
});
