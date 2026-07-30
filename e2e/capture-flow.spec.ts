import { expect, test } from "@playwright/test";
import {
  analyzeCurrentMidi,
  capturePageErrors,
  chooseFirstCandidate,
  dropMidi,
  loadMidiForPreAnalysis,
  openApp,
  openCapture,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

test("MIDIをドロップし、Voice確認から解析結果へ進める", async ({ page }) => {
  const pageErrors = await capturePageErrors(page);
  await openApp(page);
  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ voiceCount: 3 }),
    "E2E harmony bass melody.mid",
  );

  await expect(page.getByTestId("pre-analysis-workspace")).toBeVisible();
  await expect(page.locator("[data-voice-id]")).toHaveCount(3);
  await expect(page.getByText("E2E harmony bass melody.mid", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("pre-analysis-analyze")).toBeEnabled();

  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);

  await expect(page.locator("[data-candidate-toggle]").first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByText(/選択中・編集対象|Selected and editing/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("11 Voiceとドラムを解析前一覧に表示する", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ voiceCount: 11 }),
    "all-instruments-generated.mid",
  );

  const partDetails = page.getByRole("button", { name: /パート詳細|Part details/ });
  if (await partDetails.getAttribute("aria-expanded") !== "true") {
    await partDetails.click();
  }
  await expect(page.locator("[data-voice-id]")).toHaveCount(11);
  await expect(page.getByText("Drums", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/11 Voice/).first()).toBeVisible();
});

test("解析前に複数MIDIを追加できる", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture(), "first.mid");
  await dropMidi(page, createMidiFixture({ bars: 4 }), "second.mid");

  await expect(page.getByText("first.mid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("second.mid", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-source-id]")).toHaveCount(2);
});

test("壊れたMIDIは回復操作付きエラーを表示する", async ({ page }) => {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, Uint8Array.from([0, 1, 2, 3]), "broken.mid");

  const alert = page.locator('[data-capture-stage="empty"]').getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/MIDI|read|load/i);
  await expect(page.getByTestId("capture-retry-midi")).toBeVisible();
});

test("Web版のファイル選択はデスクトップ操作が必要と通知する", async ({ page }) => {
  await openApp(page);
  await openCapture(page);
  await page.getByTestId("capture-choose-midi").click();

  await expect(page.locator('[data-toast-tone="info"]')).toContainText(
    /デスクトップ|desktop/i,
  );
});

test("未保存のコード修正を残した候補切替では確認し、キャンセルで編集へ戻れる", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ bars: 16, voiceCount: 3 }),
    "unsaved-correction.mid",
  );
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);

  await page.getByRole("button", { name: /展開|Expand/, exact: true }).click();
  const chordLabel = page.locator('input[id^="chord-label-"]').first();
  await chordLabel.fill("Dm7");
  await chordLabel.press("Enter");
  await expect(page.getByTestId("draft-source")).toContainText(/編集中|Editing/);

  const secondCandidate = page.locator("[data-candidate-toggle]").nth(1);
  await secondCandidate.click();
  const dialog = page.getByRole("dialog", { name: /未保存|Unsaved/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /キャンセル|Cancel/i }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-candidate-toggle]").first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(chordLabel).toHaveValue("Dm7");
});
