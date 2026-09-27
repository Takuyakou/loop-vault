import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

test("P8.8.5 Capture MIDI/Text tabs keep one DOM node and identical geometry", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  for (const width of [1920, 1600, 1440, 1366, 1280, 1024, 899, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const frame = page.getByTestId("capture-mode-tabs-frame");
    const tabs = page.getByTestId("capture-input-mode");
    await expect(tabs).toHaveCount(1);
    await frame.evaluate(element => element.setAttribute("data-stability-token", "same-node"));
    await tabs.getByRole("button", { name: "MIDI" }).evaluate(element => element.setAttribute("data-stability-token", "midi"));
    await tabs.getByRole("button", { name: /テキスト/ }).evaluate(element => element.setAttribute("data-stability-token", "text"));
    const before = {
      frame: await frame.boundingBox(),
      midi: await tabs.getByRole("button", { name: "MIDI" }).boundingBox(),
      text: await tabs.getByRole("button", { name: /テキスト/ }).boundingBox(),
    };
    await tabs.getByRole("button", { name: /テキスト/ }).click();
    await expect(tabs).toHaveCount(1);
    await expect(frame).toHaveAttribute("data-stability-token", "same-node");
    await expect(tabs.getByRole("button", { name: "MIDI" })).toHaveAttribute("data-stability-token", "midi");
    await expect(tabs.getByRole("button", { name: /テキスト/ })).toHaveAttribute("data-stability-token", "text");
    for (const [name, locator] of [
      ["frame", frame],
      ["midi", tabs.getByRole("button", { name: "MIDI" })],
      ["text", tabs.getByRole("button", { name: /テキスト/ })],
    ] as const) {
      const after = await locator.boundingBox();
      const initial = before[name];
      expect(after).not.toBeNull();
      expect(initial).not.toBeNull();
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(after![key] - initial![key]), `${width}px ${name}.${key}`).toBeLessThanOrEqual(1);
      }
    }
    await tabs.getByRole("button", { name: "MIDI" }).click();
    await expect(frame).toHaveAttribute("data-stability-token", "same-node");
    await expect(tabs.getByRole("button", { name: "MIDI" })).toHaveAttribute("data-stability-token", "midi");
    await expect(tabs.getByRole("button", { name: /テキスト/ })).toHaveAttribute("data-stability-token", "text");
    await assertNoHorizontalOverflow(page);
  }
});

test("P8.8.5 header owns persistent metronome ON/OFF across Capture modes", async ({ page }) => {
  await openApp(page);
  const global = page.getByTestId("global-metronome");
  await expect(global).toHaveAttribute("aria-pressed", "false");
  await global.click();
  await expect(global).toHaveAttribute("aria-label", "メトロノーム：ON");
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await page.getByTestId("text-mode-extended").click();
  await expect(page.getByTestId("global-metronome")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("extended-text-intake").getByRole("button", { name: /メトロノーム/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("global-metronome")).toHaveAttribute("aria-pressed", "true");
});
