import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

async function openPopulatedVoicingLoop(page: Page) {
  await openApp(page);
  await chooseVoicingLoop(page);
  return page.getByTestId("voicing-loop-workspace");
}

async function expectBefore(left: Locator, right: Locator) {
  const rightHandle = await right.elementHandle();
  if (!rightHandle) throw new Error("Expected the later workspace section to exist.");
  expect(await left.evaluate((element, other) => Boolean(
    element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
  ), rightHandle)).toBe(true);
}

async function chooseVoicingLoop(page: Page) {
  const sidebar = page.locator('[data-nav="voicing-loop"]');
  if (await sidebar.isVisible()) { await sidebar.click(); return; }
  await page.locator('[data-nav="chord-dojo"]').click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
}

test("P5.30 compact workspace follows the approved order and proportional timeline geometry", async ({ page }) => {
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
  await expect(controls).not.toContainText(/\bMY\b|\bLESSON\b|SHELL TYPE/);
  await expect(workspace.getByTestId("voicing-loop-shell-type")).toHaveCount(0);
  await expect(workspace.getByText("Root Shell 1·3·7", { exact: true })).toHaveCount(0);

  const cards = timeline.getByTestId("voicing-loop-event");
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(boxes.every(({ width, height }) => width > 0 && height === 54)).toBe(true);
  await expect(timeline.getByTestId("voicing-loop-playhead")).toHaveAttribute("aria-hidden", "true");
  await expect(timeline.getByTestId("voicing-loop-playhead-marker")).toBeVisible();
  await expect(timeline.getByTestId("voicing-loop-event-beat-rail")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test("P5.30 card audition is keyboard-operable and reference sound is session-local", async ({ page }) => {
  const workspace = await openPopulatedVoicingLoop(page);
  const currentHeading = workspace.getByTestId("voicing-loop-current-next").getByRole("heading", { level: 2 });
  const secondCard = workspace.getByRole("button", { name: /2\/2: Dm7.*ここへ移動/ });
  const preview = workspace.getByTestId("voicing-loop-event-preview").nth(1);
  await preview.click();
  const initialBox = await secondCard.boundingBox();
  await secondCard.focus();
  await page.keyboard.press("Enter");
  await expect(secondCard).toHaveAttribute("aria-current", "step");
  await expect(currentHeading).toHaveText("Dm7");
  await expect(workspace).toContainText("0 周完了");
  const auditionedBox = await secondCard.boundingBox();
  expect({ width: auditionedBox?.width, height: auditionedBox?.height }).toEqual({
    width: initialBox?.width,
    height: initialBox?.height,
  });

  const referenceSound = workspace.getByRole("checkbox", { name: "お手本音" });
  await expect(referenceSound).toBeChecked();
  await referenceSound.uncheck();
  await expect(referenceSound).not.toBeChecked();
  await page.getByLabel("カウントイン").selectOption("0");
  await page.getByRole("button", { name: /開始/ }).click();
  await expect(secondCard).toBeEnabled();
  await secondCard.click();
  await expect(workspace.locator("[data-testid='voicing-loop-event'][aria-current='step']"))
    .toContainText("Dm7", { timeout: 5_000 });
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "現在のコードを試聴", exact: true })).toBeEnabled();
  await workspace.getByRole("button", { name: "現在のコードを試聴", exact: true }).click();
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(referenceSound).not.toBeChecked();
});

test("P5.30 128-event timeline stays local, resumes follow, reduced-motion, and axe-clean", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await chooseVoicingLoop(page);
  await page.getByRole("button", { name: /Textで新しい進行を入力/ }).click();

  const capture = page.getByTestId("text-progression-capture");
  const maximumInput = `| ${Array(32).fill("Cmaj7 Cmaj7 Cmaj7 Cmaj7").join(" | ")} |`;
  await capture.getByTestId("text-progression-input").fill(maximumInput);
  await capture.getByTestId("text-progression-key").selectOption("C major");
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
  expect(new Set(geometry).size).toBe(1);
  expect(geometry[0]).toMatch(/^[0-9.]+x54$/);
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
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveText(/追従/);
  await viewport.hover();
  await page.mouse.wheel(0, 200);
  await expect(workspace.getByTestId("voicing-loop-follow")).toHaveText(/手動/);
  await page.keyboard.press("f");
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft), { timeout: 5_000 })
    .toBeLessThan(maximumScroll);
  await expect(workspace.locator("[data-testid='voicing-loop-event'][aria-current='step']")).toHaveCount(1);
  await page.getByRole("button", { name: "停止", exact: true }).click();

  await workspace.getByRole("button", { name: "自動生成", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "自動生成", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await workspace.getByRole("combobox", { name: "生成タイプ", exact: true }).click();
    await page.getByRole("option", { name: "骨組み", exact: true }).click();
  await expect(workspace.getByRole("combobox", { name: "生成タイプ", exact: true }))
    .toHaveAttribute("value", "core");
  await expect(workspace.getByTestId("voicing-loop-shell-type")).toHaveCount(0);
  await expect(workspace.getByText("SHELL TYPE", { exact: true })).toHaveCount(0);
  await expect(workspace.getByTestId("voicing-loop-current-explanation"))
    .toContainText("Family Core");
  await expect(workspace.getByTestId("voicing-loop-current-explanation"))
    .toContainText("Literal");
  await expect(workspace.getByTestId("voicing-loop-detail").locator("svg[role='img']"))
    .toHaveAttribute("aria-label", /お手本4音/);
  await expect(workspace.getByText("左手の目安", { exact: true })).toBeVisible();
  await expect(workspace.getByText("右手の目安", { exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "現在のコードを試聴", exact: true }).click();
  await expect(workspace.getByRole("button", { name: /開始/ })).toBeEnabled();

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='voicing-loop-workspace']")
    .analyze();
  expect(axe.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical")).toEqual([]);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const keyboard = workspace.getByTestId("voicing-loop-detail").locator("svg[role='img']");
  const keyboardBox = await keyboard.boundingBox();
  expect(keyboardBox).not.toBeNull();
  await expect(keyboard.locator("[data-midi-note]")).toHaveCount(88);
  await expect(keyboard.locator('[data-midi-note="9"]')).toBeAttached();
  await expect(keyboard.locator('[data-midi-note="96"]')).toBeAttached();
  await assertNoHorizontalOverflow(page);
});
