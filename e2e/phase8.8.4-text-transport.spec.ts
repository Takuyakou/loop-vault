import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, capturePageErrors, openTextCapture } from "./helpers/app";

test("P8.8.4 Standard score seeks exact attacks and supports Pause/Resume/Stop anchor", async ({ page }) => {
  const errors = await capturePageErrors(page);
  const capture = await openTextCapture(page);
  const input = capture.getByTestId("text-progression-input");
  await input.fill("| C Dm F G |");
  const bands = capture.getByTestId("standard-text-preview").getByTestId("text-preview-band");
  await expect(bands).toHaveCount(4);
  await bands.nth(1).click();
  expect(await input.evaluate((element: HTMLTextAreaElement) =>
    element.value.slice(element.selectionStart, element.selectionEnd))).toBe("Dm");
  await expect(capture.getByTestId("text-smooth-playhead")).toHaveCSS("left", /[1-9]/);
  const primary = capture.getByTestId("text-transport-primary");
  const initialWidth = (await primary.boundingBox())?.width;
  await expect(primary).toHaveAttribute("data-transport-variant", "primary");
  await expect(capture.getByTestId("text-transport-stop")).toHaveAttribute("data-transport-variant", "neutral");
  await expect(capture.getByTestId("text-transport-beginning")).toHaveAttribute("data-transport-variant", "neutral");
  await expect(capture.getByTestId("text-transport-loop")).toHaveAttribute("data-transport-variant", "loop-off");
  await capture.getByTestId("text-transport-loop").click();
  await expect(capture.getByTestId("text-transport-loop")).toHaveAttribute("data-transport-variant", "loop-on");
  await capture.getByTestId("text-transport-loop").click();
  await primary.click();
  await expect(primary).toContainText(/一時停止/);
  expect((await primary.boundingBox())?.width).toBe(initialWidth);
  await primary.click();
  await expect(primary).toContainText(/再開/);
  expect((await primary.boundingBox())?.width).toBe(initialWidth);
  await primary.click();
  await expect(primary).toContainText(/一時停止/);
  await capture.getByTestId("text-transport-stop").click();
  await expect(primary).toContainText(/再生/);
  await expect(capture.locator("[data-testid='extended-text-bar'][data-playback-active='true']")).toHaveCount(0);
  await input.focus();
  await page.keyboard.press("Space");
  await expect(primary).toContainText(/再生/);
  await assertNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("P8.8.4 Standard primary Vault save (P25-03 C12: no Draft path)", async ({ page }) => {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| C Dm |");
  await expect(capture.getByTestId("text-progression-convert")).toHaveCount(0);
  await capture.getByTestId("text-progression-name").fill("Public text chart");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
  await expect(page.getByTestId("manual-candidate-editor")).toHaveCount(0);
});

test("P8.8.4 the one screen exposes the repeat card and bar targets without an axe violation", async ({ page }) => {
  const capture = await openTextCapture(page);
  const intake = capture;
  const input = capture.getByTestId("text-progression-input");
  await input.fill("# Note for player\n| C % = _ | Dm |");
  // P24-05: the repeat is a card of its own; it selects the 「%」 it was written with.
  await intake.locator("[data-testid='text-preview-band'][data-chord='%']").click();
  expect(await input.evaluate((element: HTMLTextAreaElement) =>
    element.value.slice(element.selectionStart, element.selectionEnd))).toBe("%");
  await intake.getByTestId("text-preview-bar-select").nth(1).click();
  await expect(intake.locator("[data-testid='extended-text-bar'][data-bar='2']")).toHaveAttribute("data-playhead-visible", "true");
  // P25-03 C4: a shape the chord falls back from is faded to 0.55 by the design (the mock's value), so only
  // those buttons are left out of the contrast check.
  const audit = await new AxeBuilder({ page: page as never }).include("[data-testid='text-progression-capture']")
    .exclude("[data-testid='text-card-dock'] [data-shape][data-direct='false']").analyze();
  expect(audit.violations.filter(item => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});

test("P8.8.4 200-bar score updates its playhead without rebuilding the score DOM", async ({ page }) => {
  const capture = await openTextCapture(page);
  const intake = capture;
  const bars = Array.from({ length: 200 }, (_, index) => index % 2 ? "G7" : "C");
  await capture.getByTestId("text-progression-input").fill("| " + bars.join(" | ") + " |");
  await expect(intake.getByTestId("extended-text-bar")).toHaveCount(200);
  const line = intake.getByTestId("text-smooth-playhead").first();
  const before = await line.evaluate(element => (element as HTMLElement).style.left);
  await intake.getByTestId("text-transport-primary").click();
  await expect(intake.getByTestId("text-transport-primary")).toContainText(/一時停止/);
  await expect.poll(async () => line.evaluate(element => (element as HTMLElement).style.left),
    { timeout: 4_000 }).not.toBe(before);
  await expect(intake.getByTestId("extended-text-bar")).toHaveCount(200);
  await intake.getByTestId("text-transport-stop").click();
  await assertNoHorizontalOverflow(page);
});
