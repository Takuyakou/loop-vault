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

  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 11 }), "responsive-11-voice.mid");
  await assertNoHorizontalOverflow(page);
  await analyzeCurrentMidi(page);
  await assertNoHorizontalOverflow(page);

  await openVault(page);
  await assertNoHorizontalOverflow(page);
});

for (const viewport of [
  { width: 1024, height: 720 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`${viewport.width}x${viewport.height} viewport matrix`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page);
    await assertNoHorizontalOverflow(page);
    await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
    await assertNoHorizontalOverflow(page);
    await expect(page.locator("[data-global-actions]")).toBeVisible();
  });
}
