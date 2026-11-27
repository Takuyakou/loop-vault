import { expect, test } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P25 V47: a long line scrolls the input sideways when a card near its end is chosen. Both drawn layers
 * (the row numbers and the marks) must follow the textarea's `scrollLeft`, or the text is drawn twice.
 */
const BAR = "Cmaj7{C3 G3 E4 B4 D5}";
const LINE = `| ${Array.from({ length: 6 }, () => [BAR, "Dm7", "G7", "Cmaj7"].join(" | ")).join(" | ")} |`;

test("V47 the editor's layers follow the textarea sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill(LINE);
  const cards = capture.getByTestId("text-preview-band");
  await expect(cards).toHaveCount(24);
  await cards.last().click();

  const read = () => page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!;
    const over = document.querySelector<HTMLElement>('[data-testid="text-intake-marks"] > div')!;
    const under = document.querySelector<HTMLElement>('[data-testid="text-intake-decorations"] > div')!;
    const style = getComputedStyle(textarea);
    const token = [...document.querySelectorAll<HTMLElement>('[data-testid="text-intake-marks"] [data-mark="token"]')]
      .find((mark) => mark.dataset.spanStart === String(textarea.selectionStart));
    const canvas = document.createElement("canvas").getContext("2d")!;
    canvas.font = `${style.fontSize} ${style.fontFamily}`;
    const prefix = textarea.value.slice(0, textarea.selectionStart);
    const box = textarea.getBoundingClientRect();
    const x = (transform: string) => {
      const matrix = /matrix\(([^)]+)\)/.exec(transform);
      return matrix === null ? undefined : Number(matrix[1]!.split(",")[4]!);
    };
    return {
      scrollLeft: textarea.scrollLeft,
      overX: x(getComputedStyle(over).transform),
      underX: x(getComputedStyle(under).transform),
      tokenLeft: token?.getBoundingClientRect().left,
      expectedLeft: box.left + Number.parseFloat(style.paddingLeft) + canvas.measureText(prefix).width - textarea.scrollLeft,
      selectionStart: textarea.selectionStart,
    };
  });

  // A card at the end of a 24-bar line is chosen while the input is scrolled sideways.
  await expect.poll(async () => (await read()).scrollLeft, { timeout: 5_000 }).toBeGreaterThan(0);
  await expect.poll(async () => {
    const state = await read();
    return Math.abs((state.overX ?? Number.NaN) + state.scrollLeft) <= 1;
  }, { timeout: 5_000 }).toBe(true);
  const scrolled = await read();
  expect(scrolled.selectionStart).toBeGreaterThan(0);
  expect(Math.abs((scrolled.underX ?? Number.NaN) + scrolled.scrollLeft)).toBeLessThanOrEqual(1);
  expect(scrolled.tokenLeft).not.toBeUndefined();
  expect(Math.abs(scrolled.tokenLeft! - scrolled.expectedLeft)).toBeLessThanOrEqual(2);

  // Back to the first card: the caret goes home and the input follows it (the browser keeps the left
  // padding in view, so the scroll settles a few pixels in). Both layers must follow whatever it settles on.
  await cards.first().click();
  await capture.getByTestId("text-progression-input").press("Home");
  await expect.poll(async () => (await read()).scrollLeft, { timeout: 5_000 }).toBeLessThanOrEqual(59);
  const nearStart = await read();
  expect(Math.abs((nearStart.overX ?? Number.NaN) + nearStart.scrollLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs((nearStart.underX ?? Number.NaN) + nearStart.scrollLeft)).toBeLessThanOrEqual(1);

  // At 0 (what the wheel or the scrollbar does) both layers sit at 0.
  await page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="text-progression-input"]')!;
    textarea.scrollLeft = 0;
    textarea.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => (await read()).scrollLeft, { timeout: 5_000 }).toBe(0);
  const start = await read();
  expect(Math.abs(start.overX ?? Number.NaN)).toBeLessThanOrEqual(1);
  expect(Math.abs(start.underX ?? Number.NaN)).toBeLessThanOrEqual(1);
});
