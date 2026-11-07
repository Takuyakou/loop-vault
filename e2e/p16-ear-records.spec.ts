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
/** Everything the browser keeps that is not the ear practice's (the Dojo, the Bass practice, the Vault). */
const otherKeys = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(window.localStorage).filter((key) => !key.includes("ear-practice")).sort().map((key) => [key, window.localStorage.getItem(key)])));
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);

type Rec = Record<string, unknown>;
const DAY = 86_400_000;

/** Several weeks of made-up records (test data): levels 1-3, a weak kind at level 3, two benchmarks at level 2. */
function manyWeeks(now = Date.now()): string {
  const records: Rec[] = [];
  let id = 0;
  const play = (level: number, at: number, extra: Rec, perChord: (index: number) => Rec) => {
    id += 1;
    const kinds = level === 3 ? ["三和音", "7", "maj7・6", "m7・m6"] : level === 2 ? ["三和音", "転回形", "sus・dim・aug", "三和音"] : ["三和音", "三和音", "三和音", "三和音"];
    for (let index = 0; index < 4; index += 1) {
      records.push({
        at: new Date(at).toISOString(), play: `play${id}`, questionId: `bank:L${level}-4-${(id % 9) + 1}`, source: "bank", level, length: 4,
        chordLevel: level, kind: kinds[index], ...(index ? { move: [5, 7, 2, 10][index] } : {}), index, given: index === 0, manual: false,
        wrongs: 0, hint: 0, seconds: 2.4, firstAnswerSeconds: 2.4, replays: 0, judge: "core", ...extra, ...perChord(index),
      });
    }
  };
  const weekOf = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 0, 1, 2, 3, 0];
  for (let n = 0; n < 16; n += 1) play(1, now - weekOf[n]! * 7 * DAY - (n % 5) * 3_600_000 - 2 * 60_000, {}, (i) => ({ seconds: 1.8 + (n % 4) * 0.4, wrongs: n === 3 && i === 2 ? 1 : 0, replays: n < 6 ? 1 : 0 }));
  for (let n = 0; n < 6; n += 1) play(2, now - (n % 4) * 7 * DAY - 3 * 3_600_000, {}, (i) => ({ seconds: 3.5 + i * 0.3, wrongs: i === 1 ? 1 : 0, replays: 1 }));
  for (let n = 0; n < 10; n += 1) play(3, now - (n % 4) * 7 * DAY - 4 * 3_600_000, {}, (i) => ({ seconds: 4.2 + i * 0.2, wrongs: i === 1 ? 1 : 0, hint: i === 1 && n % 3 === 0 ? 1 : 0, replays: 1 }));
  for (const [run, daysAgo, wrongs] of [["bench-a", 40, 1], ["bench-b", 12, 0]] as const) {
    for (let q = 0; q < 4; q += 1) {
      id += 1;
      for (let index = 0; index < 4; index += 1) {
        records.push({
          at: new Date(now - daysAgo * DAY).toISOString(), play: `bench${id}`, run, benchmark: 2, questionId: `bank:L2-4-${10 + q}`, source: "bank", level: 2, length: 4,
          chordLevel: 2, kind: "転回形", ...(index ? { move: 5 } : {}), index, given: index === 0, manual: false, wrongs: index === 1 && q < 2 ? wrongs : 0,
          hint: 0, seconds: daysAgo > 20 ? 4.1 : 3.3, firstAnswerSeconds: 3, replays: daysAgo > 20 ? 0 : 1, judge: "core",
        });
      }
    }
  }
  // a question that is not in the data (a progression removed later) still counts and nothing falls over
  play(2, now - 2 * DAY, {}, () => ({ questionId: "bank:L9-9-99" }));
  return JSON.stringify({ app: "loopvault-ear-practice", fileVersion: 1, version: 1, revision: 1, records });
}

async function openEar(page: Page, seeded?: string) {
  if (seeded) await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), { key: KEY, value: seeded });
  await openDojo(page, "midi");
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
}

async function playThrough(page: Page, options: { benchmark?: boolean } = {}) {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
  const count = await chordCount(page);
  for (let index = 0; index < count; index += 1) {
    const notes = await answerOf(page, index);
    await midi(page, notes, true, 30);
    if (index < count - 1) await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 4000 });
    else if (!options.benchmark) await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 4000 });
    await midi(page, notes, false, 0);
  }
}

test("P16-03: 記録が無いときの「耳の記録」。空の案内が出て、どの欄も落ちない", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await expect(page.getByTestId("ear-recent")).toContainText("今週はまだ記録がありません");
  await page.getByTestId("ear-open-records").click();
  await expect(page.getByTestId("ear-records-empty")).toBeVisible();
  await expect(page.getByTestId("ear-weak-none")).toBeVisible();
  await expect(page.getByTestId("ear-moves-none")).toBeVisible();
  await expect(page.getByTestId("ear-bench-none")).toBeVisible();
  await expect(page.getByTestId("ear-guide-1")).toContainText("0コード");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "p89-generated/P16-03/records-empty-1440x900.png" });
  await page.setViewportSize({ width: 768, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "p89-generated/P16-03/records-empty-768x640.png" });
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.screenshot({ path: "p89-generated/P16-03/records-empty.png" });
  // Esc goes back to the choosing screen
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
});

test("P16-03: 数週間ぶんの記録。今週と先週・別々の2つのグラフ・苦手・目安・腕試し", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page, manyWeeks());
  await page.screenshot({ path: "p89-generated/P16-03/choose.png" });
  await page.getByTestId("ear-open-records").click();
  await expect(page.getByTestId("ear-week-card")).toBeVisible();
  for (const id of ["first", "clean", "sec", "nohint", "replay"]) await expect(page.getByTestId(`ear-week-${id}`)).toBeVisible();
  // the rate and the seconds are two charts, not one
  const rate = page.getByTestId("ear-chart-rate");
  const seconds = page.getByTestId("ear-chart-seconds");
  await expect(rate).toBeVisible();
  await expect(seconds).toBeVisible();
  expect(await rate.locator("svg").count()).toBe(1);
  expect(await seconds.locator("svg").count()).toBe(1);
  // 12 weeks; the weeks with under 10 chords are hollow
  await expect(page.getByTestId("ear-chart-rate-dot").first()).toBeVisible();
  expect(await page.locator("[data-testid='ear-chart-rate-dot'][data-few]").count()).toBeGreaterThan(0);
  await expect(seconds).toContainText("聴き直し");
  // the level filter changes what the charts show
  const before = await page.getByTestId("ear-chart-rate-dot").count();
  await page.getByTestId("ear-records-level-3").click();
  expect(await page.getByTestId("ear-chart-rate-dot").count()).toBeLessThanOrEqual(before);
  await page.getByTestId("ear-records-level-all").click();
  // weak kinds: at most 3, each with the button
  const weak = page.getByTestId("ear-weak-item");
  expect(await weak.count()).toBeGreaterThan(0);
  expect(await weak.count()).toBeLessThanOrEqual(3);
  await expect(page.getByTestId("ear-weak-practice").first()).toContainText("このまとまりを多く含む問題で練習する");
  await expect(page.getByTestId("ear-move-item").first()).toBeVisible();
  // the level guide: level 1 has 48 chords of 16 progressions and goes fast, level 3 has not enough yet
  await expect(page.getByTestId("ear-guide-1")).toContainText("安定しています。次のレベルへ進めます");
  await expect(page.getByTestId("ear-guide-2")).toContainText("コード");
  await expect(page.getByTestId("ear-bench-level-2")).toBeVisible();
  expect(await page.locator("[data-testid='ear-bench-rate-2']").count()).toBe(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "p89-generated/P16-03/records-weeks-1440x900.png" });
  await page.setViewportSize({ width: 768, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "p89-generated/P16-03/records-weeks-768x640.png" });
  await page.setViewportSize({ width: 1440, height: 2100 });
  await page.screenshot({ path: "p89-generated/P16-03/records-weeks.png" });
  // narrow window: no sideways scroll
  await page.setViewportSize({ width: 768, height: 800 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 768, height: 3400 });
  await page.screenshot({ path: "p89-generated/P16-03/records-weeks-768.png" });
});

test("P16-03: 苦手の「このまとまりを多く含む問題で練習する」で、そのレベルの問題が始まる", async ({ page }) => {
  await openEar(page, manyWeeks());
  await page.getByTestId("ear-open-records").click();
  const names = await page.getByTestId("ear-weak-item").locator("b").allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  await page.getByTestId("ear-weak-practice").first().click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.getByTestId("ear-title").waitFor();
  // out to the choosing screen: the weak point is still being practised and can be stopped
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-focus")).toBeVisible();
  await page.getByTestId("ear-focus-clear").click();
  await expect(page.getByTestId("ear-focus")).toHaveCount(0);
});

test("P16-03: 最後まで弾いた問題だけが記録される。再読み込みしても残り、結果に前回までとの比べが出る", async ({ page }) => {
  // nothing is kept for a question left half way
  await openEar(page);
  const others = await otherKeys(page);
  await page.getByTestId("ear-start").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
  const notes = await answerOf(page, 0);
  await midi(page, notes, true, 30);
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true", { timeout: 4000 });
  await midi(page, notes, false, 0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
  expect(await stored(page)).toBeNull();

  // a whole question is kept, one record for each chord
  await page.getByTestId("ear-start").click();
  const count = await chordCount(page);
  await playThrough(page);
  await expect(page.getByTestId("ear-compare")).toContainText("記録がまだありません");
  await expect.poll(async () => JSON.parse((await stored(page)) ?? "{}").records?.length ?? 0).toBe(count);
  const first = JSON.parse((await stored(page))!);
  expect(first).toMatchObject({ app: "loopvault-ear-practice", fileVersion: 1, version: 1 });
  expect(first.records[0]).toMatchObject({ given: true, manual: false, judge: "core", source: "bank" });
  expect(first.records[0].move).toBeUndefined();
  expect(typeof first.records[1].move).toBe("number");
  expect(JSON.stringify(first)).not.toMatch(/name|title/);

  // what the Dojo, the Bass practice and the Vault keep is exactly what it was
  expect(await otherKeys(page)).toEqual(others);

  // the records are still there after a reload, and a second question is compared with the first
  await page.reload();
  await page.locator("[data-nav='chord-dojo']").click();
  await page.evaluate(async () => { await (window as unknown as { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-recent")).toContainText(`${count - 1}コード`);
  await page.getByTestId("ear-start").click();
  await playThrough(page);
  await expect(page.getByTestId("ear-compare")).toContainText("1問と比べて");
});

test("P16-03: 腕試し。固定の4問が固定のキーで続けて出て、結果が出る。もう一度測ると前回と並び、7日の案内が出る", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await page.getByTestId("ear-level-2").click();
  await expect(page.getByTestId("ear-benchmark-soon")).toHaveCount(0);
  const keys: string[] = [];
  const questions: string[] = [];
  const bench = async () => {
    await page.getByTestId("ear-benchmark-start").click();
    for (let q = 0; q < 4; q += 1) {
      await expect(page.getByTestId("ear-benchmark-step")).toHaveText(`腕試し ${q + 1} / 4`, { timeout: 8000 });
      // the conditions are fixed: tempo 90, the first name shown
      await expect(page.getByTestId("ear-run")).toContainText("テンポ 90");
      await expect(page.getByTestId("ear-key")).toBeVisible();
      keys.push((await page.getByTestId("ear-run").getAttribute("data-tonic")) ?? "");
      questions.push((await page.getByTestId("ear-run").getAttribute("data-question-id")) ?? "");
      await playThrough(page, { benchmark: true });
    }
    await expect(page.getByTestId("ear-benchmark-result")).toBeVisible({ timeout: 8000 });
  };
  await bench();
  await expect(page.getByTestId("ear-benchmark-note")).toContainText("前回の腕試しはありません");
  for (const id of ["first", "clean", "sec", "hints", "replays"]) await expect(page.getByTestId(`ear-benchmark-${id}`)).toBeVisible();
  await page.screenshot({ path: "p89-generated/P16-03/benchmark-result.png" });
  const saved = JSON.parse((await stored(page))!).records as Rec[];
  expect(saved.every((r) => r.benchmark === 2 && typeof r.run === "string")).toBe(true);
  expect(new Set(saved.map((r) => r.questionId)).size).toBe(4);

  // the same four, in the same keys, the second time; the result is next to the first
  await page.getByTestId("ear-benchmark-exit").click();
  await expect(page.getByTestId("ear-benchmark-soon")).toContainText("7日以上空けると比べやすくなります");
  await expect(page.getByTestId("ear-benchmark-last")).toBeVisible();
  const firstKeys = [...keys];
  const firstQuestions = [...questions];
  keys.length = 0;
  questions.length = 0;
  await bench();
  expect(keys).toEqual(firstKeys);
  expect(questions).toEqual(firstQuestions);
  await expect(page.getByTestId("ear-benchmark-note")).toContainText("使った数を並べている");
  await expect(page.getByTestId("ear-benchmark-table")).toContainText("前回(");
  await page.screenshot({ path: "p89-generated/P16-03/benchmark-compare.png" });
  // the benchmark is in the records screen too
  await page.getByTestId("ear-benchmark-records").click();
  await expect(page.getByTestId("ear-bench-level-2")).toBeVisible();
});
