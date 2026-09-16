import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

async function openEmptyApp(page: Page) {
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
}

async function openDirectVoicingLoopWithKeyboard(page: Page) {
  const directItem = page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true });
  await directItem.focus();
  await page.keyboard.press("Enter");
  await expect(directItem).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Voicing Loop", exact: true })).toBeVisible();
  return directItem;
}

test("P5.28 direct sidebar entry shows the inline Vault selector and Text fallback at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);

  await expect(page.getByRole("heading", { name: "練習する進行" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "進行を検索" })).toBeVisible();
  await expect(page.getByText("練習できる保存済み進行はまだありません。")).toBeVisible();
  await expect(page.getByRole("button", { name: "Source MIDI" })).toHaveCount(0);
  await expect(page.locator("#voicing-loop-bpm")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);

  const textCta = page.getByRole("button", { name: /Textで新しい進行を入力/ });
  await textCta.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-capture-stage='text']")).toBeVisible();
  await expect(page.getByTestId("capture-input-mode").getByRole("button", { name: /Text|テキスト/ }))
    .toHaveAttribute("aria-pressed", "true");

  await page.locator("nav").getByRole("button", { name: "Home", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: "Chord Capture", exact: true }).click();
  await expect(page.locator("[data-capture-stage='empty']")).toBeVisible();
  await expect(page.getByTestId("capture-input-mode").getByRole("button", { name: "MIDI" }))
    .toHaveAttribute("aria-pressed", "true");
  await assertNoHorizontalOverflow(page);
});

test("P5.28 Text handoff becomes a recent one-click Vault source without picker or stale session", async ({ page }) => {
  test.setTimeout(60_000);
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);
  await page.getByRole("button", { name: /Textで新しい進行を入力/ }).click();

  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| C G | Am F |");
  await capture.getByTestId("text-progression-key").fill("C major");
  await capture.getByRole("button", { name: /キーを確定|Confirm key/ }).click();
  await capture.getByTestId("text-progression-bpm").fill("120");
  await capture.getByTestId("text-progression-convert").click();

  const editor = page.getByTestId("manual-candidate-editor");
  await expect(editor).toBeVisible();
  await editor.locator("button[aria-haspopup='dialog']").click();
  const saveForm = page.locator("form[role='dialog']");
  await saveForm.locator("input[name='progression-title']").fill("P5.28 Direct Entry E2E");
  await saveForm.locator("button[type='submit']").click();
  await expect(saveForm).toBeHidden();

  const savedNotice = page.getByText("保存した進行を練習できます").locator("..");
  await savedNotice.getByRole("button", { name: "Voicing Loop", exact: true }).click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toBeVisible();
  await expect(workspace.getByRole("button", { name: "Lesson Rules", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(workspace.locator("#voicing-loop-bpm")).toHaveValue("120");

  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "最近使った進行" })).toBeVisible();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "進行を検索" });
  await search.fill("P5.28 Direct Entry E2E");
  const row = page.getByTestId("voicing-loop-progression-choice").filter({ hasText: "P5.28 Direct Entry E2E" });
  await expect(row).toHaveCount(1);
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toBeVisible();
  await expect(workspace.locator("#voicing-loop-bpm")).toHaveValue("120");

  await page.locator("nav").getByRole("button", { name: "Home", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "最近使った進行" })).toBeVisible();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toHaveCount(0);
  await page.getByTestId("voicing-loop-progression-choice").filter({ hasText: "P5.28 Direct Entry E2E" }).click();
  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  expect(await page.evaluate(() => {
    const raw = localStorage.getItem("loop-vault:voicing-loop-recents:v1");
    return raw ? JSON.parse(raw).references.length : 0;
  })).toBe(1);

  const chordDojo = page.getByRole("tab", { name: "Chord Dojo" });
  await chordDojo.click();
  await expect(chordDojo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("practice-start")).toBeVisible();
  const bassPractice = page.getByRole("tab", { name: "Bass Practice" });
  if (await bassPractice.isEnabled()) {
    await bassPractice.click();
    await expect(bassPractice).toHaveAttribute("aria-selected", "true");
  }
});

test("P5.28 empty state is reduced-motion, effective-200-percent, overflow-safe, and axe-clean", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 812 });
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });

  await expect(page.getByRole("heading", { name: "練習する進行" })).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await assertNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='voicing-loop-workspace']")
    .analyze();
  expect(axe.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
});
