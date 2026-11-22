import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, openVault } from "./helpers/app";

/** P23-10: the Vault list rebuilt (V1–V12, C1–C5). */

async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
}

async function saveText(page: Page, name: string, text: string, key?: string) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  if (key) await capture.getByTestId("text-progression-key").selectOption(key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

async function closeToasts(page: Page) {
  for (let index = 0; index < 12; index += 1) {
    const closes = page.locator(".lv-toast-close");
    if (await closes.count() === 0) return;
    await closes.first().click();
  }
}

/** Saved newest last: 夜 (F) … 2-5-1 C; one keyless. */
async function vaultWithFive(page: Page) {
  await openApp(page);
  await saveText(page, "キーなしの進行", "| C9 | B7 | Em7 | A13 |");
  await saveText(page, "F の 2-5-1", "| Gm7 | C7 | Fmaj7 |", "F major");
  await saveText(page, "C の 2-5-1", "| Dm7 | G7 | Cmaj7 |", "C major");
  await saveText(page, "C の循環", "| Cmaj7 | Am7 | Dm7 | G7 |", "C major");
  await saveText(page, "C の王道", "| Fmaj7 | G7 | Em7 | Am7 |", "C major");
  await openVault(page);
  await closeToasts(page);
  await settle(page);
}

const rows = (page: Page) => page.locator(".lv-vault-row");
const rowNames = (page: Page) => page.locator(".lv-vault-row .lv-vault-progression-primary").allTextContents();
const preview = (page: Page) => page.getByTestId("vault-preview");

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("V1/C3: the key band counts each key, chooses one key at a time, and leaves keyless progressions out", async ({ page }) => {
  test.setTimeout(120_000);
  await vaultWithFive(page);
  const band = page.getByTestId("vault-key-band");
  await expect(band.locator("[data-key-cell]")).toHaveCount(24);
  const c = band.getByRole("button", { name: "C メジャー 3件" });
  const f = band.getByRole("button", { name: "F メジャー 1件" });
  await expect(c).toBeEnabled();
  await expect(band.getByRole("button", { name: "G メジャー 0件" })).toBeDisabled();
  // C3: 5 progressions, 4 with a key: the band counts 4.
  const counted = await band.locator("[data-key-cell] small").allTextContents();
  expect(counted.map(Number).reduce((sum, count) => sum + count, 0)).toBe(4);
  await c.click();
  await expect(c).toHaveAttribute("aria-pressed", "true");
  expect(new Set(await rowNames(page))).toEqual(new Set(["C の 2-5-1", "C の循環", "C の王道"]));
  await f.click();
  await expect(f).toHaveAttribute("aria-pressed", "true");
  await expect(c).toHaveAttribute("aria-pressed", "false");
  expect(await rowNames(page)).toEqual(["F の 2-5-1"]);
  await band.getByRole("button", { name: "キーを外す" }).click();
  await expect(rows(page)).toHaveCount(5);
  // The facet chips: 取り込み元 opens its values.
  await page.getByTestId("vault-facets").getByRole("button", { name: /^取り込み元/ }).click();
  const menu = page.getByRole("dialog", { name: "取り込み元" });
  await expect(menu.getByRole("button", { name: /テキスト/ })).toContainText("5");
  await expect(menu.getByRole("button", { name: /^MIDI/ })).toBeDisabled();
});

test("V2/V3/C3: 58px rows, one click shows the contents, a second click opens; role colours only with a key; ♥ and 開く only", async ({ page }) => {
  test.setTimeout(120_000);
  await vaultWithFive(page);
  const heights = await rows(page).evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
  expect(new Set(heights)).toEqual(new Set([58]));
  for (const row of await rows(page).all()) {
    await expect(row.locator(".lv-vault-actions button")).toHaveCount(2);
    await expect(row.locator(".lv-vault-actions").getByRole("button", { name: "進行を開く" })).toBeVisible();
    await expect(row.getByRole("button", { name: /コピー/ })).toHaveCount(0);
  }
  const keyed = rows(page).filter({ hasText: "C の 2-5-1" });
  expect(await keyed.locator(".lv-vault-chip").evaluateAll((chips) => chips.map((chip) => chip.getAttribute("data-fn")))).toEqual(["SD", "D", "T"]);
  const keyless = rows(page).filter({ hasText: "キーなしの進行" });
  await expect(keyless.locator(".lv-vault-chip[data-fn]")).toHaveCount(0);

  await keyed.locator(".lv-vault-progression").click();
  await expect(keyed).toHaveAttribute("data-selected", "true");
  await expect(preview(page).getByRole("heading", { name: "C の 2-5-1" })).toBeVisible();
  await keyed.locator(".lv-vault-progression").click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
  await openVault(page);
  await rows(page).filter({ hasText: "C の循環" }).locator(".lv-vault-progression").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("progression-title")).toBeVisible();
});

test("V5: no date headings, whichever the order (P23-59-fix-3 §1c)", async ({ page }) => {
  test.setTimeout(120_000);
  await vaultWithFive(page);
  await expect(page.getByTestId("vault-date-heading")).toHaveCount(0);
  await page.getByLabel(/並び順/).selectOption("name");
  await expect(page.getByTestId("vault-date-heading")).toHaveCount(0);
  await page.getByLabel(/並び順/).selectOption("newest");
  await expect(page.getByTestId("vault-date-heading")).toHaveCount(0);
});

test("V6: with 選ぶと鳴らす on, a new selection plays; switching on does not", async ({ page }) => {
  test.setTimeout(120_000);
  await vaultWithFive(page);
  const second = rows(page).nth(1);
  await second.locator(".lv-vault-progression").click();
  await expect(second).toHaveAttribute("data-playing", "false");
  const auto = page.getByRole("button", { name: "選ぶと鳴らす" });
  await expect(auto).toHaveAttribute("aria-pressed", "false");
  await auto.click();
  await expect(auto).toHaveAttribute("aria-pressed", "true");
  // Switching on is silent: the row already chosen does not start.
  await page.waitForTimeout(400);
  await expect(second).toHaveAttribute("data-playing", "false");
  await page.locator("#main-content").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(2)).toHaveAttribute("data-playing", "true");
  // Switching off keeps a new selection silent too.
  await auto.click();
  await expect(auto).toHaveAttribute("aria-pressed", "false");
  await page.locator("#main-content").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(3)).toHaveAttribute("data-playing", "false");
});

test("V7/V8: same motion in another key, and the contents' buttons in order", async ({ page }) => {
  test.setTimeout(120_000);
  await vaultWithFive(page);
  await rows(page).filter({ hasText: "C の 2-5-1" }).locator(".lv-vault-progression").click();
  const same = preview(page).getByTestId("vault-same-motion");
  await expect(same.getByRole("button")).toHaveCount(1);
  await expect(same.getByRole("button")).toContainText("F の 2-5-1");
  await same.getByRole("button").click();
  await expect(rows(page).filter({ hasText: "F の 2-5-1" })).toHaveAttribute("data-selected", "true");
  const labels = await preview(page).locator(".lv-vault-preview-actions button").allTextContents();
  expect(labels.map((label) => label.trim())).toEqual(["MIDI を DAW へドラッグ", "開いて編集", "コードをコピー", "VLVoicing Loop で弾く", "CDChord Dojo で覚える"]);
  await preview(page).getByRole("button", { name: /Voicing Loop で弾く/ }).click();
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible();
});

test("V10/V11: text saves say テキスト; ↓ moves, C copies, / searches", async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await vaultWithFive(page);
  await expect(page.locator(".lv-vault-row .lv-vault-source")).toHaveText(Array(5).fill("テキスト"));
  await page.locator("#main-content").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("| Cmaj7 | Am7 | Dm7 | G7 |");
  await page.keyboard.press("/");
  await expect(page.locator("#vault-search")).toBeFocused();
});

test("V12: the Home's 「ほか n 件を Vault で見る」 opens the Vault on that key", async ({ page }) => {
  test.setTimeout(150_000);
  await openApp(page);
  for (const [name, text] of [["C1", "| C | G | Am | F |"], ["C2", "| Dm7 | G7 | Cmaj7 |"], ["C3", "| Cmaj7 | Am7 |"], ["C4", "| F | G | C |"]]) {
    await saveText(page, name!, text!, "C major");
  }
  await saveText(page, "F1", "| Gm7 | C7 | Fmaj7 |", "F major");
  await page.locator('[data-nav="home"]').click();
  await closeToasts(page);
  await page.getByRole("radio", { name: "キーで聴く" }).click();
  await page.getByRole("button", { name: /ほか 1 件を Vault で見る/ }).click();
  await expect(page.getByTestId("vault-key-band").getByRole("button", { name: "C メジャー 4件" })).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(4);
});

test("C2: an empty Vault guides to capture; one progression shows its contents", async ({ page }) => {
  await openApp(page);
  await openVault(page);
  await expect(page.getByText(/最初の進行を取り込む/)).toBeVisible();
  await expect(page.getByTestId("vault-key-band")).toHaveCount(0);
  await saveText(page, "ひとつ", "| C | F | G |", "C major");
  await openVault(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(preview(page).getByRole("heading", { name: "ひとつ" })).toBeVisible();
});

test("C4/C5: four widths without sideways overflow; the contents under the list below 900px; axe with the contents open", async ({ page }) => {
  test.setTimeout(150_000);
  await vaultWithFive(page);
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await assertNoHorizontalOverflow(page);
    const list = (await page.locator(".lv-vault-list").boundingBox())!;
    const contents = (await preview(page).boundingBox())!;
    if (width === 768) expect(contents.y, `${width}`).toBeGreaterThan(list.y + list.height - 1);
    else expect(contents.x, `${width}`).toBeGreaterThan(list.x + list.width - 1);
    const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`), `${width}x${height}`).toEqual([]);
  }
});
