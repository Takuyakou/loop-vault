import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, capturePageErrors, openApp } from "./helpers/app";

test("P8.8 Extended Text saves a public synthetic score and opens Voicing Loop", async ({ page }) => {
  const errors = await capturePageErrors(page);
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-mode-extended").click();
  const intake = capture.getByTestId("extended-text-intake");
  const input = intake.getByTestId("extended-text-input");
  const raw = "# Key: C major\r\n# BPM: 120\r\n| C % = _ | F/C |";
  await input.fill(raw);
  await expect(intake.getByTestId("extended-text-bar")).toHaveCount(2);
  await expect(intake.getByTestId("text-preview-band")).toHaveCount(2);
  await expect(intake.getByTestId("text-preview-attack")).toHaveCount(3);
  await expect(intake.getByTestId("text-preview-rest")).toHaveCount(1);
  await expect(intake.getByTestId("extended-text-metadata")).toHaveCount(0);
  await intake.getByRole("button", { name: /キー Cメジャーを使う/ }).click();
  await intake.getByRole("button", { name: /BPM 120を使う/ }).click();
  await expect(intake.getByTestId("extended-text-metadata")).toContainText("BPM 120");
  await expect(input).toHaveValue(raw);
  await intake.getByTestId("extended-text-save").click();
  await expect(page.locator("#main-content").getByRole("button", { name: /Voicing Loopで練習/ })).toBeVisible();
  await page.locator("#main-content").getByRole("button", { name: /Voicing Loopで練習/ }).click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  expect(errors).toEqual([]);
});

test("P8.8 Extended Text blocks ambiguous input and remains accessible at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-mode-extended").focus();
  await page.keyboard.press("Enter");
  const intake = capture.getByTestId("extended-text-intake");
  const input = intake.getByTestId("extended-text-input");
  await input.fill("| C _ = F |");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(intake.getByTestId("extended-text-save")).toBeDisabled();
  await expect(intake.getByTestId("extended-text-diagnostics")).toContainText("ERROR");
  await input.fill("| C % = _ | F/C |");
  await expect(intake.getByTestId("extended-text-save")).toBeEnabled();
  await assertNoHorizontalOverflow(page);
  const audit = await new AxeBuilder({ page: page as never }).include("[data-testid='extended-text-intake']").analyze();
  expect(audit.violations).toEqual([]);
});

test("P8.8.2 renders 70/150/200 public bars and keeps both panes usable across breakpoints", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await page.getByTestId("text-mode-extended").click();
  const intake = page.getByTestId("extended-text-intake");
  const input = intake.getByTestId("extended-text-input");
  for (const count of [70, 150, 200]) {
    const bars = Array.from({ length: count }, (_, index) => index % 2 ? "G7" : "C");
    const started = Date.now();
    await input.fill("| " + bars.join(" | ") + " |");
    await expect(intake.getByTestId("extended-text-bar")).toHaveCount(count);
    await expect(intake.getByTestId("text-preview-row")).toHaveCount(Math.ceil(count / 4));
    await expect(intake.getByTestId("extended-text-save")).toBeEnabled();
    const updateMs = Date.now() - started;
    console.log("P8.8.2 public chart update", count, updateMs);
    expect(updateMs).toBeLessThan(7000);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1024, height: 720 });
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 899, height: 720 });
  await expect(intake.getByRole("tab", { name: /入力/ })).toBeVisible();
  await intake.getByRole("tab", { name: /プレビュー/ }).click();
  await expect(intake.getByTestId("extended-text-preview")).toBeVisible();
  await expect(intake.getByTestId("extended-text-editor")).toBeHidden();
  for (const width of [853, 768, 640]) {
    await page.setViewportSize({ width, height: 720 });
    await assertNoHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await assertNoHorizontalOverflow(page);
  await intake.getByRole("tab", { name: /入力/ }).click();
  await expect(input).toBeVisible();
});
