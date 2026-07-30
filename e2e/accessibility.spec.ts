import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  analyzeCurrentMidi,
  createSavedProgression,
  loadMidiForPreAnalysis,
  openApp,
  openVault,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

async function expectNoSeriousViolations(page: Page, label: string) {
  // @axe-core/playwright allows a newer playwright-core range than the test
  // runner. Runtime Page APIs are compatible; isolate the dependency-only type.
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
  expect(blocking, `${label}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
}

test("HomeとCapture空状態", async ({ page }) => {
  await openApp(page);
  await expectNoSeriousViolations(page, "home");
  await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
  await expectNoSeriousViolations(page, "capture-empty");
});

test("解析前と解析結果", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 11 }), "axe-voices.mid");
  await expectNoSeriousViolations(page, "pre-analysis");
  await analyzeCurrentMidi(page);
  await expectNoSeriousViolations(page, "analysis-result");
});

test("Vault、進行詳細、Settings、Dialog", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Axe Progression");
  await openVault(page);
  await expectNoSeriousViolations(page, "vault");
  await page.locator(".lv-vault-row").first()
    .getByRole("button", { name: /進行を開く|Open progression/ }).click();
  await expectNoSeriousViolations(page, "progression-detail");
  await page.getByRole("button", { name: /設定|Settings/ }).first().click();
  await expectNoSeriousViolations(page, "settings-dialog");
});
