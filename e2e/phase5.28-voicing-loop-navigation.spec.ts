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

test("P5.28 direct sidebar entry is keyboard-operable and its empty CTAs route correctly at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);

  await expect(page.getByText("練習するコード進行を選択してください。")).toBeVisible();
  await expect(page.getByRole("button", { name: "Source MIDI" })).toHaveCount(0);
  await expect(page.locator("#voicing-loop-bpm")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);

  const vaultCta = page.getByRole("button", { name: "My Vaultから選ぶ" });
  await vaultCta.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "Vault");

  await openDirectVoicingLoopWithKeyboard(page);
  const textCta = page.getByRole("button", { name: "Textで進行を入力" });
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

test("P5.28 Text and Vault handoffs survive direct-entry stale-session clearing", async ({ page }) => {
  test.setTimeout(60_000);
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);
  await page.getByRole("button", { name: "Textで進行を入力" }).click();

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
  await expect(workspace.getByRole("button", { name: "Basic Full 1–7–3" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(workspace.locator("#voicing-loop-bpm")).toHaveValue("120");

  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  await expect(page.getByText("練習するコード進行を選択してください。")).toBeVisible();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "My Vaultから選ぶ" }).click();
  await page.locator("#vault-search").fill("P5.28 Direct Entry E2E");
  const row = page.locator(".lv-vault-row").filter({ hasText: "P5.28 Direct Entry E2E" });
  await row.getByRole("button", { name: /進行を開く|Open progression/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await detail.getByTestId("voicing-loop-handoff").click();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toBeVisible();
  await expect(workspace.locator("#voicing-loop-bpm")).toHaveValue("120");

  await page.locator("nav").getByRole("button", { name: "Home", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  await expect(page.getByText("練習するコード進行を選択してください。")).toBeVisible();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toHaveCount(0);

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

  await expect(page.getByText("練習するコード進行を選択してください。")).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await assertNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='voicing-loop-workspace']")
    .analyze();
  expect(axe.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
});
