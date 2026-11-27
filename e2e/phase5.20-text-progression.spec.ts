import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  capturePageErrors,
  openApp,
  openVault,
  openBassPractice, chooseTextSetting } from "./helpers/app";
import { bassPracticeFromVault, practiceFromVault } from "./helpers/practice";

const textTitle = "P5.20 Text Entry E2E";

async function openTextCapture(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();

  const modeSelector = page.getByTestId("capture-input-mode");
  const textMode = modeSelector.getByRole("button", { name: /\u30c6\u30ad\u30b9\u30c8|Text/ });
  await expect(modeSelector).toBeVisible();
  await textMode.focus();
  await page.keyboard.press("Enter");
  await expect(textMode).toHaveAttribute("aria-pressed", "true");

  const capture = page.getByTestId("text-progression-capture");
  await expect(capture).toBeVisible();
  return capture;
}

async function enterEligibleProgression(page: Page) {
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| C G | Am F |");
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(4);

  await chooseTextSetting(capture, "text-progression-key", "C major");
  await expect(capture.getByTestId("text-progression-key-state")).toContainText("C major");

  await capture.getByTestId("text-progression-bpm").fill("120");
  await expect(capture.getByTestId("text-progression-save")).toBeEnabled();
}

function parseDuration(value: string): number {
  return Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1_000;
  }));
}

test("P5.20 production Text Progression Entry saves and reaches its supported downstream consumers", async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors = await capturePageErrors(page);
  const capture = await openTextCapture(page);
  const textInput = capture.getByTestId("text-progression-input");

  // P24-05: three chords in a bar are read now, so an unreadable bar is the case that stays visible.
  await textInput.fill("| C///E |");
  await expect(textInput).toHaveAttribute("aria-invalid", "true");
  await expect(capture.getByTestId("text-progression-diagnostics")).toBeVisible();
  await expect(capture.getByTestId("text-preview-error")).toHaveCount(1);
  // An invalid bar yields no card, so there is no card band either (P25-03 C1).
  await expect(capture.getByTestId("text-card-dock")).toHaveCount(0);
  await expect(capture.getByTestId("text-card-dock-closed")).toHaveCount(0);

  // Valid text is independently capable of Vault/Dojo even before the optional
  // Chord Context conditions have been confirmed.
  await textInput.fill("| C G |");
  await expect(capture.getByTestId("text-card-dock-closed")).toBeVisible();
  // P24-07 item 4: the capability list (the 「?」) is no longer shown; the evaluator itself is tested in
  // its own unit tests.
  await expect(capture.getByTestId("text-progression-capabilities")).toHaveCount(0);
  await expect(capture.getByTestId("text-progression-capability-details")).toHaveCount(0);

  await enterEligibleProgression(page);
  await expect(page.locator("[data-capture-stage='pre-analysis']")).toHaveCount(0);
  await expect(page.getByTestId("pre-analysis-analyze")).toHaveCount(0);
  await expect(page.locator("[data-capture-midi-drop-zone]")).toHaveCount(0);

  // P25-03 C: choosing a card opens its band; the shape buttons change the card's sound (K), and the band
  // replaced the old style selector and the Draft bridge (C12).
  const cards = capture.getByTestId("text-preview-band");
  await cards.first().focus();
  await page.keyboard.press("Enter");
  const dock = capture.getByTestId("text-card-dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByTestId("text-dock-source")).toContainText("おすすめの形 · 基本");
  await expect(dock.locator("[data-shape='basic']")).toHaveAttribute("aria-pressed", "true");
  const notes = dock.getByTestId("text-dock-notes");
  const basicNotes = await notes.textContent();
  await dock.locator("[data-shape='shell']").click();
  await expect(dock.locator("[data-shape='shell']")).toHaveAttribute("aria-pressed", "true");
  await expect(dock.getByTestId("text-dock-source")).toContainText("おすすめの形 · シェル");
  expect(basicNotes).toBeTruthy();
  const lit = await dock.getByTestId("text-dock-key").evaluateAll((keys) =>
    keys.filter((key) => key.getAttribute("aria-pressed") === "true").map((key) => Number((key as HTMLElement).dataset.note)));
  expect(lit.length).toBeGreaterThan(0);
  await expect(capture.getByTestId("text-progression-convert")).toHaveCount(0);
  await expect(page.getByTestId("manual-candidate-editor")).toHaveCount(0);

  // Selecting a card auditions the exact voicing currently planned for save.
  await cards.nth(1).dispatchEvent("click");
  await cards.first().dispatchEvent("click");

  // The panel's own save goes through the text save adapter and never starts MIDI analysis.
  await capture.getByTestId("text-progression-name").fill(textTitle);
  await capture.getByTestId("text-progression-save").click();
  await expect(page.getByRole("button", { name: "Voicing Loopで練習", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).click();
  const voicingLoop = page.getByTestId("voicing-loop-workspace");
  await expect(voicingLoop).toBeVisible();
  await expect(voicingLoop.getByRole("heading", { level: 2, name: "C", exact: true })).toBeVisible();
  await expect(voicingLoop.getByRole("button", { name: "自動生成", exact: true }))
    .toHaveAttribute("aria-pressed", "false");

  await openVault(page);
  await page.locator("#vault-search").fill(textTitle);
  const row = page.locator(".lv-vault-row").filter({ hasText: textTitle });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("C");
  await expect(row).toContainText(/Ⅰ.*Ⅴ.*Ⅵm.*Ⅳ/);

  await row.getByRole("button", { name: /\u9032\u884c\u3092\u958b\u304f|Open progression/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(textTitle);
  await practiceFromVault(page, "Voicing Loop", textTitle);
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await expect(page.getByTestId("voicing-loop-workspace").getByRole("heading", { level: 2, name: "C", exact: true })).toBeVisible();

  await openVault(page);
  await page.locator("#vault-search").fill(textTitle);
  await page.locator(".lv-vault-row").filter({ hasText: textTitle })
    .getByRole("button", { name: /\u9032\u884c\u3092\u958b\u304f|Open progression/ })
    .click();
  await expect(detail).toBeVisible();
  await bassPracticeFromVault(page, textTitle);

  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  // P23-63: source/key/tempo sit in the stage's 条件 chip and meta line; progression selector is in 条件.
  await expect(page.getByTestId("bassline-conditions")).toContainText(/Vault source|Vault進行/);
  await expect(page.getByTestId("bassline-conditions")).toContainText("120 BPM");
  await expect(page.getByTestId("bassline-progression-select")).toHaveValue("vault");
  await page.getByTestId("bassline-conditions").click();
  await expect(bassline.locator(".bp-meta")).toContainText(/C メジャー|C major/);
  await expect(bassline.locator(".bp-meta")).toContainText("120 BPM");
  await expect(bassline.locator("[data-testid='bp-lane']")).toBeVisible();
  await expect(bassline.getByTestId("bassline-listen")).toBeVisible();

  const chordDojo = page.locator('[data-nav="chord-dojo"]');
  await chordDojo.click();
  await expect(chordDojo).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("practice-start")).toBeVisible();

  await page.locator('[data-nav="bass-practice"]').click();
  await openBassPractice(page, "コード進行のベース");
  await expect(bassline).toBeVisible();
  await openBassPractice(page, "ルートの動き");
  const rootMotion = page.getByTestId("root-motion-echo-view");
  await expect(rootMotion).toBeVisible();
  // P23-62: the source switched to the Vault's roots from the band's 「ルートの動きの条件」 panel.
  await page.getByTestId("root-motion-conditions").click();
  const rootMotionConditions = page.getByRole("dialog", { name: "ルートの動きの条件" });
  const rootMotionSource = rootMotionConditions.getByTestId("root-motion-source");
  await expect(rootMotionSource).toHaveValue("generated");
  await rootMotionSource.selectOption("vault-root-path");
  await expect(rootMotionSource).toHaveValue("vault-root-path");
  await expect(rootMotionConditions).toContainText("元のベースラインではありません。");
  await expect(page.getByTestId("root-motion-conditions")).toContainText("Vault の進行");

  // The Web runtime intentionally uses BrowserMemoryVaultStorage.  A browser
  // reload is therefore not presented as a durable Vault guarantee; the Tauri
  // release smoke owns save/restart persistence verification.
  await page.reload();
  await openVault(page);
  await page.locator("#vault-search").fill(textTitle);
  await expect(page.locator(".lv-vault-row").filter({ hasText: textTitle })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("P5.20 Text Progression Entry remains keyboard-accessible, responsive, reduced-motion, and axe-clean", async ({ page }) => {
  const pageErrors = await capturePageErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  const capture = await openTextCapture(page);
  await enterEligibleProgression(page);
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(capture).toBeVisible();
  await assertNoHorizontalOverflow(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

  const durations = await capture.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  expect(durations.every(({ animation, transition }) =>
    parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);

  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  expect(pageErrors).toEqual([]);
});
