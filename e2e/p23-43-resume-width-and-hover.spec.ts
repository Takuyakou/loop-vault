import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";
import { homeFixture } from "./helpers/p12DojoHome";
import { reportShot } from "./helpers/reportShots";

const CD_ACCENT = "rgb(66, 216, 198)";
const BP_ACCENT = "rgb(167, 156, 255)";
const HOME = "[data-testid='bass-practice-home']";

async function openBass(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

/** One finished 度数 attempt creates the same resume the product uses. */
async function playOne(page: Page): Promise<void> {
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
  // P23-62: 度数 is on the shared stage; finish one attempt without a microphone:
  // 聴く → 録らずに弾く → 弾けた・答えを見る → 評価 → 次のフレーズ.
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
  await view.locator("[data-review-rating='good']").click();
  await view.getByTestId("degree-next").click();
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.locator(HOME)).toBeVisible();
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();
  await expect(page.getByTestId("bass-home-resume").locator(".lv-resume-band-title")).toHaveText("度数");
}

const metrics = (page: Page) => page.evaluate(() => {
  const rect = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return undefined;
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  };
  const style = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return undefined;
    const computed = getComputedStyle(element);
    return { backgroundColor: computed.backgroundColor, borderTopColor: computed.borderTopColor, fontSize: computed.fontSize };
  };
  return {
    home: rect("[data-testid='bass-practice-home']"),
    headings: document.querySelectorAll(".lv-bh-top, .lv-bh-heading").length,
    main: rect(".lv-bh-main"),
    aside: rect(".lv-bh-aside"),
    card: rect("[data-testid='bass-home-card'][data-mode='degree']"),
    instrument: rect("[aria-labelledby='bass-home-instrument-title']"),
    resume: rect("[data-testid='bass-home-resume']"),
    button: rect("[data-testid='bass-home-resume-open']"),
    resumeStyle: style("[data-testid='bass-home-resume']"),
    mark: rect(".lv-resume-band-mark"),
    enter: style(".lv-resume-go-key"),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});

test("Bass 続きから reaches the instrument panel's right edge and fits one column", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBass(page);
  await playOne(page);

  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    const box = await metrics(page);
    expect(box.resume, `${size.width}: resume`).toBeTruthy();
    expect(box.headings, `${size.width}: no top heading box`).toBe(0);
    expect(Math.abs(box.resume!.left - box.main!.left), `${size.width}: left edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(box.resume!.right - box.aside!.right), `${size.width}: right edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(box.card!.top - box.instrument!.top), `${size.width}: cards and instrument top`).toBeLessThanOrEqual(1);
    expect(box.button!.right, `${size.width}: button at the right`).toBeGreaterThanOrEqual(box.resume!.right - 24);
    expect(box.resume!.height).toBeCloseTo(56.59, 1);
    expect(box.mark).toMatchObject({ width: 30, height: 30 });
    expect(box.enter!.fontSize).toBe("10px");
    expect(box.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: reportShot(`p23-43-assets/bass-resume-${size.width}.png`), fullPage: true });
  }

  for (const size of [{ width: 1199, height: 900 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    const box = await metrics(page);
    expect(Math.abs(box.resume!.left - box.main!.left), `${size.width}: narrow left`).toBeLessThanOrEqual(1);
    expect(Math.abs(box.resume!.right - box.aside!.right), `${size.width}: narrow right`).toBeLessThanOrEqual(1);
    expect(box.resume!.width).toBeCloseTo(box.main!.width, 0);
    expect(box.instrument!.top, `${size.width}: instrument follows the cards`).toBeGreaterThanOrEqual(box.card!.bottom - 1);
    expect(box.overflow).toBeLessThanOrEqual(1);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: reportShot(`p23-43-assets/bass-resume-${size.width}.png`), fullPage: true });
  }

  // The purple hover stays on the full-width band and returns after the pointer leaves.
  await page.setViewportSize({ width: 1440, height: 900 });
  const normal = await metrics(page);
  expect(normal.resume!.height).toBeCloseTo(56.59, 1);
  await page.getByTestId("bass-home-resume").hover();
  await page.waitForTimeout(260);
  await expect(page.getByTestId("bass-home-resume")).toHaveCSS("border-top-color", BP_ACCENT);
  const hovered = await metrics(page);
  expect(hovered.resumeStyle!.borderTopColor).toBe(BP_ACCENT);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(260);
  await expect(page.getByTestId("bass-home-resume")).not.toHaveCSS("border-top-color", BP_ACCENT);
});

test("続ける and Enter both resume from the full-width band", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBass(page);
  await playOne(page);
  await page.getByTestId("bass-home-resume-open").click();
  await expect(page.getByTestId("degree-echo-view")).toBeVisible();
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.locator(HOME)).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("degree-echo-view")).toBeVisible();
});

test("CD/VL normal bands are calm; hover uses the mode accent and leaves cleanly", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
  await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), {
    version: 1, entries: [{ kind: "standard", id: "ii-v-i-major", key: 0, random: false, at: "2026-11-08T00:00:00.000Z" }],
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("home-resume")).toBeVisible();

  const cdCss = () => page.getByTestId("home-resume").evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderTopColor, background: style.backgroundColor };
  });
  const cdNormal = await cdCss();
  expect(cdNormal.border).not.toBe(CD_ACCENT);
  await expect(page.getByTestId("home-resume")).toHaveCSS("height", /^56\.59/);
  await page.getByTestId("home-resume").hover();
  await page.waitForTimeout(260);
  await expect(page.getByTestId("home-resume")).toHaveCSS("border-top-color", CD_ACCENT);
  expect((await cdCss()).background).not.toBe(cdNormal.background);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(260);
  expect((await cdCss()).border).toBe(cdNormal.border);
  await page.screenshot({ path: reportShot("p23-43-assets/cd-resume-normal-1440.png") });

  // Keyboard focus keeps the band's accent; mouse focus does not leave it behind after leaving.
  await page.getByTestId("home-resume-go").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("home-resume")).toHaveCSS("border-top-color", CD_ACCENT);
  await page.getByTestId("home-resume-go").evaluate((element) => (element as HTMLElement).blur());
  await page.waitForTimeout(260);
  expect((await cdCss()).border).toBe(cdNormal.border);

  // VL: same calm normal / accent hover contract.
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
  }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
  await page.goto("/?p527Status=vl15-picker");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-resume")).toBeVisible();
  const vlCss = () => page.getByTestId("voicing-loop-resume").evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderTopColor, background: style.backgroundColor };
  });
  const vlNormal = await vlCss();
  expect(vlNormal.border).not.toBe(CD_ACCENT);
  await expect(page.getByTestId("voicing-loop-resume")).toHaveCSS("height", /^56\.59/);
  await page.getByTestId("voicing-loop-resume").hover();
  await page.waitForTimeout(260);
  await expect(page.getByTestId("voicing-loop-resume")).toHaveCSS("border-top-color", CD_ACCENT);
  expect((await vlCss()).background).not.toBe(vlNormal.background);
  await page.screenshot({ path: reportShot("p23-43-assets/vl-resume-hover-1440.png") });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(260);
  expect((await vlCss()).border).toBe(vlNormal.border);
});
