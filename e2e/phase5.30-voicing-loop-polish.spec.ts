import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

async function openPopulatedVoicingLoop(page: Page) {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  return page.getByTestId("voicing-loop-workspace");
}

async function expectBefore(left: Locator, right: Locator) {
  const rightHandle = await right.elementHandle();
  if (!rightHandle) throw new Error("Expected the later workspace section to exist.");
  expect(await left.evaluate((element, other) => Boolean(
    element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
  ), rightHandle)).toBe(true);
}

test("P5.30 compact workspace follows the approved order and fixed timeline geometry", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  const workspace = await openPopulatedVoicingLoop(page);
  const controls = workspace.getByTestId("voicing-loop-controls");
  const currentNext = workspace.getByTestId("voicing-loop-current-next");
  const timeline = workspace.getByTestId("voicing-loop-timeline");
  const detail = workspace.getByTestId("voicing-loop-detail");
  const transport = workspace.getByTestId("voicing-loop-transport");
  await expectBefore(controls, currentNext);
  await expectBefore(currentNext, timeline);
  await expectBefore(timeline, detail);
  await expectBefore(detail, transport);
  await expect(currentNext.getByRole("group", { name: "Voicing表示モード" })).toHaveCount(0);
  await expect(controls.getByRole("group", { name: "Voicing表示モード" })).toBeVisible();

  const cards = timeline.getByTestId("voicing-loop-event");
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(boxes.every(({ width, height }) => width === 92 && height === 46)).toBe(true);
  await expect(timeline.getByTestId("voicing-loop-playhead")).toHaveAttribute("aria-hidden", "true");
  await assertNoHorizontalOverflow(page);
});

test("P5.30 128-event timeline stays local, auto-reveals, reduced-motion, and axe-clean", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  await page.getByRole("button", { name: /Textで新しい進行を入力/ }).click();

  const capture = page.getByTestId("text-progression-capture");
  const maximumInput = `| ${Array(32).fill("Cmaj7 Cmaj7 Cmaj7 Cmaj7").join(" | ")} |`;
  await capture.getByTestId("text-progression-input").fill(maximumInput);
  await capture.getByTestId("text-progression-key").fill("C major");
  await capture.getByRole("button", { name: /キーを確定|Confirm key/ }).click();
  await capture.getByTestId("text-progression-bpm").fill("240");
  await capture.getByTestId("text-progression-convert").click();
  const editor = page.getByTestId("manual-candidate-editor");
  await editor.locator("button[aria-haspopup='dialog']").click();
  const saveForm = page.locator("form[role='dialog']");
  await saveForm.locator("input[name='progression-title']").fill("P5.30 maximum fixture");
  await saveForm.locator("button[type='submit']").click();
  const savedNotice = page.getByText("保存した進行を練習できます").locator("..");
  await savedNotice.getByRole("button", { name: "Voicing Loop", exact: true }).click();

  const workspace = page.getByTestId("voicing-loop-workspace");
  const cards = workspace.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(128);
  const geometry = await cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return `${rect.width}x${rect.height}`;
  }));
  expect(new Set(geometry)).toEqual(new Set(["92x46"]));
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  expect(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await assertNoHorizontalOverflow(page);

  await page.getByLabel("カウントイン").selectOption("0");
  const maximumScroll = await viewport.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(maximumScroll).toBeGreaterThan(0);
  await page.getByRole("button", { name: /開始/ }).click();
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft), { timeout: 5_000 })
    .toBeLessThan(maximumScroll);
  await expect(workspace.locator("[data-testid='voicing-loop-event'][aria-current='step']")).toHaveCount(1);
  await page.getByRole("button", { name: "停止", exact: true }).click();

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='voicing-loop-workspace']")
    .analyze();
  expect(axe.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
});
