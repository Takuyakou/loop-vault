import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  enableLegacyCaptureScreen,
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  chooseFirstCandidate,
  loadMidiForPreAnalysis,
  openApp,
  waitForSidebarSettled,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

function parseDuration(value: string): number {
  return Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms")
      ? Number.parseFloat(trimmed)
      : Number.parseFloat(trimmed) * 1_000;
  }));
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) => (
    violation.impact === "critical" || violation.impact === "serious"
  ));
  const summary = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 12).map((node) => node.target.join(" > ")),
    count: violation.nodes.length,
  }));
  expect(blocking, JSON.stringify(summary, null, 2)).toEqual([]);
}

test("P5.23 Full Timeline remains stable, keyboard-operable, responsive, and axe-clean", async ({ page }) => {
  // The old capture screen itself (P10.0-06: behind the legacy setting until P10.0-07 removes it).
  await enableLegacyCaptureScreen(page);
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 812 });
  await openApp(page);
  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ bars: 145, voiceCount: 3 }),
    "timeline-legibility-145-bars.mid",
  );
  await analyzeCurrentMidi(page);

  const minimap = page.locator("[data-song-minimap]");
  await expect(minimap).toBeVisible();
  await expect(minimap.getByText("1-145", { exact: true })).toBeVisible();
  await expect(minimap.locator("[data-harmonic-activity-bar]")).toHaveCount(145);
  await assertNoHorizontalOverflow(page);

  const groupedTrigger = minimap.locator(
    "[data-song-minimap-group][aria-expanded]",
  ).first();
  await expect(groupedTrigger).toBeVisible();
  const committedSelection = minimap.locator("[data-current-selection]");
  await expect(committedSelection).toBeVisible();
  const selectionBeforeOpen = await committedSelection.getAttribute("aria-label");

  await groupedTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(groupedTrigger).toHaveAttribute("aria-expanded", "true");
  const selectedVariant = minimap.locator(
    '[data-song-minimap-variant-selected="true"]',
  );
  await expect(selectedVariant).toBeFocused();
  await expect(committedSelection).toHaveAttribute("aria-label", selectionBeforeOpen!);
  const variantLabels = await minimap.locator("[data-song-minimap-variant]").allTextContents();
  expect(variantLabels.length).toBeGreaterThan(1);
  expect(variantLabels.every((label) => /(?:小節).*(?:Bar|Bars)/.test(label))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(groupedTrigger).toBeFocused();
  await expect(groupedTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(committedSelection).toHaveAttribute("aria-label", selectionBeforeOpen!);

  await page.setViewportSize({ width: 640, height: 812 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await groupedTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(selectedVariant).toBeFocused();
  await assertNoHorizontalOverflow(page);
  const selectorFits = await minimap.locator("[data-song-minimap-variant-selector]").evaluate(
    (selector) => selector.scrollWidth <= selector.clientWidth + 1,
  );
  expect(selectorFits).toBe(true);
  const variantsFit = await minimap.locator("[data-song-minimap-variant]").evaluateAll(
    (variants) => variants.every((variant) => variant.scrollWidth <= variant.clientWidth + 1),
  );
  expect(variantsFit).toBe(true);

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(true);
  const durations = await minimap.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  expect(durations.every(({ animation, transition }) => (
    parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01
  ))).toBe(true);
  await expectNoSeriousViolations(page);

  await page.evaluate(() => document.fonts.ready);
  const firstScreenshot = await minimap.screenshot({ animations: "disabled" });
  const secondScreenshot = await minimap.screenshot({ animations: "disabled" });
  expect(secondScreenshot.equals(firstScreenshot)).toBe(true);
});

test("Vault save form stays visible with the sidebar expanded at the reported narrow size", async ({ page }) => {
  // The old capture screen itself (P10.0-06: behind the legacy setting until P10.0-07 removes it).
  await enableLegacyCaptureScreen(page);
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 786, height: 836 });
  await openApp(page);

  const sidebar = page.locator("[data-sidebar]");
  if (await sidebar.getAttribute("data-sidebar") === "collapsed") {
    await page.getByRole("button", { name: "サイドバーを広げる" }).click();
  }
  await expect(sidebar).toHaveAttribute("data-sidebar", "expanded");
  await waitForSidebarSettled(page);

  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ bars: 20, voiceCount: 3 }),
    "save-popover-narrow.mid",
  );
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);

  const selected = page.locator('[data-candidate-state="selected"]');
  await selected
    .getByRole("button", { name: /Vaultに保存/, exact: true })
    .click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form).toBeVisible();

  const bounds = await form.evaluate((element) => {
    const formBounds = element.getBoundingClientRect();
    const mainBounds = document.querySelector("main")!.getBoundingClientRect();
    return {
      formLeft: formBounds.left,
      formRight: formBounds.right,
      formTop: formBounds.top,
      formBottom: formBounds.bottom,
      mainLeft: mainBounds.left,
      mainRight: mainBounds.right,
      viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.formLeft).toBeGreaterThanOrEqual(bounds.mainLeft + 7);
  expect(bounds.formRight).toBeLessThanOrEqual(bounds.mainRight - 7);
  expect(bounds.formTop).toBeGreaterThanOrEqual(7);
  expect(bounds.formBottom).toBeLessThanOrEqual(bounds.viewportHeight - 7);
  await expect(form.locator('input[name="progression-title"]')).toBeFocused();
  await assertNoHorizontalOverflow(page);
});
