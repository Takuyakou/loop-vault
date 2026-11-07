import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

const KEY = "loop-vault:ear-practice-v1:data";
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
const records = async (page: Page) => JSON.parse((await page.evaluate((key) => window.localStorage.getItem(key), KEY)) ?? "{\"records\":[]}").records as Array<Record<string, unknown>>;

/** Opens the choosing screen (level 1, 8 bars so that there are cards still to come) and starts. `degrees` is the setting 「最初から見せる」. */
async function start(page: Page, options: { degrees?: boolean; length?: 4 | 8; size?: { width: number; height: number } } = {}) {
  if (options.size) await page.setViewportSize(options.size);
  await openDojo(page, "midi");
  // a run in the same page keeps its settings: begin each one from the defaults
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  await page.getByTestId("ear-level-1").click();
  await page.getByTestId(`ear-length-${options.length ?? 8}`).click();
  if (options.degrees) {
    await page.getByText("詳しい設定").click();
    await page.getByTestId("ear-show-degrees").check();
  }
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
}
const toPlay = async (page: Page) => {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
};
async function answer(page: Page, index: number, last = false) {
  const notes = await answerOf(page, index);
  await midi(page, notes, true, 30);
  if (last) await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 4000 });
  else await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 4000 });
  await midi(page, notes, false, 0);
}
const listens = (page: Page) => page.locator(".ear-stats").first().innerText();

test("P16-06: 練習中、まだ合っていないカードには度数も機能も出ない。1つ目は最初から出る。合うと出る。結果の画面にも出て、推定の注が付く", async ({ page }) => {
  await start(page);
  await toPlay(page);
  // the first card (its name is on show from the start) has its degree from the start; the others show nothing
  await expect(page.getByTestId("ear-card-degree-0")).toBeVisible();
  for (const index of [1, 2, 3]) {
    await expect(page.getByTestId(`ear-card-name-${index}`)).toHaveText("?");
    await expect(page.getByTestId(`ear-card-degree-${index}`)).toHaveCount(0);
    await expect(page.getByTestId(`ear-card-function-${index}`)).toHaveCount(0);
  }
  for (const index of [1, 2, 3]) expect(await page.getByTestId(`ear-card-${index}`).innerText()).not.toMatch(/[ⅠⅡⅢⅣⅤⅥⅦ]/);
  await answer(page, 0);
  await expect(page.getByTestId("ear-card-degree-0")).toBeVisible();
  await answer(page, 1);
  // a card that has been answered shows its degree (and its function when one fits); the cards to come still show nothing
  await expect(page.getByTestId("ear-card-degree-1")).toBeVisible();
  await expect(page.getByTestId("ear-card-degree-2")).toHaveCount(0);
  const count = await chordCount(page);
  for (let index = 2; index < count; index += 1) await answer(page, index, index === count - 1);
  for (let index = 0; index < count; index += 1) await expect(page.getByTestId(`ear-result-card-degree-${index}`)).toBeVisible();
  await expect(page.getByTestId("ear-function-note")).toContainText("機能はコードの並びから自動で推定したものです");
  // the degrees are written with full-width Roman numerals
  expect(await page.getByTestId("ear-result-card-degree-0").innerText()).toMatch(/^[♭♯]?[ⅠⅡⅢⅣⅤⅥⅦ]/);
  // nothing about them is kept in the records of a run that did not show them before the answer
  expect((await records(page)).some((record) => record.degreeShown !== undefined)).toBe(false);
});

test("P16-06: 「最初から見せる」をオンにすると全部のカードに出て、記録が degreeShown になる。途中でオフにしても、見えていたコードは degreeShown のまま", async ({ page }) => {
  await start(page, { degrees: true });
  await toPlay(page);
  const count = await chordCount(page);
  // every card that is on the screen (a long question shows a stretch of them) has its degree
  const onScreen = await page.locator("[data-testid^='ear-card-name-']").count();
  expect(onScreen).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < onScreen; index += 1) await expect(page.getByTestId(`ear-card-degree-${index}`)).toBeVisible();
  await answer(page, 0);
  await answer(page, 1);
  // off half way: the cards still to come lose them, but they were seen
  await page.getByTestId("ear-degree-toggle").uncheck();
  await expect(page.getByTestId("ear-card-degree-3")).toHaveCount(0);
  for (let index = 2; index < count; index += 1) await answer(page, index, index === count - 1);
  const saved = await records(page);
  expect(saved).toHaveLength(count);
  expect(saved.every((record) => record.degreeShown === true)).toBe(true);
  // the setting is kept for the next time
  const settings = await page.evaluate(() => window.localStorage.getItem("loop-vault:ear-practice-settings:v1"));
  expect(JSON.parse(settings!).showDegrees).toBe(false);
});

test("P16-06: 途中でオンにしたときは、オンにした後に見えたコードだけが degreeShown になる", async ({ page }) => {
  await start(page);
  await toPlay(page);
  const count = await chordCount(page);
  await answer(page, 0);
  await answer(page, 1);
  await page.getByTestId("ear-degree-toggle").check();
  await expect(page.getByTestId("ear-card-degree-2")).toBeVisible();
  await expect(page.getByTestId("ear-card-degree-3")).toBeVisible();
  for (let index = 2; index < count; index += 1) await answer(page, index, index === count - 1);
  const saved = await records(page);
  expect(saved.map((record) => record.degreeShown === true)).toEqual(saved.map((record) => (record.index as number) >= 2));
});

test("P16-06: 腕試しでは、設定がオンでも合うまで出ない。切り替えも無い", async ({ page }) => {
  await start(page, { degrees: true });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-benchmark-start")).toBeVisible();
  await page.getByTestId("ear-benchmark-start").click();
  await expect(page.getByTestId("ear-benchmark-step")).toBeVisible();
  await toPlay(page);
  await expect(page.getByTestId("ear-degree-toggle")).toHaveCount(0);
  await expect(page.getByTestId("ear-card-name-1")).toHaveText("?");
  await expect(page.getByTestId("ear-card-degree-1")).toHaveCount(0);
  await expect(page.getByTestId("ear-card-function-1")).toHaveCount(0);
});

test("P16-06: カードを押すと鳴る。今のカードは動かない。先のカードの名前・度数・機能は出ない。ショートカットはそのまま働く", async ({ page }) => {
  await start(page);
  // in the first lap the cards cannot be pressed
  // (a disabled card is not clicked by the test tool unless it is forced: it would wait for the lap to end)
  await page.getByTestId("ear-card-2").click({ force: true });
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "listen");
  await expect(page.getByTestId("ear-card-2")).not.toHaveAttribute("data-pressed", "true");
  await expect(page.getByTestId("ear-card-2")).toHaveAttribute("aria-disabled", "true");
  await toPlay(page);
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("aria-label", "1つ目のコードを鳴らす");
  const before = await listens(page);
  // the card being played: counts as 今のコードを聴く
  await page.getByTestId("ear-card-0").click();
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-pressed", "true");
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-current", "true");
  expect(await listens(page)).not.toBe(before);
  await answer(page, 0);
  const afterFirst = await listens(page);
  // a card already answered: sounds, counts nothing, and does not become the card being played
  await page.getByTestId("ear-card-0").click();
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-pressed", "true");
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  expect(await listens(page)).toBe(afterFirst);
  // a card still to come: sounds, counts as a listen of that chord, shows nothing of it
  await page.getByTestId("ear-card-3").click();
  await expect(page.getByTestId("ear-card-3")).toHaveAttribute("data-pressed", "true");
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  await expect(page.getByTestId("ear-card-name-3")).toHaveText("?");
  await expect(page.getByTestId("ear-card-degree-3")).toHaveCount(0);
  await expect(page.getByTestId("ear-card-function-3")).toHaveCount(0);
  expect(await listens(page)).not.toBe(afterFirst);
  // the shortcuts still work (the card did not take the focus): Space gives the first hint to the card being played
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-card-name-1")).not.toHaveText("?");
  await expect(page.getByTestId("ear-card-name-3")).toHaveText("?");
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
  const hinted = await listens(page);
  await page.keyboard.press("l");
  expect(await listens(page)).not.toBe(hinted);
  // finish, and look at what was recorded
  const count = await chordCount(page);
  for (let index = 1; index < count; index += 1) await answer(page, index, index === count - 1);
  const saved = await records(page);
  const replays = (index: number) => saved.find((record) => record.index === index)!.replays as number;
  expect(replays(0)).toBe(1); // pressed while it was being played
  expect(replays(3)).toBe(1); // pressed before its turn
  expect(replays(1)).toBe(1); // L (the press of card 0 after it was answered counted nothing)
  expect(replays(2)).toBe(0);
});

test("P16-06: MIDI 鍵盤で途中まで押さえている最中にカードを押しても、判定は途中のまま変わらない", async ({ page }) => {
  await start(page);
  await toPlay(page);
  await answer(page, 0);
  const notes = await answerOf(page, 1);
  // two of the three or four names are down: nothing is judged
  const feedback = await page.getByTestId("ear-feedback").innerText();
  await midi(page, [notes[0]!], true, 0);
  await page.getByTestId("ear-card-3").click();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("ear-card-1")).not.toHaveAttribute("data-done", "true");
  expect(await page.getByTestId("ear-feedback").innerText()).toBe(feedback);
  // the rest of the chord is played: it is judged as it always is
  await midi(page, notes.slice(1), true, 30);
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  await midi(page, notes, false, 0);
});

test("P16-06: 結果の画面のカードを押すと鳴り、記録は変わらない", async ({ page }) => {
  await start(page, { length: 4 });
  await toPlay(page);
  const count = await chordCount(page);
  for (let index = 0; index < count; index += 1) await answer(page, index, index === count - 1);
  const before = await page.evaluate((key) => window.localStorage.getItem(key), KEY);
  await page.getByTestId("ear-result-card-1").click();
  await expect(page.getByTestId("ear-result-card-1")).toHaveAttribute("data-pressed", "true");
  await page.getByTestId("ear-result-card-0").click();
  await expect(page.getByTestId("ear-result-card-0")).toHaveAttribute("data-pressed", "true");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBe(before);
});

test("P16-06: 768×640 で、度数と機能が付いてもカードの高さが変わらず、スクロールせず鍵盤まで見える。1440×900 も同じ", async ({ page }) => {
  for (const size of [{ width: 768, height: 640 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await start(page, { size, length: 8 });
    await toPlay(page);
    const heights = async () => page.evaluate(() => [...document.querySelectorAll("[data-testid^='ear-card-']")].filter((node) => /^ear-card-\d+$/.test(node.getAttribute("data-testid")!)).map((node) => Math.round(node.getBoundingClientRect().height)));
    const plain = await heights();
    // two cards answered (they show their degree and function), the others still "?": the same heights
    await answer(page, 0);
    await answer(page, 1);
    await expect(page.getByTestId("ear-card-degree-1")).toBeVisible();
    expect(await heights()).toEqual(plain);
    await page.screenshot({ path: `p89-generated/P16-06/play-mixed-${size.width}x${size.height}.png` });
    // everything shows its degree and function: the heights are the same as with none
    await page.getByTestId("ear-degree-toggle").check();
    await expect(page.getByTestId("ear-card-degree-2")).toBeVisible();
    const withInfo = await heights();
    expect(withInfo).toEqual(plain);
    const fits = await page.evaluate(() => {
      const keyboard = document.querySelector("[data-testid='ear-keyboard']")!.getBoundingClientRect();
      return { scroll: document.documentElement.scrollHeight - window.innerHeight, bottom: keyboard.bottom - window.innerHeight };
    });
    expect(fits.scroll).toBeLessThanOrEqual(1);
    expect(fits.bottom).toBeLessThanOrEqual(1);
    // nothing runs out of its card: each line stays inside the width of the card
    const overflow = await page.evaluate(() => [...document.querySelectorAll(".ear-card[data-degree]")].flatMap((card) => {
      const box = card.getBoundingClientRect();
      return [...card.querySelectorAll(".ear-card-name, .ear-card-degree, .ear-card-fn")].filter((line) => { const r = line.getBoundingClientRect(); return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5; }).map((line) => line.textContent);
    }));
    expect(overflow).toEqual([]);
    await page.screenshot({ path: `p89-generated/P16-06/play-${size.width}x${size.height}.png` });
    // finish the question: the result keeps the same card height
    const count = await chordCount(page);
    for (let index = 2; index < count; index += 1) await answer(page, index, index === count - 1);
    expect(await page.evaluate(() => Math.round(document.querySelector("[data-testid='ear-result-card-0']")!.getBoundingClientRect().height))).toBe(plain[0]);
    await page.screenshot({ path: `p89-generated/P16-06/result-${size.width}x${size.height}.png` });
  }
});
