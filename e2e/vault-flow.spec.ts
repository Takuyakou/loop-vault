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
  await expect(page.getByText(/最初の進行を取り込む/)).toBeVisible();
  await expect(page.getByRole("button", { name: "MIDI から取り込む", exact: true })).toBeVisible();
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

test("検索・絞り込み・並び替えを組み合わせられる", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Filter Target");
  await openVault(page);

  const filters = page.locator(".lv-vault-rail");
  await page.getByRole("textbox", { name: /検索/ }).fill("Filter Target");
  await filters.getByRole("button", { name: /〜4小節/ }).click();
  await page.getByLabel(/並び順/).selectOption("name");
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);

  // Options that would leave nothing are counted 0 and disabled (OR/AND is covered by unit tests).
  await filters.getByRole("button", { name: /MIDI/ }).first().click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  await expect(filters.getByRole("button", { name: /テキスト/ })).toBeDisabled();
  await expect(filters.getByRole("button", { name: /5〜8小節/ })).toBeDisabled();
  await filters.getByRole("button", { name: "すべて解除" }).click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);

  await page.getByRole("textbox", { name: /検索/ }).fill("6-4-5");
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  await expect(page.getByTestId("vault-degree-match")).toContainText("度数で一致");
  await page.getByRole("textbox", { name: /検索/ }).fill("7-7-7");
  await expect(page.locator(".lv-vault-row")).toHaveCount(0);
});
