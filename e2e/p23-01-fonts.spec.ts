import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";

/** P23-01 §5-2: the bundled typefaces and the subdominant colours. */

const MEASURE_FONT = '600 20px "LV Symbols", "Inter", "Noto Sans JP", sans-serif';

test("the app text is Inter + Noto Sans JP, and the monospaced text keeps IBM Plex Mono", async ({ page }) => {
  await openApp(page);
  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    mono: getComputedStyle(document.documentElement).getPropertyValue("--font-mono"),
  }));
  const symbols = fonts.body.indexOf("LV Symbols");
  const inter = fonts.body.indexOf("Inter");
  const noto = fonts.body.indexOf("Noto Sans JP");
  expect(symbols).toBeGreaterThanOrEqual(0);
  expect(inter).toBeGreaterThan(symbols);
  expect(noto).toBeGreaterThan(inter);
  expect(fonts.mono).toContain("LV Symbols");
  expect(fonts.mono).toContain("IBM Plex Mono");
});

test("♭ and ♯ are narrow: a flat takes less than half the width of a full-width letter", async ({ page }) => {
  await openApp(page);
  const widths = await page.evaluate(async (font) => {
    await document.fonts.load('600 20px "LV Symbols"', "♭♯Ⅰ");
    await document.fonts.load('600 20px "Noto Sans JP"', "あ");
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = font;
    return { flat: context.measureText("♭").width, sharp: context.measureText("♯").width, kana: context.measureText("あ").width };
  }, MEASURE_FONT);
  expect(widths.flat).toBeLessThan(10);
  expect(widths.sharp).toBeLessThan(14);
  expect(widths.kana).toBeGreaterThan(19);
});

test("Ⅰ is narrow and Ⅳ is one glyph", async ({ page }) => {
  await openApp(page);
  const widths = await page.evaluate(async (font) => {
    await document.fonts.load('600 20px "LV Symbols"', "♭♯Ⅰ");
    await document.fonts.load('600 20px "Noto Sans JP"', "あ");
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = font;
    return { one: context.measureText("Ⅰ").width, four: context.measureText("Ⅳ").width };
  }, MEASURE_FONT);
  expect(widths.one).toBeLessThan(10);
  expect(widths.four).toBeGreaterThan(12);
  expect(widths.four).toBeLessThan(24);
});

test("the subdominant colours are the yellow pair", async ({ page }) => {
  await openApp(page);
  const colours = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim().toLowerCase();
    return { sd: read("--lv-fn-sd"), sdm: read("--lv-fn-sdm"), t: read("--lv-fn-t"), d: read("--lv-fn-d") };
  });
  expect(colours).toEqual({ sd: "#f5dc4a", sdm: "#b9a03a", t: "#6aa8ff", d: "#ff6b7d" });
});

test("no font file is fetched from the network", async ({ page }) => {
  const fontUrls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\.(woff2?|ttf|otf)$/i.test(path)) fontUrls.push(request.url());
  });
  await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  const origin = new URL(page.url()).origin;
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const url of fontUrls) expect(new URL(url).origin, url).toBe(origin);
});
