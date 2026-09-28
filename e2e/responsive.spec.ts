import { expect, test } from "@playwright/test";
import {
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  loadMidiForPreAnalysis,
  openApp,
  openVault,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

test("1024x720でShell、Capture、結果、Vaultが横にはみ出さない", async ({ page }) => {
  await openApp(page);
  await assertNoHorizontalOverflow(page);
  await expect(page.locator("[data-global-actions]")).toBeVisible();

  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 11 }), "responsive-11-voice.mid");
  await assertNoHorizontalOverflow(page);
  await analyzeCurrentMidi(page);
  await assertNoHorizontalOverflow(page);

  await openVault(page);
  await assertNoHorizontalOverflow(page);
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`${viewport.width}x${viewport.height} breakpoint stays overflow-safe`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page);
    await assertNoHorizontalOverflow(page);
    await page.locator('[data-nav="capture"]').click();
    await assertNoHorizontalOverflow(page);
    await expect(page.locator("[data-global-actions]")).toBeVisible();
  });
}

test("P8.9-09b header volume knob is always visible and follows an up/down drag", async ({ page }) => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await openApp(page);
    const knob = page.getByRole("slider", { name: "マスター音量" });
    await expect(knob).toBeVisible();
    const group = (await page.locator(".lv-volume-group").boundingBox())!;
    expect(group.height, `${width}px`).toBeLessThanOrEqual(31);
    expect(group.x + group.width, `${width}px`).toBeLessThanOrEqual(width);
  }
  const knob = page.getByRole("slider", { name: "マスター音量" });
  await knob.focus();
  await page.keyboard.press("Home");
  await expect(knob).toHaveAttribute("aria-valuenow", "0");
  const box = (await knob.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[data-volume-tooltip]")).toHaveText("音量 0%");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 75, { steps: 5 });
  await expect(knob).toHaveAttribute("aria-valuenow", "50");
  await expect(knob).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(knob).not.toHaveAttribute("data-dragging", /.*/);
  await knob.dblclick();
  await expect(knob).toHaveAttribute("aria-valuenow", "100");
});
