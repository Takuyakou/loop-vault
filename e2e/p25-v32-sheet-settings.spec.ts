import { expect, test } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P25 V32: a chord sheet's `Key:` / `BPM:` / `Time Signature:` lines are read as settings, `--- A Section ---`
 * lines as headings, and a row tag never sits under the editor's scrollbar.
 */
test("V32 reads the sheet's setting lines and keeps every row tag left of the scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const capture = await openTextCapture(page);
  const sheet = [
    "Key: D minor",
    "BPM: 108",
    "Time Signature: 4/4",
    "",
    "--- A Section ---",
    "",
    "| Dm11 | Em11 |",
    "| Dm11 | Bbmaj9(#11) |",
    "| Gm9 | Abm9 |",
    "| Am11 | A7(#9,b13) |",
    "",
    "--- B Section ---",
    "",
    "| Dm9 | Fmaj9/E |",
    "| Ebmaj9(#11) | D13(#11) |",
    "| Gm11 | C13 |",
    "| Fmaj9 | Em11 Eb13(#11) |",
    ...Array.from({ length: 30 }, (_value, index) => `日本語の歌詞です ${index + 1}`),
  ].join("\n");
  await capture.getByTestId("text-progression-input").fill(sheet);

  const marks = page.getByTestId("text-intake-marks");
  // (a) the three setting lines and the two `---` headings carry their own tags.
  for (const line of [1, 2, 3]) {
    await expect(marks.locator(`[data-line="${line}"][data-line-kind="setting"]`)).toHaveCount(1);
    await expect(marks.locator(`[data-line="${line}"]`)).toContainText("設定");
  }
  for (const line of [5, 12]) {
    await expect(marks.locator(`[data-line="${line}"][data-line-kind="heading"]`)).toHaveCount(1);
    await expect(marks.locator(`[data-line="${line}"]`)).toContainText("見出し");
  }
  await expect(marks.locator('[data-line-kind="setting"]')).toHaveCount(3);
  await expect(marks.locator('[data-line-kind="heading"]')).toHaveCount(2);

  // (b) the editor really scrolls, and every tag ends at or left of the textarea's client area.
  const measured = await page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!;
    const limit = textarea.getBoundingClientRect().left + textarea.clientWidth;
    const tags = [...document.querySelectorAll<HTMLElement>('[data-testid="text-intake-marks"] > div > div')]
      .filter((row) => row.dataset.lineKind === "setting" || row.dataset.lineKind === "heading")
      .map((row) => row.lastElementChild!.getBoundingClientRect().right);
    return { limit, tags, scrolls: textarea.scrollHeight > textarea.clientHeight };
  });
  expect(measured.scrolls).toBe(true);
  expect(measured.tags).toHaveLength(5);
  for (const right of measured.tags) expect(right).toBeLessThanOrEqual(measured.limit + 1);

  // (c) the sheet's values reach the three fields.
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("譜面: D マイナー");
  await expect(capture.locator(".lv-text-toolbar-bpm input")).toHaveValue("108");
  await expect(capture.getByTestId("text-progression-meter-value")).toHaveText("4/4");
});
