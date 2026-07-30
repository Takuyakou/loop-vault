import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";

test("reduced motionではアニメーションと遷移を実質停止する", async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(true);

  const durations = await page.locator("body *").evaluateAll((elements) =>
    elements.slice(0, 200).map((element) => {
      const style = getComputedStyle(element);
      return {
        animation: style.animationDuration,
        transition: style.transitionDuration,
      };
    }));
  const parse = (value: string) => Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms")
      ? Number.parseFloat(trimmed)
      : Number.parseFloat(trimmed) * 1000;
  }));
  expect(durations.every(({ animation, transition }) =>
    parse(animation) <= 0.01 && parse(transition) <= 0.01)).toBe(true);
});
