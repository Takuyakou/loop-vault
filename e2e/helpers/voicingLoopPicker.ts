import { expect, type Locator, type Page } from "@playwright/test";

/**
 * P23-29: how the picker opens a practice now — the row is picked by the first press and the practice starts
 * from the picked row (a second press / Enter) or from the right column's main 「この進行で練習する」.
 */
export async function startPracticeFromRow(page: Page, row: Locator): Promise<void> {
  await row.click();
  const main = page.getByTestId("voicing-loop-preview-practice");
  if (await main.count()) await main.click();
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible({ timeout: 20_000 });
}

/** The row whose text contains `text`, started the same way. */
export async function startPracticeNamed(page: Page, text: string): Promise<void> {
  await startPracticeFromRow(page, page.getByTestId("voicing-loop-progression-row").filter({ hasText: text }).first());
}

/** The row the picker picked by itself (the 続きから progression, else the first playable row). */
export function selectedRow(page: Page): Locator {
  return page.locator('[data-testid="voicing-loop-progression-row"][data-selected="true"]');
}
