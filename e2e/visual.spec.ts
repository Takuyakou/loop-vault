import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chooseFirstCandidate,
  createSavedProgression,
  dropMidi,
  loadMidiForPreAnalysis,
  openApp,
  openCapture,
  openVault,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

const afterDir = resolve(process.cwd(), "artifacts", "phase5.13-v2", "after");

test.describe.serial("Phase 5.13 visual evidence", () => {
  test.beforeAll(async () => {
    await mkdir(afterDir, { recursive: true });
  });

  test("Home", async ({ page }) => {
    await openApp(page);
    await evidence(page, "home");
    await expect(page).toHaveScreenshot("home.png", { fullPage: true });
  });

  test("Capture states and correction workflow", async ({ page }) => {
    await openApp(page);
    await openCapture(page);
    await evidence(page, "capture-empty");
    await expect(page).toHaveScreenshot("capture-empty.png", { fullPage: true });

    await dropMidi(page, createMidiFixture({ voiceCount: 3 }), "simple-harmony.mid");
    await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
    await evidence(page, "capture-source-selection");
    await expect(page).toHaveScreenshot("capture-source-selection.png", { fullPage: true });

    await dropMidi(page, createMidiFixture({ bars: 4 }), "second-part.mid");
    await expect(page.locator("[data-source-id]")).toHaveCount(2);
    await evidence(page, "capture-multi-midi");

    await page.getByTestId("pre-analysis-analyze").click();
    await expect(page.getByTestId("capture-analysis-progress")).toBeVisible();
    await evidence(page, "analyzing");
    await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
    await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
    await expect(page.getByTestId("capture-analysis-progress")).toBeHidden();
    await evidence(page, "capture-analysis-results");
    await expect(page).toHaveScreenshot("capture-analysis-results.png", { fullPage: true });

    await chooseFirstCandidate(page);
    await evidence(page, "correction-editor");
    await expect(page).toHaveScreenshot("correction-editor.png", { fullPage: true });
  });

  test("all-instruments pre-analysis state", async ({ page }) => {
    await openApp(page);
    await loadMidiForPreAnalysis(
      page,
      createMidiFixture({ voiceCount: 11 }),
      "all-instruments-generated.mid",
    );
    await evidence(page, "capture-all-instruments");
  });

  test("Vault, detail, Dojo and long content", async ({ page }) => {
    await openApp(page);
    await openVault(page);
    await evidence(page, "vault-empty");

    await createSavedProgression(
      page,
      "Extended cinematic progression title ".repeat(8),
      { fileName: "very-long-source-file-name-for-overflow-verification.mid" },
    );
    await openVault(page);
    await evidence(page, "vault");
    await expect(page).toHaveScreenshot("vault.png", { fullPage: true });

    const row = page.locator(".lv-vault-row").first();
    await row.getByRole("button", { name: /進行を開く|Open progression/ }).click();
    await evidence(page, "progression-detail-default");
    await expect(page).toHaveScreenshot("progression-detail-default.png", { fullPage: true });

    const cards = page.locator("[data-progression-card-stage] [data-chord-card]");
    await cards.nth(Math.min(1, Math.max(0, await cards.count() - 1))).click();
    await evidence(page, "progression-detail-selected");
    await cards.first().dispatchEvent("contextmenu");
    await expect(page.locator("[data-quick-chord-editor]")).toBeVisible();
    await evidence(page, "progression-detail-editing");
    await page.keyboard.press("Escape");

    await page.locator("[data-progression-detail-view]")
      .getByRole("button", { name: /練習する|Practice/ }).click();
    await expect(page.getByTestId("practice-layout")).toBeVisible();
    await evidence(page, "practice");
    await expect(page).toHaveScreenshot("practice.png", { fullPage: true });
    await evidence(page, "long-content");
  });

  test("global Live MIDI, Settings, dialog and toast states", async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page);
    await createSavedProgression(page, "History visual fixture", {
      fileName: "history-visual-fixture.mid",
    });

    await page.getByRole("button", { name: "Live MIDI" }).click();
    await evidence(page, "live-midi");
    await page.getByRole("button", { name: /メイン画面を表示|Show main window/ }).click();

    await page.getByRole("button", { name: "History", exact: true }).click();
    await evidence(page, "history");
    await expect(page).toHaveScreenshot("history.png", { fullPage: true });

    await page.getByRole("button", { name: /設定|Settings/ }).first().click();
    await expect(page.getByRole("dialog", { name: /設定|Settings/ })).toBeVisible();
    await evidence(page, "settings");
    await expect(page).toHaveScreenshot("settings.png", { fullPage: true });
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Idea", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /新しいIdea|Create idea/i })).toBeVisible();
    await evidence(page, "dialog");
    await page.keyboard.press("Escape");

    // Reload to clear the transient analysis slice while retaining the saved
    // History fixture in the repository-backed vault.
    await openApp(page);
    await openCapture(page);
    await page.getByTestId("capture-choose-midi").click();
    await expect(page.locator("[data-toast-tone]")).toBeVisible();
    await evidence(page, "toast", { preserveToast: true });
  });
});

async function evidence(
  page: Page,
  name: string,
  options: { preserveToast?: boolean } = {},
): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  if (!options.preserveToast) {
    const toast = page.locator("[data-toast-tone]").first();
    if (await toast.isVisible().catch(() => false)) {
      await expect(toast).toBeHidden({ timeout: 5_000 });
    }
  }
  await page.screenshot({
    path: resolve(afterDir, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}
