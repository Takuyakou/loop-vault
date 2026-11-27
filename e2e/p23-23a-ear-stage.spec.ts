import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";

/**
 * P23-23a: 耳で弾く — the listening and playing screen (T1-T4, S1-S22, B1-B3, C1-C10).
 * The words and attributes the earlier screens already check are left to their own specs; this one checks what the
 * stage adds, its sizes at the four widths, the two new ways of listening, the chips and hints, and the photos.
 */
interface Midi { emit: (notes: number[], on?: boolean, spread?: number) => void; connect: () => Promise<void> }

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

async function start(page: Page, options: { size?: { width: number; height: number }; level?: number; length?: 4 | 8 | 16; mode?: string } = {}) {
  if (options.size) await page.setViewportSize(options.size);
  await openDojo(page, options.mode ?? "midi");
  await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
  if (options.level) await page.getByTestId(`ear-level-${options.level}`).click();
  if (options.length) await page.getByTestId(`ear-length-${options.length}`).click();
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
}

const toPlay = async (page: Page) => {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
};

const cardIndex = async (page: Page) => Number(await page.locator(".ear-tile b").innerText()) - 1;

/** A note name that is not part of the answer (moved up until it is foreign). */
const foreignPc = (answer: readonly number[], from: number) => {
  const own = new Set(answer.map((note) => ((note % 12) + 12) % 12));
  let note = from;
  while (own.has(((note % 12) + 12) % 12)) note += 1;
  return note;
};

/** Plays a shape on the answer and waits for the words it earns. */
async function playWrong(page: Page, notes: readonly number[], words: RegExp) {
  await midi(page, [...notes], true, 10);
  await page.waitForTimeout(60);
  await midi(page, [...notes], false, 0);
  await expect(page.getByTestId("ear-feedback")).toContainText(words, { timeout: 5000 });
}

/** A shape with a note the judgement must ask for (the third of the sorted answer) left out. */
const missingShape = (answer: readonly number[]) => answer.filter((_, position) => position !== 1);

const namedNoteOf = (message: string) => message.startsWith("長7度(")
  ? message.slice(4, message.indexOf(")"))
  : (message.match(/^(.+) がありません$/)?.[1] ?? "");
/** The judgement's words use the domain's names (F#); the cards and chips write F♯. The note is the same. */
const chipName = (name: string) => name.replace(/#/g, "♯");

async function answerRight(page: Page, index: number, last = false) {
  const notes = await answerOf(page, index);
  await midi(page, notes, true, 20);
  if (last) await expect(page.getByTestId("ear-result")).toBeVisible({ timeout: 5000 });
  else await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 5000 });
  await midi(page, notes, false, 0);
}

test("C1: the top row, the flow and the cards keep their words and take the sizes of the rule (T1-T4)", async ({ page }) => {
  await start(page, { size: { width: 1440, height: 900 }, level: 3, length: 8 });
  await toPlay(page);

  // T1: back, the same title words, the key and the tempo; the old note is gone.
  await expect(page.getByTestId("ear-back")).toBeVisible();
  await expect(page.getByTestId("ear-title")).toContainText(/^耳の課題 \d{3}・レベル3・8小節$/);
  const fonts = await page.evaluate(() => ({
    main: parseFloat(getComputedStyle(document.querySelector(".ear-title-main") as Element).fontSize),
    fact: parseFloat(getComputedStyle(document.querySelector(".ear-title-fact") as Element).fontSize),
  }));
  expect(fonts.main).toBeGreaterThan(fonts.fact);
  await expect(page.getByTestId("ear-key")).toContainText("キー");
  await expect(page.locator(".ear-note")).toHaveCount(0);

  // T2: three steps in one group; the current one is current, the finished one a tick, and ② holds "{i} / {n}".
  const steps = page.getByRole("group", { name: "練習の流れ" }).locator(":scope > span");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveAttribute("data-state", "done");
  await expect(steps.nth(0).locator(".ear-step-no")).toHaveText("✓");
  await expect(steps.nth(1)).toHaveAttribute("data-state", "current");
  await expect(steps.nth(1)).toContainText(/1 \/ \d+/);
  await expect(steps.nth(2)).toHaveAttribute("data-state", "todo");

  // T3: 96 px at 1440, the name 23 px, the number and the marks at the corners, the 3 px line at the bottom.
  const cardBox = await page.getByTestId("ear-card-0").boundingBox();
  expect(Math.round(cardBox?.height ?? 0)).toBe(96);
  const nameSize = await page.getByTestId("ear-card-name-0").evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(nameSize).toBe(23);
  const top = await page.getByTestId("ear-card-0").locator(".ear-card-top").boundingBox();
  const no = await page.getByTestId("ear-card-0").locator(".ear-card-no").boundingBox();
  const marks = await page.getByTestId("ear-card-0").locator(".ear-marks").boundingBox();
  expect(Math.round(no!.x)).toBeLessThan(Math.round(marks!.x));
  expect(Math.round(top!.y)).toBeLessThan(Math.round(cardBox!.y + cardBox!.height / 2));
  expect(Math.round((await page.getByTestId("ear-card-0").locator(".ear-card-bar").boundingBox())!.height)).toBe(3);

  // The finished card's line takes the role colour; the card being played is framed in the accent.
  await answerRight(page, 0);
  await expect(page.getByTestId("ear-card-0")).toHaveAttribute("data-done", "true");
  const kinds = await page.getByTestId("ear-card-0").locator(".ear-card-bar").getAttribute("data-kind");
  expect(["T", "SD", "SDm", "D"]).toContain(kinds);
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");

  // T4: the marks' meanings, the place in the whole question and the switch under the cards.
  const under = await page.evaluate(() => {
    const legend = document.querySelector(".ear-under .ear-legend")!.getBoundingClientRect();
    const position = document.querySelector("[data-testid='ear-position']")!.getBoundingClientRect();
    const toggle = document.querySelector(".ear-toggle")!.getBoundingClientRect();
    const input = document.querySelector("[data-testid='ear-degree-toggle']") as HTMLInputElement;
    const style = getComputedStyle(input);
    return {
      leftToMiddle: position.left - legend.left,
      middleToRight: toggle.left - position.left,
      appearance: style.appearance,
      width: Math.round(input.getBoundingClientRect().width),
    };
  });
  expect(under.leftToMiddle).toBeGreaterThan(0);
  expect(under.middleToRight).toBeGreaterThan(0);
  expect(under.width).toBe(28);
  expect(under.appearance).toBe("none");

  // The back button leaves the run, like Esc.
  await page.getByTestId("ear-back").click();
  await expect(page.getByTestId("ear-start")).toBeVisible();
});

test("C1/C2: the stage's columns, the big listen button and the score (S1-S4, S8, S20, S22)", async ({ page }) => {
  await start(page, { size: { width: 1440, height: 900 }, level: 3, length: 8 });

  // S1/S2/S3: 聴く is its own column with a 100 px wheel; in the first lap the button is R, the others wait.
  await expect(page.locator(".ear-listen .ear-zone-head")).toContainText("聴く");
  // P25 V3: the heading is 「聴く」 alone.
  await expect(page.locator(".ear-listen .ear-zone-head")).toHaveText("聴く");
  const orb = await page.getByTestId("ear-lap-again").boundingBox();
  expect(Math.round(orb!.width)).toBe(100);
  expect(Math.round(orb!.height)).toBe(100);
  await expect(page.getByTestId("ear-lap-again")).toContainText("全体を聴く");
  await expect(page.getByTestId("ear-lap-again").locator("svg.ear-orb-ring")).toHaveCount(1);
  await expect(page.getByTestId("ear-listen-lap")).toBeEnabled();
  for (const id of ["ear-listen-pair", "ear-listen-bass", "ear-listen-spread"]) await expect(page.getByTestId(id)).toBeDisabled();
  const keys = ["ear-listen-pair", "ear-listen-lap", "ear-listen-bass", "ear-listen-spread"];
  for (const [position, id] of keys.entries()) {
    const box = await page.getByTestId(id).boundingBox();
    const previous = position === 0 ? undefined : await page.getByTestId(keys[position - 1]!).boundingBox();
    if (previous) expect(Math.round(box!.y)).toBeGreaterThan(Math.round(previous.y));
  }

  // S8: the middle says what is sounding and how far the lap is, and starts the playing.
  await expect(page.locator(".ear-answer .ear-zone-head")).toContainText("まず聴く");
  await expect(page.getByTestId("ear-listening")).toContainText("進行を聴いています…");
  await expect(page.locator(".ear-lap-count")).toContainText(/\/ \d+ 小節/);
  await expect(page.getByTestId("ear-start-playing")).toContainText("弾き始める");

  // S20: the score is a column of the same face: no frame of its own, the heading and its zoom unchanged.
  const score = await page.evaluate(() => {
    const node = document.querySelector("[data-testid='ear-score']") as HTMLElement;
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, head: (document.querySelector(".ear-score-head b") as HTMLElement).innerText };
  });
  expect(score.border).toBe("0px");
  expect(score.head).toBe("楽譜(押している音・答えは合ってから)");

  // The three columns at 1440 and at 1280 take the widths the rules name.
  const columns = async () => page.evaluate(() => getComputedStyle(document.querySelector(".ear-stage")!).gridTemplateColumns.split(" ").map((value) => Math.round(parseFloat(value))));
  expect(await columns()).toEqual([336, expect.any(Number), 372]);
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await columns()).toEqual([296, expect.any(Number), 280]);

  // Nothing spills out of its column and no column clips what it holds, at either width.
  const clipped = async () => page.evaluate(() => {
    const stage = document.querySelector(".ear-stage")!.getBoundingClientRect();
    const boxes = [".ear-listen", ".ear-answer", "[data-testid='ear-score']"].map((selector) => document.querySelector(selector)!.getBoundingClientRect());
    const zones = [...document.querySelectorAll(".ear-listen, .ear-answer, .ear-stage > [data-testid='ear-score']")].map((node) => ({
      clipped: node.scrollHeight - node.clientHeight,
      inside: node.getBoundingClientRect().left >= stage.left - 0.5 && node.getBoundingClientRect().right <= stage.right + 0.5 && node.getBoundingClientRect().bottom <= stage.bottom + 0.5,
    }));
    return {
      order: boxes[0]!.right <= boxes[1]!.left + 1 && boxes[1]!.right <= boxes[2]!.left + 1,
      zones,
    };
  });
  let fit = await clipped();
  expect(fit.order).toBe(true);
  for (const zone of fit.zones) { expect(zone.clipped).toBeLessThanOrEqual(1); expect(zone.inside).toBe(true); }
  await page.setViewportSize({ width: 1440, height: 900 });
  fit = await clipped();
  expect(fit.order).toBe(true);
  for (const zone of fit.zones) { expect(zone.clipped).toBeLessThanOrEqual(1); expect(zone.inside).toBe(true); }

  await toPlay(page);
  // S2: in the playing lap the wheel is the current chord (L) and all four buttons are there.
  await expect(page.getByTestId("ear-listen-chord")).toContainText("今のコード");
  for (const id of keys) await expect(page.getByTestId(id)).toBeEnabled();

  // S22: a narrow window puts 答える first, 聴く under it, and 楽譜 beside them, without running out of the width.
  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  const places = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const answer = box(".ear-answer");
    const listen = box(".ear-listen");
    const scoreBox = box("[data-testid='ear-score']");
    return { answerTop: answer.top, answerLeft: answer.left, answerBottom: answer.bottom, listenTop: listen.top, scoreLeft: scoreBox.left, scoreTop: scoreBox.top };
  });
  expect(places.answerTop).toBeLessThan(places.listenTop);
  expect(places.answerBottom).toBeLessThanOrEqual(places.listenTop + 1);
  expect(places.scoreLeft).toBeGreaterThan(places.answerLeft);
  expect(places.scoreTop).toBeLessThan(places.listenTop);

  // S3: while a sound runs the wheel turns; with reduced motion it stays still. It is a decoration.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("ear-listen-lap").click();
  await expect(page.locator(".ear-orb-ring-fill")).toHaveCount(1);
  expect(await page.locator(".ear-orb-ring-fill").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await expect(page.getByTestId("ear-listen-chord").locator("svg.ear-orb-ring")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".ear-orb-ring-track")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("C2/C3/C14: the words, the guide, the pressed keys and the two new listens (S5, S6, S9-S14, B1, B2)", async ({ page }) => {
  await start(page, { size: { width: 1440, height: 900 }, level: 3, length: 8 });
  await toPlay(page);

  // S9/S10: the number of the card, the figures, and the words only once there is a judgement.
  const tile = await page.locator(".ear-tile").boundingBox();
  expect(Math.round(tile!.width)).toBe(72);
  expect(Math.round(tile!.height)).toBe(72);
  await expect(page.locator(".ear-tile")).toContainText("つ目");
  await expect(page.getByTestId("ear-stats")).toContainText("聴き直し 0回");
  await expect(page.getByTestId("ear-feedback")).toHaveCount(0);

  // B1: the keyboard's heading names the extra note colour too.
  await expect(page.locator(".ear-keyboard .dojo-keyboard-head")).toContainText("余分な音");

  const index = await cardIndex(page);
  const answer = await answerOf(page, index);
  const extra = foreignPc(answer, answer[0]! + 1);

  // C3 ①/S14/B2: one extra note is red in its chip and on its key, and nothing else is.
  await midi(page, [...answer, extra], true, 10);
  await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });
  await expect(page.getByTestId("ear-feedback-guide")).toHaveText("赤い音を外して、もう一度押さえてください。");
  const redChips = page.locator("[data-testid='ear-held-chips'] [data-extra]");
  await expect(redChips).toHaveCount(1);
  const heldCount = await page.locator("[data-testid='ear-held-chips'] .ear-chip:not([data-missing])").count();
  expect(heldCount).toBe(answer.length + 1);
  await expect(page.locator("[data-testid='ear-held-chips'] [data-missing]")).toHaveCount(0);
  await expect(page.locator("[data-testid='ear-keyboard'] [data-visual-state='held-foreign']")).toHaveCount(1);
  await midi(page, [...answer, extra], false, 0);

  // S5/S6/C2: B and A count one listen, leave no mark, and move neither the card nor the answers nor the seconds.
  const before = await page.getByTestId("ear-stats").innerText();
  const beforeName = await page.getByTestId(`ear-card-name-${index}`).innerText();
  const beforeMarks = await page.getByTestId(`ear-card-${index}`).locator(".ear-mark").count();
  await page.getByTestId("ear-listen-bass").click();
  await expect(page.getByTestId("ear-stats")).not.toHaveText(before);
  await expect(page.getByTestId("ear-stats")).toContainText("聴き直し 1回");
  await expect(page.getByTestId(`ear-card-${index}`).locator(".ear-mark")).toHaveCount(beforeMarks);
  await expect(page.getByTestId(`ear-card-name-${index}`)).toHaveText(beforeName);
  await page.getByTestId("ear-listen-spread").click();
  await expect(page.getByTestId("ear-stats")).toContainText("聴き直し 2回");
  await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-current", "true");
  // The keys B and A work the same way as the buttons.
  await page.keyboard.press("b");
  await page.keyboard.press("a");
  await expect(page.getByTestId("ear-stats")).toContainText("聴き直し 4回");

  // C3 ②: a missing note leaves no red and one dotted chip with the one name the words say.
  const missing = missingShape(answer);
  await playWrong(page, missing, /がありません/);
  const message = await page.getByTestId("ear-feedback").innerText();
  const named = namedNoteOf(message.replace(/^× /, ""));
  await expect(page.getByTestId("ear-feedback-guide")).toHaveText("音を足して、もう一度押さえてください。");
  await expect(page.locator("[data-testid='ear-held-chips'] [data-extra]")).toHaveCount(0);
  const dotted = page.locator("[data-testid='ear-held-chips'] [data-missing]");
  await expect(dotted).toHaveCount(1);
  await expect(dotted).toHaveText(chipName(named));

  // C3 ③: two extra notes are two red chips (and two red keys).
  const extra2 = foreignPc(answer, extra + 1);
  await midi(page, [...answer, extra, extra2], true, 10);
  await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });
  await expect(page.locator("[data-testid='ear-held-chips'] [data-extra]")).toHaveCount(2);
  await expect(page.locator("[data-testid='ear-keyboard'] [data-visual-state='held-foreign']")).toHaveCount(2);
  await midi(page, [...answer, extra, extra2], false, 0);

  // C3 ④: the right answer clears both marks.
  await midi(page, answer, true, 10);
  await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 5000 });
  await expect(page.getByTestId("ear-feedback")).toContainText("合いました");
  await expect(page.locator("[data-testid='ear-held-chips'] [data-extra]")).toHaveCount(0);
  await expect(page.locator("[data-testid='ear-held-chips'] [data-missing]")).toHaveCount(0);
  await expect(page.locator("[data-testid='ear-keyboard'] [data-visual-state='held-foreign']")).toHaveCount(0);
  await midi(page, answer, false, 0);
});

test("C5/C6: the shapes that were tried and the two-step hint (S15-S17)", async ({ page }) => {
  await start(page, { size: { width: 1440, height: 900 }, level: 3, length: 8 });
  await toPlay(page);
  await answerRight(page, 0);
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");

  // S17/C6: the hint row is two steps; the next one is the button and carries the words.
  await expect(page.getByTestId("ear-hint")).toHaveText(/① 名前を見る/);
  await page.getByTestId("ear-hint").click();
  await expect(page.getByTestId("ear-card-name-1")).not.toHaveText("?");
  await expect(page.getByTestId("ear-hint")).toHaveText(/② 鍵盤で答えを見る/);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("ear-hint")).toHaveText(/② 答えを表示中/);
  await expect(page.getByTestId("ear-hint")).toBeDisabled();
  await expect(page.getByTestId("ear-card-1").locator("[data-mark='key']")).toBeVisible();
  await expect(page.locator("[data-testid='ear-score'] [data-tone='answer']").first()).toBeVisible();
  await expect(page.locator("[data-testid='ear-keyboard'] [data-answer-marker]").first()).toBeVisible();
  await expect(page.getByTestId("ear-card-1")).toHaveAttribute("data-current", "true");

  // Four shapes on the same card: A, B, B, C.
  const index = await cardIndex(page);
  expect(index).toBe(1);
  const answer = await answerOf(page, index);
  const a = foreignPc(answer, answer[0]! + 1);
  await midi(page, [...answer, a], true, 10);
  await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });
  await midi(page, [...answer, a], false, 0);
  await playWrong(page, missingShape(answer), /がありません/);
  await playWrong(page, missingShape(answer), /がありません/);
  const c = foreignPc(answer, a + 1);
  await midi(page, [...answer, c], true, 10);
  await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });

  // The judgement on show is not repeated; the older ones are newest first, with their answer numbers.
  const rows = page.locator("[data-testid='ear-tried'] .ear-tried-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("3 回目");
  await expect(rows.nth(0)).toContainText("がありません");
  await expect(rows.nth(1)).toContainText("1 回目");
  await expect(rows.nth(1)).toContainText("余分な音");
  await expect(page.getByTestId("ear-feedback")).not.toContainText("3 回目");
  await midi(page, [...answer, c], false, 0);

  // The next card starts with no tried shapes.
  await answerRight(page, index);
  await expect(page.getByTestId("ear-tried")).toHaveCount(0);
});

test("C7/C8/C9: the four widths, the sizes, the tab order and axe", async ({ page }) => {
  // C8: the keyboard keeps its height (before: 218 at 1440×900, 114 at 1280×720) and nothing scrolls.
  for (const size of [{ width: 1440, height: 900, least: 210 }, { width: 1280, height: 720, least: 106 }]) {
    await start(page, { size, level: 3, length: 8 });
    await toPlay(page);
    await page.evaluate(() => document.fonts.ready);
    // The keys are measured after the layout settles; wait for the value itself, not for a longer pause.
    await expect.poll(async () => Number(await page.getByTestId("ear-keyboard").getAttribute("data-key-height")), { timeout: 5000 })
      .toBeGreaterThanOrEqual(size.least);
    const measured = await page.evaluate(() => {
      const run = document.querySelector("[data-testid='ear-run']") as HTMLElement;
      const keyboard = document.querySelector("[data-testid='ear-keyboard']")!.getBoundingClientRect();
      return {
        keyHeight: Number(document.querySelector("[data-testid='ear-keyboard']")!.getAttribute("data-key-height")),
        cardHeight: Math.round(document.querySelector("[data-testid='ear-card-0']")!.getBoundingClientRect().height),
        pageScroll: document.documentElement.scrollHeight - innerHeight,
        runScroll: run.scrollHeight - run.clientHeight,
        keyboardBottom: keyboard.bottom,
        viewport: innerHeight,
      };
    });
    expect(measured.keyHeight, `${size.width}`).toBeGreaterThanOrEqual(size.least);
    expect(measured.cardHeight, `${size.width}`).toBe(size.width === 1440 ? 96 : 78);
    expect(measured.pageScroll).toBeLessThanOrEqual(1);
    expect(measured.runScroll).toBeLessThanOrEqual(1);
    expect(measured.keyboardBottom).toBeLessThanOrEqual(measured.viewport);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ear-start")).toBeVisible();
  }

  // C9: no width runs out of the page, and axe finds nothing serious or critical.
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await start(page, { size, level: 3, length: 8 });
    await toPlay(page);
    await assertNoHorizontalOverflow(page);
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), `${size.width}`).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ear-start")).toBeVisible();
  }

  // C9: the keyboard order follows the screen: the top row, 聴く, 答える, 楽譜, the keys.
  await start(page, { size: { width: 1440, height: 900 }, level: 3, length: 8 });
  await toPlay(page);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("[data-testid='ear-run'] button, [data-testid='ear-run'] input, [data-testid='ear-run'] [tabindex]")]
      .filter((node) => !(node as HTMLButtonElement).disabled && node.getBoundingClientRect().width > 0)
      .map((node) => node.getAttribute("data-testid") ?? node.getAttribute("aria-label") ?? node.getAttribute("class") ?? ""));
  const firstOf = (id: string) => order.indexOf(id);
  expect(firstOf("ear-back")).toBeGreaterThanOrEqual(0);
  for (const id of ["ear-listen-chord", "ear-listen-pair", "ear-listen-lap", "ear-listen-bass", "ear-listen-spread"]) {
    expect(firstOf(id), id).toBeGreaterThan(firstOf("ear-back"));
  }
  expect(firstOf("ear-hint")).toBeGreaterThan(firstOf("ear-listen-spread"));
  expect(firstOf("ear-score-zoom")).toBeGreaterThan(firstOf("ear-hint"));
  expect(firstOf("ear-range-down")).toBeGreaterThan(firstOf("ear-score-zoom"));
  expect(firstOf("ear-range-up")).toBeGreaterThan(firstOf("ear-range-down"));
});

test("C10: the four questions of 腕試し can be played to the end", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.getByTestId("ear-open").click();
  await expect(page.getByTestId("ear-benchmark-start")).toBeVisible();
  await page.getByTestId("ear-benchmark-start").click();

  for (let question = 0; question < 4; question += 1) {
    await expect(page.getByTestId("ear-benchmark-step")).toContainText(`${question + 1} / 4`, { timeout: 30_000 });
    await toPlay(page);
    const count = await chordCount(page);
    for (let index = 0; index < count; index += 1) {
      const notes = await answerOf(page, index);
      await midi(page, notes, true, 10);
      if (index < count - 1) await expect(page.getByTestId(`ear-card-${index}`)).toHaveAttribute("data-done", "true", { timeout: 5000 });
      await midi(page, notes, false, 0);
    }
  }
  await expect(page.getByTestId("ear-benchmark-result")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ear-benchmark-table")).toBeVisible();
});

test("the photos: the listening face, the playing face and its judgements at 1440×900 and 1280×720", async ({ page }) => {
  test.setTimeout(300_000);
  const shoot = async (name: string) => {
    await page.screenshot({ path: `p89-generated/p23-23a/${name}.png` });
  };
  const state = async (name: string, size: { width: number; height: number }, run: (page: Page) => Promise<void>, mode = "midi") => {
    await start(page, { size, level: 3, length: 8, mode });
    await run(page);
    await shoot(`${name}-${size.width}x${size.height}`);
    await page.keyboard.press("Escape").catch(() => undefined);
  };

  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await state("listen", size, async () => undefined);
    await state("play-before", size, async (page) => { await toPlay(page); });
    await state("play-extra", size, async (page) => {
      await toPlay(page);
      const index = await cardIndex(page);
      const answer = await answerOf(page, index);
      await midi(page, [...answer, foreignPc(answer, answer[0]! + 1)], true, 10);
      await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });
    });
    await state("play-missing", size, async (page) => {
      await toPlay(page);
      const index = await cardIndex(page);
      const answer = await answerOf(page, index);
      await playWrong(page, missingShape(answer), /がありません/);
    });
    await state("play-tried", size, async (page) => {
      await toPlay(page);
      const index = await cardIndex(page);
      const answer = await answerOf(page, index);
      const a = foreignPc(answer, answer[0]! + 1);
      await midi(page, [...answer, a], true, 10);
      await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });
      await midi(page, [...answer, a], false, 0);
      await playWrong(page, missingShape(answer), /がありません/);
      await playWrong(page, [...answer, foreignPc(answer, a + 1)], /余分な音/);
    });
    await state("hint-1", size, async (page) => {
      await toPlay(page);
      await page.getByTestId("ear-hint").click();
    });
    await state("hint-2", size, async (page) => {
      await toPlay(page);
      await page.getByTestId("ear-hint").click();
      await page.keyboard.press("Space");
    });
    await state("no-midi", size, async (page) => {
      await toPlay(page);
    }, "no-midi");
  }

  // The photo of a wrong answer at the two smaller sizes.
  for (const size of [{ width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await state("play-extra", size, async (page) => {
      await toPlay(page);
      const index = await cardIndex(page);
      const answer = await answerOf(page, index);
      await midi(page, [...answer, foreignPc(answer, answer[0]! + 1)], true, 10);
      await expect(page.getByTestId("ear-feedback")).toContainText("余分な音", { timeout: 5000 });
    });
  }
});
