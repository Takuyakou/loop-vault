import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/** P25 V23 Stage 1: the dotted 「＋」 and the palette over the preview (proposal v4 §8.3). */
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |";

async function capture(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const view = page.getByTestId("text-progression-capture");
  await view.getByTestId("text-progression-input").fill(PROGRESSION);
  await page.evaluate(() => document.fonts.ready);
  return view;
}

async function geometry(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid='extended-text-bar']")]
    .map((node) => { const rect = node.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }; }));
}

async function foldedInPalette(page: Page) {
  return page.evaluate(() => {
    const palette = document.querySelector<HTMLElement>("[role='dialog'][aria-label='次のコード']");
    if (!palette) return ["no palette"];
    const isInline = (element: Element) => getComputedStyle(element).display.startsWith("inline") && getComputedStyle(element).display !== "inline-block" && getComputedStyle(element).display !== "inline-flex";
    const found: string[] = [];
    for (const button of palette.querySelectorAll("button")) {
      const runs = new Map<Element, DOMRect[]>();
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        let box = node.parentElement!;
        while (box !== button && isInline(box)) box = box.parentElement!;
        const range = document.createRange();
        range.selectNodeContents(node);
        runs.set(box, [...(runs.get(box) ?? []), ...range.getClientRects()]);
      }
      for (const rects of runs.values()) {
        const tops = new Set(rects.filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top)));
        if (tops.size > 1) found.push(`${(button.textContent ?? "").trim()} (${tops.size})`);
      }
    }
    return found;
  });
}

for (const [width, height] of [[1024, 720], [1280, 720], [1440, 900]] as const) {
  test(`V23 the palette keeps the preview and itself inside the window at ${width}`, async ({ page }) => {
    const view = await capture(page, width, height);
    const ghost = view.getByTestId("text-suggestion-ghost");
    await expect(ghost).toBeVisible();
    await expect(ghost).toHaveAttribute("aria-label", "次のコードを足す");
    const before = await geometry(page);
    await ghost.click();
    const palette = page.getByRole("dialog", { name: "次のコード" });
    await expect(palette).toBeVisible();
    const after = await geometry(page);
    expect(after, "opening the palette does not move the preview").toEqual(before);
    const box = (await palette.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 0.5);
    const inner = await palette.evaluate((element) => {
      const scroll = element.querySelector<HTMLElement>("[data-testid='text-suggestion-scroll']") ?? element;
      return { scrollLeft: scroll.scrollWidth - scroll.clientWidth, scrollTop: scroll.scrollHeight - scroll.clientHeight };
    });
    expect(inner.scrollLeft, "the palette does not scroll sideways").toBeLessThanOrEqual(1);
    expect(await foldedInPalette(page), "no button's words fold in the palette").toEqual([]);
    await palette.getByRole("button", { name: "閉じる(Esc)" }).click();
    await expect(palette).toBeHidden({ timeout: 2000 });
    expect(await geometry(page)).toEqual(before);
  });
}

test("V23 a 2-beat bar stays open in the palette and joins the text when it fills", async ({ page }) => {
  const view = await capture(page, 1440, 900);
  await view.getByTestId("text-suggestion-ghost").click();
  const palette = page.getByRole("dialog", { name: "次のコード" });
  await palette.getByRole("button", { name: "2 拍 2" }).click();
  const input = view.getByTestId("text-progression-input");
  const before = await input.inputValue();
  await palette.getByTestId("text-suggestion-add").first().click();
  expect(await input.inputValue()).toBe(before);
  await expect(view.locator("[data-testid='text-suggestion-ghost'] [data-pending='true']").first()).toBeVisible();
  await palette.getByTestId("text-suggestion-add").first().click();
  await expect.poll(async () => (await input.inputValue()).length).toBeGreaterThan(before.length);
  expect((await input.inputValue()).split("|").length).toBeGreaterThan(before.split("|").length);
});
