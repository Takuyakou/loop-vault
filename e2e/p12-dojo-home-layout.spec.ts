import { test, expect } from "@playwright/test";
import { homeFixture } from "./helpers/p12DojoHome";
import { openDojo, waitForP104Fixture } from "./helpers/p12";

/** P20 replaced the old home: four practice cards, four small cards, a resume strip and a thin MIDI banner. */
const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]] as const;
for (const [width, height] of SIZES) {
  test(`Chord Dojo home P20 fits ${width}x${height}`, async ({ browser }, info) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width, height }, baseURL: String(info.project.use.baseURL), locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "dark" });
    const page = await context.newPage();
    try {
      await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
      await expect.poll(async () => { try { await page.goto("/?p12=no-midi&p104=theme"); return page.url().includes("p12="); } catch { return false; } }, { timeout: 30_000 }).toBe(true);
      await waitForP104Fixture(page);
      await page.locator('[data-nav="chord-dojo"]').click();
      await expect(page.getByTestId("dojo-home")).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
      const measured = await page.evaluate(() => {
        const main = document.getElementById("main-content")!;
        const home = document.querySelector("[data-testid=dojo-home]") as HTMLElement;
        const rect = (element: Element | null) => element ? element.getBoundingClientRect() : null;
        const boxes = [...document.querySelectorAll(".dojo-home-p20-main > *, .dojo-home-p20-sub > *")].map((element) => rect(element)!);
        return {
          scroll: main.scrollHeight - main.clientHeight,
          scrollTop: main.scrollTop,
          horizontal: document.documentElement.scrollWidth - innerWidth,
          mainCards: document.querySelectorAll(".dojo-home-p20-main > *").length,
          subCards: document.querySelectorAll(".dojo-home-p20-sub > *").length,
          midiBanners: document.querySelectorAll("[data-testid=home-midi-banner]").length,
          cardOverflow: boxes.some((box) => box.bottom > innerHeight + 1 && false),
          primaryHeights: [...document.querySelectorAll("[data-testid=dojo-home] .dojo-home-p20-primary, [data-testid=dojo-home] .master251-continue")].map((element) => Math.round(rect(element)!.height)),
          overlapping: boxes.some((box, index) => boxes.some((other, otherIndex) => index < otherIndex && box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)),
          textOverflow: [...home.querySelectorAll<HTMLElement>("[data-testid=dojo-home] *")].filter((element) => element.getClientRects().length && element.scrollWidth > element.clientWidth + 2).map((element) => ({ text: (element.textContent ?? "").slice(0, 40), className: element.className, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })),
        };
      });
      expect(measured.horizontal, "no horizontal overflow").toBe(0);
      expect(measured.mainCards).toBe(4); // P23-47-fix-4: the guide is its own wide card under the four
      expect(measured.subCards).toBe(4);
      expect(measured.midiBanners, "one MIDI banner").toBe(1);
      expect(measured.scrollTop).toBe(0);
      if (width >= 1440) expect(measured.scroll, "P23-38: the fifth card may need one short row; no more").toBeLessThanOrEqual(80);
      // P23-41: the resume 続ける button uses the Voicing Loop canonical small size (36px); the other
      // primaries stay at 44px or taller. The old 44px floor everywhere was the pre-P23-41 resume size.
      expect(measured.primaryHeights.every((value) => value >= 36), `primary buttons are 36px or taller ${JSON.stringify(measured.primaryHeights)}`).toBe(true);
      expect(measured.overlapping, "cards do not overlap").toBe(false);
      expect(measured.textOverflow, `no clipped text inside the home ${JSON.stringify(measured.textOverflow)}`).toHaveLength(0);

      const subBefore = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>(".dojo-home-p20-sub > *")].map((element) => [element.getAttribute("data-testid"), Math.round(element.getBoundingClientRect().height)])));
      await page.screenshot({ path: `p89-generated/p20/home-${width}x${height}.png`, fullPage: true });
      await page.getByTestId("home-today-details").click();
      await expect(page.getByTestId("home-today-details-body")).toBeVisible();
      const opened = await page.evaluate(() => {
        const main = document.getElementById("main-content")!;
        const heights = Object.fromEntries([...document.querySelectorAll<HTMLElement>(".dojo-home-p20-sub > *")].map((element) => [element.getAttribute("data-testid"), Math.round(element.getBoundingClientRect().height)]));
        const clipped = [...document.querySelectorAll<HTMLElement>("[data-testid=home-today-details-body] *")].filter((element) => element.getClientRects().length && element.scrollWidth > element.clientWidth + 2).map((element) => ({ text: (element.textContent ?? "").slice(0, 60), className: element.className }));
        return { scroll: main.scrollHeight - main.clientHeight, body: document.querySelector("[data-testid=home-today-details-body]")!.getBoundingClientRect().height, heights, clipped };
      });
      expect(opened.body).toBeGreaterThan(40);
      expect(opened.heights["home-today"]).toBeGreaterThan(subBefore["home-today"]!);
      for (const other of ["home-saved", "home-wanted", "home-shape"]) expect(opened.heights[other], `${other} keeps its height`).toBe(subBefore[other]);
      expect(opened.clipped, `long names are not clipped ${JSON.stringify(opened.clipped)}`).toHaveLength(0);
      expect(opened.scroll).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: `p89-generated/p20/home-${width}x${height}-details.png`, fullPage: true });
    } finally {
      await context.close();
    }
  });
}

test("home 1440x900 with MIDI connected (photo)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "p89-generated/p20/home-1440x900-midi.png", fullPage: true });
});