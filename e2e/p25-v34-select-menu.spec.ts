import { expect, test, type Page } from "@playwright/test";

/**
 * P25 V34: every `<select>` opens the app's own list. These checks use the real screens: the Voicing Loop's
 * キー / カウントイン, the fingering dialog, the Space key and the settings screen's import mode.
 */

async function openLoop(page: Page) {
  await page.goto("/?p527Status=both-hands");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  const sidebar = page.locator('[data-nav="voicing-loop"]');
  if (await sidebar.isVisible()) {
    await sidebar.click();
  } else {
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  return workspace;
}

const menu = (page: Page) => page.locator("#lv-select-menu");

test("V34 opens the Voicing Loop's key list in the app's look, above the field when there is no room below", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspace = await openLoop(page);
  const key = workspace.locator("#voicing-loop-key");
  await key.click();
  await expect(menu(page)).toBeVisible();
  const chosen = key.evaluate((element) => (element as HTMLSelectElement).value);
  const marked = menu(page).locator('[role="option"][aria-selected="true"]');
  await expect(marked).toHaveCount(1);
  expect(await marked.getAttribute("data-value")).toBe(await chosen);
  // The list opens upward here: its bottom edge never reaches past the field's top edge.
  const field = await key.boundingBox();
  const list = await menu(page).boundingBox();
  expect(field).not.toBeNull();
  expect(list).not.toBeNull();
  expect(list!.y + list!.height).toBeLessThanOrEqual(field!.y + 1);
  // Another key is one press away and reaches the select.
  const other = menu(page).locator(`[role="option"]:not([data-value="${await chosen}"])`).first();
  const otherValue = await other.getAttribute("data-value");
  await other.click();
  await expect(key).toHaveValue(otherValue!);
  await expect(menu(page)).toHaveCount(0);
});

test("V34 the count-in list sets なし and Escape closes only the fingering list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspace = await openLoop(page);
  const countIn = workspace.locator("#voicing-loop-count-in");
  await countIn.click();
  await expect(menu(page)).toBeVisible();
  await menu(page).locator('[role="option"][data-value="0"]').click();
  await expect(countIn).toHaveValue("0");

  await workspace.getByRole("button", { name: "運指を編集", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "運指を編集" });
  await expect(editor).toBeVisible();
  const finger = editor.getByRole("combobox").first();
  await finger.click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test("V34 Space opens the key list and does not start playback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspace = await openLoop(page);
  const key = workspace.locator("#voicing-loop-key");
  await key.focus();
  await page.keyboard.press("Space");
  await expect(menu(page)).toBeVisible();
  await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
});

test("V34 the settings list has the app's look", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="settings"]').click();
  await expect(page.getByTestId("settings-view")).toBeVisible();
  const importMode = page.locator("#settings-import-mode");
  // A page scroll closes the list (the design's rule), so this field is brought into view before the press.
  await importMode.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await importMode.click();
  await expect(menu(page)).toBeVisible();
  const look = await menu(page).evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontSize: getComputedStyle(element.querySelector('[role="option"]')!).fontSize, background: style.backgroundColor };
  });
  expect(look.fontSize).toBe("13px");
  expect(look.background).toBe("rgb(22, 35, 56)");
});
