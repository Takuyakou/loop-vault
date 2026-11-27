import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/** P25 V25: the fixes the lead's check 5 asked for (band keys and note names, the palette's rows and frame, the help table). */
async function textCapture(page: Page, width: number, height: number, text: string) {
  await page.setViewportSize({ width, height });
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await page.evaluate(() => document.fonts.ready);
  return capture;
}

test("V25-1/2 the band's note names spell the tension from the chord's degree (Em7 rootless: F♯, not G♭)", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |");
  await capture.locator('[data-testid="text-preview-band"][data-chord="Em7"]:visible').first().click();
  const dock = capture.getByTestId("text-card-dock");
  await expect(dock).toBeVisible();
  await dock.locator("[data-shape='rootless']").click();
  const notes = dock.getByTestId("text-dock-notes");
  await expect(notes).toContainText("F♯");
  await expect(notes).not.toContainText("G♭");
});

test("V25-3 the key-chord row listens (no text change); its + adds", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| Cmaj7 | Am7 |");
  const input = capture.getByTestId("text-progression-input");
  await capture.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await expect(palette).toBeVisible();
  const before = await input.inputValue();
  await palette.getByTestId("text-key-chord-preview").first().click();
  expect(await input.inputValue()).toBe(before);
  await expect(palette.getByTestId("text-key-chord-preview").first()).toBeVisible();
  await palette.getByTestId("text-key-chord-add").first().click();
  await expect.poll(async () => (await input.inputValue()).length).toBeGreaterThan(before.length);
});

test("V25-4 one key: the screen's A minor heads the chords and reads the degrees of every candidate", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| Fmaj7 | E7 | Am7 | C7 |");
  await capture.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await expect(palette).toBeVisible();
  await expect(palette).toContainText("A マイナーのコード");
  const fmaj7 = palette.getByTestId("text-key-chord-preview").filter({ hasText: "Fmaj7" }).first();
  await expect(fmaj7.locator("span").first()).toContainText("♭Ⅵ");
});

test("V25-7 the help lists Ctrl+Z once", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| Cmaj7 |");
  await capture.getByTestId("text-help").click();
  const face = page.getByTestId("text-help-face");
  await expect(face).toBeVisible();
  await expect(face.getByText("元に戻す(入力欄の外でも)")).toHaveCount(1);
  await expect(face.getByText("1 つ戻す(入力欄の外)")).toHaveCount(0);
});

for (const [width, height] of [[1024, 720], [1280, 720], [1440, 900]] as const) {
  for (const place of ["top", "middle", "bottom"] as const) {
    test(`V25-6 the palette's header and × stay in sight, every row can be reached (${width}, + at the ${place})`, async ({ page }) => {
      const bars = place === "top" ? 1 : place === "middle" ? 9 : 24;
      const capture = await textCapture(page, width, height, Array.from({ length: bars }, (_, index) => ["| Cmaj7 |", "| Am7 |", "| Dm7 |", "| G7 |"][index % 4]).join("\n"));
      const ghost = capture.getByTestId("text-suggestion-ghost");
      const scroller = capture.getByTestId("standard-text-preview-scroll");
      if (place === "middle") await scroller.evaluate((element) => { element.scrollTop = (element.scrollHeight - element.clientHeight) / 2; });
      if (place === "bottom") await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await ghost.scrollIntoViewIfNeeded();
      await ghost.click();
      const palette = page.getByRole("dialog", { name: "次のコード" });
      await expect(palette).toBeVisible();
      await page.waitForTimeout(450);
      // V26-1: the height is the working area (under the reading-settings row, to 12px above the window's bottom).
      const toolbar = (await capture.getByTestId("text-capture-toolbar").boundingBox())!;
      const box = (await palette.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height - 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(height - 12 + 0.5);
      const head = (await palette.getByTestId("text-suggestion-head").boundingBox())!;
      const close = (await palette.getByRole("button", { name: "閉じる(Esc)" }).boundingBox())!;
      expect(head.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(close.y).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(close.y + close.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      // Scrolling the body never moves the header row.
      const body = palette.getByTestId("text-suggestion-scroll");
      await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const headAfter = (await palette.getByTestId("text-suggestion-head").boundingBox())!;
      expect(Math.abs(headAfter.y - head.y)).toBeLessThan(0.5);
      // The last of the seven chords and the first of the five can both be reached by scrolling.
      const last = palette.getByTestId("text-key-chord-preview").last();
      await last.scrollIntoViewIfNeeded();
      const lastBox = (await last.boundingBox())!;
      const bodyBox = (await body.boundingBox())!;
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height + 0.5);
      expect(lastBox.y).toBeGreaterThanOrEqual(bodyBox.y - 0.5);
      const firstChip = palette.getByTestId("text-suggestion-preview").first();
      await firstChip.scrollIntoViewIfNeeded();
      const chipBox = (await firstChip.boundingBox())!;
      expect(chipBox.y).toBeGreaterThanOrEqual(bodyBox.y - 0.5);
      expect(await palette.getByTestId("text-suggestion-preview").count()).toBe(5);
      expect(await palette.getByTestId("text-key-chord-preview").count()).toBe(7);
    });
  }
}
