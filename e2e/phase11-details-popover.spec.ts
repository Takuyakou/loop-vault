import { expect, test } from "@playwright/test";

// P25-08 L1: 「形 ▼」 replaced 「基本 ▼」 and 「詳しい設定」; its menu keeps the old popover's dismissal rules.
test.beforeEach(async ({ page }) => {
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
});

const trigger = (page: import("@playwright/test").Page) => page.getByTestId("voicing-loop-shape-button");
const menu = (page: import("@playwright/test").Page) => page.getByTestId("voicing-loop-shape-menu");

test("P11 the shape menu closes and disables after a fixed Source change, reopens on generated", async ({ page }) => {
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "元MIDI", exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger(page)).toBeDisabled();
  await expect(trigger(page)).toHaveAttribute("title", "自動生成を選択すると設定できます");
  await trigger(page).dispatchEvent("click");
  await expect(menu(page)).toHaveCount(0);
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
});

test("P11 the shape menu closes on outside pointer and Escape, toggles, keeps its own controls open", async ({ page }) => {
  await trigger(page).click();
  await page.getByTestId("voicing-loop-current-panel").locator("h2").click();
  await expect(menu(page)).toHaveCount(0);
  await trigger(page).click();
  await menu(page).getByTestId("voicing-loop-shape-spread").check();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await trigger(page).click();
  await expect(menu(page)).toHaveCount(0);
});

test("P11 choosing a shape closes the menu without disabling later dismissals", async ({ page }) => {
  for (const shape of ["shell", "basic"]) {
    await trigger(page).click();
    await menu(page).locator(`[data-shape="${shape}"]`).click();
    await expect(menu(page)).toHaveCount(0);
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  }
  // P25 V25-8: Space starts the loop from anywhere; a focused button is pressed with Enter.
  await trigger(page).press("Enter");
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeVisible();
});
