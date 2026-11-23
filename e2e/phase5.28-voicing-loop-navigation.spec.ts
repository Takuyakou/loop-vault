import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, chooseTextSetting } from "./helpers/app";
import { startPracticeNamed } from "./helpers/voicingLoopPicker";

async function openEmptyApp(page: Page) {
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
}

async function openDirectVoicingLoopWithKeyboard(page: Page) {
  const directItem = page.locator('[data-nav="voicing-loop"]');
  if (await directItem.isVisible()) {
    await directItem.focus();
    await page.keyboard.press("Enter");
    await expect(directItem).toHaveAttribute("aria-current", "page");
  } else {
    await page.locator('[data-nav="chord-dojo"]').click();
    const tab = page.getByRole("tab", { name: "Voicing Loop" });
    await tab.focus();
    await page.keyboard.press("Enter");
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
  // VL-15: the picker no longer repeats the "Voicing Loop" heading under the shell title.
  await expect(page.getByRole("heading", { name: "練習する進行" })).toBeVisible();
}

test("P5.28 direct sidebar entry shows the inline Vault selector and Text fallback at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);

  await expect(page.getByRole("heading", { name: "練習する進行" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "進行を検索" })).toBeVisible();
  await expect(page.getByText("まだ進行がありません")).toBeVisible();
  await expect(page.getByRole("button", { name: "元MIDI" })).toHaveCount(0);
  await expect(page.locator("#voicing-loop-bpm")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);

  // P23-61 §3: with no progression at all the empty screen's テキストで入力 is the next step.
  const textCta = page.getByRole("button", { name: "テキストで入力", exact: true });
  await textCta.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-capture-stage='text']")).toBeVisible();
  await expect(page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }))
    .toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-nav="home"]').click();
  await page.locator('[data-nav="capture"]').click();
  await expect(page.locator("[data-capture-stage='empty']")).toBeVisible();
  await expect(page.getByTestId("capture-input-mode").getByRole("button", { name: "MIDI" }))
    .toHaveAttribute("aria-pressed", "true");
  await assertNoHorizontalOverflow(page);
});

test("P5.28 Text handoff becomes a recent one-click Vault source without picker or stale session", async ({ page }) => {
  test.setTimeout(60_000);
  await openEmptyApp(page);
  await openDirectVoicingLoopWithKeyboard(page);
  await page.getByRole("button", { name: "テキストで入力", exact: true }).click();

  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| C G | Am F |");
  await chooseTextSetting(capture, "text-progression-key", "C major");
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
  await expect(workspace.getByRole("button", { name: "自動生成", exact: true }))
    .toHaveAttribute("aria-pressed", "false");
  // P23-32 K4: no practice BPM field; the saved 120 goes to the header's 共通 BPM.
  await expect(workspace.locator("#voicing-loop-bpm")).toHaveCount(0);
  await expect(page.getByTestId("global-bpm-value")).toHaveAttribute("aria-valuenow", "120");

  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByRole("heading", { name: "最近使った" })).toBeVisible();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "進行を検索" });
  await search.fill("P5.28 Direct Entry E2E");
  // P23-29 L6/L7: the main practice button is the right column's; Enter on it starts the picked row.
  const practice = page.getByTestId("voicing-loop-preview-practice");
  await expect(practice).toHaveCount(1);
  await practice.focus();
  await page.keyboard.press("Enter");
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toBeVisible();
  await expect(page.getByTestId("global-bpm-value")).toHaveAttribute("aria-valuenow", "120");

  await page.locator('[data-nav="home"]').click();
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByRole("heading", { name: "最近使った" })).toBeVisible();
  await expect(workspace.getByRole("heading", { level: 2, name: "C", exact: true })).toHaveCount(0);
  await startPracticeNamed(page, "P5.28 Direct Entry E2E");
  await page.locator('[data-nav="voicing-loop"]').click();
  expect(await page.evaluate(() => {
    const raw = localStorage.getItem("loop-vault:voicing-loop-recents:v1");
    return raw ? JSON.parse(raw).references.length : 0;
  })).toBe(1);

  const chordDojo = page.locator('[data-nav="chord-dojo"]');
  await chordDojo.click();
  await expect(chordDojo).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("practice-start")).toBeVisible();
  const bassPractice = page.locator('[data-nav="bass-practice"]');
  if (await bassPractice.isEnabled()) {
    await bassPractice.click();
    await expect(bassPractice).toHaveAttribute("aria-current", "page");
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
