import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

const bassPracticeFeatureKeys = [
  "loop-vault:bass-practice-degree-echo-enabled:v1",
  "loop-vault:bass-practice-rhythm-echo-enabled:v1",
  "loop-vault:bass-practice-bassline-echo-enabled:v1",
  "loop-vault:bass-practice-root-motion-enabled:v1",
] as const;

async function disableBassPractice(page: Page) {
  await page.addInitScript(({ keys }) => keys.forEach((key) => localStorage.setItem(key, "false")), {
    keys: bassPracticeFeatureKeys,
  });
}

async function openDegreeEcho(page: Page) {
  await openApp(page);
  await page.getByTestId("bass-practice-home-card")
    .getByRole("button")
    .click();
  await expect(page.getByTestId("degree-echo-view")).toBeVisible();
}

test("explicit Bass Practice rollback leaves Chord Dojo navigation unchanged", async ({ page }) => {
  await disableBassPractice(page);
  await openApp(page);
  await expect(page.getByTestId("bass-practice-home-card")).toHaveCount(0);
  await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Bass Practice" })).toHaveCount(0);
});

test("Degree Echo exposes an honest accessible setup with the shipped P5.16 modes", async ({ page }) => {
  await openDegreeEcho(page);
  const view = page.getByTestId("degree-echo-view");
  await expect(view).toContainText("自己評価");
  await expect(view).toContainText("自動採点ではありません");
  await expect(page.getByRole("tab", { name: "Rhythm Echo" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Bassline Echo" })).toBeVisible();
  await expect(view.locator("[data-primary-action]")).toHaveCount(1);

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='degree-echo-view']")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => (
    violation.impact === "critical" || violation.impact === "serious"
  ));
  expect(blocking.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      summary: node.failureSummary,
    })),
  }))).toEqual([]);
});

test("Degree Echo shortcuts ignore form focus and key repeat", async ({ page }) => {
  await openDegreeEcho(page);
  const primary = page.locator("[data-primary-action]");
  await page.getByLabel("弦数").focus();
  await page.keyboard.press("Space");
  await expect(primary).toContainText("練習を準備");
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: " ",
    repeat: true,
  })));
  await expect(primary).toContainText("練習を準備");
  await page.locator("#main-content").focus();
  await page.keyboard.press("Space");
  await expect(primary).toContainText("フレーズを再生");
});

test("pointer flow completes the dwell and plays a real different-key Transfer", async ({ page }) => {
  test.setTimeout(30_000);
  await openDegreeEcho(page);
  const view = page.getByTestId("degree-echo-view");
  const primary = view.locator("[data-primary-action]");

  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "ready");
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "singing");
  await expect(primary).toBeDisabled();
  await expect(primary).toBeEnabled({ timeout: 10_000 });
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "thinking");
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "playing");
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "review");
  const sourceDegrees = await view.getByTestId("degree-answer").textContent();

  await view.locator("[data-review-rating='good']").click();
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "transfer-offer");
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "transfer");
  const relation = view.getByTestId("degree-transfer-relation");
  await expect(relation).toContainText("C");
  await expect(relation).toContainText("G");
  await expect(relation).toContainText("同じ度数・同じリズム");
  await expect(view.getByTestId("degree-answer")).toHaveText(sourceDegrees ?? "");
  await expect(view.getByTestId("degree-status-announcement"))
    .toHaveText("Degree Echo: Transfer C → G。移調先はGです。");

  const transferReference = view.locator("[data-transfer-reference-action]");
  await transferReference.click();
  await expect(view).toHaveAttribute("data-practice-state", "transfer");
  await expect(transferReference).toBeEnabled({ timeout: 10_000 });
  await expect(view).toHaveAttribute("data-practice-state", "transfer");
  await primary.click();
  await expect(view).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
  await expect(primary).toBeDisabled();
  await expect(view.locator("[data-review-rating][aria-pressed='true']")).toHaveCount(0);
  await expect(view.locator("#degree-main-issue")).toHaveValue("");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Degree Echo ${viewport.width}x${viewport.height} keeps CTA and body overflow safe`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDegreeEcho(page);
    await assertNoHorizontalOverflow(page);
    const primary = page.locator("[data-primary-action]");
    await primary.scrollIntoViewIfNeeded();
    await expect(primary).toBeVisible();
    const box = await primary.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  });
}

test("Degree Echo remains operable at Windows 200% scale", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4174",
    colorScheme: "dark",
    deviceScaleFactor: 2,
    locale: "ja-JP",
    viewport: { width: 1024, height: 720 },
  });
  try {
    const page = await context.newPage();
    await openDegreeEcho(page);
    await assertNoHorizontalOverflow(page);
    const primary = page.locator("[data-primary-action]");
    await primary.scrollIntoViewIfNeeded();
    await expect(primary).toBeVisible();
    await expect(primary).toContainText("練習を準備");
  } finally {
    await context.close();
  }
});
