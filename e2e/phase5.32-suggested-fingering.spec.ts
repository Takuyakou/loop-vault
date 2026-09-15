import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

async function openPopulatedVoicingLoop(page: Page, status = "both-hands") {
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  return page.getByTestId("voicing-loop-workspace");
}

test("P5.32 shows the resolved two-hand plan, edits personal fingering, and preserves playback", async ({ page }) => {
  const workspace = await openPopulatedVoicingLoop(page);
  await expect(workspace.getByRole("checkbox", { name: "おすすめ運指を表示" })).toBeChecked();
  await expect(workspace.getByTestId("voicing-loop-left-hand")).toContainText("PITCH");
  await expect(workspace.getByTestId("voicing-loop-left-hand")).toContainText("CHORD TONE");
  await expect(workspace.getByTestId("voicing-loop-left-hand")).toContainText("FINGER");
  await expect(workspace.getByTestId("voicing-loop-right-hand")).toContainText("FINGER");
  await expect(workspace.getByTestId("voicing-loop-next-left-hand")).toBeVisible();
  await expect(workspace.getByTestId("voicing-loop-next-right-hand")).toBeVisible();
  await expect(workspace).not.toContainText("DEGREE");
  await expect(workspace).not.toContainText("度数");
  await expect(workspace.getByRole("button", { name: "左手 L", exact: true })).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: "右手 R", exact: true })).toHaveCount(0);
  await expect(workspace.locator("[data-finger-label]")).not.toHaveCount(0);
  await expect(workspace.locator("[data-midi-note] title").filter({ hasText: /, L[1-5]/ }).first()).toBeAttached();
  await expect(workspace.locator("[data-midi-note] title").filter({ hasText: /, R[1-5]/ }).first()).toBeAttached();

  await workspace.getByRole("button", { name: "運指を編集", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "運指を編集" });
  await expect(editor.getByText("LEFT HAND", { exact: true })).toBeVisible();
  await expect(editor.getByText("RIGHT HAND", { exact: true })).toBeVisible();
  await editor.getByRole("combobox").nth(1).selectOption("2");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-right-hand")).toContainText("自分の運指");

  await workspace.getByRole("button", { name: "運指を編集", exact: true }).click();
  await page.getByRole("dialog", { name: "運指を編集" })
    .getByRole("button", { name: "おすすめに戻す", exact: true }).click();
  await page.getByRole("dialog", { name: "運指を編集" })
    .getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-right-hand")).toContainText("おすすめ");

  await workspace.getByRole("checkbox", { name: "おすすめ運指を表示" }).uncheck();
  await expect(workspace.getByTestId("voicing-loop-current-voicing")).not.toContainText("FINGER");
  await expect(workspace.getByTestId("voicing-loop-current-voicing")).toContainText("PITCH");
  await expect(workspace.getByTestId("voicing-loop-current-voicing")).toContainText("CHORD TONE");
  await expect(workspace.locator("[data-finger-label]")).toHaveCount(0);
  await workspace.getByRole("checkbox", { name: "おすすめ運指を表示" }).check();

  await page.getByLabel("カウントイン").selectOption("0");
  await workspace.getByRole("button", { name: /開始/ }).click();
  await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
});

test("P5.32 is keyboard-operable, 320px/200%, reduced-motion, and axe clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await openPopulatedVoicingLoop(page, "both-hands-long");
  const edit = workspace.getByRole("button", { name: "運指を編集", exact: true });
  await edit.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("dialog", { name: "運指を編集" });
  await expect(editor).toBeVisible();
  const firstFinger = editor.getByRole("combobox").first();
  await firstFinger.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  const keyboardRegion = workspace.getByRole("region", { name: "ピアノ鍵盤" });
  expect(await keyboardRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const timelineViewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  expect(await timelineViewport.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const cardSizes = await workspace.getByTestId("voicing-loop-event").evaluateAll((cards) =>
    cards.map((card) => ({ height: card.getBoundingClientRect().height, width: card.getBoundingClientRect().width })));
  expect(cardSizes.every(({ height, width }) => height === 46 && width === 92)).toBe(true);
  await assertNoHorizontalOverflow(page);
  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='voicing-loop-workspace']")
    .analyze();
  expect(axe.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical")).toEqual([]);

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
});

test("P5.32 compact practice surface fits a 1920x1080 desktop without page scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openPopulatedVoicingLoop(page, "both-hands-long");
  await expect(workspace.getByTestId("voicing-loop-controls")).toBeVisible();
  await expect(workspace.getByTestId("voicing-loop-current-next")).toBeVisible();
  await expect(workspace.getByTestId("voicing-loop-status")).toBeVisible();
  await expect(workspace.getByTestId("voicing-loop-timeline")).toBeVisible();
  await expect(workspace.getByTestId("voicing-loop-detail")).toBeVisible();
  await expect(workspace.getByTestId("voicing-loop-transport")).toBeVisible();

  const mainOverflow = await page.locator("#main-content").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(mainOverflow.scrollHeight).toBeLessThanOrEqual(mainOverflow.clientHeight + 1);
  expect(mainOverflow.scrollWidth).toBeLessThanOrEqual(mainOverflow.clientWidth + 1);

  const keyboard = workspace.getByRole("region", { name: "ピアノ鍵盤" });
  const keyboardSvg = keyboard.locator("svg");
  const keyboardBox = await keyboard.boundingBox();
  expect(keyboardBox).not.toBeNull();
  expect(keyboardBox!.height).toBeGreaterThanOrEqual(160);
  expect(await keyboard.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(keyboardSvg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  await expect(keyboard.locator('[data-midi-note="24"]')).toBeAttached();
  await expect(keyboard.locator('[data-midi-note="84"]')).toBeAttached();
  await expect(keyboard.locator('[data-c-label="C2"]')).toBeAttached();
  await expect(keyboard.locator('[data-c-label="C7"]')).toBeAttached();
  const keyboardScale = await keyboard.locator("[data-key-layer='white']").evaluate((element) => {
    const matrix = (element as SVGGraphicsElement).getScreenCTM();
    if (!matrix) throw new Error("Keyboard transform matrix is unavailable");
    return {
      x: Math.hypot(matrix.a, matrix.b),
      y: Math.hypot(matrix.c, matrix.d),
    };
  });
  expect(Math.abs(keyboardScale.x - keyboardScale.y)).toBeLessThan(0.01);

  const timelineCards = workspace.getByTestId("voicing-loop-event");
  const widths = await timelineCards.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width));
  expect(widths.every((width) => width === 92)).toBe(true);
  await assertNoHorizontalOverflow(page);
});
