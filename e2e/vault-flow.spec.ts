import { expect, test } from "@playwright/test";
import {
  capturePageErrors,
  createSavedProgression,
  openApp,
  openVault,
} from "./helpers/app";

test("解析結果を保存し、Vaultで検索して詳細とDojoへ渡せる", async ({ page }) => {
  const pageErrors = await capturePageErrors(page);
  await openApp(page);
  await createSavedProgression(page, "Midnight E2E Progression");
  await openVault(page);

  const search = page.getByRole("textbox", { name: /検索|Search/ });
  await search.fill("Midnight E2E");
  await expect(page.getByText(/Midnight E2E Progression/)).toBeVisible();
  await expect(page.locator("#main-content").getByRole("status")).toContainText(/1件|1 item/i);

  const row = page.locator(".lv-vault-row").first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く|Open progression/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail.getByRole("button", { name: /練習する|Practice/ })).toBeVisible();

  await detail.getByRole("button", { name: /練習する|Practice/ }).click();
  await page.getByRole("tab", { name: "Chord Dojo" }).click();
  await expect(page.getByTestId("practice-layout")).toBeVisible();
  await expect(page.getByTestId("practice-progression-overview")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("空Vaultは次の行動を示し、長いタイトルでも横にはみ出さない", async ({ page }) => {
  await openApp(page);
  await openVault(page);
  await expect(page.getByText(/条件に合う進行はありません|No matching progressions/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Idea|New idea/ }).last()).toBeVisible();

  await createSavedProgression(
    page,
    "Very long progression title ".repeat(12),
    { fileName: "a-very-long-source-file-name-that-must-not-break-layout.mid" },
  );
  await openVault(page);
  const row = page.locator(".lv-vault-row").first();
  await expect(row).toBeVisible();
  const overflow = await row.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
});

test("検索・小節数フィルター・並び替えを組み合わせられる", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Filter Target");
  await openVault(page);

  await page.getByRole("textbox", { name: /検索|Search/ }).fill("Filter Target");
  await page.getByRole("button", { name: /4小節|4 bars/ }).click();
  await page.getByLabel(/並び順|Sort/).selectOption("key");
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);

  await page.getByRole("button", { name: /8小節|8 bars/ }).click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(0);
  await page.getByRole("button", { name: /すべて|All/, exact: true }).first().click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
});
