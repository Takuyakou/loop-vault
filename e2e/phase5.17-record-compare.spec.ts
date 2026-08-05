import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/**
 * Record & Compare (P5.17-02) end-to-end with Chromium's fake media device, so
 * no real microphone is needed. The feature ships on by production default — no
 * feature flag is injected here.
 */

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["microphone"],
});

async function openBasslineReview(page: Page) {
  await openApp(page);
  await page.getByTestId("bass-practice-home-card").getByRole("button").click();
  await page.getByRole("tab", { name: "Bassline Echo" }).click();
  await expect(page.getByTestId("bassline-echo-view")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
}

test("Record & Compare is available at the production default without flag injection", async ({ page }) => {
  await openBasslineReview(page);
  const section = page.getByTestId("record-compare");
  await expect(section).toBeVisible();
  await expect(section).toHaveAttribute("data-record-state", "off");
  await expect(section).toContainText("自動採点や分析はありません");
});

test("record, listen back and keep a take with a fake input device", async ({ page }) => {
  test.setTimeout(25_000);
  await openBasslineReview(page);
  await page.getByTestId("record-compare-enable").click();

  // Permission is granted by the fake UI; the recorder becomes ready.
  await expect(page.getByTestId("record-compare-status")).toContainText("録音できます");
  await page.getByLabel("入力チャンネル").selectOption("mono-sum");

  await page.getByTestId("record-start").click();
  const section = page.getByTestId("record-compare");
  await expect(section).toHaveAttribute("data-record-state", "recording", { timeout: 10_000 });
  await page.getByTestId("record-stop").click();
  await expect(section).toHaveAttribute("data-record-state", "recorded");

  // Reaching Review without hearing My Take forces an explicit choice.
  await expect(page.getByTestId("listen-choice")).toBeVisible();
  await page.getByTestId("listen-choice-skip").click();
  await expect(page.getByTestId("listen-choice")).toHaveCount(0);

  await page.getByTestId("record-keep").click();
  await expect(section).toHaveAttribute("data-record-state", "saved");
});

test("explicit local false hides Record & Compare (rollback)", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("loop-vault:bass-practice-record-compare-enabled:v1", "false");
  });
  await openBasslineReview(page);
  await expect(page.getByTestId("record-compare")).toHaveCount(0);
});
