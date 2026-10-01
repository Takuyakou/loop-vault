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

  const pianoRoll = page.getByTestId("pre-analysis-piano-roll");
  const standardVisibleNotes = Number(
    await pianoRoll.getAttribute("data-visible-note-count"),
  );
  await page.locator(
    "[data-analysis-contribution-preset='harmonic-core']",
  ).click();
  await expect(pianoRoll).toHaveAttribute(
    "data-contribution-preset",
    "harmonic-core",
  );
  await expect(page.getByTestId(
    "pre-analysis-harmonic-core-preview",
  )).toContainText(/和声を強調/);
  expect(Number(await pianoRoll.getAttribute("data-visible-note-count")))
    .toBeLessThan(standardVisibleNotes);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();

  await page.locator(
    "[data-analysis-contribution-preset='standard']",
  ).click();
  await expect(pianoRoll).toHaveAttribute("data-contribution-preset", "standard");

  // P10.0-07: the result opens in the correction workspace; the first recommended range is ready to save.
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);
  await expect(page.getByTestId("correction-save-form").getByTestId("correction-save-range")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("11 Voiceとドラムを解析前一覧に表示する", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ voiceCount: 11 }),
    "all-instruments-generated.mid",
  );

  const partDetails = page.getByRole("button", { name: /パート詳細/ });
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
    /デスクトップ/i,
  );
});
