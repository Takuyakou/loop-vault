import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/** P25 V26: the palette's room is the whole working area, its tooltips are not cut, and its length follows the bar before. */
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

async function saveOnce(page: Page, text: string) {
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-name").fill("P25 V26 保存");
  await capture.getByTestId("text-progression-save").click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  await capture.getByTestId("text-progression-input").fill(text);
}

const TEXT = "| Fmaj7 | E7 | Am7 | C7 |";
for (const saved of [false, true]) {
  for (const [width, height] of [[1024, 720], [1280, 720], [1440, 900]] as const) {
    test(`V26-1 the header row and all seven 「＋」 are in sight without scrolling (${width}x${height}, saved panel ${saved ? "shown" : "not shown"})`, async ({ page }) => {
      const capture = await textCapture(page, width, height, TEXT);
      if (saved) await saveOnce(page, TEXT);
      await capture.getByTestId("text-suggestion-ghost").click();
      const palette = page.getByRole("dialog", { name: "次のコード" });
      await expect(palette).toBeVisible();
      await page.waitForTimeout(450);
      const box = (await palette.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height - 12 + 0.5);
      const body = palette.getByTestId("text-suggestion-scroll");
      const scrolls = await body.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
      expect(scrolls).toBe(false);
      const head = (await palette.getByTestId("text-suggestion-head").boundingBox())!;
      expect(head.y).toBeGreaterThanOrEqual(box.y - 0.5);
      const adds = palette.getByTestId("text-key-chord-add");
      expect(await adds.count()).toBe(7);
      for (let index = 0; index < 7; index += 1) {
        const add = (await adds.nth(index).boundingBox())!;
        expect(add.y).toBeGreaterThanOrEqual(box.y - 0.5);
        expect(add.y + add.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
      }
      // The sides stay inside the preview's frame.
      const frame = (await capture.getByTestId("standard-text-preview-scroll").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    });
  }
}

test("V26-2 a palette tooltip is drawn whole over the palette's own edge (the first chip's 「＋」)", async ({ page }) => {
  const capture = await textCapture(page, 1280, 900, TEXT);
  await capture.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await expect(palette).toBeVisible();
  await page.waitForTimeout(450);
  async function wholeTip(target: ReturnType<typeof palette.locator>, above: boolean) {
    await target.hover();
    const tip = page.getByRole("tooltip").filter({ visible: true }).first();
    await expect(tip).toBeVisible();
    const box = (await tip.boundingBox())!;
    const targetBox = (await target.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(above ? box.y + box.height <= targetBox.y + 0.5 : box.y >= targetBox.y + targetBox.height - 0.5).toBe(true);
    // On the top layer (a child of the body, above the popover layer) and its text is whole (not cut by any frame).
    const facts = await tip.evaluate((element) => ({
      parent: element.parentElement === document.body,
      z: Number(getComputedStyle(element).zIndex),
      cut: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
      palette: Number(getComputedStyle(document.querySelector("[role='dialog'][aria-label='次のコード']")!).zIndex),
    }));
    expect(facts.parent).toBe(true);
    expect(facts.z).toBeGreaterThan(facts.palette);
    expect(facts.cut).toBe(false);
  }
  await wholeTip(palette.getByTestId("text-suggestion-add").first(), false);
  // V28: the candidate body and the key chords carry no explanation tooltip.
  await palette.getByTestId("text-suggestion-preview").first().hover();
  await expect(page.getByRole("tooltip").filter({ visible: true })).toHaveCount(0);
  await palette.getByTestId("text-key-chord-preview").first().hover();
  await expect(page.getByRole("tooltip").filter({ visible: true })).toHaveCount(0);
});

test("V29 the palette's chord names are never cut and every chip stays inside", async ({ page }) => {
  const text = "| Fmaj7 | E7 | Am7 | C7 |";
  const capture = await textCapture(page, 1440, 900, text);
  for (let index = 1; index <= 3; index += 1) {
    await capture.getByTestId("text-progression-name").fill(`P25 V29 丸サ ${index}`);
    await capture.getByTestId("text-progression-save").click();
    await expect(page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).first()).toBeVisible();
    await capture.getByTestId("text-progression-input").fill(text);
  }
  const close = page.locator(".lv-toast-close");
  while (await close.count() > 0) await close.first().click();
  for (const [width, height] of [[1024, 720], [1280, 900], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await capture.getByTestId("text-suggestion-ghost").click();
    const palette = page.getByRole("dialog", { name: "次のコード" });
    await expect(palette).toBeVisible();
    await page.waitForTimeout(450);
    expect(await palette.locator("[data-category='好み']").count()).toBeGreaterThan(0);
    const names = await palette.getByTestId("text-suggestion-name").evaluateAll((nodes) => nodes.map((node) => ({
      scroll: node.scrollWidth, client: node.clientWidth, text: node.textContent,
    })));
    for (const name of names) expect(name.scroll, `${width}: ${name.text}`).toBeLessThanOrEqual(name.client);
    const frame = (await palette.boundingBox())!;
    const chips = await palette.locator(".lv-suggestion-chip").evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    for (const chip of chips) {
      expect(chip.left).toBeGreaterThanOrEqual(frame.x - 0.5);
      expect(chip.right).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    }
    await palette.getByRole("button", { name: "閉じる(Esc)" }).click();
    await expect(palette).toBeHidden({ timeout: 2000 });
  }
});

test("V26-3 the length starts like the bar before: | C G | gives 2 beats, two 「＋」 write | C G | X Y |", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| C G |");
  const input = capture.getByTestId("text-progression-input");
  await capture.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("button", { name: "2 拍 2" })).toHaveAttribute("aria-pressed", "true");
  await palette.getByTestId("text-suggestion-add").first().click();
  await expect.poll(async () => await input.inputValue()).toBe("| C G |");
  await palette.getByTestId("text-suggestion-add").first().click();
  await expect.poll(async () => await input.inputValue()).toMatch(/^\| C G \| \S+ \S+ \|$/);
  await expect(palette.getByRole("button", { name: "2 拍 2" })).toHaveAttribute("aria-pressed", "true");
});

test("V26-3 a one-chord bar before gives one bar, and a picked length is kept", async ({ page }) => {
  const capture = await textCapture(page, 1440, 900, "| C |");
  await capture.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await expect(palette.getByRole("button", { name: "1 小節 1" })).toHaveAttribute("aria-pressed", "true");
  await palette.getByRole("button", { name: "1 拍 3" }).click();
  await palette.getByTestId("text-suggestion-add").first().click();
  await expect(palette.getByRole("button", { name: "1 拍 3" })).toHaveAttribute("aria-pressed", "true");
});
