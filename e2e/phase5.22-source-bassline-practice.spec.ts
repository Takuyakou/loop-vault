import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  chooseFirstCandidate,
  saveChosenRange,
  loadMidiForPreAnalysis,
  openApp,
  openVault,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";
import { bassPracticeFromVault } from "./helpers/practice";

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
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await bassPracticeFromVault(page);

  // P23-63: every setting is in the top band's 条件 panel; the Vault picker leaves it open.
  const bassline = page.getByTestId("bassline-echo-view");
  const panel = page.getByRole("dialog", { name: "コード進行のベースの条件" });
  await expect(bassline).toBeVisible();
  if (!(await panel.isVisible().catch(() => false))) await page.getByTestId("bassline-conditions").click();
  await expect(panel).toBeVisible();
  const source = panel.getByTestId("bassline-line-source");
  await expect(source.locator("option[value='source-bassline']")).toBeEnabled();
  await source.focus();
  await page.keyboard.press("ArrowDown");
  await expect(source).toHaveValue("source-bassline");
  const savedSource = panel.getByTestId("source-bassline-vault-select");
  await expect(savedSource).toHaveValue("");
  await page.keyboard.press("Tab");
  await expect(savedSource).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(savedSource).not.toHaveValue("");
  await page.keyboard.press("Tab");
  const level = panel.locator("#bassline-level");
  await expect(level).toBeFocused();
  const windowLength = panel.getByTestId("source-bassline-window-bars");
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
  const nextWindow = panel.getByTestId("source-bassline-next");
  await nextWindow.focus();
  await page.keyboard.press("Enter");
  await expect(nextWindow).toBeFocused();
  await expect(panel.getByTestId("source-bassline-range")).toContainText(/3〜4小節/);
  await expect(panel.getByTestId("source-bassline-window")).toBeVisible();
  await expect(panel.getByTestId("source-bassline-projection-facts")).toContainText(/切り出しノート/);
  await expect(panel.getByTestId("source-bassline-projection-facts")).toContainText(/単音投影/);
  await expect(level).toHaveValue("3");
  await expect(level.locator("option[value='1']")).toBeDisabled();
  await expect(level.locator("option[value='2']")).toBeDisabled();
  await expect(level.locator("option[value='3']")).toBeEnabled();
  await expect(panel.locator("#bassline-level-description")).toContainText(/正確な保存済み和声/);
  await expect(panel.getByTestId("source-bassline-projection-facts")).toContainText(/pitch置換 0/);

  // 段 1 ▶ → ■ (the sound starts without waiting for the whole window), then 段 3 by the short self-rated way.
  const listen = bassline.getByTestId("bassline-listen");
  await expect(bassline.getByTestId("bassline-record")).toBeDisabled();
  await listen.click();
  await expect(listen).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await listen.click();
  await expect(listen).toHaveAttribute("aria-label", "お手本を聴く");
  await bassline.getByRole("button", { name: "録らずに弾く" }).click();
  await expect(bassline).toHaveAttribute("data-stage-step", "1");
  await bassline.getByRole("button", { name: /弾けた・答えを見る/ }).click();
  await expect(bassline).toHaveAttribute("data-stage-step", "2");
  const saveHistory = bassline.getByTestId("bassline-next");
  await expect(saveHistory).toBeEnabled();
  await saveHistory.click();
  await expect(bassline).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });
  // The next window follows the save, and the reference-only History lists the restored condition.
  await page.getByTestId("bassline-conditions").click();
  await expect(panel).toBeVisible();
  // The save moves to the next window — or wraps back to the first one after the last (P23-63).
  await expect(panel.getByTestId("source-bassline-range")).toHaveText(/^(1〜2|5〜6)小節$/);
  await expect(panel.getByTestId("source-bassline-history")).toBeVisible();
  await expect(panel.getByTestId("source-bassline-history")).toContainText(/元ライン（単音化）/);

  // A wide window at a slow tempo: the phrase still plays, and a take with no microphone permission fails honestly
  // (the old screen disabled record-start and showed the same message).
  await eightBars.focus();
  await page.keyboard.press("Enter");
  await expect(eightBars).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await panel.getByTestId("chord-context-effective-bpm").fill("31");
  await page.getByTestId("bassline-conditions").click();
  await expect(panel).toBeHidden();
  await bassline.getByTestId("bassline-listen").click();
  await expect(listen).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await listen.click();
  await expect(listen).toHaveAttribute("aria-label", "お手本を聴く");
  await bassline.getByTestId("bassline-record").click();
  await expect(bassline).toContainText("マイクの使用が許可されませんでした。", { timeout: 20_000 });
  await bassline.getByRole("button", { name: "答えを見る" }).click();
  await expect(bassline.getByTestId("bassline-next")).toBeEnabled();
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 640, height: 812 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await page.getByTestId("bassline-conditions").click();
  await expect(panel.getByTestId("source-bassline-window")).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("Source Bassline is axe-clean and honors reduced motion at effective 200% scale", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 812 });
  await openApp(page);
  await saveSyntheticSourceBassline(page);
  await openVault(page);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await bassPracticeFromVault(page);

  const bassline = page.getByTestId("bassline-echo-view");
  const panel = page.getByRole("dialog", { name: "コード進行のベースの条件" });
  if (!(await panel.isVisible().catch(() => false))) await page.getByTestId("bassline-conditions").click();
  await panel.getByTestId("bassline-line-source").selectOption("source-bassline");
  await panel.getByTestId("source-bassline-vault-select").selectOption({ index: 1 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });

  await expect(bassline).toBeVisible();
  await expect(panel.getByTestId("source-bassline-window")).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const durations = await page.evaluate(() => {
    const stage = document.querySelector("[data-testid='bassline-echo-view']");
    const conditions = document.querySelector("[aria-label='コード進行のベースの条件']");
    const elements = [stage, conditions].flatMap((root) => root ? [...root.querySelectorAll("*")] : []);
    return elements.map((element) => {
      const style = getComputedStyle(element);
      return { animation: style.animationDuration, transition: style.transitionDuration };
    });
  });
  expect(durations.every(({ animation, transition }) =>
    parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);
  await assertNoHorizontalOverflow(page);
  await expectNoSeriousViolations(page);
});

/** P10.0-07: saved from the correction workspace, the bassline under the save form's 「詳しい設定」. */
async function saveSyntheticSourceBassline(page: Page): Promise<void> {
  await loadMidiForPreAnalysis(page, createMidiFixture({ bars: 16, voiceCount: 3 }), "synthetic-source-practice.mid");
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);
  const form = page.getByTestId("correction-save-form");
  await form.locator("summary", { hasText: "詳しい設定" }).click();
  const panel = form.getByTestId("source-bassline-capture-panel");
  const voice = panel.getByLabel(/Bass Voiceを選択/);
  const range = panel.getByLabel(/保存する範囲/);
  await voice.selectOption({ index: 1 });
  await expect(range).toBeEnabled();
  await range.selectOption({ index: 1 });
  await panel.getByRole("checkbox", { name: /元ベースラインを練習用に保存/ }).check();
  await saveChosenRange(page, "Synthetic source practice");
}
