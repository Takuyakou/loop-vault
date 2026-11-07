import { expect, test, type Page } from "@playwright/test";

/** VL-13 report screenshots. Daily runs (test:full included) write under p89-generated, which git does not track;
 * UPDATE_REPORT_SCREENSHOTS=1 writes into the tracked docs/reports folder instead (run it explicitly to refresh the report). */
const dir = process.env.UPDATE_REPORT_SCREENSHOTS === "1" ? "docs/reports/vl-13" : "p89-generated/report-screenshots/vl-13";
const PREFS = "loop-vault:live-midi-preferences:v1";
const CONNECTION = "loop-vault:live-midi-connection:v1";

async function seedMidi(page: Page) {
  await page.addInitScript(({ prefs, connection }) => {
    if (!localStorage.getItem(prefs)) {
      localStorage.setItem(prefs, JSON.stringify({ alwaysOnTop: true, showHistory: true, preferredInput: { backendId: "p12-synthetic", name: "合成入力", previousIndex: 0 } }));
    }
    if (!localStorage.getItem(connection)) localStorage.setItem(connection, JSON.stringify({ autoConnect: true }));
  }, { prefs: PREFS, connection: CONNECTION });
}

async function openLoopWithMidi(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedMidi(page);
  await page.goto("/?p12=midi&p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".lv-midi-chip")).toHaveAttribute("data-midi-kind", "connected", { timeout: 5000 });
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  return workspace;
}

async function openLoop(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  return workspace;
}

test("VL-13 screenshots", async ({ page }) => {
  // A: connected, with the piano monitor ready.
  const connected = await openLoopWithMidi(page);
  await expect(connected).toHaveAttribute("data-midi-audio", "ready", { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __dojoMonitorCount: number }).__dojoMonitorCount)).toBe(1);
  await page.screenshot({ path: `${dir}/midi-connected-1440x900.png` });
  await connected.getByTestId("voicing-loop-transport-midi-row").screenshot({ path: `${dir}/midi-status-1440x900.png` });

  // A: the load failure notice and its retry button.
  await page.route("**/*.mp3", (route) => route.abort());
  const failed = await openLoopWithMidi(page);
  await expect(failed.getByTestId("voicing-loop-midi-audio-error")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${dir}/midi-audio-error-1440x900.png` });
  await page.unroute("**/*.mp3");

  // B: while playing, the fill is part-way through a group (a close-up of the strip).
  const playing = await openLoop(page);
  await playing.getByRole("button", { name: "開始", exact: true }).click();
  await expect.poll(() => playing.getByTestId("voicing-loop-navigator").locator("[data-navigator-head]")
    .evaluate((element) => Number.parseFloat((element as HTMLElement).style.left) || 0), { timeout: 15_000 }).toBeGreaterThan(10);
  await page.waitForTimeout(700);
  await playing.getByTestId("voicing-loop-timeline").screenshot({ path: `${dir}/navigator-playing-1440x900.png` });
});
