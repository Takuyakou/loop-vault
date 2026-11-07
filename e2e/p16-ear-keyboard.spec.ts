import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

async function start(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await openDojo(page, "midi");
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
}

const measure = (page: Page) => page.evaluate(() => {
  const svg = document.querySelector("[data-testid='ear-keyboard'] svg")!;
  const box = svg.getBoundingClientRect();
  const view = svg.getAttribute("viewBox")!.split(" ").map(Number);
  const white = document.querySelector("[data-testid='ear-keyboard'] [data-key-kind='white'] rect")!.getBoundingClientRect();
  const black = document.querySelector("[data-testid='ear-keyboard'] [data-key-kind='black'] rect")!.getBoundingClientRect();
  const keyboard = document.querySelector("[data-testid='ear-keyboard']")!.getBoundingClientRect();
  return {
    whiteW: white.width, whiteH: white.height, blackW: black.width, blackH: black.height,
    scaleX: box.width / view[2]!, scaleY: box.height / view[3]!,
    scroll: document.documentElement.scrollHeight - window.innerHeight,
    bottom: keyboard.bottom - window.innerHeight,
    runScroll: (document.querySelector("[data-testid='ear-run']") as HTMLElement).scrollHeight - (document.querySelector("[data-testid='ear-run']") as HTMLElement).clientHeight,
  };
});

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 768, height: 640 }, { width: 1024, height: 1000 }]) {
  test(`P16: 鍵盤が縦長にならない ${size.width}×${size.height}: 白鍵の縦横比が 1:3.5〜1:4.5、絵は引き伸ばされない、スクロールしない`, async ({ page }) => {
    await start(page, size);
    await expect(page.getByTestId("ear-keyboard")).toHaveAttribute("data-key-height", /\d+/);
    const m = await measure(page);
    console.log("KEYS", size.width, size.height, JSON.stringify({ ...m, ratio: +(m.whiteH / m.whiteW).toFixed(2), black: +(m.blackH / m.whiteH).toFixed(3) }));
    const ratio = m.whiteH / m.whiteW;
    expect(ratio).toBeGreaterThanOrEqual(3.5);
    expect(ratio).toBeLessThanOrEqual(4.5);
    // the picture is drawn at its own size: the width and the height are scaled the same (1:1), so the keys and the black keys keep their shape
    expect(Math.abs(m.scaleX - 1)).toBeLessThan(0.02);
    expect(Math.abs(m.scaleY - 1)).toBeLessThan(0.02);
    expect(m.blackH / m.whiteH).toBeCloseTo(80 / 128, 1);
    // nothing scrolls, and the whole keyboard is on the screen
    expect(m.scroll).toBeLessThanOrEqual(1);
    expect(m.runScroll).toBeLessThanOrEqual(1);
    expect(m.bottom).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `p89-generated/P16-keyboard/keyboard-${size.width}x${size.height}.png` });
  });
}

test("P16: 練習中の楽譜の調号は1回だけ、色を付けずに描く(押している音と答えを重ねても)。段は文字の色ずれが出ない層で描かれる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  // E♭ (three flats) when the question is major, E♭ minor (six) when it is minor: a key with a signature either way
  await page.getByTestId("ear-tonic").selectOption("3");
  await page.getByTestId("ear-start").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
  // the answer is on the staff (the second hint) and keys are held: two sets of notes are drawn together
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await page.evaluate(() => (window as unknown as { __p12Midi: { emit: (notes: number[], on: boolean, spread: number) => void } }).__p12Midi.emit([40, 52, 59], true, 0));
  await expect(page.locator("[data-testid='ear-score'] .dojo-score-note[data-tone='answer']").first()).toBeVisible();
  await expect(page.locator("[data-testid='ear-score'] .dojo-score-note[data-tone='held']").first()).toBeVisible();
  const key = await page.evaluate(() => {
    const groups = [...document.querySelectorAll("[data-testid='ear-score'] .dojo-score-key")];
    const texts = groups.flatMap((group) => [...group.querySelectorAll("text")]);
    const svg = document.querySelector("[data-testid='ear-score'] svg")!;
    return {
      groups: groups.length,
      count: Number(groups[0]?.getAttribute("data-key-count")),
      texts: texts.length,
      fills: [...new Set(texts.map((text) => getComputedStyle(text).fill))],
      positions: new Set(texts.map((text) => `${text.getAttribute("x")},${text.getAttribute("y")}`)).size,
      layer: getComputedStyle(svg).willChange,
    };
  });
  // once, for both staves (a signature of n signs has 2 × n signs), at places that are all different, in one plain colour
  expect(key.groups).toBe(1);
  expect(key.count).toBeGreaterThanOrEqual(3);
  expect(key.texts).toBe(key.count * 2);
  expect(key.positions).toBe(key.texts);
  expect(key.fills).toEqual(["rgb(200, 212, 223)"]);
  expect(key.layer).toBe("transform");
});
