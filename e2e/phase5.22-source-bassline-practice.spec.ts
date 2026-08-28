import AxeBuilder from "@axe-core/playwright";
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

function parseDuration(value: string): number {
  return Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1_000;
  }));
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious");
  const summary = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 12).map((node) => node.target.join(" > ")),
    count: violation.nodes.length,
  }));
  expect(blocking, JSON.stringify(summary, null, 2)).toEqual([]);
}

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
  await source.focus();
  await page.keyboard.press("ArrowDown");
  await expect(source).toHaveValue("source-bassline");
  const savedSource = bassline.getByTestId("source-bassline-vault-select");
  await expect(savedSource).toHaveValue("");
  await page.keyboard.press("Tab");
  await expect(savedSource).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(savedSource).not.toHaveValue("");
  await page.keyboard.press("Tab");
  const level = bassline.locator("#bassline-level");
  await expect(level).toBeFocused();
  const windowLength = bassline.getByTestId("source-bassline-window-bars");
  const oneBar = windowLength.getByRole("button", { name: "1", exact: true });
  const twoBars = windowLength.getByRole("button", { name: "2", exact: true });
  const fourBars = windowLength.getByRole("button", { name: "4", exact: true });
  const eightBars = windowLength.getByRole("button", { name: "8", exact: true });
  await expect(windowLength.getByRole("button")).toHaveCount(4);
  await expect(twoBars).toHaveAttribute("aria-pressed", "true");
  await fourBars.focus();
  await page.keyboard.press("Enter");
  await expect(fourBars).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await eightBars.focus();
  await page.keyboard.press("Enter");
  await expect(eightBars).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await oneBar.focus();
  await page.keyboard.press("Enter");
  await expect(oneBar).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await twoBars.focus();
  await page.keyboard.press("Enter");
  await expect(twoBars).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  const nextWindow = bassline.getByTestId("source-bassline-next");
  await nextWindow.focus();
  await page.keyboard.press("Enter");
  await expect(nextWindow).toBeFocused();
  await expect(bassline.getByTestId("source-bassline-range")).toContainText(/Bars 3-4|3〜4小節/);
  await expect(bassline.getByTestId("source-bassline-window")).toBeVisible();
  await expect(bassline.getByTestId("source-bassline-projection-facts")).toContainText(/Cropped notes|切り出しノート/);
  await expect(bassline.getByTestId("source-bassline-projection-facts")).toContainText(/monophonic projection|単音投影/);
  await expect(level).toHaveValue("3");
  await expect(level.locator("option[value='1']")).toBeDisabled();
  await expect(level.locator("option[value='2']")).toBeDisabled();
  await expect(level.locator("option[value='3']")).toBeEnabled();
  await expect(bassline.locator("#bassline-level-description")).toContainText(/exact captured harmony|正確な保存済み和声/);
  await expect(bassline.getByTestId("source-bassline-projection-facts")).toContainText(/pitches replaced 0|pitch置換 0/);
  const review = bassline.getByRole("button", { name: /Review|レビュー/, exact: false });
  await review.focus();
  await page.keyboard.press("Enter");
  const saveHistory = bassline.getByTestId("source-bassline-save-history");
  await saveHistory.focus();
  await page.keyboard.press("Enter");
  await expect(bassline.getByTestId("source-bassline-history")).toBeVisible();
  await expect(bassline.getByTestId("source-bassline-history")).toContainText(/Source line \(monophonic\)|元ライン（単音化）/);
  await eightBars.focus();
  await page.keyboard.press("Enter");
  await expect(eightBars).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await bassline.getByTestId("chord-context-effective-bpm").fill("31");
  await bassline.getByRole("button", { name: /Review|レビュー/, exact: false }).click();
  await bassline.getByTestId("record-compare-enable").click();
  await expect(bassline.getByTestId("record-start")).toBeDisabled();
  await expect(bassline.getByRole("alert")).toContainText(/Microphone permission was denied|マイクの使用が許可されませんでした/);
  await expect(bassline.getByTestId("bassline-listen")).toBeEnabled();
  await expect(bassline.getByTestId("source-bassline-save-history")).toBeEnabled();
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 640, height: 812 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(bassline.getByTestId("source-bassline-window")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("Source Bassline is axe-clean and honors reduced motion at effective 200% scale", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 812 });
  await openApp(page);
  await saveSyntheticSourceBassline(page);
  await openVault(page);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /Open progression|進行を開く/ }).click();
  await page.getByTestId("chord-context-handoff").getByRole("button").click();

  const bassline = page.getByTestId("bassline-echo-view");
  await bassline.getByTestId("bassline-line-source").selectOption("source-bassline");
  await bassline.getByTestId("source-bassline-vault-select").selectOption({ index: 1 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });

  await expect(bassline.getByTestId("source-bassline-window")).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const durations = await bassline.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  expect(durations.every(({ animation, transition }) =>
    parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);
  await assertNoHorizontalOverflow(page);
  await expectNoSeriousViolations(page);
});

async function saveSyntheticSourceBassline(page: Page): Promise<void> {
  await loadMidiForPreAnalysis(page, createMidiFixture({ bars: 16, voiceCount: 3 }), "synthetic-source-practice.mid");
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
