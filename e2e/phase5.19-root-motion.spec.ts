import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, openBassPractice } from "./helpers/app";

/**
 * P23-62: ルートの動き sits on the shared stage (1 聴く → 2 弾く → 3 結果). The per-practice
 * fields (出どころ / 答えること / 音の数) moved from the old right column into the 条件 chip's
 * popover in the top band; the stage itself keeps the lane, the keys and the answer evidence.
 */

const PRACTICE_FILE = "loop-vault:practice-v1:data";

async function openRootMotion(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await openBassPractice(page, "ルートの動き");
  const view = page.getByTestId("root-motion-echo-view");
  await expect(view).toBeVisible();
  return view;
}

/** 「条件」 opens the popover that now holds 出どころ / 答えること / 音の数. */
async function openConditions(page: Page) {
  const chip = page.getByTestId("root-motion-conditions");
  if (await chip.getAttribute("aria-expanded") !== "true") await chip.click();
  const dialog = page.getByRole("dialog", { name: "ルートの動きの条件" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function parseDuration(value: string): number {
  return Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1_000;
  }));
}

test("P5.19 production default exposes a keyboard-operable Root Motion Echo at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const view = await openRootMotion(page);
  await expect(view).toBeVisible();
  await expect(view).toHaveAttribute("data-stage-step", "0");
  await assertNoHorizontalOverflow(page);

  // P23-62: 出どころ is still the production default おまかせ（作る）, now inside the 条件 popover.
  const conditions = await openConditions(page);
  await expect(conditions.getByTestId("root-motion-source")).toHaveValue("generated");
  const level = conditions.locator("#root-motion-level");
  await level.focus();
  await page.keyboard.press("ArrowDown");
  await expect(level).toHaveValue("2");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "ルートの動きの条件" })).toHaveCount(0);

  const listen = view.getByTestId("root-motion-listen");
  await listen.focus();
  await page.keyboard.press("Enter");
  // The answer choices take the place the old screen's fieldset had, once the phrase has been heard.
  await expect(view.getByRole("group", { name: "答え" })).toBeVisible({ timeout: 20_000 });
  await assertNoHorizontalOverflow(page);
});

test("P5.19 Root Motion meets reduced-motion, effective 200% scale, and axe serious/critical gates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 720 });
  const view = await openRootMotion(page);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(view).toBeVisible();
  await assertNoHorizontalOverflow(page);

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const durations = await view.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  expect(durations.every(({ animation, transition }) => parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);

  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
});

test("P5.19 preserves a completed Root Motion session through History persistence and exposes Transfer", async ({ page }) => {
  test.setTimeout(60_000);
  const view = await openRootMotion(page);
  await view.getByTestId("root-motion-listen").click();
  // The answer is checked at once, and the first answer stays as evidence.
  await expect(view.getByRole("group", { name: "答え" })).toBeVisible({ timeout: 20_000 });
  await view.getByRole("group", { name: "答え" }).getByRole("button", { name: "同じ", exact: true }).click();
  await view.getByTestId("root-motion-submit").click();
  await expect(view.getByTestId("root-motion-first-answer")).toBeVisible();

  await view.getByRole("button", { name: "録らずに弾く" }).click();
  await view.getByRole("button", { name: /弾けた・答えを見る/ }).click();
  await expect(view).toHaveAttribute("data-stage-step", "2");
  await view.locator("[data-review-rating='good']").click();

  // 「別の音から」 is the old Transfer step: the same motion from another root, with the banner saying so.
  const transfer = view.getByTestId("root-motion-transfer");
  await expect(transfer).toBeEnabled();
  await transfer.click();
  await expect(view.locator(".bp-banner")).toContainText("別の音から");
  await expect(view).toHaveAttribute("data-stage-step", "0");

  // The completed session — with the first answer — reached History.
  await expect.poll(() => page.evaluate((key) => {
    const stored = localStorage.getItem(key);
    const file = stored ? JSON.parse(stored) as { rootMotionHistory?: { firstAnswer?: unknown }[] } : null;
    return file?.rootMotionHistory?.filter((entry) => entry.firstAnswer).length ?? 0;
  }, PRACTICE_FILE)).toBeGreaterThanOrEqual(1);
});

test("P5.19-06 exposes and persists an eight-note Root Motion chain at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openRootMotion(page);
  const noteCount = (await openConditions(page)).getByTestId("root-motion-note-count");
  await noteCount.focus();
  await page.keyboard.press("End");
  await expect(noteCount).toHaveValue("8");
  await assertNoHorizontalOverflow(page);
  await expect.poll(() => page.evaluate(() => {
    const stored = localStorage.getItem("loop-vault:practice-v1:data");
    return stored ? (JSON.parse(stored) as { settings?: { rootMotionNoteCount?: number } }).settings?.rootMotionNoteCount : undefined;
  })).toBe(8);

  await page.reload();
  const view = await openRootMotion(page);
  await expect(view).toBeVisible();
  const reopened = (await openConditions(page)).getByTestId("root-motion-note-count");
  await expect(reopened).toHaveValue("8");
  await assertNoHorizontalOverflow(page);
});
