import { expect, test } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

test("P8.9-09b 続きから strip keeps 7-character chord names whole and plays a chord on click", async ({ page }) => {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill(
    "| C#m7b5 | Dmaj7 | Eadd9 | Bbmaj7 | Cm7 | F7 | Abmaj7 | G7 | C#m7b5 | Dmaj7 | Eadd9 | Bbmaj7 | Cm7 | F7 | Abmaj7 | G7 |",
  );
  await capture.getByTestId("text-progression-name").fill("Continue strip");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();

  for (const [width, height, cells] of [[1920, 1080, 16], [1440, 900, 16], [960, 1032, 8], [768, 640, 8]] as const) {
    await page.setViewportSize({ width, height });
    await page.locator('[data-nav="home"]').click();
    const strip = page.getByTestId("home-continue").locator(".lv-home-strip");
    await expect(strip).toBeVisible();
    const fit = await strip.evaluate((element) => {
      const chords = [...element.querySelectorAll<HTMLElement>(".lv-home-strip-chord")].filter((chord) => chord.offsetParent !== null);
      return { count: chords.length, clipped: chords.filter((chord) => chord.scrollWidth > chord.clientWidth).map((chord) => chord.textContent) };
    });
    expect(fit.count, `${width}px`).toBe(cells);
    expect(fit.clipped, `${width}px`).toEqual([]);
  }

  const chord = page.getByTestId("home-continue").getByRole("button", { name: "試聴: Dmaj7" }).first();
  await chord.click();
  await expect(chord).toHaveAttribute("data-playing", "true");
  await chord.click();
  await expect(chord).toHaveAttribute("data-playing", "false");
});
