import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-23b: 耳で弾く — the result screen (X1-X15, C1-C8).
 * The numbers, their counting, the records and the keys are the same as before; this checks the new shape, the wheel,
 * the four figures' notes, the seconds' lines, the twelve-question bars and where the bottom row sits.
 */
interface Midi { emit: (notes: number[], on?: boolean, spread?: number) => void }

/**
 * The added bank's level 3 / 4-bar set has 11 questions with no name. They are 63 candidates, and the first
 * name-less one (`X3-4-003`, shown as 耳の課題 150) is at index 8. `makeQuestion(..., Math.random)` picks
 * `floor(random() * 63)`, so the page's `Math.random` is pinned to 8.5/63 just before starting: the run gets
 * that fixed question instead of waiting for a random draw. The product's selection is not touched, and the
 * pin only lives in this document (the next openDojo navigation restores the native Math.random).
 */
const UNNAMED_QUESTION_RANDOM = 8.5 / 63;

const midi = (page: Page, notes: number[], on = true, spread = 10) =>
  page.evaluate(({ notes, on, spread }) => (window as unknown as { __p12Midi: Midi }).__p12Midi.emit(notes, on, spread), { notes, on, spread });
const answerOf = (page: Page, index: number): Promise<number[]> =>
  page.evaluate((chord) => (window as unknown as { __earAnswer: (index: number) => number[] }).__earAnswer(chord), index);
const chordCount = (page: Page): Promise<number> => page.evaluate(() => {
  const ask = (window as unknown as { __earAnswer: (index: number) => number[] | undefined }).__earAnswer;
  let count = 0;
  while (ask(count)) count += 1;
  return count;
});

const cardIndex = async (page: Page) => Number(await page.locator(".ear-tile b").innerText()) - 1;

async function playThrough(page: Page, before?: (page: Page) => Promise<void>) {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
  if (before) await before(page);
  const count = await chordCount(page);
  for (let index = await cardIndex(page); index < count; index += 1) {
    const notes = await answerOf(page, index);
    await midi(page, notes, true, 10);
    if (index < count - 1) await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 5000 });
    await midi(page, notes, false, 0);
  }
  await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 8000 });
}

/** No MIDI keyboard: the player reveals the answer and says it was played. */
async function playNoMidi(page: Page) {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
  const count = await chordCount(page);
  for (let index = await cardIndex(page); index < count; index += 1) {
    await page.keyboard.press("Space");
    await expect(page.getByTestId("ear-self-yes")).toBeVisible();
    await page.keyboard.press("y");
    if (index < count - 1) await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 5000 });
  }
  await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 8000 });
}

async function run(page: Page, options: { size?: { width: number; height: number }; level?: number; length?: 4 | 8 | 16; source?: "bank" | "builtin"; mode?: string; before?: (page: Page) => Promise<void>; random?: number } = {}) {
  if (options.size) await page.setViewportSize(options.size);
  await openDojo(page, options.mode ?? "midi");
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  if (options.source) await page.getByTestId(`ear-source-${options.source}`).click();
  if (options.level) await page.getByTestId(`ear-level-${options.level}`).click();
  if (options.length) await page.getByTestId(`ear-length-${options.length}`).click();
  // A fixed draw for this run only (the next navigation restores the native Math.random).
  if (options.random !== undefined) await page.evaluate((value) => { Math.random = () => value; }, options.random);
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  if (options.mode === "no-midi") await playNoMidi(page);
  else await playThrough(page, options.before);
}

const nextQuestion = async (page: Page) => {
  await page.getByTestId("ear-next").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await playThrough(page);
};

test("C1/C2: the top row, the summary face, the four figures, the cards and the score (X1-X9)", async ({ page }) => {
  await run(page, { size: { width: 1440, height: 900 }, level: 3, length: 8, source: "builtin" });

  // X1: the same top row shape as the playing screen, with ③ current and ①② ticked; the title keeps its words.
  await expect(page.getByTestId("ear-back")).toBeVisible();
  const title = await page.locator(".ear-result .ear-head h1").evaluate((node) => node.textContent);
  expect(title).toMatch(/^(定番の進行|耳の課題 \d{3})・レベル3・8小節$/);
  await expect(page.locator(".ear-result .ear-head")).toContainText("キー");
  await expect(page.locator(".ear-result .ear-head")).toContainText("テンポ");
  const steps = page.locator(".ear-result .ear-steps > span");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveAttribute("data-state", "done");
  await expect(steps.nth(1)).toHaveAttribute("data-state", "done");
  await expect(steps.nth(2)).toHaveAttribute("data-state", "current");
  await expect(steps.nth(0).locator(".ear-step-no")).toHaveText("✓");

  // X2: the wheel is a decoration of first-tries over counted chords; the numbers in it are read.
  const ring = await page.evaluate(() => {
    const fill = document.querySelector(".ear-rate-fill") as SVGCircleElement | null;
    const track = document.querySelector(".ear-rate-track") as SVGCircleElement;
    const center = (document.querySelector(".ear-rate-center b") as HTMLElement).innerText;
    const first = (document.querySelector("[data-testid='ear-summary-first']") as HTMLElement).innerText;
    const svg = document.querySelector(".ear-rate-ring")!;
    return {
      aria: svg.getAttribute("aria-hidden"),
      centerAria: (document.querySelector(".ear-rate-center") as HTMLElement).getAttribute("aria-hidden"),
      first,
      center,
      dash: fill ? Number(fill.getAttribute("stroke-dasharray")!.split(" ")[0]) : null,
      circumference: 2 * Math.PI * Number(track.getAttribute("r")),
    };
  });
  expect(ring.aria).toBe("true");
  expect(ring.centerAria).toBeNull();
  expect(ring.center).toBe(ring.first);
  const [won, counted] = ring.first.split(" / ").map(Number);
  expect(ring.dash).toBeCloseTo(ring.circumference * (won! / counted!), 1);

  // X3/X4: the name with 「でした」, and the key with the degrees joined by arrows.
  await expect(page.getByTestId("ear-result-name")).toContainText(/この進行は .+ でした/);
  await expect(page.locator(".ear-result-facts")).toContainText(/キー /);

  // X5: four figures, each with the old dd words and one line under it.
  await expect(page.getByTestId("ear-summary")).toBeVisible();
  for (const id of ["ear-summary-first", "ear-summary-median", "ear-summary-hints", "ear-summary-listens"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId("ear-summary-first")).toHaveText(/^\d+ \/ \d+$/);
  await expect(page.getByTestId("ear-summary-median")).toHaveText(/^(—|\d+\.\ds)$/);
  await expect(page.getByTestId("ear-summary-hints")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("ear-summary-listens")).toHaveText(/^\d+回$/);
  const notes = await page.locator(".ear-summary-note").evaluateAll((nodes) => nodes.map((node) => node.textContent));
  expect(notes.some((note) => /名前 \d+ ・ 鍵盤 \d+/.test(note ?? ""))).toBe(true);
  expect(notes.some((note) => (note ?? "").includes("印は付きません"))).toBe(true);
  // The comparison text stays word for word under the figures.
  await expect(page.getByTestId("ear-compare")).toContainText(/前回までとの比べ|同じレベル・長さの記録がまだありません/);

  // X7/X8: the cards one by one (112 px), the seconds' lines, and 「通して聴く」.
  await expect(page.locator(".ear-result-cards-head")).toContainText("1 コードずつ");
  await expect(page.locator(".ear-result-cards-head")).toContainText("押すと鳴ります。下の線は、かかった秒数です(黄色は時間がかかった所)。");
  await expect(page.getByTestId("ear-result-play-all")).toHaveText("通して聴く");
  const cards = await page.locator("[data-testid^='ear-result-card-']").count();
  expect(cards).toBeGreaterThan(0);
  const cardBox = await page.getByTestId("ear-result-card-0").boundingBox();
  expect(Math.round(cardBox!.height)).toBe(112);
  const lines = await page.locator(".ear-result-sec").count();
  // A line only where the card has seconds of its own (not shown from the start, not judged by the player) and the
  // question's longest is above zero; the length is the share of that longest.
  const withSeconds = await page.locator("[data-testid^='ear-result-card-']").evaluateAll((nodes) =>
    nodes.filter((node) => {
      const sub = node.querySelector(".ear-card-sub")?.textContent ?? "";
      const match = /^(\d+\.\d)s$/.exec(sub);
      return match !== null && Number(match[1]) > 0;
    }).length);
  expect(lines).toBe(withSeconds);

  // X9: the score is the same block, and its note sits under it when any function could be estimated.
  await expect(page.getByTestId("ear-result-score")).toBeVisible();
  await expect(page.locator("[data-testid='ear-result-score'] .ear-score-chord").first()).toBeVisible();
  const functions = await page.locator("[data-testid='ear-result-cards'] .ear-card-fn").count();
  if (functions > 0) await expect(page.getByTestId("ear-function-note")).toContainText("機能はコードの並びから自動で推定したものです");
});

test("C3: the hint line counts the cards whose name and keyboard were shown (X5)", async ({ page }) => {
  await run(page, {
    size: { width: 1440, height: 900 }, level: 3, length: 8,
    before: async (page) => {
      // card 0 is done without a hint, card 1 with the name, card 2 with the name and the keyboard
      const notes0 = await answerOf(page, 0);
      await midi(page, notes0, true, 10);
      await midi(page, notes0, false, 0);
      await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");
      await page.keyboard.press("Space");
      const notes1 = await answerOf(page, 1);
      await midi(page, notes1, true, 10);
      await midi(page, notes1, false, 0);
      await expect(page.getByTestId("ear-card-2")).toHaveAttribute("data-current", "true");
      await page.keyboard.press("Space");
      await page.keyboard.press("Space");
      const notes2 = await answerOf(page, 2);
      await midi(page, notes2, true, 10);
      await midi(page, notes2, false, 0);
      await expect(page.getByTestId("ear-card-3")).toHaveAttribute("data-current", "true");
    },
  });
  await expect(page.locator(".ear-summary-note").filter({ hasText: "名前" })).toHaveText("名前 2 ・ 鍵盤 1");
});

test("C6/C7: the twelve-question bars, and the bottom row inside the window (X10-X14)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  await page.getByTestId("ear-level-1").click();
  await page.getByTestId("ear-length-4").click();
  await page.getByTestId("ear-start").click();
  await playThrough(page);

  // One question: one bar, the current one, and the sentence about no records yet.
  await expect(page.locator("[data-testid='ear-trend-rate'] .ear-trend-bar")).toHaveCount(1);
  await expect(page.locator("[data-testid='ear-trend-rate'] .ear-trend-bar[data-current]")).toHaveCount(1);
  await expect(page.locator("[data-testid='ear-result-trend']")).toContainText("同じレベル・長さの記録がまだありません。");
  await expect(page.locator("[data-testid='ear-trend-rate']")).toHaveAttribute("aria-label", /一発の割合。直近 1 問。今回/);
  await expect(page.locator("[data-testid='ear-trend-seconds']")).toHaveAttribute("aria-label", /秒数の中央値。直近 1 問。今回/);

  // Three questions: three bars, oldest first, the rightmost is this one.
  await nextQuestion(page);
  await nextQuestion(page);
  const bars = page.locator("[data-testid='ear-trend-rate'] .ear-trend-bar");
  await expect(bars).toHaveCount(3);
  await expect(page.locator("[data-testid='ear-trend-rate'] .ear-trend-bar[data-current]")).toHaveCount(1);
  expect(await bars.evaluateAll((nodes) => nodes.map((node) => node.hasAttribute("data-current")))).toEqual([false, false, true]);
  await expect(page.locator("[data-testid='ear-result-trend']")).not.toContainText("記録がまだありません");
  await expect(page.locator(".ear-trend-axis").first()).toContainText("2 問前");

  // X13/X14: the bottom row is inside the window at 1440×900 and 1280×720, for 8 bars too.
  const footInside = async (size: { width: number; height: number }) => {
    await page.setViewportSize(size);
    const measured = await page.evaluate(() => {
      const next = document.querySelector("[data-testid='ear-next']")!.getBoundingClientRect();
      const foot = document.querySelector(".ear-result-foot")!.getBoundingClientRect();
      return { nextBottom: next.bottom, footBottom: foot.bottom, pageScroll: document.documentElement.scrollHeight - innerHeight, viewport: innerHeight };
    });
    expect(measured.nextBottom).toBeLessThanOrEqual(measured.viewport);
    expect(measured.footBottom).toBeLessThanOrEqual(measured.viewport);
    expect(measured.pageScroll).toBeLessThanOrEqual(1);
  };
  await footInside({ width: 1440, height: 900 });
  await footInside({ width: 1280, height: 720 });
  // P23-58-fix-1 B6 / X14: 8-bar result fits without scrolling .ear-result-body at 1440x900 and 1366x768.
  await page.getByTestId("ear-again").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
  await page.getByTestId("ear-length-8").click();
  await page.getByTestId("ear-start").click();
  await playThrough(page);
  for (const size of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
    await footInside(size);
    await page.waitForTimeout(100);
    const bodyScroll = await page.evaluate(() => {
      const body = document.querySelector(".ear-result-body")!;
      return { overflow: body.scrollHeight - body.clientHeight, scrollH: body.scrollHeight, clientH: body.clientHeight };
    });
    console.log(`B6_FIX1_8BAR_${size.width}x${size.height}:`, JSON.stringify(bodyScroll));
    await captureReportShot(page, `p23-58-fix-1-assets/b6-ear-8bar-${size.width}.png`);
    expect(bodyScroll.overflow, `${size.width}x${size.height}`).toBeLessThanOrEqual(1);
  }
  // With 16 bars the cards take two rows; the bottom row still stays in the window.
  await page.getByTestId("ear-again").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ear-start")).toBeVisible();
  await page.getByTestId("ear-length-16").click();
  await page.getByTestId("ear-start").click();
  await playThrough(page);
  await footInside({ width: 1440, height: 900 });
});

test("C8: four widths, axe, and Enter/Esc (X1-X15)", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await run(page, { size, level: 2, length: 4 });
    await assertNoHorizontalOverflow(page);
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), `${size.width}`).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ear-start")).toBeVisible();
  }
  // Enter goes to the next question.
  await run(page, { size: { width: 1440, height: 900 }, level: 1, length: 4 });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "listen");
});

test("C1/X3: a question without a name shows the key and the degrees only", async ({ page }) => {
  test.setTimeout(300_000);
  // The fixed name-less question of the added bank (level 3, 4 bars): no draw and no retries.
  await run(page, { size: { width: 1440, height: 900 }, level: 3, length: 4, random: UNNAMED_QUESTION_RANDOM });
  // The fixed question really is the one asked (its number is the bank's display number).
  await expect(page.locator(".ear-result .ear-head h1")).toContainText("耳の課題 150");
  await expect(page.getByTestId("ear-result-name")).toHaveCount(0);
  await expect(page.getByTestId("ear-summary")).toBeVisible();
  await expect(page.locator(".ear-result-facts")).toContainText(/キー|→/);
});

test("C1/X2/X15: no MIDI — the player judges, so nothing is counted and no seconds are drawn", async ({ page }) => {
  await run(page, { size: { width: 1440, height: 900 }, level: 1, length: 4, mode: "no-midi" });
  await expect(page.getByTestId("ear-summary-first")).toHaveText("0 / 0");
  await expect(page.getByTestId("ear-summary-median")).toHaveText("—");
  await expect(page.locator(".ear-rate-center b")).toHaveText("— / 0");
  await expect(page.locator(".ear-rate-fill")).toHaveCount(0);
  await expect(page.locator("[data-testid='ear-result-card-0']")).toContainText("自分で判定");
  await expect(page.locator(".ear-result-sec")).toHaveCount(0);
});

test("the photos: named, unnamed, one record, 16 bars and no MIDI, at 1440×900 and 1280×720", async ({ page }) => {
  test.setTimeout(600_000);
  const shoot = async (name: string, size: { width: number; height: number }) => {
    await page.screenshot({ path: `p89-generated/p23-23b/${name}-${size.width}x${size.height}.png` });
  };
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    // named (a built-in progression always has its name)
    await run(page, { size, level: 3, length: 8, source: "builtin" });
    await shoot("named", size);
    // unnamed: the same fixed name-less bank question (level 3, 4 bars) as the C1/X3 check.
    await run(page, { size, level: 3, length: 4, random: UNNAMED_QUESTION_RANDOM });
    await expect(page.getByTestId("ear-result-name")).toHaveCount(0);
    await shoot("unnamed", size);
    // one record: a fresh store, the first question
    await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-v1:data"));
    await run(page, { size, level: 1, length: 4 });
    await shoot("one-record", size);
    // sixteen bars (the cards take two rows)
    await run(page, { size, level: 1, length: 16 });
    await shoot("sixteen-bars", size);
    // no MIDI: judged by the player
    await run(page, { size, level: 1, length: 4, mode: "no-midi" });
    await shoot("no-midi", size);
  }
  for (const size of [{ width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await run(page, { size, level: 3, length: 8, source: "builtin" });
    await shoot("named", size);
  }
});

test("P23-31b C12: the ring's count stays inside the ring", async ({ page }) => {
  test.setTimeout(240_000);
  // P25 T3: 1440×900 and 768×640 (the widest and the narrowest of the result's sizes).
  for (const size of [{ width: 1440, height: 900 }, { width: 768, height: 640 }]) {
    await run(page, { size, level: 3, length: 8, source: "builtin" });
    const measured = await page.evaluate(() => {
      const track = document.querySelector<SVGCircleElement>(".ear-rate-track")!;
      const count = document.querySelector<HTMLElement>(".ear-rate-center b")!;
      return {
        countWidth: count.getBoundingClientRect().width,
        // The track circle's own box (its centre line, without the stroke), measured on the page.
        inner: track.getBoundingClientRect().width,
        text: count.textContent,
      };
    });
    expect(measured.countWidth, `${size.width}: inside the ring (${measured.text})`).toBeLessThanOrEqual(measured.inner - 8);
    await page.screenshot({ path: `p89-generated/p23-31b/ear-result-${size.width}x${size.height}.png` });
  }
});
