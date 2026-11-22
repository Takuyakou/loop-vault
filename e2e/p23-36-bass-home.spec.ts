import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

/**
 * P23-36: three small corrections to the Bass Practice home.
 *
 * 1. the 「楽器」 panel starts at the cards' top (the layout row does it, not a margin or a spacer),
 * 2. 「続ける」 shows the Enter key and Enter resumes (the Chord Dojo home's contract),
 * 3. the practice cards take the Bass purple on hover without moving.
 */
const HOME = "[data-testid='bass-practice-home']";
const card = (page: Page, mode: string) => page.locator(`[data-testid='bass-home-card'][data-mode='${mode}']`);
const modebar = (page: Page) => page.locator(".bass-modebar");

async function openHome(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

const tops = (page: Page) => page.evaluate(() => {
  const rect = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return undefined;
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
  };
  return {
    card: rect("[data-testid='bass-home-card'][data-mode='degree']"),
    instrument: rect("[aria-labelledby='bass-home-instrument-title']"),
    week: rect("[aria-labelledby='bass-home-week-title']"),
    main: rect(".lv-bh-main"),
    aside: rect(".lv-bh-aside"),
    resume: rect("[data-testid='bass-home-resume']"),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});

async function expectAligned(page: Page, label: string) {
  const box = await tops(page);
  expect(box.card, label).toBeTruthy();
  expect(box.instrument, label).toBeTruthy();
  expect(Math.abs(box.card!.top - box.instrument!.top), `${label}: the instrument panel starts at the cards' top ${JSON.stringify(box)}`)
    .toBeLessThanOrEqual(1);
  // P23-67: there is no upper heading area (「聴いてまねる」 is gone); the shared row starts at the top (or right under 続きから).
  expect(await page.locator(".lv-bh-top, .lv-bh-heading").count(), `${label}: no top heading box`).toBe(0);
  expect(Math.abs(box.card!.top - box.main!.top), `${label}: the cards start at the shared row's top`).toBeLessThanOrEqual(1);
  if (box.resume) expect(box.instrument!.top, `${label}: the panel is below 続きから`).toBeGreaterThanOrEqual(box.resume.bottom - 1);
  expect(box.week!.top, `${label}: この 7 日 stays under the instrument`).toBeGreaterThanOrEqual(box.instrument!.bottom - 1);
  expect(box.overflow, `${label}: no horizontal overflow`).toBeLessThanOrEqual(1);
}

/** One finished Degree Echo attempt, so the home has a 続きから (the same route the product uses). */
async function playOne(page: Page) {
  await card(page, "degree").click();
  const view = page.getByTestId("degree-echo-view");
  // P23-62: listen, play without a take and look at the answer — the 3-step stage's self-rated path without a microphone.
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 10_000 });
  await view.locator("[data-review-rating='good']").click();
  // 「次のフレーズ」 writes the attempt and moves on; wait for the next phrase before coming back.
  await view.getByTestId("degree-next").click();
  await expect(view).toHaveAttribute("data-stage-step", "0", { timeout: 10_000 });
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.locator(HOME)).toBeVisible();
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();
}

test("the instrument panel starts at the cards' top, with no 「?」 key help on home", async ({ page }) => {
  test.setTimeout(60_000);
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1200, height: 900 }]) {
    await page.setViewportSize(size);
    await openHome(page);
    await expect(page.locator(HOME).getByRole("button", { name: "キー操作", exact: true })).toHaveCount(0);
    await expectAligned(page, `${size.width} no help`);
  }
});

test("続きから is present: the panel still starts at the cards' top at 1920 and 1440", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await playOne(page);
  await expectAligned(page, "1440 with 続きから");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expectAligned(page, "1920 with 続きから");
  await page.setViewportSize({ width: 1200, height: 900 });
  await expectAligned(page, "1200 with 続きから");
});

test("one column at 1199 and 768: no empty top space, no overflow", async ({ page }) => {
  test.setTimeout(60_000);
  for (const size of [{ width: 1199, height: 900 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openHome(page);
    const box = await tops(page);
    // The panel is in the second row: below the whole card area, and only the row gap away from it.
    expect(box.aside!.top, `${size.width}: the panel follows the cards`).toBeGreaterThanOrEqual(box.main!.bottom - 1);
    expect(box.aside!.top - box.main!.bottom, `${size.width}: no artificial gap`).toBeLessThanOrEqual(16);
    expect(box.overflow, `${size.width}: no horizontal overflow`).toBeLessThanOrEqual(1);
    await assertNoHorizontalOverflow(page);
  }
});

test("Enter and 続ける open the same practice once, and Enter is left to the controls", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await playOne(page);

  // A focused control keeps its own Enter: the strings switch changes and no practice opens.
  const fiveStrings = page.locator("[aria-label='弦'] button", { hasText: "5 弦" });
  await fiveStrings.focus();
  await page.keyboard.press("Enter");
  await expect(fiveStrings).toHaveAttribute("aria-pressed", "true");
  await expect(modebar(page)).toBeHidden();

  // Enter on the home resumes the last practice, through the same start as the button.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(modebar(page)).toBeVisible();
  await expect(modebar(page).locator(".bass-mode-name")).toHaveText("度数");
  await expect(page.locator(HOME)).toBeHidden();

  // The practice is in front: the home's Enter is not listening behind it.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  await expect(modebar(page).locator(".bass-mode-name")).toHaveText("度数");
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.locator(HOME)).toBeVisible();

  // The button opens the same mode.
  await page.getByTestId("bass-home-resume-open").click();
  await expect(modebar(page)).toBeVisible();
  await expect(modebar(page).locator(".bass-mode-name")).toHaveText("度数");
});

test("without a resume, Enter does nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await expect(page.getByTestId("bass-home-resume")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  await expect(page.locator(HOME)).toBeVisible();
  await expect(modebar(page)).toBeHidden();
});

test("the hover ring is the Bass purple and nothing moves; focus-visible stays", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const target = card(page, "root-motion");
  const before = await target.boundingBox();
  await target.hover();
  await page.waitForTimeout(300);
  const hovered = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      shadow: style.boxShadow,
      x: element.getBoundingClientRect().x,
      y: element.getBoundingClientRect().y,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      transform: style.transform,
    };
  });
  expect(hovered.shadow).toContain("rgb(167, 156, 255)");
  expect(hovered.shadow).not.toContain("rgb(51, 73, 106)");
  expect({ x: hovered.x, y: hovered.y, width: hovered.width, height: hovered.height }).toEqual({
    x: before!.x, y: before!.y, width: before!.width, height: before!.height,
  });
  expect(hovered.transform === "none" || hovered.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);

  // Reduced motion keeps the ring (the motion is what is reduced, not the cue).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await target.hover();
  await page.waitForTimeout(200);
  expect(await target.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("rgb(167, 156, 255)");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // focus-visible keeps its outline: reach a card with Tab, never the pointer.
  await page.mouse.move(0, 0);
  let focused = "";
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-mode") ?? "");
    if (focused) break;
  }
  expect(focused).not.toBe("");
  const ring = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBe("2px");
});

test("the instrument settings and the screen's accessibility still hold", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  await page.locator("[aria-label='弦'] button", { hasText: "5 弦" }).click();
  await expect(page.locator("[aria-label='弦'] button", { hasText: "5 弦" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".lv-bh-string").count()).toBe(5);
  await page.locator("[aria-label='利き手'] button", { hasText: "左利き" }).click();
  await expect(page.locator(".lv-bh-fretboard")).toHaveAttribute("data-handedness", "left");
  await assertNoHorizontalOverflow(page);
  const axe = await new AxeBuilder({ page: page as never }).include(HOME).analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
});
