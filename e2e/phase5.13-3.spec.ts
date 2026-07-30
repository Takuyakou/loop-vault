import { expect, test, type Page } from "@playwright/test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertNoHorizontalOverflow,
  createSavedProgression,
  openApp,
  openVault,
} from "./helpers/app";

const afterDir = resolve(process.cwd(), "artifacts", "phase5.13-3", "after");
const beforeDir = resolve(process.cwd(), "artifacts", "phase5.13-3", "before");
const viewportMatrix = [
  { width: 1024, height: 720 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const viewportMetrics: Array<{
  viewport: string;
  clientHeight: number;
  scrollHeight: number;
  finalScrollTop: number;
  horizontalOverflowPx: number;
  endVisible: boolean;
  queueWheelChained?: boolean;
}> = [];

test.describe.serial("Phase 5.13-3 viewport recovery", () => {
  test.beforeAll(async () => {
    await mkdir(afterDir, { recursive: true });
    await mkdir(beforeDir, { recursive: true });
    await copyFile(
      resolve(process.cwd(), "artifacts", "phase5.13-v2", "after", "live-midi.png"),
      resolve(beforeDir, "live-midi-window.png"),
    );
    await copyFile(
      resolve(process.cwd(), "artifacts", "phase5.13-v2", "after", "practice.png"),
      resolve(beforeDir, "chord-dojo-bottom-clipped.png"),
    );
  });

  test.afterAll(async () => {
    await writeFile(
      resolve(afterDir, "viewport-metrics.json"),
      `${JSON.stringify(viewportMetrics, null, 2)}\n`,
      "utf8",
    );
  });

  test("Dojoの下端へマウスとキーボードで到達できる", async ({ page }) => {
    test.setTimeout(90_000);
    await openApp(page);
    await createSavedProgression(
      page,
      "Phase 5.13-3 long Dojo progression title ".repeat(5),
      { fileName: "phase5.13-3-long-dojo-source-name.mid" },
    );
    await openVault(page);
    await page.locator(".lv-vault-row").first()
      .getByRole("button", { name: /進行を開く|Open progression/ })
      .click();
    await page.locator("[data-progression-detail-view]")
      .getByRole("button", { name: /練習する|Practice/ })
      .click();
    await expect(page.getByTestId("practice-layout")).toBeVisible();

    for (const viewport of viewportMatrix) {
      await page.setViewportSize(viewport);
      await assertNoHorizontalOverflow(page);
      const main = page.locator("#main-content");
      const dimensions = await scrollDimensions(main);
      expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

      await main.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("PageDown");
      await expect.poll(async () => (await scrollDimensions(main)).scrollTop).toBeGreaterThan(0);
      await page.keyboard.press("End");
      await expectEndVisible(page);

      let queueWheelChained: boolean | undefined;
      if (viewport.width === 1280) {
        await assertQueueWheelChainsToMain(page);
        queueWheelChained = true;
        await main.focus();
        await page.keyboard.press("End");
        await expectEndVisible(page);
      }
      const finalDimensions = await scrollDimensions(main);
      const endBox = await page.getByTestId("practice-workspace-end").boundingBox();
      viewportMetrics.push({
        viewport: `${viewport.width}x${viewport.height}`,
        clientHeight: dimensions.clientHeight,
        scrollHeight: dimensions.scrollHeight,
        finalScrollTop: finalDimensions.scrollTop,
        horizontalOverflowPx: Math.max(0, dimensions.scrollWidth - dimensions.clientWidth),
        endVisible: Boolean(
          endBox
          && endBox.y >= 0
          && endBox.y + endBox.height <= viewport.height
        ),
        ...(queueWheelChained === undefined ? {} : { queueWheelChained }),
      });

      if (
        (viewport.width === 1024 && viewport.height === 720)
        || (viewport.width === 1440 && viewport.height === 900)
        || (viewport.width === 1920 && viewport.height === 1080)
      ) {
        await page.screenshot({
          path: resolve(afterDir, `chord-dojo-${viewport.width}x${viewport.height}-bottom.png`),
          animations: "disabled",
        });
      }
      if (viewport.width === 1280 && viewport.height === 720) {
        await page.screenshot({
          path: resolve(afterDir, "chord-dojo-bottom.png"),
          animations: "disabled",
        });
      }
    }
  });

  test("メインを残したLive MIDI表示と常設レベルメーター", async ({ page }) => {
    await openApp(page);
    const meter = page.locator("[data-playback-level-meter]");
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute("data-playback-status", "idle");
    await expect(meter).toBeDisabled();
    await page.getByRole("button", { name: "Live MIDI" }).click();
    await expect(page.getByText(/現在のコード|Current chord/)).toBeVisible();
    await expect(page.locator("#main-content")).toBeVisible();
    await page.screenshot({
      path: resolve(afterDir, "live-midi-and-main.png"),
      animations: "disabled",
    });
    await assertNoHorizontalOverflow(page);
  });
});

async function scrollDimensions(locator: ReturnType<Page["locator"]>) {
  return locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    scrollWidth: element.scrollWidth,
  }));
}

async function expectEndVisible(page: Page): Promise<void> {
  const end = page.getByTestId("practice-workspace-end");
  await expect(end).toBeVisible();
  await expect.poll(async () => {
    const box = await end.boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= page.viewportSize()!.height);
  }).toBe(true);
}

async function assertQueueWheelChainsToMain(page: Page): Promise<void> {
  const main = page.locator("#main-content");
  const queue = page.getByTestId("practice-queue-scroll");
  await main.evaluate((element) => { element.scrollTop = 0; });
  await queue.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await queue.hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(async () => (await scrollDimensions(main)).scrollTop).toBeGreaterThan(0);
}
