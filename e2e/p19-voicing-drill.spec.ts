import { test, expect, type Page } from "@playwright/test";
import { openDojo, type MidiControl } from "./helpers/p12";
import { buildDrillKeySet, drillSetById, drillSetRevision } from "../src/domain/chordDojo/voicingDrill";
import type { VoicingDrillRecords } from "../src/domain/chordDojo/voicingDrillRecords";

/**
 * P19 Stage 1: the voicing drill. The set list (the four stages, the name, the degrees, the card count, the self best),
 * ① and ② laps judged by synthetic MIDI, the end of a lap (the seconds, the self best and its update, the cards slowest
 * first, the twelve keys), hints (a hinted ② lap is not recorded), the key/stage changes that drop the lap, the time
 * and the record only with MIDI, and the frame at four window sizes.
 */
const STORAGE = "loop-vault:voicing-drill-v1:data";
const SET = "cycle-a";
const REV = drillSetRevision(SET);
const cards = () => drillSetById(SET)!.cards;

const emit = (page: Page, notes: readonly number[], on = true, spread = 0) =>
  page.evaluate(({ notes, on, spread }) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, on, spread), { notes: [...notes], on, spread });
const keyOf = async (page: Page) => Number(await page.getByTestId("dojo-drill").getAttribute("data-drill-key"));
const stored = (page: Page) => page.evaluate((storage) => {
  const raw = localStorage.getItem(storage);
  return raw ? JSON.parse(raw) as VoicingDrillRecords : undefined;
}, STORAGE);

async function openList(page: Page, mode = "midi") {
  await openDojo(page, mode);
  await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
  await expect(page.getByTestId("drill-list")).toBeVisible();
}
async function openDrill(page: Page, setId = SET, mode = "midi") {
  await openList(page, mode);
  await page.getByTestId(`drill-open-${setId}`).click();
  await expect(page.getByTestId("dojo-drill")).toBeVisible();
}
async function start(page: Page) {
  await page.getByTestId("drill-start").click();
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "ready");
}
/** Plays the cards as a pianist: let go of what the next card does not keep, and press only the keys not already held
 * (a held key is not pressed again — pressing it again would be a new key press for the next card). */
async function playLap(page: Page, setId = SET) {
  const key = await keyOf(page);
  const lapCards = buildDrillKeySet(setId, key).cards;
  const held = new Set<number>();
  for (let index = 0; index < lapCards.length; index += 1) {
    await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", String(index));
    const notes = [...lapCards[index]!.left, ...lapCards[index]!.right];
    const release = [...held].filter((note) => !notes.includes(note));
    if (release.length) {
      await emit(page, release, false);
      release.forEach((note) => held.delete(note));
    }
    const press = notes.filter((note) => !held.has(note));
    if (press.length) {
      await emit(page, press, true, 25);
      press.forEach((note) => held.add(note));
    }
  }
  // the pianist lifts the hands at the end of the lap (the next lap waits for a fresh press anyway)
  await emit(page, [...held], false);
}
const lapOf = (file: VoicingDrillRecords | undefined, key: number, stage: "see" | "recall") =>
  file?.sets[SET]?.[REV]?.keys[String(key)]?.[stage];
async function expectRecorded(page: Page, key: number, stage: "see" | "recall", laps = 1) {
  await expect.poll(async () => lapOf(await stored(page), key, stage)?.laps ?? 0).toBe(laps);
}
const seedRecord = (page: Page, record: VoicingDrillRecords) =>
  page.addInitScript(({ storage, value }) => localStorage.setItem(storage, JSON.stringify(value)), { storage: STORAGE, value: record });

function slowRecord(key: number): VoicingDrillRecords {
  const set = drillSetById(SET)!;
  const each = Math.floor(99_000 / set.cards.length);
  const cardMs = set.cards.map((_, index) => index === set.cards.length - 1 ? 99_000 - each * (set.cards.length - 1) : each);
  const at = "2026-11-01T00:00:00.000Z";
  return {
    app: "loopvault-voicing-drill", fileVersion: 1, version: 1, revision: 1, operations: [],
    sets: {
      [SET]: {
        [REV]: {
          cards: set.cards.map((card) => ({ id: card.id, label: card.label, degree: card.degree, form: card.form, left: [...card.left], right: [...card.right] })),
          keys: { [String(key)]: { see: { laps: 1, best: { totalMs: 99_000, cardMs, at }, last: { totalMs: 99_000, cardMs, marks: [0], at } } } },
        },
      },
    },
  } as VoicingDrillRecords;
}

test("the set list shows the four stages, the degrees, the card count and the best", async ({ page }) => {
  await openList(page);
  await expect(page.getByTestId("drill-stage-section-1")).toContainText("① 循環コード");
  await expect(page.getByTestId("drill-stage-section-4")).toContainText("④ 短い転調の進行");
  await expect(page.getByTestId("drill-degrees-cycle-a")).toHaveText("Ⅰ – Ⅵm7 – ⅣΔ7 – Ⅴ7");
  await expect(page.locator('[data-drill-set="cycle-a"]')).toContainText("4 枚");
  await expect(page.getByTestId("drill-best-cycle-a")).toHaveText("まだ記録はありません");
  await expect(page.locator(".dojo-drill-sets [data-drill-set]")).toHaveCount(20);
});

test("① one lap is timed, recorded, and shows its cards and its best", async ({ page }) => {
  test.setTimeout(60_000);
  await openDrill(page);
  await expect(page.getByTestId("drill-degrees")).toHaveText("Ⅰ–Ⅵm7–ⅣΔ7–Ⅴ7");
  await expect(page.getByTestId("dojo-drill")).not.toContainText("親指"); // no fingering anywhere
  await expect(page.locator("[data-score-finger]")).toHaveCount(0);
  const key = await keyOf(page);
  await start(page);
  await playLap(page);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "finished");
  await expect(page.getByTestId("drill-result")).toBeVisible();
  await expectRecorded(page, key, "see");
  const record = lapOf(await stored(page), key, "see")!;
  expect(record.best?.cardMs).toHaveLength(cards().length);
  expect(record.best!.totalMs).toBe(record.best!.cardMs.reduce((sum, ms) => sum + ms, 0));
  expect(record.last?.marks).toEqual([]); // the pianist re-presses no carried key: this lap marks no card 迷った
  await expect(page.getByTestId("drill-card-row")).toHaveCount(cards().length);
  await expect(page.getByTestId("drill-best-updated")).toBeVisible();
  const shown = Number((await page.getByTestId("drill-result-total").innerText()).replace(/[^0-9.]/g, ""));
  expect(shown).toBeCloseTo(record.best!.totalMs / 1000, 0);
  // the table can put the slowest card first
  const times = async () => (await page.getByTestId("drill-card-ms").allInnerTexts()).map((text) => Number(text) || 0);
  const inOrder = await times();
  await page.getByTestId("drill-sort-slow").click();
  const slowFirst = await times();
  expect([...slowFirst].sort((a, b) => b - a)).toEqual(slowFirst);
  expect(slowFirst).toHaveLength(inOrder.length);
  // the key's best appears in the twelve-key table, the other keys are empty
  await expect(page.getByTestId(`drill-key-best-${key}`)).not.toContainText("—");
  await expect(page.getByTestId(`drill-key-best-${(key + 1) % 12}`)).toContainText("—");
});

test("② one clean lap is recorded; a hinted lap is not, and the same key comes again", async ({ page }) => {
  test.setTimeout(90_000);
  await openDrill(page);
  await page.getByTestId("dojo-stage-2").click();
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-stage", "recall");
  await expect(page.getByTestId("drill-cover")).toBeVisible();
  await start(page);
  const key = await keyOf(page);
  await playLap(page);
  await expect(page.getByTestId("drill-result")).toBeVisible();
  await expect(page.getByTestId("drill-result-hinted")).toHaveCount(0);
  await expectRecorded(page, key, "recall");
  // again on the random key: the next lap is on another key; a hint makes that lap uncounted and keeps the key
  await page.getByTestId("drill-random").click();
  const randomKey = await keyOf(page);
  await start(page);
  await page.getByTestId("drill-hint").click();
  await expect(page.getByTestId("drill-cover")).toHaveCount(0);
  await playLap(page);
  await expect(page.getByTestId("drill-result-hinted")).toBeVisible();
  await expect(page.getByTestId("drill-result")).toBeVisible();
  await expectRecorded(page, randomKey, "recall", 1); // the hinted lap added nothing
  await page.getByTestId("drill-again").click();
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-key", String(randomKey));
});

test("この段階をくり返す goes on lap after lap; the random key moves at the lap end", async ({ page }) => {
  test.setTimeout(90_000);
  await openDrill(page);
  await page.getByTestId("drill-random").click();
  await page.getByTestId("drill-repeat").click();
  await expect(page.getByTestId("drill-repeat")).toHaveAttribute("aria-pressed", "true");
  const first = await keyOf(page);
  await start(page);
  await playLap(page);
  const second = await keyOf(page);
  expect(second).not.toBe(first);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "running");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "0");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-lap", "2");
  await expectRecorded(page, first, "see");
  await playLap(page);
  await expectRecorded(page, second, "see");
  await page.getByTestId("drill-repeat").click();
  await playLap(page);
  await expect(page.getByTestId("drill-result")).toBeVisible();
});

test("changing the key or the stage while a lap runs drops it, back to before 始める", async ({ page }) => {
  test.setTimeout(60_000);
  await openDrill(page);
  await start(page);
  const key = await keyOf(page);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "ready");
  await emit(page, [...buildDrillKeySet(SET, key).cards[0]!.left, ...buildDrillKeySet(SET, key).cards[0]!.right], true);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "1");
  await page.getByTestId("drill-key-select").selectOption("7");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "idle");
  expect(await stored(page)).toBeUndefined();
  // the old card's keys are still held: 始める waits for them to be let go (spec §3)
  await page.getByTestId("drill-start").click();
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "waiting-release");
  await expect(page.getByTestId("drill-status")).toContainText("鍵盤から手を離してください");
  await emit(page, [...buildDrillKeySet(SET, key).cards[0]!.left, ...buildDrillKeySet(SET, key).cards[0]!.right], false);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "ready");
  await emit(page, [...buildDrillKeySet(SET, 7).cards[0]!.left, ...buildDrillKeySet(SET, 7).cards[0]!.right], true);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "1");
  await page.getByTestId("dojo-stage-2").click();
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-stage", "recall");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "idle");
  await expect(page.getByTestId("drill-result")).toHaveCount(0);
});

test("without MIDI the answer is shown, 弾けた advances, and nothing is timed or recorded", async ({ page }) => {
  test.setTimeout(60_000);
  await openDrill(page, SET, "no-midi");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-manual", "true");
  await expect(page.getByTestId("drill-status")).toContainText("秒数は測らず記録もしません");
  // P25 V1: the big "not connected" notice is gone; only this one small line says what changes without MIDI.
  await expect(page.getByTestId("midi-required-notice")).toHaveCount(0);
  expect((await page.getByTestId("drill-status").boundingBox())!.height).toBeLessThanOrEqual(24);
  await expect(page.locator(".dojo-score [data-score-midi]")).toHaveCount(cards()[0]!.left.length + cards()[0]!.right.length);
  for (let index = 0; index < cards().length; index += 1) await page.getByTestId("drill-yes").click();
  await expect(page.getByTestId("drill-result")).toBeVisible();
  await expect(page.getByTestId("drill-result-total")).toHaveText("秒数は測っていません");
  await expect(page.getByTestId("drill-result-manual")).toBeVisible();
  await expect(page.getByTestId("drill-result-best")).toContainText("自己ベスト なし");
  expect(await stored(page)).toBeUndefined();
});

test("a seeded slow best is shown before the lap and is beaten by a faster lap", async ({ page }) => {
  test.setTimeout(60_000);
  await seedRecord(page, slowRecord(0));
  await openDrill(page);
  await expect(page.getByTestId("drill-record-line")).toContainText("自己ベスト 99.0 秒（C）");
  await expect(page.getByTestId("drill-record-line")).toContainText("前回遅かったコード");
  await start(page);
  await playLap(page);
  await expect(page.getByTestId("drill-best-updated")).toBeVisible();
  await expect(page.getByTestId("drill-result-best")).toContainText("自己ベスト");
  await expect.poll(async () => lapOf(await stored(page), 0, "see")!.best!.totalMs).toBeLessThan(99_000);
});

test("a learned set shows its best in the list, with the key", async ({ page }) => {
  test.setTimeout(60_000);
  await seedRecord(page, slowRecord(6));
  await openList(page);
  await expect(page.getByTestId("drill-best-cycle-a")).toHaveText("99.0 秒・F♯");
});

test("③ shows 形A/形B on the card and in the result, and the drill never shows fingering", async ({ page }) => {
  test.setTimeout(60_000);
  await openDrill(page, "tension-front");
  await page.getByTestId("dojo-stage-2").click();
  await expect(page.getByTestId("drill-card").first()).toContainText("形A");
  await expect(page.getByTestId("drill-card").nth(1)).toContainText("形B");
  await expect(page.getByTestId("dojo-drill")).not.toContainText("親指");
  await start(page);
  await playLap(page, "tension-front");
  await expect(page.getByTestId("drill-card-table")).toContainText("A");
  await expect(page.getByTestId("drill-card-table")).toContainText("B");
});

test("MIDI going away drops the timed lap (nothing is recorded); the answer can still be practised", async ({ page }) => {
  test.setTimeout(60_000);
  await openDrill(page);
  await start(page);
  const key = await keyOf(page);
  const notes = [...buildDrillKeySet(SET, key).cards[0]!.left, ...buildDrillKeySet(SET, key).cards[0]!.right];
  await emit(page, notes, true);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "1");
  await page.evaluate(async () => { await (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.disconnect(); });
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "running");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-manual", "true");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "0");
  await page.getByTestId("drill-yes").click();
  await page.getByTestId("drill-yes").click();
  await page.getByTestId("drill-yes").click();
  await page.getByTestId("drill-yes").click();
  await expect(page.getByTestId("drill-result")).toBeVisible();
  await expect(page.getByTestId("drill-result-manual")).toBeVisible();
  expect(await stored(page)).toBeUndefined();
});

test("the practice and the result fit four sizes and have the strip under the keyboard", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await openDrill(page);
    await start(page);
    await page.waitForTimeout(250);
    const practice = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const safe = box("[data-testid=practice-safe]")!;
      return {
        overflowX: document.documentElement.scrollWidth - innerWidth,
        safeHeight: safe.height,
        keyboardBottom: box(".dojo-keyboard")!.bottom,
        staffTop: box("[data-testid=dojo-score]")!.top,
        safeBottom: safe.bottom,
        viewportHeight: innerHeight,
        headRows: new Set([...document.querySelector(".dojo-practice-head")!.children].map((element) => Math.round((element.getBoundingClientRect().top + element.getBoundingClientRect().bottom) / 2 / 8))).size,
      };
    });
    expect(practice.overflowX, `no sideways overflow at ${width}x${height}`).toBe(0);
    expect(practice.safeHeight, `the strip at ${width}x${height}`).toBeGreaterThanOrEqual(16);
    expect(practice.keyboardBottom, `the keyboard is clear of the bottom at ${width}x${height}`).toBeLessThanOrEqual(practice.viewportHeight - 16);
    expect(practice.safeBottom).toBeLessThanOrEqual(practice.viewportHeight);
    expect(practice.headRows, `one head row at ${width}x${height}`).toBe(1);
    await playLap(page);
    await expect(page.getByTestId("drill-result")).toBeVisible();
    const result = await page.evaluate(() => {
      const safe = document.querySelector("[data-testid=practice-safe]")!.getBoundingClientRect();
      return { overflowX: document.documentElement.scrollWidth - innerWidth, safeBottom: safe.bottom, viewportHeight: innerHeight };
    });
    expect(result.overflowX, `the result has no sideways overflow at ${width}x${height}`).toBe(0);
    expect(result.safeBottom, `the result keeps the strip at ${width}x${height}`).toBeLessThanOrEqual(result.viewportHeight);
  }
});

test("28 cards stay on one scrolling row; the 1st, 14th and 28th card are fully visible at three sizes", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await openDrill(page, "tension-all", "no-midi");
    await expect(page.getByTestId("drill-card")).toHaveCount(28);
    const strip = page.getByTestId("drill-card-strip");
    const stripMetrics = await strip.evaluate((element) => ({
      flexWrap: getComputedStyle(element).flexWrap,
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(stripMetrics.flexWrap, `one row at ${width}x${height}`).toBe("nowrap");
    expect(stripMetrics.overflowX).toBe("auto");
    expect(stripMetrics.scrollWidth, `the row scrolls at ${width}x${height}`).toBeGreaterThan(stripMetrics.clientWidth);

    const cardBox = (index: number) => page.evaluate((index) => {
      const stripElement = document.querySelector('[data-testid="drill-card-strip"]')!;
      const card = stripElement.querySelector(`[data-drill-index="${index}"]`)!;
      const s = stripElement.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const staff = document.querySelector('[data-testid="dojo-score"]')!.getBoundingClientRect();
      const chord = card.querySelector('[data-testid="drill-card-name"]') as HTMLElement;
      const notes = card.querySelector('[data-testid="drill-card-notes"]') as HTMLElement;
      return {
        stripLeft: s.left, stripRight: s.right, stripTop: s.top,
        left: c.left, right: c.right, top: c.top, bottom: c.bottom,
        staffTop: staff.top, viewportWidth: innerWidth, viewportHeight: innerHeight,
        cardOverflow: card.scrollWidth - card.clientWidth,
        chordOverflow: chord.scrollWidth - chord.clientWidth,
        notesHeight: notes.clientHeight,
        lineHeight: parseFloat(getComputedStyle(notes).lineHeight),
      };
    }, index);

    const assertVisible = async (index: number) => {
      await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", String(index));
      await expect.poll(async () => {
        const box = await cardBox(index);
        return box.left >= box.stripLeft - 1 && box.right <= box.stripRight + 1;
      }, { message: `card ${index + 1} is scrolled into view at ${width}x${height}` }).toBe(true);
      const box = await cardBox(index);
      expect(box.left, `card ${index + 1} left at ${width}x${height}`).toBeGreaterThanOrEqual(box.stripLeft - 1);
      expect(box.right, `card ${index + 1} right at ${width}x${height}`).toBeLessThanOrEqual(box.stripRight + 1);
      expect(box.top).toBeGreaterThanOrEqual(box.stripTop - 1);
      expect(box.bottom, `card ${index + 1} is above the staff at ${width}x${height}`).toBeLessThanOrEqual(box.staffTop + 1);
      expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight - 16);
      expect(box.right).toBeLessThanOrEqual(box.viewportWidth);
      expect(box.cardOverflow, `card ${index + 1} text stays inside at ${width}x${height}`).toBeLessThanOrEqual(1);
      expect(box.chordOverflow).toBeLessThanOrEqual(1);
      expect(box.notesHeight, `the two hand lines of card ${index + 1}`).toBeLessThanOrEqual(Math.ceil(box.lineHeight * 2) + 2);
    };

    await assertVisible(0);
    for (let step = 0; step < 13; step += 1) await page.getByTestId("drill-yes").click();
    await assertVisible(13);
    for (let step = 0; step < 14; step += 1) await page.getByTestId("drill-yes").click();
    await assertVisible(27);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});

test("a duplicate note-on and one release do not leave a stale held key: the basic cycle still passes", async ({ page }) => {
  await openDrill(page);
  await start(page);
  const lapCards = buildDrillKeySet(SET, await keyOf(page)).cards;
  const first = [...lapCards[0]!.left, ...lapCards[0]!.right];
  await emit(page, [first[0]!], true);
  await emit(page, [first[0]!], true);       // the same channel+note twice
  await emit(page, [first[0]!], false);      // one release still leaves it held
  await emit(page, first.slice(1), true);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "1");
  await page.getByTestId("drill-debug").locator("summary").click();
  await expect(page.getByTestId("drill-debug-row").first()).toBeVisible();

  const held = new Set(first);
  for (const note of [...held]) if (!lapCards[1]!.left.includes(note) && !lapCards[1]!.right.includes(note)) { await emit(page, [note], false); held.delete(note); }
  for (let index = 1; index < lapCards.length; index += 1) {
    await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", String(index));
    const notes = [...lapCards[index]!.left, ...lapCards[index]!.right];
    await emit(page, [...held].filter((note) => !notes.includes(note)), false);
    await emit(page, notes.filter((note) => !held.has(note)), true, 20);
    held.clear(); notes.forEach((note) => held.add(note));
  }
  await emit(page, [...held], false);
  await expect(page.getByTestId("drill-result")).toBeVisible();
});

test("after about a second a held mismatch shows the reason under the card", async ({ page }) => {
  await openDrill(page);
  await start(page);
  const card = buildDrillKeySet(SET, await keyOf(page)).cards[0]!;
  await emit(page, [card.left[0]!, card.left[0]! + 1], true);
  await expect(page.getByTestId("drill-reason")).toBeVisible({ timeout: 2500 });
  await expect(page.getByTestId("drill-reason")).toContainText(/余分な音|足りない音|右手|左手|ペダル/);
  await emit(page, [card.left[0]!, card.left[0]! + 1], false);
});
test("a brief disconnect drops the lap and the stale held keys; the next press starts cleanly", async ({ page }) => {
  await openDrill(page);
  await start(page);
  const card = buildDrillKeySet(SET, await keyOf(page)).cards[0]!;
  const notes = [...card.left, ...card.right];
  await emit(page, notes, true);
  await page.evaluate(async () => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.unplug());
  await page.evaluate(async () => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.plug());
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-state", "idle", { timeout: 5000 });
  await emit(page, notes, false);
  await page.getByTestId("drill-start").click();
  await emit(page, notes, true, 20);
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "1");
});