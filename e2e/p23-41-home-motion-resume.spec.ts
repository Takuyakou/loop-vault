import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { homeFixture } from "./helpers/p12DojoHome";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-41: the Chord Dojo card hover, 今日のおまかせ's natural height, and the three resume bands sharing the
 * Voicing Loop's dimensions while each keeps its own mode colour. No practice/judging/record change is made.
 */
const AT = "2026-11-08T00:00:00.000Z";
const CD_ACCENT = "rgb(66, 216, 198)";
const CARDS = ["home-standard", "home-master", "home-ear", "home-drill", "home-guide"] as const;

async function seedChordHome(page: Page, state: "many" | "theme" | "empty" = "many"): Promise<void> {
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture(state));
  await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), {
    version: 1,
    entries: [
      { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at: AT },
      { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at: AT },
      { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at: AT },
    ],
  });
}

async function openChordHome(page: Page): Promise<void> {
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("home-resume")).toBeVisible();
}

const box = (page: Page, selector: string) => page.locator(selector).boundingBox();
const css = (page: Page, selector: string, property: string) => page.locator(selector).evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

/** P23-47-fix-4: the hover follows Bass Practice — an inset ring and a lighter surface; each picture has its own story. */
const RING = `${CD_ACCENT} 0px 0px 0px 1px inset`;
const STORY: Record<(typeof CARDS)[number], string> = {
  "home-standard": "lv-cd-play",
  "home-master": "lv-cd-sweep",
  "home-ear": "lv-cd-wave",
  "home-drill": "lv-cd-hand",
  "home-guide": "lv-cd-now",
};
const STORIES = Object.values(STORY);

test("P23-41 A: the five practice cards react with the Dojo accent and move only their decoration", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedChordHome(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await openChordHome(page);

  for (const id of CARDS) {
    const card = page.getByTestId(id);
    await card.scrollIntoViewIfNeeded();
    const before = (await card.boundingBox())!;
    const backgroundBefore = await css(page, `[data-testid='${id}']`, "background-color");
    await expect(card).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await card.hover({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(260);
    const after = (await card.boundingBox())!;
    expect({ x: after.x, y: after.y, width: after.width, height: after.height }, `${id}: hover must not move the card`)
      .toEqual({ x: before.x, y: before.y, width: before.width, height: before.height });
    // P23-47-fix-4: no border; the ring is an inset shadow (nothing moves under the pointer).
    await expect(card).toHaveCSS("box-shadow", RING);
    await expect(card).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    expect(await css(page, `[data-testid='${id}']`, "background-color"), `${id}: hover background brightens`).not.toBe(backgroundBefore);
    if (id === "home-guide") {
      // The guide has no arrow: what pressing it does is the filled 「続きから／始める」 on its right.
      await expect(card.locator(".dojo-home-guide-go")).toBeVisible();
    } else {
      const chevron = await card.locator("h2 .dojo-home-chev").evaluate((element) => getComputedStyle(element).transform);
      expect(chevron, `${id}: the arrow moves 3px`).toBe("matrix(1, 0, 0, 1, 3, 0)");
    }
    const animations = await card.evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName));
    expect(animations.filter((name) => name === STORY[id]).length, `${id}: the picture plays ${STORY[id]}`).toBeGreaterThan(0);
    if (id === "home-standard") await page.screenshot({ path: reportShot("p23-41-assets/cd-card-hover-1440.png") });
    // The decoration is the only moving thing: the card box did not change.
    expect((await card.boundingBox())!.width).toBe(before.width);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(260);
    await expect(card).not.toHaveCSS("box-shadow", RING);
  }

  // focus-within keeps the ring and the focus outline, without needing the decoration to move.
  await page.getByTestId("home-standard").locator(".dojo-card-primary").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("home-standard")).toHaveCSS("box-shadow", RING);
  await expect(page.getByTestId("home-standard")).toHaveCSS("outline-width", "2px");

  // reduced motion: still the ring, no looping decoration.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("home-standard").hover({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(260);
  await expect(page.getByTestId("home-standard")).toHaveCSS("box-shadow", RING);
  const reduced = await page.getByTestId("home-standard").evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName));
  expect(reduced.filter((name) => STORIES.includes(name))).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("P23-41 B: 今日のおまかせ keeps its natural height and the details never clip", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedChordHome(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await openChordHome(page);

  const geometry = () => page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return undefined;
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    return {
      today: rect("[data-testid='home-today']"),
      sub: rect(".dojo-home-p20-sub"),
      left: rect(".dojo-home-p20-left"),
      flows: rect(".dojo-home-today-flows"),
      actions: rect(".dojo-home-p20-today .dojo-home-mini-actions"),
      details: rect("[data-testid='home-today-details-body']"),
      todayOverflow: (() => {
        const element = document.querySelector<HTMLElement>("[data-testid='home-today']")!;
        return { scroll: element.scrollHeight, client: element.clientHeight, overflowY: getComputedStyle(element).overflowY };
      })(),
      detailsOverflow: (() => {
        const element = document.querySelector<HTMLElement>("[data-testid='home-today-details-body']");
        return element ? { scroll: element.scrollHeight, client: element.clientHeight, overflowY: getComputedStyle(element).overflowY } : undefined;
      })(),
    };
  });

  const closed = await geometry();
  expect(closed.today!.height).toBeLessThan(closed.left!.height - 40);
  expect(closed.today!.height).toBeLessThan(closed.sub!.height + 1);
  expect(closed.actions!.top - closed.flows!.bottom, "the actions follow the flows, not the band's bottom").toBeLessThanOrEqual(12);
  expect(closed.todayOverflow.overflowY).toBe("visible");

  await page.getByTestId("home-today-details").click();
  await expect(page.getByTestId("home-today-details-body")).toBeVisible();
  await page.screenshot({ path: reportShot("p23-41-assets/cd-today-open-1440.png"), fullPage: true });
  const open = await geometry();
  expect(open.details!.height).toBeGreaterThan(0);
  expect(open.today!.height).toBeGreaterThan(closed.today!.height);
  expect(open.detailsOverflow).toMatchObject({ overflowY: "visible" });
  expect(open.detailsOverflow!.scroll).toBeLessThanOrEqual(open.detailsOverflow!.client + 1);
  await page.getByTestId("home-today-details").click();
  await expect(page.getByTestId("home-today-details-body")).toHaveCount(0);

  // long theme and empty data still lay out without sideways overflow
  for (const state of ["theme", "empty"] as const) {
    await seedChordHome(page, state);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.getByTestId("dojo-home")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (await page.getByTestId("home-today").count()) {
      expect(await page.getByTestId("home-today").evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
    }
  }
});

test("P23-41 C: CD/BP/VL resume bands use the VL sizes, each with its own accent", async ({ page }) => {
  test.setTimeout(120_000);
  const measure = (selectors: readonly string[]) => page.evaluate((queries) => {
    const one = (query: string) => {
      const element = document.querySelector<HTMLElement>(query);
      if (!element) return null;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, padding: style.padding, gap: style.gap, radius: style.borderRadius, font: `${style.fontSize}/${style.lineHeight} ${style.fontWeight}`, border: style.borderTopColor, background: style.backgroundColor };
    };
    return Object.fromEntries(queries.map((query) => [query, one(query)]));
  }, selectors);

  // Chord Dojo
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedChordHome(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await openChordHome(page);
  const cd = await measure(["[data-testid='home-resume']", ".lv-resume-band-mark", ".lv-resume-band-label", ".lv-resume-band-title", "[data-testid='home-resume-go']", ".lv-resume-go-key"]);
  await page.screenshot({ path: reportShot("p23-41-assets/cd-home-1440.png") });
  await page.getByTestId("home-resume").hover();
  await page.waitForTimeout(260);
  // P25 V13: the border lights in the accent at 45%.
  await expect(page.getByTestId("home-resume")).toHaveCSS("border-top-color", /0\.45\)$/);
  await page.screenshot({ path: reportShot("p23-41-assets/cd-resume-hover-1440.png") });
  await page.getByTestId("home-resume-go").hover();
  await page.waitForTimeout(260);
  const cdButtonHover = await measure(["[data-testid='home-resume-go']"]);
  const cdEnter = await measure(["[data-testid='home-resume-go'] .lv-resume-go-key"]);
  expect(cdEnter["[data-testid='home-resume-go'] .lv-resume-go-key"], "CD Enter hint").toMatchObject({ padding: "0px 5px", radius: "5px", font: "10px/16px 600" });
  await page.getByTestId("home-resume-go").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");

  // Bass Practice (one finished 度数 attempt gives the band)
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
  // P23-62: 度数 runs on the shared stage; finish one attempt without a microphone:
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
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();
  await expect(page.getByTestId("bass-home-resume").locator(".lv-resume-band-title")).toHaveText("度数");
  const bp = await measure(["[data-testid='bass-home-resume']", ".lv-resume-band-mark", ".lv-resume-band-label", ".lv-resume-band-title", "[data-testid='bass-home-resume-open']", ".lv-resume-go-key"]);
  await page.screenshot({ path: reportShot("p23-41-assets/bp-resume-1440.png") });
  await page.getByTestId("bass-home-resume").hover();
  await page.waitForTimeout(260);
  await expect(page.getByTestId("bass-home-resume")).toHaveCSS("border-top-color", /0\.45\)$/);
  await page.screenshot({ path: reportShot("p23-41-assets/bp-resume-hover-1440.png") });
  await page.getByTestId("bass-home-resume-open").hover();
  await page.waitForTimeout(260);

  // Voicing Loop (synthetic picker)
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
  }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
  await page.goto("/?p527Status=vl15-picker");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-resume")).toBeVisible();
  const vl = await measure(["[data-testid='voicing-loop-resume']", ".lv-resume-band-mark", ".lv-resume-band-label", ".lv-resume-band-title", "[data-testid='voicing-loop-resume-go']", ".lv-resume-go-key"]);
  await page.screenshot({ path: reportShot("p23-41-assets/vl-resume-1440.png") });
  await page.getByTestId("voicing-loop-resume").hover();
  await page.waitForTimeout(260);
  await expect(page.getByTestId("voicing-loop-resume")).toHaveCSS("border-top-color", /0\.45\)$/);
  await page.screenshot({ path: reportShot("p23-41-assets/vl-resume-hover-1440.png") });

  // dimensions and Enter hint are shared (P25 V13: Resume.dc.html 「案」)
  for (const [mode, values] of [["CD", cd], ["BP", bp], ["VL", vl]] as const) {
    expect(values[".lv-resume-band-mark"]!.width, mode).toBeCloseTo(34, 1);
    expect(values[".lv-resume-band-mark"]!.height, mode).toBeCloseTo(34, 1);
    expect(values[".lv-resume-band-mark"], mode).toMatchObject({ radius: "10px", font: "12px/12px 800" });
    const band = values["[data-testid='home-resume']"] ?? values["[data-testid='bass-home-resume']"] ?? values["[data-testid='voicing-loop-resume']"];
    expect(band!.height, mode).toBeCloseTo(56, 1);
    expect(band, mode)
      .toMatchObject({ padding: "0px 12px 0px 18px", gap: "14px", radius: "16px" });
    const button = values["[data-testid='home-resume-go']"] ?? values["[data-testid='bass-home-resume-open']"] ?? values["[data-testid='voicing-loop-resume-go']"];
    expect(button!.height, mode).toBeCloseTo(36, 1);
    expect(button, mode).toMatchObject({ padding: "0px 16px", radius: "10px", font: "13px/16px 700" });
    const enter = values[".lv-resume-go-key"] ?? values[".lv-resume-go-key"] ?? values[".lv-resume-go-key"];
    expect(enter, mode).toMatchObject({ padding: "0px 5px", radius: "5px" });
    expect(enter!.font, mode).toContain("10px");
  }
  expect(cdButtonHover["[data-testid='home-resume-go']"]!.background).not.toBe(cd["[data-testid='home-resume-go']"]!.background);

  // P23-40's course entry still opens from the same fifth card
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await openChordHome(page);
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
});

test("P23-41: 960 and 768 have no sideways overflow, and the home state is captured", async ({ page }) => {
  test.setTimeout(90_000);
  // P25 T3: 1920 and 1440 are covered by p23-27-dojo-home.spec.ts C4 and p12-dojo-home-layout.spec.ts.
  for (const size of [{ width: 960, height: 1032 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await seedChordHome(page);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await openChordHome(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId("home-resume-go")).toBeVisible();
    await expect(page.getByTestId("home-today")).toBeVisible();
    if (size.width >= 960) {
      const today = (await box(page, "[data-testid='home-today']"))!;
      const left = (await box(page, ".dojo-home-p20-left"))!;
      expect(today.height, `${size.width}: today is not stretched`).toBeLessThan(left.height - 40);
    }
    await page.screenshot({ path: reportShot(`p23-41-assets/cd-home-${size.width}.png`), fullPage: true });
  }
});
