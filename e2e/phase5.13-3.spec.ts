import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  assertNoHorizontalOverflow,
  openApp,
} from "./helpers/app";

const viewportMatrix = [
  { width: 1024, height: 720 },
  { width: 1280, height: 720 },
] as const;
test.describe.serial("Phase 5.13-3 viewport recovery", () => {
  test("new Dojo picker remains scrollable without horizontal clipping",async({page})=>{
    await openApp(page);await page.locator('[data-nav="chord-dojo"]').click();await page.getByRole('button',{name:'型の一覧',exact:true}).click();
    for(const viewport of viewportMatrix){await page.setViewportSize(viewport);await assertNoHorizontalOverflow(page);const main=page.locator('#main-content');await main.focus();await page.keyboard.press('End');await expect(page.locator('.dojo-list .dojo-card').last()).toBeInViewport();}
  });

  test("メインを残したLive MIDI表示と常設レベルメーター", async ({ page }, testInfo) => {
    await openApp(page);
    const meter = page.locator("[data-playback-level-meter]");
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute("data-playback-status", "idle");
    await expect(meter).toBeDisabled();
    await page.locator('[data-nav="live-midi"]').click();
    await expect(page.getByText(/現在のコード/)).toBeVisible();
    await expect(page.locator("#main-content")).toBeVisible();
    await captureEvidence(page, testInfo, "live-midi-and-main.png");
    await assertNoHorizontalOverflow(page);
  });
});

async function captureEvidence(page: Page, testInfo: TestInfo, fileName: string): Promise<void> {
  const path = testInfo.outputPath("visual-evidence", "phase5.13-3", "after", fileName);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, animations: "disabled" });
}
