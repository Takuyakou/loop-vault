import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  capturePageErrors,
  openApp,
  openVault,
} from "./helpers/app";

const textTitle = "P5.20 Text Entry E2E";

async function openTextCapture(page: Page) {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /\u30b3\u30fc\u30c9\u63a1\u96c6|Capture/ }).click();

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
  await expect(capture.getByTestId("text-progression-card")).toHaveCount(4);

  await capture.getByTestId("text-progression-key").fill("C major");
  await capture.getByRole("button", { name: /\u30ad\u30fc\u3092\u78ba\u5b9a|Confirm key/ }).click();
  await expect(capture.getByTestId("text-progression-key-state")).toContainText("C major");

  await capture.getByTestId("text-progression-bpm").fill("120");
  await expect(capture.getByTestId("text-progression-convert")).toBeEnabled();
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
  const convert = capture.getByTestId("text-progression-convert");

  // A malformed 3-token bar remains visible and blocks the one-way Draft bridge.
  await textInput.fill("| C G Am |");
  await expect(textInput).toHaveAttribute("aria-invalid", "true");
  await expect(capture.getByTestId("text-progression-diagnostics")).toBeVisible();
  await expect(capture.getByTestId("text-progression-invalid-card")).toHaveCount(3);
  await expect(convert).toBeDisabled();

  // Valid text is independently capable of Vault/Dojo even before the optional
  // Chord Context conditions have been confirmed.
  await textInput.fill("| C G |");
  const inspector = capture.getByTestId("text-progression-inspector");
  await expect(inspector).toBeVisible();
  const initialCapabilities = capture.getByTestId("text-progression-capabilities");
  // Capability order is the public evaluator contract: Vault, Dojo, Bass
  // Practice, Chord Context, Root Motion, then Voicing Memory.
  const capabilityStatuses = initialCapabilities.locator(":scope > div > [data-capability-status]");
  await expect(capabilityStatuses.nth(0)).toHaveAttribute("data-capability-status", "supported");
  await expect(capabilityStatuses.nth(1)).toHaveAttribute("data-capability-status", "supported");
  await expect(capabilityStatuses.nth(3)).toHaveAttribute("data-capability-status", /unknown|unsupported/);

  await enterEligibleProgression(page);
  await expect(page.locator("[data-capture-stage='pre-analysis']")).toHaveCount(0);
  await expect(page.getByTestId("pre-analysis-analyze")).toHaveCount(0);
  await expect(page.locator("[data-capture-midi-drop-zone]")).toHaveCount(0);

  const cards = capture.getByTestId("text-progression-card");
  await cards.first().focus();
  await page.keyboard.press("Enter");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId("text-progression-auto-generated")).toContainText(/source MIDI|\u5143MIDI/);

  const styleSelector = inspector.getByTestId("voicing-style-selector");
  const inspectorSourceChip = inspector.getByTestId("detail-voicing-source-chip");
  await expect(styleSelector).toHaveValue("generated-close");
  await expect(inspectorSourceChip).toHaveAttribute("data-voicing-source", "generated");
  expect(await inspector.evaluate((element) => {
    const select = element.querySelector("[data-testid='voicing-style-selector']");
    const chip = element.querySelector("[data-testid='detail-voicing-source-chip']");
    return Boolean(select && chip && (select.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);

  const savedNotes = inspector.getByTestId("voicing-saved-notes");
  const defaultSavedNotes = await savedNotes.textContent();
  await styleSelector.selectOption("open-17");
  await expect(styleSelector).toHaveValue("open-17");
  await expect(savedNotes).not.toHaveText(defaultSavedNotes ?? "");
  await expect(cards.first().getByTestId("text-progression-voicing-state")).toContainText(/Open|\u30aa\u30fc\u30d7\u30f3/);

  const activeMidiNotes = await inspector.getByTestId("voicing-keyboard")
    .locator("[data-active='true']")
    .evaluateAll((keys) => keys.map((key) => Number((key as HTMLElement).dataset.midiNote)));
  expect(activeMidiNotes.length).toBeGreaterThan(0);
  for (const note of activeMidiNotes) {
    await expect(savedNotes).toContainText(String(note));
  }

  // Selecting a card auditions the exact voicing currently planned for save.
  await cards.nth(1).click();
  await cards.first().click();
  await inspector.getByTestId("text-progression-preview").click();
  await inspector.getByRole("button", { name: /\u505c\u6b62|Stop/ }).click();

  // Conversion is intentionally keyboard-operable and never starts MIDI analysis.
  await convert.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByTestId("manual-candidate-editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId("draft-source")).toContainText(/\u30c6\u30ad\u30b9\u30c8|text entry/);
  const sourceChip = editor.getByTestId("capture-voicing-source-chip");
  await expect(sourceChip).toHaveAttribute("data-voicing-source", "generated");
  await expect(sourceChip).toHaveAttribute("title", /Auto-generated from this text entry|\u30c6\u30ad\u30b9\u30c8\u5165\u529b/);

  // The existing Quick Editor is available after conversion, while text-owned
  // timing remains protected by the text Draft adapter.
  await editor.locator("[data-chord-card]").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-quick-chord-editor]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-quick-chord-editor]")).toBeHidden();
  await editor.locator("[data-action='preview']").click();
  await page.keyboard.press("Escape");

  await editor.locator("button[aria-haspopup='dialog']").click();
  const saveForm = page.locator("form[role='dialog']");
  await expect(saveForm).toBeVisible();
  await saveForm.locator("input[name='progression-title']").fill(textTitle);
  await saveForm.locator("button[type='submit']").click();
  await expect(saveForm).toBeHidden();
  await expect(editor).toHaveCount(0);

  await openVault(page);
  await page.locator("#vault-search").fill(textTitle);
  const row = page.locator(".lv-vault-row").filter({ hasText: textTitle });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("C");
  await expect(row).toContainText(/I.*V.*vi.*IV/);

  await row.getByRole("button", { name: /\u9032\u884c\u3092\u958b\u304f|Open progression/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(textTitle);
  await detail.getByTestId("chord-context-handoff").getByRole("button").click();

  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await expect(bassline.getByTestId("bassline-source-summary")).toContainText(/Vault source|\u0056ault\u9032\u884c/);
  await expect(bassline.getByTestId("bassline-source-summary")).toContainText("C major");
  await expect(bassline.getByTestId("bassline-source-summary")).toContainText("120 BPM");
  await expect(bassline.getByTestId("chord-context-controls")).toBeVisible();

  const chordDojo = page.getByRole("tab", { name: "Chord Dojo" });
  await chordDojo.click();
  await expect(chordDojo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("practice-start")).toBeVisible();

  await page.getByRole("tab", { name: "Bass Practice" }).click();
  await expect(bassline).toBeVisible();
  await page.getByRole("tab", { name: "Root Motion Echo" }).click();
  const rootMotion = page.getByTestId("root-motion-echo-view");
  await expect(rootMotion).toBeVisible();
  await rootMotion.getByTestId("root-motion-source").selectOption("vault-root-path");
  await expect(rootMotion.getByTestId("root-motion-source")).toHaveValue("vault-root-path");
  await expect(rootMotion).toContainText(/not an original bassline|\u5143\u306e\u30d9\u30fc\u30b9\u30e9\u30a4\u30f3\u3067\u306f\u3042\u308a\u307e\u305b\u3093/);

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
