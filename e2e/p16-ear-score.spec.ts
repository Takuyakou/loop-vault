import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

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

/** Plays a question of the given level and length to the end (every chord right at the first try) and waits for the result. */
async function toResult(page: Page, options: { level: number; length: 4 | 8 | 16; octaveUp?: boolean; tonic?: number; size?: { width: number; height: number } }) {
  if (options.size) await page.setViewportSize(options.size);
  await openDojo(page, "midi");
  await page.getByTestId("ear-open").click();
  await page.getByTestId(`ear-level-${options.level}`).click();
  await page.getByTestId(`ear-length-${options.length}`).click();
  if (options.tonic !== undefined) await page.getByTestId("ear-tonic").selectOption(String(options.tonic));
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
  const count = await chordCount(page);
  const answers: number[][] = [];
  for (let index = 0; index < count; index += 1) {
    const exact = await answerOf(page, index);
    const notes = options.octaveUp ? exact.map((note) => note + 12) : exact;
    answers.push(exact);
    await midi(page, notes, true, 30);
    if (index < count - 1) await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 4000 });
    else await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 4000 });
    await midi(page, notes, false, 0);
  }
  return { count, answers };
}

const score = (page: Page) => page.getByTestId("ear-progression-score");

// Independent size/length scenarios get their own context and normal timeout.
// All four scenarios and all assertions remain; no longer share one 30s budget.
for (const size of [{ width: 1440, height: 900 }, { width: 768, height: 640 }]) {
  for (const length of [8, 16] as const) {
    test(`P16-04: 8小節・16小節の結果に進行全体の譜面が出る。1440 では行が少なく、768 では4小節ずつ。横にはみ出さない [${size.width}x${size.height}, ${length} bars]`, async ({ page }) => {
      await toResult(page, { level: 3, length, size });
      await expect(score(page)).toBeVisible();
      const perRow = Number(await score(page).getAttribute("data-per-row"));
      const rows = Number(await score(page).getAttribute("data-rows"));
      expect(perRow).toBeLessThanOrEqual(size.width >= 1200 ? 8 : 4);
      expect(perRow).toBeGreaterThanOrEqual(2);
      expect(rows).toBe(Math.ceil(length / perRow));
      expect(await page.getByTestId("ear-score-row").count()).toBe(rows);
      // the page does not scroll sideways, and the score fits its card
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      const fit = await page.evaluate(() => {
        const box = document.querySelector("[data-testid='ear-progression-score']")!.getBoundingClientRect();
        const svg = document.querySelector("[data-testid='ear-progression-score'] svg")!.getBoundingClientRect();
        return svg.right - box.right;
      });
      expect(fit).toBeLessThanOrEqual(1);
      // every chord of the question has its name on the score
      const names = await page.locator(".ear-score-name").count();
      expect(names).toBeGreaterThanOrEqual(length);
      await page.locator("[data-testid='ear-result-score']").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `p89-generated/P16-04/result-${length}-${size.width}x${size.height}.png`, fullPage: false });
    });
  }
}

test("P16-04: レベル5の16小節でも、コード名・印・臨時記号・音符が重ならない(1440×900・768×640)", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 768, height: 640 }]) {
    await toResult(page, { level: 5, length: 16, size });
    await expect(score(page)).toBeVisible();
    const overlaps = await page.evaluate(() => {
      const rect = (element: Element) => element.getBoundingClientRect();
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      const found: string[] = [];
      // an accidental's text box is the whole em square: what is drawn is about 9 wide and 18 high, in the middle of it
      const glyph = (element: Element) => { const r = rect(element); const x = r.left + r.width / 2; const y = r.top + r.height / 2; const half = 4.5 + ([...(element.textContent ?? "")].length - 1) * 3.5; return new DOMRect(x - half, y - 9, half * 2, 18); };
      // the name and the line under it of one chord are stacked on purpose; across chords nothing may touch
      const texts = [...document.querySelectorAll("[data-testid='ear-progression-score'] .ear-score-name, [data-testid='ear-progression-score'] .ear-score-sub")];
      const chordOf = (element: Element) => element.closest(".ear-score-chord");
      texts.forEach((a, i) => texts.slice(i + 1).forEach((b) => { if (chordOf(a) !== chordOf(b) && hit(rect(a), rect(b))) found.push(`text ${a.textContent} / ${b.textContent}`); }));
      for (const chord of document.querySelectorAll("[data-testid='ear-progression-score'] .ear-score-chord")) {
        const index = chord.getAttribute("data-chord-index");
        const accidentals = [...chord.querySelectorAll(".ear-score-accidental")];
        const heads = [...chord.querySelectorAll(".ear-score-head")];
        accidentals.forEach((a) => heads.forEach((h) => { if (hit(glyph(a), rect(h))) found.push(`accidental on head in chord ${index}`); }));
        accidentals.forEach((a, i) => accidentals.slice(i + 1).forEach((b) => { if (hit(glyph(a), glyph(b))) found.push(`accidentals in chord ${index} ${a.textContent}${JSON.stringify(glyph(a))} ${b.textContent}${JSON.stringify(glyph(b))}`); }));
        // the note names above the treble staff stay clear of the notes
        const name = chord.querySelector(".ear-score-name");
        if (name) for (const h of heads) if (hit(rect(name), rect(h))) found.push(`name on head in chord ${index}`);
      }
      return found;
    });
    await page.locator("[data-testid='ear-result-score']").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `p89-generated/P16-04/result-L5-16-${size.width}x${size.height}.png` });
    expect(overlaps).toEqual([]);
  }
});

test("P16-04: 譜面の調号が、問題のキーと同じ(キーの表示と数が合う)", async ({ page }) => {
  // E♭ (3 flats) or E♭ minor (6 flats): a key with a signature, so there is something to read
  await toResult(page, { level: 3, length: 4, tonic: 3 });
  const count = await page.getByTestId("ear-score-key").first().getAttribute("data-key-count");
  const accidental = await page.getByTestId("ear-score-key").first().getAttribute("data-key-accidental");
  const keyText = await page.getByTestId("ear-result").locator(".ear-badge").first().innerText();
  expect(keyText).toContain("キー");
  expect(Number(count)).toBeGreaterThanOrEqual(3);
  expect(accidental).toBe("flat");
  // each row has its own key signature
  expect(await page.getByTestId("ear-score-key").count()).toBe(await page.getByTestId("ear-score-row").count());
});

test("P16-04: 「自分が弾いた音」に切り替えると、合ったときに押していた音が出る。記録には入らない", async ({ page }) => {
  const { count, answers } = await toResult(page, { level: 2, length: 4, octaveUp: true });
  const midiOf = async () => page.locator("[data-testid='ear-score-chord-0']").locator("xpath=..").locator(".ear-score-note").evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-midi"))).sort((a, b) => a - b));
  // sounded: the notes the app played
  expect(await midiOf()).toEqual([...answers[0]!].sort((a, b) => a - b));
  await expect(score(page)).toHaveAttribute("data-tone", "sounded");
  await page.getByTestId("ear-score-which-played").click();
  await expect(score(page)).toHaveAttribute("data-tone", "played");
  expect(await midiOf()).toEqual(answers[0]!.map((note) => note + 12).sort((a, b) => a - b));
  // the chord names do not change
  expect(await page.locator(".ear-score-name").count()).toBeGreaterThanOrEqual(count);
  // it stays in this screen: the records have no notes of what was played
  const stored = await page.evaluate(() => window.localStorage.getItem("loop-vault:ear-practice-v1:data"));
  expect(stored).not.toBeNull();
  expect(stored).not.toContain("playedNotes");
  expect(stored).not.toContain("midi");
  await page.getByTestId("ear-score-which-sounded").click();
  expect(await midiOf()).toEqual([...answers[0]!].sort((a, b) => a - b));
});

test("P16-04: 和音を押すとその和音が鳴り(枠が光る)、2コードの小節では前半・後半が別々。「譜面を見ながら聴く」で鳴っている和音が移る", async ({ page }) => {
  const { count } = await toResult(page, { level: 3, length: 4 });
  const lit = () => page.locator(".ear-score-chord[data-playing]").evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-chord-index"))));
  // press the last chord, then the first: each lights by itself
  await page.getByTestId(`ear-score-chord-${count - 1}`).click();
  await expect.poll(lit).toEqual([count - 1]);
  await page.getByTestId("ear-score-chord-0").click();
  await expect.poll(lit).toEqual([0]);
  // two chords of one bar are two different things to press
  const pairs = await page.locator(".ear-score-bar").evaluateAll((nodes) => nodes.map((node) => [...node.querySelectorAll(".ear-score-chord")].map((chord) => Number(chord.getAttribute("data-chord-index")))).filter((chords) => chords.length === 2));
  if (pairs.length) {
    const [first, second] = pairs[0]!;
    await page.getByTestId(`ear-score-chord-${second}`).click();
    await expect.poll(lit).toEqual([second!]);
    await page.getByTestId(`ear-score-chord-${first}`).click();
    await expect.poll(lit).toEqual([first!]);
  }
  // the whole progression: the lit chord moves forward
  await page.getByTestId("ear-score-listen").click();
  const seen = new Set<number>();
  await expect.poll(async () => { for (const index of await lit()) seen.add(index); return seen.size; }, { timeout: 12000, intervals: [60] }).toBeGreaterThanOrEqual(Math.min(count, 3));
  const order = [...seen];
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("P16-04: 結果の画面から前の機能が消えていない(一発・秒数・ヒント・聴き直し・前回までとの比べ)", async ({ page }) => {
  await toResult(page, { level: 1, length: 4 });
  for (const id of ["ear-summary-first", "ear-summary-median", "ear-summary-hints", "ear-summary-listens", "ear-compare", "ear-again", "ear-next", "ear-to-choose"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});
