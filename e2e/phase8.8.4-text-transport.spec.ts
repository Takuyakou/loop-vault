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
  await expect(primary).toContainText(/一時停止|Pause/);
  expect((await primary.boundingBox())?.width).toBe(initialWidth);
  await primary.click();
  await expect(primary).toContainText(/再開|Resume/);
  expect((await primary.boundingBox())?.width).toBe(initialWidth);
  await primary.click();
  await expect(primary).toContainText(/一時停止|Pause/);
  await capture.getByTestId("text-transport-stop").click();
  await expect(primary).toContainText(/再生|Play/);
  await expect(capture.getByTestId("text-transport-position")).toContainText(/1小節目|Bar 1/);
  await input.focus();
  await page.keyboard.press("Space");
  await expect(primary).toContainText(/再生|Play/);
  await assertNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("P8.8.4 Standard primary Vault save retains the advanced Draft path", async ({ page }) => {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| C Dm |");
  await expect(capture.getByTestId("text-progression-convert")).toBeEnabled();
  await capture.getByTestId("text-progression-name").fill("Public text chart");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました|Saved/, { exact: true })).toBeVisible();
  await expect(page.getByTestId("manual-candidate-editor")).toHaveCount(0);
});

test("P8.8.4 Extended score exposes reattack and bar targets without an axe violation", async ({ page }) => {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-mode-extended").click();
  const intake = capture.getByTestId("extended-text-intake");
  const input = intake.getByTestId("extended-text-input");
  await input.fill("# Note for player\n| C % = _ | Dm |");
  await intake.locator("[data-testid='text-preview-attack'][data-kind='repeat']").click();
  expect(await input.evaluate((element: HTMLTextAreaElement) =>
    element.value.slice(element.selectionStart, element.selectionEnd))).toBe("%");
  await intake.getByTestId("text-preview-bar-select").nth(1).click();
  await expect(intake.getByTestId("text-transport-position")).toContainText(/2小節目|Bar 2/);
  const audit = await new AxeBuilder({ page: page as never }).include("[data-testid='extended-text-intake']").analyze();
  expect(audit.violations.filter(item => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});

test("P8.8.4 200-bar score updates its playhead without rebuilding the score DOM", async ({ page }) => {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-mode-extended").click();
  const intake = capture.getByTestId("extended-text-intake");
  const bars = Array.from({ length: 200 }, (_, index) => index % 2 ? "G7" : "C");
  await intake.getByTestId("extended-text-input").fill("| " + bars.join(" | ") + " |");
  await expect(intake.getByTestId("extended-text-bar")).toHaveCount(200);
  const line = intake.getByTestId("text-smooth-playhead").first();
  const before = await line.evaluate(element => (element as HTMLElement).style.left);
  await intake.getByTestId("extended-text-play").click();
  await expect(intake.getByTestId("extended-text-play")).toContainText(/一時停止|Pause/);
  await expect.poll(async () => line.evaluate(element => (element as HTMLElement).style.left),
    { timeout: 4_000 }).not.toBe(before);
  await expect(intake.getByTestId("extended-text-bar")).toHaveCount(200);
  await intake.getByTestId("text-transport-stop").click();
  await assertNoHorizontalOverflow(page);
});
