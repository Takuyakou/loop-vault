import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

test("P8.8.5 Capture MIDI/Text tabs keep one DOM node and identical geometry", async ({ page }) => {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
  for (const width of [1920, 1440, 1280, 1024, 899, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const frame = page.getByTestId("capture-mode-tabs-frame");
    const tabs = page.getByTestId("capture-input-mode");
    await expect(tabs).toHaveCount(1);
    await frame.evaluate(element => element.setAttribute("data-stability-token", "same-node"));
    const before = {
      frame: await frame.boundingBox(),
      midi: await tabs.getByRole("button", { name: "MIDI" }).boundingBox(),
      text: await tabs.getByRole("button", { name: /テキスト|Text/ }).boundingBox(),
    };
    await tabs.getByRole("button", { name: /テキスト|Text/ }).click();
    await expect(tabs).toHaveCount(1);
    await expect(frame).toHaveAttribute("data-stability-token", "same-node");
    for (const [name, locator] of [
      ["frame", frame],
      ["midi", tabs.getByRole("button", { name: "MIDI" })],
      ["text", tabs.getByRole("button", { name: /テキスト|Text/ })],
    ] as const) {
      const after = await locator.boundingBox();
      const initial = before[name];
      expect(after).not.toBeNull();
      expect(initial).not.toBeNull();
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(after![key] - initial![key])).toBeLessThanOrEqual(1);
      }
    }
    await tabs.getByRole("button", { name: "MIDI" }).click();
    await expect(frame).toHaveAttribute("data-stability-token", "same-node");
    await assertNoHorizontalOverflow(page);
  }
});
