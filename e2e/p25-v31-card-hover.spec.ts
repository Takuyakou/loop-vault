import { expect, test } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/** P25 V31: the text card answers hover/focus like Voicing Loop's cards. */
test("V31 text cards lift on hover, keep the ring when selected, and do not lift with reduced motion", async ({ page }) => {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
  const bands = capture.getByTestId("standard-text-preview").getByTestId("text-preview-band");
  const second = bands.nth(1);

  await second.hover();
  await page.waitForTimeout(250);
  const shadow = await second.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).toContain("rgba(0, 0, 0, 0.35)");

  await bands.first().click();
  await bands.first().hover();
  await page.waitForTimeout(250);
  const selectedShadow = await bands.first().evaluate((element) => getComputedStyle(element).boxShadow);
  expect(selectedShadow).toContain("rgb(66, 216, 198)");
  expect(selectedShadow).toContain("rgba(0, 0, 0, 0.35)");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await second.hover();
  // The transform comes back to none through the 140ms transition; wait for the settled value.
  await expect.poll(async () => second.evaluate((element) => getComputedStyle(element).transform), { timeout: 2_000 }).toBe("none");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await capture.getByTestId("standard-text-preview").getByTestId("text-preview-bar-select").first().focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("text-preview-band");
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.activeElement!).transform), { timeout: 2_000 })
    .toBe("matrix(1, 0, 0, 1, 0, -2)");
});
