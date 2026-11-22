import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openApp, openTextCapture } from "./helpers/app";

/**
 * P23-07: Ctrl+K opens the search palette (progressions, screens, actions) without leaving the screen.
 */
const palette = (page: Page) => page.getByRole("dialog", { name: "探す" });
const searchInput = (page: Page) => page.getByTestId("command-palette-input");
const chosen = (page: Page) => page.locator("[role='option'][aria-selected='true']");

async function saveProgression(page: Page, name: string, chords: string) {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill(`| ${chords} |`);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
  await page.locator('[data-nav="home"]').click();
}

test("E1 Ctrl+K opens the palette on the same screen with the caret in its input", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await expect(page.locator('[data-nav="home"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#vault-search")).toHaveCount(0);
  await expect(searchInput(page)).toBeFocused();
});

test("E2 the palette closes with Ctrl+K, Esc or a click outside, and gives the focus back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");

  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette(page)).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await page.locator("[data-modal-backdrop]").first().click({ position: { x: 6, y: 6 } });
  await expect(palette(page)).toHaveCount(0);

  await page.locator('[data-nav="vault"]').focus();
  await expect(page.locator('[data-nav="vault"]')).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-nav="vault"]')).toBeFocused();
});

test("E3 the title bar's 検索 button opens the same palette", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.locator("[data-titlebar-search]").click();
  await expect(palette(page)).toBeVisible();
  await expect(searchInput(page)).toBeFocused();
});

test("E4 typing a name lists the progression and Enter opens its page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.keyboard.press("Control+k");
  await searchInput(page).fill("夜");
  await expect(page.locator('[data-palette-section="progression"]')).toContainText("夜のループ");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator("[data-progression-detail-view]")).toContainText("夜のループ");
});

test("E5 Ctrl+Enter opens the progression in Voicing Loop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.keyboard.press("Control+k");
  await searchInput(page).fill("夜");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("voicing-loop-controls")).toBeVisible();
  // The picker (its search field) is not what opened: the practice for that progression did.
  await expect(page.locator("#voicing-loop-progression-search")).toHaveCount(0);
  await page.locator('[data-nav="home"]').click();
  const continued = page.getByTestId("home-continue");
  await expect(continued).toContainText("Voicing Loop");
  await expect(continued).toContainText("夜のループ");
});

test("E6 typing 設定 opens the settings screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.keyboard.press("Control+k");
  await searchInput(page).fill("設定");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator('[data-nav="settings"]')).toHaveAttribute("aria-current", "page");
});

test("E7 nothing typed: ↑ lands on Vault で探す and Enter moves to the Vault with the search focused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.keyboard.press("Control+k");
  await expect(chosen(page)).toHaveText("Voicing Loop");
  await page.keyboard.press("ArrowUp");
  await expect(chosen(page)).toHaveText("Vault で探す");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator("#vault-search")).toBeFocused();
});

test("E8 F♯ finds the sharp progression and its chords keep ♯, not #", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await saveProgression(page, "F# の曲", "F#m7 | Bm7 | E7 | Amaj7");
  await page.keyboard.press("Control+k");
  await searchInput(page).fill("F♯");
  const item = page.getByTestId("command-palette-item").filter({ hasText: "F# の曲" });
  await expect(item).toBeVisible();
  await expect(item.locator(".lv-palette-item-chords")).toContainText("♯");
  await expect(item.locator(".lv-palette-item-chords")).not.toContainText("#");
});

test("E9 Ctrl+K does nothing while a confirmation is open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.locator('[data-nav="settings"]').click();
  await expect(page.getByTestId("settings-view")).toBeVisible();
  // The correction buttons live in the developer section, which opens from the settings nav.
  await page.locator(".lv-settings-nav").getByRole("button", { name: "開発者向け" }).click();
  await page.getByRole("button", { name: "修正ログを削除" }).click();
  await expect(page.getByRole("dialog", { name: "修正ログを削除" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("E10 the palette has no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  // P23-03 M8: measure the settled screen, not a frame of the fade.
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious");
  const summary = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 12).map((node) => node.target.join(" > ")),
    count: violation.nodes.length,
  }));
  expect(blocking, `palette: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
});

test("E11 at 768×640 the palette stays inside the window", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await openApp(page);
  await saveProgression(page, "夜のループ", "Dm7 | G7 | Cmaj7 | A7");
  await page.keyboard.press("Control+k");
  await expect(palette(page)).toBeVisible();
  const box = await palette(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
});
