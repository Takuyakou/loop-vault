import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

interface Midi { emit: (notes: number[], on?: boolean, spread?: number) => void }
const midi = (page: Page, notes: number[], on = true, spread = 0) =>
  page.evaluate(({ notes, on, spread }) => (window as unknown as { __p12Midi: Midi }).__p12Midi.emit(notes, on, spread), { notes, on, spread });
const answerOf = (page: Page, index: number): Promise<number[]> =>
  page.evaluate((chord) => (window as unknown as { __earAnswer: (index: number) => number[] }).__earAnswer(chord), index);

async function startPlaying(page: Page, autoPlay: boolean) {
  await openDojo(page);
  await page.getByTestId("ear-open").click();
  await page.getByText("詳しい設定").click();
  if (!autoPlay) await page.getByTestId("ear-autoplay").uncheck();
  await page.getByTestId("ear-start").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
}

/** The seconds written under the card that was just answered. */
async function secondsOf(page: Page, index: number): Promise<number> {
  const text = await page.getByTestId(`ear-card-${index}`).locator(".ear-card-sub").innerText();
  return Number(/([\d.]+)s/.exec(text)![1]);
}

test("P16-02: 秒数は、自動で鳴らし終わってから測る(自動で鳴らさないときは、そのカードに進んだ時点から)", async ({ page }) => {
  // On: the chord sounds for about 1.6 s first, so an answer after 2.6 s took about 1 s.
  await startPlaying(page, true);
  await page.waitForTimeout(2600);
  await midi(page, await answerOf(page, 0));
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  const withSound = await secondsOf(page, 0);
  expect(withSound).toBeGreaterThan(0.2);
  expect(withSound).toBeLessThan(1.8);
});

test("P16-02: 自動で鳴らさない設定では、カードに進んだときから測る", async ({ page }) => {
  await startPlaying(page, false);
  await page.waitForTimeout(2600);
  await midi(page, await answerOf(page, 0));
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  const without = await secondsOf(page, 0);
  expect(without).toBeGreaterThan(2.0);
  expect(without).toBeLessThan(3.4);
});

test("P16-02: 聴き直し(L・K・R)で止まらず、押しても印は付かない。ヒント(Space)は1段ずつ", async ({ page }) => {
  await startPlaying(page, false);
  await page.waitForTimeout(1200);
  for (const key of ["l", "k", "r"]) await page.keyboard.press(key);
  await expect(page.getByTestId("ear-stats")).toContainText("聴き直し 3回");
  await expect(page.getByTestId("ear-card-0").locator("[data-mark]")).toHaveCount(0);
  await midi(page, await answerOf(page, 0));
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  // the listening did not stop the clock: 1.2 s and more passed before the answer
  expect(await secondsOf(page, 0)).toBeGreaterThan(1.0);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='name']")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='key']")).toBeVisible();
});

test("P16-02: 答えは、少しずつ押しても、上から押しても、途中では判定されない", async ({ page }) => {
  await startPlaying(page, false);
  const notes = await answerOf(page, 0);
  // from the top, one key at a time, 250 ms apart: still on the way until the names are all there
  for (const note of [...notes].reverse().slice(0, -1)) {
    await midi(page, [note]);
    await page.waitForTimeout(250);
  }
  await expect(page.getByTestId("ear-feedback")).toHaveCount(0);
  await midi(page, [notes[0]!]);
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  await midi(page, notes, false);
});
