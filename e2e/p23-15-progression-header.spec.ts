import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

/** P23-15: the progression page header (H1–H8, C2–C5) and the Vault preview's loop roll (Z1, Z4). */

const SIZES = [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const;

async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? []).map((animation) => animation.finished.catch(() => undefined))));
}

async function saveText(page: Page, text: string, key: string, name: string) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await capture.getByTestId("text-progression-key").selectOption(key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

const LOOP = "| Ebmaj7 | Cm7 | Fm7 Bb7 | Ebmaj7 | Abmaj7 | Gm7 C7 | Fm7 | Bb7 |";

async function openPage(page: Page) {
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "夜のループ" }).first();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveText(page, LOOP, "Eb major", "夜のループ");
});

test("H1–H5: the header rows, no practice buttons, the shell title is Vault, ‹ Vault goes back", async ({ page }) => {
  await openPage(page);
  const page_ = page.locator("[data-progression-detail-view]");
  await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "Vault");
  await expect(page.locator(".lv-app-header-title")).toHaveText("Vault");
  await expect(page_.getByRole("navigation", { name: "現在の場所" })).toHaveCount(0);
  for (const name of ["Voicing Loop", "Chord Dojo", "Bass Practice"]) await expect(page_.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page_.getByRole("button", { name: "お気に入りに入れる" })).toBeVisible();
  await expect(page_.getByRole("button", { name: "コードをコピー" })).toBeVisible();
  await expect(page_.locator(".lv-progression-fact").first()).toHaveText("E♭メジャー");
  await expect(page_.getByRole("combobox", { name: "この曲の進行" })).toHaveCount(0);
  await page_.getByRole("button", { name: "お気に入りに入れる" }).click();
  await expect(page_.getByRole("button", { name: "お気に入りから外す" })).toHaveAttribute("aria-pressed", "true");
  await page_.getByRole("button", { name: "そのほか", exact: true }).click();
  await expect(page_.getByRole("group", { name: "そのほかの操作" }).getByRole("button")).toHaveText(["複製する", "この曲の情報を見る", "元の MIDI・以前の操作", "この進行を削除…"]);
  await page.keyboard.press("Escape");
  await page_.getByRole("button", { name: "Vault", exact: true }).click();
  await expect(page.getByTestId("vault-preview")).toBeVisible();
});

test("C3/C4: rename in place, add a tag and write the memo; 保存 keeps them after reopening", async ({ page }) => {
  await openPage(page);
  const title = page.getByTestId("progression-title");
  await title.click();
  const input = page.getByRole("textbox", { name: "進行の題名" });
  await input.fill("朝のループ");
  await input.press("Escape");
  await expect(title).not.toContainText("朝のループ");
  await title.click();
  await input.fill("朝のループ");
  await input.press("Enter");
  await expect(title).toContainText("朝のループ");
  await page.getByRole("button", { name: "＋ タグ" }).click();
  const tags = page.getByRole("dialog", { name: "タグを足す・外す" });
  await tags.getByRole("textbox").fill("夜");
  await tags.getByRole("textbox").press("Enter");
  await page.keyboard.press("Escape");
  if (await page.getByTestId("progression-memo-add").isVisible()) await page.getByTestId("progression-memo-add").click();
  await page.getByLabel("メモ", { exact: true }).fill("サビ前に");
  await page.getByRole("button", { name: "上書き保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "上書き保存", exact: true })).toBeDisabled();
  await page.locator('[data-nav="home"]').click();
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await expect(title).toContainText("朝のループ");
  await expect(page.getByLabel("メモ", { exact: true })).toHaveValue("サビ前に");
  await expect(page.getByTestId("progression-tags").locator("[data-mine]")).toHaveText(["夜"]);
});

test("C5: four sizes, no horizontal overflow and no serious or critical axe findings", async ({ page }) => {
  await openPage(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await assertNoHorizontalOverflow(page);
    const result = await new AxeBuilder({ page: page as never }).include("[data-progression-detail-view]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`), `${width}x${height}`).toEqual([]);
  }
});

test("Z1/Z4: the Vault preview's loop roll moves while ▶ plays, and the preview fits 1440×900 and 1280×720", async ({ page }) => {
  await page.locator('[data-nav="vault"]').click();
  const preview = page.getByTestId("vault-preview");
  const roll = preview.getByTestId("home-loop-roll");
  await expect(roll).toBeVisible();
  await expect(roll.locator("[data-roll-chord]")).toHaveCount(await preview.locator(".lv-vault-preview-chord").count());
  for (const [width, height] of [[1440, 900], [1280, 720]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    const box = (await preview.boundingBox())!;
    expect(box.y + box.height, `${width}x${height}`).toBeLessThanOrEqual(height);
    await expect(preview.getByRole("button", { name: /Chord Dojo で覚える/ })).toBeInViewport();
  }
  await preview.getByRole("button", { name: "この進行を試聴" }).click();
  const head = roll.getByTestId("home-loop-roll-head");
  await expect(head).toBeVisible();
  const first = await head.evaluate((element) => element.style.transform);
  await expect.poll(() => head.evaluate((element) => element.style.transform)).not.toBe(first);
  await preview.getByRole("button", { name: "この進行を止める" }).click();
});
