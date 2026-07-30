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

const afterDir = resolve(process.cwd(), "artifacts", "phase5.13", "after");

test.describe.serial("Phase 5.13 visual evidence", () => {
  test.beforeAll(async () => {
    await mkdir(afterDir, { recursive: true });
  });

  test("Capture states and correction workflow", async ({ page }) => {
    await openApp(page);
    await openCapture(page);
    await evidence(page, "capture-empty");
    await expect(page).toHaveScreenshot("capture-empty.png", { fullPage: true });

    await dropMidi(page, createMidiFixture({ voiceCount: 3 }), "simple-harmony.mid");
    await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
    await evidence(page, "capture-simple-midi");

    await dropMidi(page, createMidiFixture({ bars: 4 }), "second-part.mid");
    await expect(page.locator("[data-source-id]")).toHaveCount(2);
    await evidence(page, "capture-multi-midi");

    await page.getByTestId("pre-analysis-analyze").click();
    await expect(page.getByTestId("capture-analysis-progress")).toBeVisible();
    await evidence(page, "analyzing");
    await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
    await evidence(page, "analysis-result");
    await expect(page).toHaveScreenshot("analysis-result.png", { fullPage: true });

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
    await evidence(page, "vault-populated");
    await expect(page).toHaveScreenshot("vault-populated.png", { fullPage: true });

    const row = page.locator(".lv-vault-row").first();
    await row.getByRole("button", { name: /進行を開く|Open progression/ }).click();
    await evidence(page, "progression-detail");
    await expect(page).toHaveScreenshot("progression-detail.png", { fullPage: true });

    await page.getByRole("button", { name: /練習する|Practice/ }).click();
    await expect(page.getByTestId("practice-layout")).toBeVisible();
    await evidence(page, "chord-dojo");
    await evidence(page, "long-content");
  });

  test("global Live MIDI, Settings, dialog and toast states", async ({ page }) => {
    await openApp(page);

    await page.getByRole("button", { name: "Live MIDI" }).click();
    await evidence(page, "live-midi");
    await page.getByRole("button", { name: /戻る|Back/ }).click();

    await page.getByRole("button", { name: /設定|Settings/ }).first().click();
    await expect(page.getByRole("dialog", { name: /設定|Settings/ })).toBeVisible();
    await evidence(page, "settings");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Idea", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /新しいIdea|Create idea/i })).toBeVisible();
    await evidence(page, "dialog");
    await page.keyboard.press("Escape");

    await openCapture(page);
    await page.getByTestId("capture-choose-midi").click();
    await expect(page.locator("[data-toast-tone]")).toBeVisible();
    await evidence(page, "toast");
  });
});

async function evidence(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: resolve(afterDir, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}
