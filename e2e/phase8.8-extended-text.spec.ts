import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, capturePageErrors, openApp } from "./helpers/app";

/**
 * P8.8 extended-text — rewritten for P24-05's one screen. The extended-only inputs (a `# Key:` line, 3/5 cells,
 * `%` `/` `=` `_`) are read by the one grammar now, so these checks run on the one intake.
 */
test("the one text screen saves a public synthetic score and opens Voicing Loop", async ({ page }) => {
  const errors = await capturePageErrors(page);
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const intake = page.getByTestId("text-progression-capture");
  const input = intake.getByTestId("text-progression-input");
  const raw = "# Key: C major\n# BPM: 120\n| C % = _ | F/C |";
  await input.fill(raw);
  await expect(intake.getByTestId("extended-text-bar")).toHaveCount(2);
  // P24-05: the written 「%」 keeps a card of its own (there are no separate attack markers now).
  await expect(intake.getByTestId("text-preview-band")).toHaveCount(3);
  await expect(intake.locator("[data-testid='text-preview-band'][data-chord='%']")).toHaveCount(1);
  await expect(intake.getByTestId("text-preview-rest")).toHaveCount(1);
  // P24-05: the `# Key:` / `# BPM:` lines are proposals until their buttons are pressed.
  await expect(intake.getByTestId("text-progression-key")).toHaveAttribute("data-value","auto");
  await intake.getByTestId("text-hint-key").click();
  await intake.getByTestId("text-hint-bpm").click();
  await expect(intake.getByTestId("text-progression-key")).toHaveAttribute("data-value","C major");
  await expect(intake.getByTestId("text-progression-bpm")).toHaveValue("120");
  await expect(input).toHaveValue(raw);
  await intake.getByTestId("text-progression-save").click();
  await expect(page.getByRole("button", { name: /Voicing Loopで練習/ })).toBeVisible();
  await page.getByRole("button", { name: /Voicing Loopで練習/ }).click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the one text screen blocks ambiguous input and remains accessible at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  const input = capture.getByTestId("text-progression-input");
  await input.fill("| C _ = F |");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  await expect(capture.getByTestId("text-progression-diagnostics")).toContainText("前に鳴っているコードが要ります");
  await input.fill("| C % = _ | F/C |");
  await expect(capture.getByTestId("text-progression-save")).toBeEnabled();
  await assertNoHorizontalOverflow(page);
  const audit = await new AxeBuilder({ page: page as never }).include("[data-testid='text-progression-capture']").analyze();
  expect(audit.violations).toEqual([]);
});

test("P8.8.2 renders 70/150/200 public bars and keeps both panes usable across breakpoints", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const intake = page.getByTestId("text-progression-capture");
  const input = intake.getByTestId("text-progression-input");
  for (const count of [70, 150, 200]) {
    const bars = Array.from({ length: count }, (_, index) => index % 2 ? "G7" : "C");
    const started = Date.now();
    await input.fill("| " + bars.join(" | ") + " |");
    await expect(intake.getByTestId("extended-text-bar")).toHaveCount(count);
    await expect(intake.getByTestId("text-preview-row")).toHaveCount(Math.ceil(count / 4));
    await expect(intake.getByTestId("text-progression-save")).toBeEnabled();
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
  await expect(intake.getByTestId("standard-text-preview")).toBeVisible();
  await expect(intake.getByTestId("text-intake-editor")).toBeHidden();
  for (const width of [853, 768, 640]) {
    await page.setViewportSize({ width, height: 720 });
    await assertNoHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await assertNoHorizontalOverflow(page);
  await intake.getByRole("tab", { name: /入力/ }).click();
  await expect(input).toBeVisible();
});
