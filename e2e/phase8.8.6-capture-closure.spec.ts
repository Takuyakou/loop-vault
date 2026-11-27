import { expect, test, type Page } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P8.8.6 — rewritten for P24-05's one text screen. The old loop over 「標準 / 拡張」 proved the two screens
 * had the same shell; there is one screen now, so the same properties are checked once.
 */
async function capture(page: Page) {
  return page.getByTestId("text-progression-capture");
}

async function assertCaptureNoPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector("#main-content")!;
    return {
      documentVertical: document.documentElement.scrollHeight - innerHeight,
      documentHorizontal: document.documentElement.scrollWidth - innerWidth,
      mainVertical: main.scrollHeight - main.clientHeight,
      mainHorizontal: main.scrollWidth - main.clientWidth,
    };
  });
  for (const value of Object.values(metrics)) expect(value).toBeLessThanOrEqual(1);
  const viewport = page.viewportSize()!;
  for (const selector of ["[data-testid='text-capture-toolbar']", ".lv-text-status-bar"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

test("P8.8.6 the shared status keeps empty, valid, invalid, and explicit BPM", async ({ page }) => {
  await openTextCapture(page);
  const rows = await capture(page);
  const summary = rows.locator("[data-text-status-summary]");
  // fix-1 item 3: no annotation count, no meter 4/4, no BPM dash; the chords and the key stay.
  const emptySummary = "0 小節 · 0 コード · キー 未確定";
  await rows.getByTestId("text-progression-input").fill("");
  await expect(summary).toHaveText(emptySummary);
  // P24-05: the empty screen shows no 「why it cannot be saved」 sentence (the design asks for none).
  await expect(rows.locator(".lv-text-save-reason")).toHaveCount(0);
  await expect(rows.getByTestId("text-progression-save")).toBeDisabled();
  await expect(rows.locator(".lv-text-toolbar-bpm input")).toHaveValue("");
  // P25 V32: an empty BPM field carries the shared BPM as its placeholder; the 「試聴」 note is gone.
  await expect(rows.locator(".lv-text-toolbar-bpm input")).toHaveAttribute("placeholder", "120");
  await expect(rows.locator(".lv-text-toolbar-bpm")).not.toContainText("試聴");
  await rows.getByTestId("text-progression-input").fill("| Cmaj7 Dm7 |");
  await expect(summary).toContainText("1 小節 · 2 コード · キー 未確定");
  const bpm = rows.locator(".lv-text-toolbar-bpm input");
  await bpm.fill("120");
  await bpm.press("Enter");
  await expect(summary).toContainText("BPM 120");
  await expect(bpm).toHaveValue("120");
  await expect(rows.locator(".lv-text-toolbar-bpm")).not.toContainText("試聴");
  await rows.getByTestId("text-progression-input").fill("| Cmaj7 ??? |");
  // fix-1 item 3: the reason sentence is gone; the error count is the one line.
  await expect(rows.locator(".lv-text-save-reason")).toHaveCount(0);
  await expect(rows.getByTestId("text-save-error-count")).toContainText("直す所が 1 か所あります");
});

test("P8.8.6 the shell keeps one toolbar, one footer and no legacy Capture UI", async ({ page }) => {
  test.setTimeout(90_000);
  await openTextCapture(page);
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    const rows = await capture(page);
    const common = ["[data-testid='text-capture-toolbar']", ".lv-text-intake-grid",
      ".lv-text-intake-editor", ".lv-text-intake-pane:last-child", ".lv-text-status-bar",
      "[data-testid='text-progression-name']", "[data-testid='text-progression-save']"];
    for (const selector of common) expect(await page.locator(selector).boundingBox()).not.toBeNull();
    await assertCaptureNoPageOverflow(page);
    await expect(rows.locator(".lv-text-status-bar")).toHaveCount(1);
    await expect(rows.getByTestId("text-progression-save")).toHaveCount(1);
    await expect(rows.locator("[data-testid='legacy-text-key-block'], [data-testid='legacy-text-bpm-block'], [data-testid='legacy-text-conversion-panel'], [data-testid='legacy-text-availability-grid'], [data-testid='text-local-metronome']")).toHaveCount(0);
    // P24-05: the old 「変換前に修正」 list is gone; the one list is the shell's error list.
    await expect(rows.getByText("変換前に修正", { exact: true })).toHaveCount(0);
    await expect(rows.locator("[data-text-status-summary]")).toHaveCount(1);
  }
});

test("P8.8.6 Capture has zero outer overflow for empty and short input at desktop viewports", async ({ page }) => {
  test.setTimeout(90_000);
  await openTextCapture(page);
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    const rows = await capture(page);
    const editor = rows.getByTestId("text-progression-input");
    await editor.fill("");
    await assertCaptureNoPageOverflow(page);
    await editor.fill("| Cmaj7 Dm7 | G7 Cmaj7 |");
    await assertCaptureNoPageOverflow(page);
  }
});

test("P8.8.6 70/150/200-bar charts scroll inside Preview and Editor", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openTextCapture(page);
  const rows = await capture(page);
  for (const barCount of [70, 150, 200]) {
    await rows.getByTestId("text-progression-input").fill(Array.from({ length: barCount }, () => "| C Dm F G |").join("\n"));
    await expect(rows.getByTestId("text-preview-row")).toHaveCount(Math.ceil(barCount / 4));
    await assertCaptureNoPageOverflow(page);
    const overflow = await rows.evaluate(element => {
      const preview = element.querySelector(".lv-text-preview-scroll")!;
      const editor = element.querySelector("textarea")!;
      return { preview: preview.scrollHeight - preview.clientHeight, editor: editor.scrollHeight - editor.clientHeight };
    });
    expect(overflow.preview).toBeGreaterThan(0);
    expect(overflow.editor).toBeGreaterThan(0);
  }
});

test("P8.8.6 long charts keep the outer shell fixed at every required viewport", async ({ page }) => {
  test.setTimeout(120_000);
  await openTextCapture(page);
  const rows = await capture(page);
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    for (const barCount of [70, 150, 200]) {
      await rows.getByTestId("text-progression-input").fill(Array.from({ length: barCount }, () => "| C Dm F G |").join("\n"));
      await expect(rows.locator("[data-text-status-summary]")).toContainText(`${barCount} 小節`);
      await assertCaptureNoPageOverflow(page);
      const scroller = rows.getByTestId("standard-text-preview-scroll");
      const dimensions = await scroller.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
      expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
      await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
      expect(await scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await assertCaptureNoPageOverflow(page);
    }
  }
  // P24-05: the one grammar reads up to 256 bars; only past that does the input stop being savable.
  await rows.getByTestId("text-progression-input").fill(Array.from({ length: 70 }, () => "| C Dm F G |").join("\n"));
  await expect(rows.getByTestId("text-progression-save")).toBeEnabled();
  await rows.getByTestId("text-progression-input").fill(Array.from({ length: 257 }, () => "| C Dm F G |").join("\n"));
  await expect(rows.getByTestId("text-progression-save")).toBeDisabled();
  // fix-1 item 3: the error count is the one line in the save row.
  await expect(rows.getByTestId("text-save-error-count")).toContainText("直す所が");
  await assertCaptureNoPageOverflow(page);
});
