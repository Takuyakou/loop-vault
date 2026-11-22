import { openBassPractice } from "./app";
import { expect, type Page } from "@playwright/test";

/**
 * P23-15 H2: the progression page has no practice buttons any more. Tests that opened practice from it now go the
 * other ways the app offers: the Vault preview (Voicing Loop / Chord Dojo) and Bass Practice's 「Vaultから選ぶ」.
 */

/** The progression page's 「‹ Vault」. With unsaved changes it asks 「変更を保存しますか？」 as the old buttons did. */
export async function backToVault(page: Page): Promise<void> {
  await page.locator("[data-progression-detail-view]").getByRole("button", { name: "Vault", exact: true }).click();
}

/** Vault → choose the row (`row`: its text, or `{ blockId }`; default: the one already chosen) → the preview's button. */
export async function practiceFromVault(
  page: Page,
  practice: "Voicing Loop" | "Chord Dojo",
  row?: string | RegExp | { blockId: string },
): Promise<void> {
  const preview = page.getByTestId("vault-preview");
  if (!(await page.locator(".lv-vault").isVisible())) await page.locator('[data-nav="vault"]').click();
  await expect(preview).toBeVisible();
  if (row !== undefined) {
    const rows = page.locator(".lv-vault-row");
    const target = typeof row === "object" && "blockId" in row
      ? page.locator(`.lv-vault-row[data-row-id$=":${row.blockId}"]`)
      : rows.filter({ hasText: row }).first();
    if ((await target.getAttribute("data-selected")) !== "true") await target.locator(".lv-vault-progression").click();
    await expect(target).toHaveAttribute("data-selected", "true");
  }
  await preview.getByRole("button", { name: practice === "Voicing Loop" ? /Voicing Loop で弾く/ : /Chord Dojo で覚える/ }).click();
}

/**
 * Bass Practice → コード進行のベース → 「Vaultから選ぶ」 → the progression (`title`: text in its row; default the first)
 * → 確定. P23-63: the picker lives in the stage's 条件 popover, so that is opened first when it is shut.
 */
export async function bassPracticeFromVault(page: Page, title?: string | RegExp): Promise<void> {
  await page.locator('[data-nav="bass-practice"]').click();
  await openBassPractice(page, "Bassline Echo");
  const view = page.getByTestId("bassline-echo-view");
  await expect(view).toBeVisible();
  const openPicker = page.getByTestId("vault-progression-picker-open");
  if (!(await openPicker.isVisible().catch(() => false))) await page.getByTestId("bassline-conditions").click();
  await openPicker.click();
  const candidates = page.getByTestId("vault-progression-picker").getByTestId("vault-progression-picker-candidate");
  await (title === undefined ? candidates.first() : candidates.filter({ hasText: title }).first()).click();
  await page.getByTestId("vault-progression-picker-confirm").click();
}
