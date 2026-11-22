import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";

/**
 * P23-21: the ear practice's choosing screen (E1-E14) and records (R1-R14). The run and the benchmark result are
 * not touched by this instruction.
 */
interface Midi { emit: (notes: number[], on?: boolean, spread?: number) => void }
const midi = (page: Page, notes: number[], on = true, spread = 30) =>
  page.evaluate(({ notes, on, spread }) => (window as unknown as { __p12Midi: Midi }).__p12Midi.emit(notes, on, spread), { notes, on, spread });
const answerOf = (page: Page, index: number): Promise<number[]> =>
  page.evaluate((chord) => (window as unknown as { __earAnswer: (index: number) => number[] }).__earAnswer(chord), index);
const chordCount = (page: Page): Promise<number> => page.evaluate(() => {
  const ask = (window as unknown as { __earAnswer: (index: number) => number[] | undefined }).__earAnswer;
  let count = 0;
  while (ask(count)) count += 1;
  return count;
});

async function openEar(page: Page) {
  await openDojo(page, "midi");
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
}

/** One question, played to the end, so the records have something in them. */
async function playOne(page: Page) {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play", { timeout: 20_000 });
  const count = await chordCount(page);
  for (let index = 0; index < count; index += 1) {
    const notes = await answerOf(page, index);
    await midi(page, notes, true, 30);
    if (index < count - 1) await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 4000 });
    else await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 4000 });
    await midi(page, notes, false, 0);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
}

const box = (page: Page, testId: string) => page.getByTestId(testId).boundingBox();

test("C1/C2/C5/C10: the choosing screen keeps its items and its sizes", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);

  // E2/E3/E6/E7/F1: the faces and the controls.
  await expect(page.getByTestId("ear-source-bank")).toBeVisible();
  await expect(page.getByTestId("ear-source-builtin")).toBeVisible();
  await expect(page.getByTestId("ear-source-collection")).toBeVisible();
  await expect(page.getByTestId("ear-count")).toBeVisible();
  await expect(page.getByTestId("ear-level-1")).toBeVisible();
  await expect(page.getByTestId("ear-length-4")).toBeVisible();
  await expect(page.getByTestId("ear-tonic")).toBeVisible();
  await expect(page.getByTestId("ear-bpm")).toBeVisible();
  await expect(page.getByTestId("ear-start")).toBeVisible();
  await expect(page.getByTestId("ear-benchmark-card")).toBeVisible();
  await expect(page.getByTestId("ear-recent-card")).toBeVisible();
  await expect(page.getByTestId("ear-open-records")).toHaveAttribute("aria-label", "耳の記録を開く");
  // The advanced settings keep every item they had.
  await page.getByText("詳しい設定").click();
  for (const id of ["ear-show-degrees", "ear-first-name", "ear-autoplay", "ear-extra", "ear-settle", "ear-show-clock"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "初期値に戻す" })).toBeVisible();
  await page.getByText("詳しい設定").click();

  // C2/E3: five level rows of 46px each.
  const heights: number[] = [];
  for (const level of [1, 2, 3, 4, 5]) {
    const rect = await box(page, `ear-level-${level}`);
    heights.push(Math.round(rect?.height ?? 0));
  }
  for (const height of heights) expect(Math.abs(height - 46)).toBeLessThanOrEqual(1);

  // C2/E7: the start button is 48 high and 170 wide, and the band stays under 80.
  const start = await box(page, "ear-start");
  expect(Math.abs((start?.height ?? 0) - 48)).toBeLessThanOrEqual(1);
  expect((start?.width ?? 0)).toBeGreaterThanOrEqual(160);
  expect((start?.width ?? 0)).toBeLessThanOrEqual(180);
  const band = await page.locator(".ear-startband").boundingBox();
  expect((band?.height ?? 999)).toBeLessThanOrEqual(80);

  // C5/E14: no scrolling needed to see it at either size.
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const rect = await box(page, "ear-start");
    expect((rect?.y ?? 0) + (rect?.height ?? 0), `${size.width}x${size.height}`).toBeLessThanOrEqual(size.height);
    expect(rect?.y ?? 0).toBeGreaterThanOrEqual(0);
  }

  // C9: Enter starts, Escape goes back.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("#main-content").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();

  // Photos of the choosing screen.
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await page.screenshot({ path: `p89-generated/p23-21/choose-${size.width}x${size.height}.png`, fullPage: true });
  }
});

test("C3: the five level counts follow the source and the length", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);

  const countOf = async (level: number) => Number(((await page.getByTestId(`ear-level-${level}`).innerText()).match(/(\d+) 個/) ?? [])[1]);
  const here = async () => Number(((await page.getByTestId("ear-count").innerText()).match(/このレベル・長さでは (\d+) 個/) ?? [])[1]);

  await page.getByTestId("ear-level-3").click();
  const four = await Promise.all([1, 2, 3, 4, 5].map(countOf));
  expect(await here()).toBe(four[2]);

  await page.getByTestId("ear-length-8").click();
  const eight = await Promise.all([1, 2, 3, 4, 5].map(countOf));
  expect(await here()).toBe(eight[2]);
  expect(eight).not.toEqual(four);
});

test("C4/E12: after one question the recent list has one card", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await expect(page.getByTestId("ear-recent-play")).toHaveCount(0);
  await playOne(page);
  await expect(page.getByTestId("ear-recent-play")).toHaveCount(1);
  const card = page.getByTestId("ear-recent-play").first();
  await expect(card).toContainText(/レベル \d ・ \d+ 小節/);
  await expect(card).toContainText(/出題用の進行|定番の進行|自分の進行/);
  await expect(card.locator(".ear-recent-play-rate")).toHaveText(/^\d+$|^—$/);
});

test("C6/C8: the records screen — empty, and five cards from the same records", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);

  // R13/C8: with no record, the way in is there and returns to the choosing screen.
  await page.getByTestId("ear-open-records").click();
  await expect(page.getByTestId("ear-records-empty")).toBeVisible();
  await expect(page.getByTestId("ear-weak-none")).toBeVisible();
  await expect(page.getByTestId("ear-guide-1")).toContainText("0コード");
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `p89-generated/p23-21/records-empty-${size.width}x${size.height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("ear-records-start").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();

  // C6/R2-R3: after one question the five cards carry the figures the choosing screen shows for this week.
  await playOne(page);
  const weekLine = await page.getByTestId("ear-recent").innerText();
  const firstTry = (weekLine.match(/一発 (\d+)%/) ?? [])[1];
  await page.getByTestId("ear-open-records").click();
  await expect(page.getByTestId("ear-week-card")).toBeVisible();
  for (const id of ["first", "clean", "sec", "nohint", "replay"]) await expect(page.getByTestId(`ear-week-${id}`)).toBeVisible();
  if (firstTry !== undefined) {
    await expect(page.getByTestId("ear-week-first")).toContainText(firstTry);
  }
  // One week has a value, so the first card's line has one dot; the others have none yet.
  expect(await page.getByTestId("ear-week-first").locator("svg circle").count()).toBe(1);
  await expect(page.getByTestId("ear-guide-1")).toBeVisible();

  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `p89-generated/p23-21/records-${size.width}x${size.height}.png`, fullPage: true });
  }
});

test("C9: four widths, axe and the keys on both screens", async ({ page }) => {
  test.setTimeout(120_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openEar(page);
    await assertNoHorizontalOverflow(page);
    // Tab order follows the screen: the controls go top to bottom, and left to right inside a row.
    const order = await page.evaluate(() => {
      const ids = ["ear-source-bank", "ear-count", "ear-level-1", "ear-length-4", "ear-tonic", "ear-bpm", "ear-start"];
      return ids.map((id) => {
        const element = document.querySelector(`[data-testid='${id}']`);
        const rect = element?.getBoundingClientRect();
        return { id, y: Math.round(rect?.y ?? -1), x: Math.round(rect?.x ?? -1) };
      });
    });
    for (let index = 1; index < order.length; index += 1) {
      const before = order[index - 1]!;
      const current = order[index]!;
      expect(current.y > before.y || (Math.abs(current.y - before.y) <= 2 && current.x >= before.x), `${before.id} → ${current.id} at ${size.width}`).toBe(true);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
  const chooseAxe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const chooseBlocking = chooseAxe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(chooseBlocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);

  await page.getByTestId("ear-open-records").click();
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
  const recordsAxe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const recordsBlocking = recordsAxe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(recordsBlocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
});

test("P23-31b C11: the ear choosing screen never overlaps and the records button stays on one line", async ({ page }) => {
  test.setTimeout(180_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openEar(page);
    const measured = await page.evaluate(() => {
      const side = document.querySelector<HTMLElement>(".ear-side")!;
      const main = document.querySelector<HTMLElement>(".ear-choose-main")!;
      const boxes = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(":scope > *")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: element.className || element.tagName, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
      });
      const left = boxes(main);
      const right = boxes(side);
      const overlaps: string[] = [];
      for (const a of left) {
        for (const b of right) {
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) overlaps.push(`${a.selector} / ${b.selector}`);
        }
      }
      const records = document.querySelector<HTMLElement>(".ear-open-records")!;
      return { overlaps, recordsHeight: Math.round(records.getBoundingClientRect().height) };
    });
    expect(measured.overlaps, `${size.width}: no overlap ${JSON.stringify(measured.overlaps)}`).toEqual([]);
    expect(measured.recordsHeight, `${size.width}: the records button is one line`).toBeLessThanOrEqual(32);
    await page.screenshot({ path: `p89-generated/p23-31b/ear-choose-${size.width}x${size.height}.png` });
  }
});
