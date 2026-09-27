import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

test("Final Capture empty and populated states follow the single-toolbar contract", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  const header = page.locator("header.lv-app-header");
  // P8.9-02: the header shows the screen name only; the old context line is gone.
  await expect(header.locator(".lv-app-header-title")).toHaveText("取り込む");
  await expect(header).not.toContainText("MIDIやテキストからコード進行を採集");
  await expect(header.getByTestId("capture-input-mode")).toHaveCount(1);
  await expect(header.getByTestId("global-metronome")).toContainText("メトロノーム");
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  const toolbar = capture.getByTestId("text-capture-toolbar");
  const empty = capture.getByTestId("standard-text-preview");
  await expect(empty).toContainText("コード進行を入力すると、ここに譜面が表示されます");
  await expect(empty).toContainText("エラーなし");
  await expect(capture.getByTestId("text-progression-capability-summary")).toContainText("BPM —");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  await expect(capture.locator("#text-progression-save-reason")).toContainText("コード進行を入れると保存できます");
  await expect(capture.getByTestId("standard-text-card-details")).toHaveCount(0);
  await expect(capture.getByTestId("text-progression-inspector")).toHaveCount(0);
  const fontFaces = await page.evaluate(async () => {
    const sans = await document.fonts.load('400 14px "IBM Plex Sans JP"', "日本語");
    const mono = await document.fonts.load('400 14px "IBM Plex Mono"', "Cmaj7");
    return { sans: sans.length, mono: mono.length, body: getComputedStyle(document.body).fontFamily };
  });
  expect(fontFaces.sans).toBeGreaterThan(0);
  expect(fontFaces.mono).toBeGreaterThan(0);
  expect(fontFaces.body).toContain("IBM Plex Sans JP");
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 Dm7 | G7 Cmaj7 |");
  await expect(capture.getByTestId("text-progression-save")).toBeEnabled();
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(4);
  await expect(capture.getByTestId("standard-text-card-details")).toHaveCount(1);
  await expect(capture.getByTestId("text-progression-inspector")).toHaveCount(1);
  const mode = (await capture.getByTestId("text-mode-standard").boundingBox())!;
  const primary = (await capture.getByTestId("text-transport-primary").boundingBox())!;
  const name = (await capture.getByTestId("text-progression-name").boundingBox())!;
  expect(Math.abs(mode.y - primary.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(name.y - primary.y)).toBeLessThanOrEqual(1);
  const save = (await capture.getByTestId("text-progression-save").boundingBox())!;
  const bounds = (await toolbar.boundingBox())!;
  expect(save.x + save.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  await assertNoHorizontalOverflow(page);
});

test("Final Capture keeps transport states, BPM provenance and offline font access clear", async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
  const bpm = capture.getByTestId("text-progression-bpm");
  await expect(bpm).toHaveValue("");
  await expect(capture.getByTestId("text-progression-capability-summary")).toContainText("BPM —");
  await bpm.fill("120");
  await bpm.press("Enter");
  await expect(capture.getByTestId("text-progression-capability-summary")).toContainText("BPM 120");
  const primary = capture.getByTestId("text-transport-primary");
  const name = capture.getByTestId("text-progression-name");
  const save = capture.getByTestId("text-progression-save");
  const before = await Promise.all([primary, name, save].map(locator => locator.boundingBox()));
  await primary.click();
  await expect(primary).toContainText("一時停止");
  await primary.click();
  await expect(primary).toContainText("再開");
  const after = await Promise.all([primary, name, save].map(locator => locator.boundingBox()));
  before.forEach((box, index) => {
    expect(box).not.toBeNull(); expect(after[index]).not.toBeNull();
    for (const axis of ["x", "y", "width"] as const) {
      expect(Math.abs(after[index]![axis] - box![axis])).toBeLessThanOrEqual(1);
    }
  });
  const loop = capture.getByTestId("text-transport-loop");
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await expect(loop).not.toContainText("ON");
  const metro = page.getByTestId("global-metronome");
  await metro.click();
  await expect(metro).toHaveAttribute("aria-pressed", "true");
  await expect(metro).toHaveAttribute("title", "メトロノーム：ON");
  const audit = await new AxeBuilder({ page: page as never }).include("[data-testid='text-progression-capture']").analyze();
  expect(audit.violations.filter(item => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});
