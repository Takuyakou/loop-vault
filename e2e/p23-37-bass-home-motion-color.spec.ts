import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

/**
 * P23-37: the four UI items of the Bass Practice home.
 *
 * P23-36's alignment / Enter / hover-ring checks live in p23-36-bass-home.spec.ts and are not repeated here;
 * this spec covers the purple instrument settings, the practice's own chrome (the 3-step stage across P23-62..64) and
 * the MIDI card's reading-line motion.
 */
const HOME = "[data-testid='bass-practice-home']";
const PURPLE = "rgb(167, 156, 255)";
const ON_PURPLE = "rgb(23, 18, 58)";
const PRACTICE_FILE = "loop-vault:practice-v1:data";

async function openHome(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

const segment = (page: Page, label: string) => page.locator(`[aria-label='${label}'] button`);
const card = (page: Page, mode: string) => page.locator(`[data-testid='bass-home-card'][data-mode='${mode}']`);
const modebar = (page: Page) => page.locator(".bass-modebar");

test("the instrument settings choose with the Bass purple and stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  for (const [label, pressed] of [["弦", "4 弦"], ["利き手", "右利き"], ["フレット", "0〜12"]] as const) {
    const chosen = segment(page, label).filter({ hasText: pressed });
    await expect(chosen).toHaveAttribute("aria-pressed", "true");
    const style = await chosen.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { background: computed.backgroundColor, color: computed.color, transition: computed.transition };
    });
    expect(style.background, label).toBe(PURPLE);
    expect(style.color, label).toBe(ON_PURPLE);
    expect(style.transition).toContain("background-color 0.16s");
    // The unchosen ones keep the plain ground; nothing but the chosen setting is filled.
    const other = segment(page, label).filter({ hasNotText: pressed });
    expect(await other.first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  }

  // Keyboard: the focused segment takes Enter itself and the fretboard follows the instrument.
  await segment(page, "弦").filter({ hasText: "5 弦" }).focus();
  await page.keyboard.press("Enter");
  await expect(segment(page, "弦").filter({ hasText: "5 弦" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".lv-bh-string").count()).toBe(5);
  await segment(page, "利き手").filter({ hasText: "左利き" }).click();
  await expect(page.locator(".lv-bh-fretboard")).toHaveAttribute("data-handedness", "left");
  await segment(page, "フレット").filter({ hasText: "5〜17" }).click();
  await expect(page.locator(".lv-bh-fret-number").first()).toHaveText("5");
  await expect(page.locator(".lv-bh-fret-number").last()).toHaveText("17");
  await assertNoHorizontalOverflow(page);

  // The choices are still there after visiting a practice and coming back.
  await card(page, "degree").click();
  await expect(modebar(page)).toBeVisible();
  await modebar(page).getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.locator(HOME)).toBeVisible();
  await expect(segment(page, "弦").filter({ hasText: "5 弦" })).toHaveAttribute("aria-pressed", "true");
  await expect(segment(page, "利き手").filter({ hasText: "左利き" })).toHaveAttribute("aria-pressed", "true");
  await expect(segment(page, "フレット").filter({ hasText: "5〜17" })).toHaveAttribute("aria-pressed", "true");
});

test("the 3-step stage replaces the practice badges across all five practices (P23-62..64)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);

  // P23-62..63: 度数・リズム・ルートの動き・コード進行のベース all open on the shared 3-step stage with no top badge.
  const stageView = (mode: "degree" | "rhythm" | "root-motion" | "bassline") => page.getByTestId(
    mode === "degree"
      ? "degree-echo-view"
      : mode === "rhythm"
        ? "rhythm-echo-view"
        : mode === "root-motion"
          ? "root-motion-echo-view"
          : "bassline-echo-view",
  );
  for (const mode of ["degree", "rhythm", "root-motion", "bassline"] as const) {
    await card(page, mode).click();
    await expect(modebar(page)).toBeVisible();
    await expect(modebar(page).locator(".bass-mode-badge")).toHaveCount(0);
    const view = stageView(mode);
    await expect(view).toHaveAttribute("data-stage-step", "0");
    expect(await view.locator(".bp-step").evaluateAll((steps) => steps.map((step) => step.textContent?.trim())))
      .toEqual(["1聴く", "2弾く", "3結果"]);
    await expect(view.locator(".bp-step").first()).toHaveAttribute("data-state", "current");
    await expect(view.locator(".bp-foot")).toHaveText("Space 聴く · H ヒント · R 録って弾く");
    await modebar(page).getByRole("button", { name: /Bass Practice/ }).click();
    await expect(page.locator(HOME)).toBeVisible();
  }

  // P23-64: MIDI のベースライン joins the same stage top band cleanly (no top badge; opens on its song library).
  await card(page, "midi").click();
  await expect(modebar(page)).toBeVisible();
  await expect(modebar(page).locator(".bass-mode-badge")).toHaveCount(0);
  await expect(page.getByTestId("midi-bass-library")).toBeVisible();
});

test("the MIDI card's reading line moves on hover only and touches nothing", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const midi = card(page, "midi");
  await midi.scrollIntoViewIfNeeded();
  const before = await page.evaluate((key) => ({ practice: localStorage.getItem(key) }), PRACTICE_FILE);
  const box = await midi.boundingBox();

  await midi.hover();
  await expect.poll(async () => midi.evaluate((element) => element.querySelectorAll(".lv-bh-note").length)).toBe(14);
  const first = await midi.evaluate((element) => {
    const scan = element.querySelector<SVGElement>(".lv-bh-scan")!;
    const notes = [...element.querySelectorAll<SVGElement>(".lv-bh-note")];
    return {
      scanOpacity: getComputedStyle(scan).opacity,
      transform: getComputedStyle(scan).transform,
      scanAnimations: scan.getAnimations().map((animation) => (animation as CSSAnimation).animationName),
      noteAnimations: notes.map((note) => getComputedStyle(note).animationName),
      delays: notes.map((note) => getComputedStyle(note).animationDelay),
      rows: [...element.querySelectorAll("text")].map((text) => text.textContent),
    };
  });
  expect(first.scanOpacity).toBe("0.9");
  expect(first.scanAnimations).toContain("lv-bh-scan");
  expect(first.noteAnimations.every((name) => name === "lv-bh-note")).toBe(true);
  expect(new Set(first.delays).size).toBeGreaterThan(3);
  expect(first.rows).toEqual(expect.arrayContaining(["お手本", "録音"]));
  await page.waitForTimeout(400);
  const later = await midi.evaluate((element) => getComputedStyle(element.querySelector<SVGElement>(".lv-bh-scan")!).transform);
  expect(later).not.toBe(first.transform);

  // The movement is inside the picture: the card's box, the page and the records do not change.
  expect(await midi.boundingBox()).toEqual(box);
  await expect(page.locator(HOME)).toBeVisible();
  await expect(modebar(page)).toBeHidden();
  expect(await page.evaluate((key) => ({ practice: localStorage.getItem(key) }), PRACTICE_FILE)).toEqual(before);
  await assertNoHorizontalOverflow(page);

  // Leaving stops it and puts the picture back.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
  const left = await midi.evaluate((element) => {
    const scan = element.querySelector<SVGElement>(".lv-bh-scan")!;
    const note = element.querySelector<SVGElement>(".lv-bh-note")!;
    return {
      scanOpacity: getComputedStyle(scan).opacity,
      transform: getComputedStyle(scan).transform,
      scanAnimations: scan.getAnimations().length,
      filter: getComputedStyle(note).filter,
      noteAnimations: note.getAnimations().length,
    };
  });
  expect(left).toEqual({ scanOpacity: "0", transform: "none", scanAnimations: 0, filter: "none", noteAnimations: 0 });

  // Reduced motion: no movement and no blinking; the purple hover ring stays.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await midi.hover();
  await page.waitForTimeout(300);
  const reduced = await midi.evaluate((element) => {
    const scan = element.querySelector<SVGElement>(".lv-bh-scan")!;
    const note = element.querySelector<SVGElement>(".lv-bh-note")!;
    return {
      scanAnimations: scan.getAnimations().length,
      noteAnimations: note.getAnimations().length,
      scanOpacity: getComputedStyle(scan).opacity,
      ring: getComputedStyle(element).boxShadow,
    };
  });
  expect(reduced).toEqual({ scanAnimations: 0, noteAnimations: 0, scanOpacity: "0", ring: expect.stringContaining(PURPLE) });
});
