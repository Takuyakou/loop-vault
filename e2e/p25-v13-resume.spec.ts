import { expect, test, type Page } from "@playwright/test";
import { homeFixture } from "./helpers/p12DojoHome";

/**
 * P25 V13: the 「続きから」 band of the three homes (Resume.dc.html 「案」). One row of 56px, the title at
 * 16px, the facts as small tags and the day on the right. The page must not scroll more than before the
 * change: BEFORE holds the scrollHeight measured on 56ca1d07 with this same spec.
 */
const AT = "2026-11-08T00:00:00.000Z";
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
] as const;

type Home = "vl" | "cd" | "bp";
const BAND: Record<Home, string> = { vl: "voicing-loop-resume", cd: "home-resume", bp: "bass-home-resume" };

/** scrollHeight of the band's scrolling ancestor and of the document, measured on 56ca1d07. */
const BEFORE: Record<Home, Record<string, { scroller: number; document: number }>> = {
  vl: { "1440x900": { scroller: 792, document: 900 }, "1280x720": { scroller: 612, document: 720 }, "1024x768": { scroller: 660, document: 768 } },
  cd: { "1440x900": { scroller: 808, document: 900 }, "1280x720": { scroller: 913, document: 720 }, "1024x768": { scroller: 981, document: 768 } },
  bp: { "1440x900": { scroller: 792, document: 900 }, "1280x720": { scroller: 737, document: 720 }, "1024x768": { scroller: 1213, document: 768 } },
};

async function seed(page: Page): Promise<void> {
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
  await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), {
    version: 1,
    entries: [
      { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at: AT },
      { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at: AT },
      { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at: AT },
    ],
  });
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
  }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
}

/** One finished 度数 attempt gives the Bass Practice home its band (the P23-41 route). */
async function finishOneDegreeAttempt(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="bass-practice"]').click();
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
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
}

async function openHome(page: Page, home: Home): Promise<void> {
  await page.goto(home === "vl" ? "/?p527Status=vl15-picker" : "/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator(`[data-nav="${home === "vl" ? "voicing-loop" : home === "cd" ? "chord-dojo" : "bass-practice"}"]`).click();
  await expect(page.getByTestId(BAND[home])).toBeVisible();
  await page.waitForTimeout(400);
}

async function measure(page: Page, home: Home) {
  return page.getByTestId(BAND[home]).evaluate((band) => {
    let scroller: HTMLElement | null = band.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    return {
      band: band.getBoundingClientRect().height,
      scroller: (scroller ?? document.documentElement).scrollHeight,
      document: document.documentElement.scrollHeight,
    };
  });
}

test("V13: the three bands are 56px and the homes scroll no more than before", async ({ page }) => {
  test.setTimeout(300_000);
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await finishOneDegreeAttempt(page);
  const seen: Record<string, unknown> = {};
  for (const size of SIZES) {
    await page.setViewportSize(size);
    const label = `${size.width}x${size.height}`;
    for (const home of ["vl", "cd", "bp"] as const) {
      await openHome(page, home);
      const value = await measure(page, home);
      seen[`${home} ${label}`] = value;
      const before = BEFORE[home][label]!;
      if (process.env.P25_V13_MEASURE === "1") continue;
      expect(Math.abs(value.band - 56), `${home} ${label} band height ${value.band}`).toBeLessThanOrEqual(1);
      expect(value.scroller, `${home} ${label} scroller`).toBeLessThanOrEqual(before.scroller);
      expect(value.document, `${home} ${label} document`).toBeLessThanOrEqual(before.document);
    }
  }
  console.log(`V13 MEASURE ${JSON.stringify(seen)}`);
  if (process.env.P25_V13_MEASURE === "1") return;

  // The parts at 1440×900: one line of words, the tags, the day on the right, 「続ける」 36px, the round chips.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page, "vl");
  const vl = page.getByTestId(BAND.vl);
  const parts = await vl.evaluate((band) => {
    const box = (selector: string) => band.querySelector(selector)!.getBoundingClientRect();
    const line = getComputedStyle(band, "::before");
    return {
      label: box(".lv-resume-band-label"), title: box(".lv-resume-band-title"),
      titleSize: getComputedStyle(band.querySelector(".lv-resume-band-title")!).fontSize,
      tags: [...band.querySelectorAll(".lv-resume-band-tag")].map((tag) => tag.textContent),
      when: band.querySelector(".lv-resume-band-when")!.textContent,
      go: box("[data-testid='voicing-loop-resume-go']").height,
      line: { width: line.width, background: line.backgroundColor },
    };
  });
  expect(Math.abs(parts.label.top + parts.label.height / 2 - (parts.title.top + parts.title.height / 2))).toBeLessThanOrEqual(3);
  expect(parts.titleSize).toBe("16px");
  expect(parts.tags.length).toBeGreaterThan(0);
  expect(parts.when).toBe("きょう");
  expect(parts.go).toBeCloseTo(36, 1);
  expect(parts.line).toEqual({ width: "3px", background: "rgb(66, 216, 198)" });

  // Hover: 1px up, the border lights; the band keeps its place in the layout.
  const layoutTop = await vl.evaluate((band) => (band as HTMLElement).offsetTop);
  await vl.hover({ position: { x: 300, y: 28 } });
  await expect.poll(() => vl.evaluate((band) => new DOMMatrix(getComputedStyle(band).transform).m42)).toBe(-1);
  expect(await vl.evaluate((band) => (band as HTMLElement).offsetTop)).toBe(layoutTop);
  expect(await vl.evaluate((band) => getComputedStyle(band).borderTopColor)).not.toBe("rgba(150, 170, 195, 0.14)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => vl.evaluate((band) => getComputedStyle(band).transform)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await openHome(page, "cd");
  const chips = page.getByTestId(BAND.cd).locator(".lv-resume-band-chip");
  expect(await chips.count()).toBeGreaterThanOrEqual(1);
  const chip = await chips.first().evaluate((element) => ({ radius: getComputedStyle(element).borderTopLeftRadius, height: element.getBoundingClientRect().height, decoration: getComputedStyle(element).textDecorationLine }));
  expect(chip).toEqual({ radius: "15px", height: 30, decoration: "none" });

  await openHome(page, "bp");
  const bp = await page.getByTestId(BAND.bp).evaluate((band) => ({ image: getComputedStyle(band).backgroundImage, line: getComputedStyle(band, "::before").backgroundColor }));
  expect(bp.line).toBe("rgb(167, 156, 255)");
  expect(bp.image).toContain("linear-gradient(90deg");
});
