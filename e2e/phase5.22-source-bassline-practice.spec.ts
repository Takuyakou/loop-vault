import { expect, test, type Page } from "@playwright/test";
import {
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  chooseFirstCandidate,
  loadMidiForPreAnalysis,
  openApp,
  openVault,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

test("Source Bassline levels and reference-only History stay overflow-safe at 320px and effective 200% scale", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 812 });
  await openApp(page);
  await saveSyntheticSourceBassline(page);
  await openVault(page);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /Open progression|進行を開く/ }).click();
  await page.getByTestId("chord-context-handoff").getByRole("button").click();

  const bassline = page.getByTestId("bassline-echo-view");
  const source = bassline.getByTestId("bassline-line-source");
  await expect(bassline).toBeVisible();
  await expect(source.locator("option[value='source-bassline']")).toBeEnabled();
  await source.selectOption("source-bassline");
  const savedSource = bassline.getByTestId("source-bassline-vault-select");
  await expect(savedSource).toHaveValue("");
  await savedSource.selectOption({ index: 1 });
  await expect(bassline.getByTestId("source-bassline-window")).toBeVisible();
  await expect(bassline.getByTestId("source-bassline-projection-facts")).toContainText(/Cropped notes|切り出しノート/);
  await expect(bassline.getByTestId("source-bassline-projection-facts")).toContainText(/monophonic projection|単音投影/);
  const level = bassline.locator("#bassline-level");
  await expect(level).toHaveValue("3");
  await expect(level.locator("option[value='1']")).toBeDisabled();
  await expect(level.locator("option[value='2']")).toBeDisabled();
  await expect(level.locator("option[value='3']")).toBeEnabled();
  await expect(bassline.locator("#bassline-level-description")).toContainText(/exact captured harmony|正確な保存済み和声/);
  await expect(bassline.getByTestId("source-bassline-projection-facts")).toContainText(/pitches replaced 0|pitch置換 0/);
  await bassline.getByRole("button", { name: /Review|レビュー/, exact: false }).click();
  await bassline.getByTestId("source-bassline-save-history").click();
  await expect(bassline.getByTestId("source-bassline-history")).toBeVisible();
  await expect(bassline.getByTestId("source-bassline-history")).toContainText(/Source line \(monophonic\)|元ライン（単音化）/);
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 640, height: 812 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(bassline.getByTestId("source-bassline-window")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

async function saveSyntheticSourceBassline(page: Page): Promise<void> {
  await loadMidiForPreAnalysis(page, createMidiFixture({ bars: 8, voiceCount: 3 }), "synthetic-source-practice.mid");
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);
  const selected = page.locator('[data-candidate-state="selected"]');
  const panel = selected.getByTestId("source-bassline-capture-panel");
  const voice = panel.getByLabel(/Select Bass Voice|Bass Voiceを選択/);
  const range = panel.getByLabel(/Range to save|保存する範囲/);
  await voice.selectOption({ index: 1 });
  await expect(range).toBeEnabled();
  await range.selectOption({ index: 1 });
  await panel.getByRole("checkbox", { name: /Save source bassline for practice|元ベースラインを練習用に保存/ }).check();
  await selected.getByRole("button", { name: /Save to Vault|Vaultに保存/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await form.locator('input[name="progression-title"]').fill("Synthetic source practice");
  await form.getByRole("button", { name: /Save|保存/, exact: true }).click();
  await expect(form).toBeHidden();
}
