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

  const search = page.getByRole("textbox", { name: /検索/ });
  await search.fill("Midnight E2E");
  await expect(page.getByText(/Midnight E2E Progression/)).toBeVisible();
  await expect(page.locator("#main-content").getByRole("status")).toContainText(/1件/i);

  const row = page.locator(".lv-vault-row").first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail.getByRole("button", { name: /練習する/ })).toBeVisible();

  await detail.getByRole("button", { name: /練習する/ }).click();
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("practice-layout")).toBeVisible();
  await expect(page.getByTestId("practice-progression-overview")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("空Vaultは次の行動を示し、長いタイトルでも横にはみ出さない", async ({ page }) => {
  await openApp(page);
  await openVault(page);
  await expect(page.getByText(/条件に合う進行はありません/)).toBeVisible();
  await expect(page.getByRole("button", { name: "コード採集", exact: true }).last()).toBeVisible();
  await expect(page.locator('button[title="+ Idea"]')).toHaveCount(0);

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

  await page.getByRole("textbox", { name: /検索/ }).fill("Filter Target");
  await page.getByRole("button", { name: /4小節/ }).click();
  await page.getByLabel(/並び順/).selectOption("key");
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);

  await page.getByRole("button", { name: /8小節/ }).click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(0);
  await page.getByRole("button", { name: /すべて/, exact: true }).first().click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
});
