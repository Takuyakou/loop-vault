import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

/**
 * P25 V1-V4 for 耳で弾く: no "not connected" box in the practice, the N3b hover on a card that sounds when pressed
 * (no hover words), the 「聴く」 heading alone, and the choosing screen's two columns starting on one line.
 */
async function openEar(page: Page, mode = "midi") {
  await openDojo(page, mode);
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
}

async function toPlay(page: Page) {
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
}

/** The card's vertical offset from its transform matrix, its edge colour and its ::after words. */
const cardLook = (page: Page, testId: string) => page.getByTestId(testId).evaluate((element) => {
  const style = getComputedStyle(element);
  const matrix = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
  return { y: matrix ? matrix.m42 : 0, border: style.borderTopColor, shadow: style.boxShadow, after: getComputedStyle(element, "::after").content };
});

test("V1/V3: without MIDI the practice shows no 'not connected' box, and 「聴く」 has no sub line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page, "no-midi");
  await toPlay(page);
  await expect(page.getByTestId("ear-no-midi")).toHaveCount(0);
  await expect(page.locator(".ear-answer .ear-notice")).toHaveCount(0);
  await expect(page.locator(".ear-listen .ear-zone-head")).toHaveText("聴く");
  await expect(page.locator(".ear-listen .ear-zone-head small")).toHaveCount(0);
});

test("V2: a pressable card lifts 2px with the teal edge and a shadow; no hover words, no title", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await toPlay(page);
  const card = page.getByTestId("ear-card-1");
  await expect(card).not.toHaveAttribute("title", /.*/);
  await expect(card).toHaveAttribute("aria-label", "2つ目のコードを鳴らす、押すと鳴ります");
  const before = await cardLook(page, "ear-card-1");
  expect(before.y).toBe(0);
  await card.hover();
  await page.waitForTimeout(300);
  const over = await cardLook(page, "ear-card-1");
  expect(over.y).toBeCloseTo(-2, 1);
  expect(over.border).toBe("rgba(66, 216, 198, 0.55)");
  expect(over.shadow).toContain("0px 6px 14px");
  expect(over.after === "none" || over.after === "normal").toBe(true);
  // The current card keeps its own edge (it only lifts).
  const currentBorder = (await cardLook(page, "ear-card-0")).border;
  await page.getByTestId("ear-card-0").hover();
  await page.waitForTimeout(300);
  const current = await cardLook(page, "ear-card-0");
  expect(current.y).toBeCloseTo(-2, 1);
  expect(current.border).toBe(currentBorder);
});

test("V2: with reduced motion the hover does not lift", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await toPlay(page);
  await page.getByTestId("ear-card-1").hover();
  await page.waitForTimeout(100);
  const over = await cardLook(page, "ear-card-1");
  expect(over.y).toBe(0);
  expect(over.border).toBe("rgba(66, 216, 198, 0.55)");
});

test("V4: the title row spans both columns; 「問題」 and 「腕試し」 start on one line; the right boxes take the face", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await openEar(page);
    const measured = await page.evaluate(() => {
      const choose = document.querySelector<HTMLElement>(".ear-choose")!;
      const head = document.querySelector<HTMLElement>(".ear-choose-head")!;
      const problem = document.querySelector<HTMLElement>(".ear-choose-main > .ear-face")!;
      const bench = document.querySelector<HTMLElement>("[data-testid='ear-benchmark-card']")!;
      const side = document.querySelector<HTMLElement>(".ear-side")!;
      const pick = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        return { radius: style.borderTopLeftRadius, background: style.backgroundColor, border: style.borderTopWidth, padding: style.padding };
      };
      const cs = getComputedStyle(choose);
      const inner = choose.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return {
        topDiff: Math.abs(problem.getBoundingClientRect().top - bench.getBoundingClientRect().top),
        headWidth: head.getBoundingClientRect().width, inner,
        headAboveSide: head.getBoundingClientRect().bottom <= side.getBoundingClientRect().top + 0.5,
        face: pick(problem), card: pick(bench),
      };
    });
    console.log(`V4 ${size.width}x${size.height}: top diff ${measured.topDiff.toFixed(2)}px, head ${measured.headWidth.toFixed(1)} / ${measured.inner.toFixed(1)}`);
    expect(measured.topDiff, `${size.width}: the two columns start on one line`).toBeLessThanOrEqual(1);
    expect(Math.abs(measured.headWidth - measured.inner)).toBeLessThanOrEqual(1);
    expect(measured.headAboveSide).toBe(true);
    expect(measured.card).toEqual(measured.face);
  }
});
