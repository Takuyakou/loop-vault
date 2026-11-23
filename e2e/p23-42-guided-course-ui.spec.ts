import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-42: the guided course screen states and layout. The store is seeded with public frozen-bank trials;
 * the product flow, clock, capture and saving are not replaced.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; prompt: "name" | "ear"; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const NOTE_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"];
const SUFFIX: Record<string, string> = { maj: "", min: "m", maj7: "maj7", min7: "m7", dom7: "7", min7b5: "m7♭5" };
const label = (entry: { root: number; quality: string }) => `${NOTE_NAMES[entry.root]}${SUFFIX[entry.quality]}`;
const sameDayNameIds = (level: number) => BANK.sets[String(level)]!.name.sameDay;
const sameDayIds = (level: number) => [...sameDayNameIds(level), ...(BANK.sets[String(level)]!.ear?.items ?? [])];
const delayIds = (level: number) => BANK.sets[String(level)]!.name.delay;
const AT = new Date().toISOString();
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
// P23-47: 60h and 40h can land on the same local calendar date, which made the delayed pass
// ineligible depending on the time of day. Keep a gap that always crosses a local date.
const OLDER = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

type Mode = "midi" | "self";
interface Store {
  schema: "loopvault-guided-course"; version: 1; bankVersion: string; policyVersion: string; pairId: string;
  trials: unknown[]; active?: { level: number; block: "sameDay" | "delay"; attemptId: string; startedAt: string; mode: Mode };
}

const base = { schema: "loopvault-guided-course" as const, version: 1 as const, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId };

function trial(level: number, block: "sameDay" | "delay", attemptId: string, id: string, result: "correct" | "wrong", at: string, mode: Mode = "midi") {
  const target = item(id);
  return {
    trialId: `${attemptId}:${id}`,
    attemptId,
    block,
    itemId: id,
    level,
    quality: target.quality,
    root: target.root,
    result,
    sealedNotes: result === "correct" ? target.referenceNotes : [],
    ...(result === "correct" ? { speedMs: 1200 } : {}),
    hintUsed: false,
    selfConfirmed: mode === "self",
    midiConfirmed: mode === "midi",
    startedAt: at,
    sealedAt: at,
  };
}

function attempt(level: number, block: "sameDay" | "delay", mode: Mode, id: string, at = AT) {
  return { level, block, attemptId: id, startedAt: at, mode };
}

function attemptTrials(level: number, block: "sameDay" | "delay", active: ReturnType<typeof attempt>, correct: boolean): unknown[] {
  const ids = block === "sameDay" ? sameDayIds(level) : delayIds(level);
  return ids.map((id) => trial(level, block, active.attemptId, id, correct ? "correct" : "wrong", active.startedAt, active.mode));
}

async function seedAndOpen(page: Page, store: Store | string, enter = true): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", typeof value === "string" ? value : JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...value }));
  }, store);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  if (enter && await page.getByTestId("course-map").count()) {
    await page.getByTestId("course-map-go").click();
  }
}

const fontPx = (page: Page, selector: string) => page.locator(selector).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

test("name and ear tasks: the header, the large task, the 2-choice and the hidden answer", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Name: the first frozen same-day name item.
  await seedAndOpen(page, { ...base, trials: [], active: attempt(1, "sameDay", "self", "ui-name") });
  const first = item(sameDayNameIds(1)[0]!);
  await expect(page.locator(".gc-head h1")).toHaveText("コード名から弾く");
  await expect(page.locator(".gc-kicker")).toContainText("ガイド練習");
  await expect(page.locator(".gc-kicker")).toContainText("Lv1");
  await expect(page.locator(".gc-sub")).toContainText("メジャーとマイナー");
  await expect(page.getByTestId("course-prompt-name")).toHaveText(label(first));
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 1 / 20");
  // The header does not repeat the chord name; the task is the one place it appears.
  await expect(page.locator(".gc-head")).not.toContainText(label(first));
  expect(await fontPx(page, ".gc-chord")).toBeGreaterThanOrEqual(48);
  expect((await page.getByTestId("course-prompt").boundingBox())!.height).toBeGreaterThanOrEqual(100);
  await expect(page.getByTestId("course-instruction")).toBeFocused();
  await expect(page.getByTestId("course-feedback-text")).toHaveText("演奏を待っています");
  await expect(page.getByTestId("course-next")).toBeDisabled();
  await expect(page.getByTestId("course-self-note")).toContainText("自己確認です。進級判定には含まれません");
  await expect(page.getByTestId("dojo-back")).toHaveCount(1);
  await expect(page.getByTestId("course-end")).toHaveCount(0);
  expect(await page.getByTestId("course-prompt").evaluate((element) => element.tagName)).toBe("SECTION");
  await expect(page.locator(".dojo-answer-swatch, [data-required], [data-answer]")).toHaveCount(0);
  await page.screenshot({ path: reportShot("p23-42-assets/name-1440.png") });

  await page.getByTestId("course-self-ok").click();
  await expect(page.getByTestId("course-feedback-text")).toContainText("弾けた（自己確認）");
  await expect(page.getByTestId("course-next")).toBeEnabled();
  await page.getByTestId("course-next").click();
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 2 / 20");

  // Ear: all name items answered, so the next question is the first ear item.
  const active = attempt(1, "sameDay", "self", "ui-ear");
  const nameTrials = sameDayNameIds(1).map((id) => trial(1, "sameDay", active.attemptId, id, "wrong", AT, "self"));
  await seedAndOpen(page, { ...base, trials: nameTrials, active });
  const ear = item(BANK.sets["1"]!.ear!.items[0]!);
  await expect(page.locator(".gc-head h1")).toHaveText("聴いて弾く");
  // P23-53 (mock ⑦): the root is on the chip under the sound disc; the instruction is one line.
  await expect(page.getByTestId("course-prompt-name")).toHaveText(`ルート（根音）は ${NOTE_NAMES[ear.root]}（配置は自由）`);
  await expect(page.getByTestId("course-ear-disc")).toBeVisible();
  await expect(page.getByTestId("course-instruction")).toHaveText("聴こえた和音を、そのまま弾く");
  await expect(page.getByTestId("course-feedback-text")).not.toHaveText("演奏を待っています");
  await expect.poll(async () => (await page.getByTestId("course-feedback-text").textContent()) ?? "").toMatch(/再生中|弾いてください/);
  await expect(page.getByTestId("course-prompt").getByTestId("course-hint")).toBeVisible();
  await expect(page.getByTestId("course-prompt")).toContainText("再試聴はヒントありになります");
  // P23-47-fix-4: the major/minor choice is gone; the played notes and bass decide the answer.
  await expect(page.getByTestId("course-choices")).toHaveCount(0);
  // Non-disclosure: no quality name or authored notes in the task before the answer.
  await expect(page.getByTestId("course-prompt")).not.toContainText(label(ear));
  await expect(page.getByTestId("course-prompt")).not.toContainText(ear.referenceNotes.join(" "));
  await page.screenshot({ path: reportShot("p23-42-assets/ear-1440.png") });
});

test("results: same-day fail/pass, the delayed wait, a formal level pass and Lv1–3 completion", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Same-day fail: one primary retry and one back, reasons folded away.
  const fail = attempt(1, "sameDay", "self", "ui-fail");
  await seedAndOpen(page, { ...base, trials: attemptTrials(1, "sameDay", fail, false), active: fail });
  await expect(page.getByTestId("course-result")).toHaveAttribute("data-ok", "false");
  await expect(page.locator(".gc-sheet h2")).toContainText("20問中 0問");
  await expect(page.getByTestId("course-retry")).toBeVisible();
  await expect(page.getByTestId("course-start-delay")).toHaveCount(0);
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
  await page.screenshot({ path: reportShot("p23-42-assets/result-fail-1440.png") });

  // Same-day pass: no delayed set on the same day; the result sheet shows the pass and next-day box.
  const pass = attempt(1, "sameDay", "midi", "ui-pass");
  await seedAndOpen(page, { ...base, trials: attemptTrials(1, "sameDay", pass, true), active: pass });
  await expect(page.getByTestId("course-result")).toHaveAttribute("data-ok", "true");
  await expect(page.locator(".gc-sheet h2")).toContainText("20問中 20問で合格");
  await expect(page.getByTestId("course-start-delay")).toHaveCount(0);
  await expect(page.getByTestId("course-result")).toContainText("別の日にもう一度");
  await expect(page.getByTestId("course-retry")).toHaveCount(0);
  await expect(page.getByTestId("course-back")).toHaveCount(1);
  await page.screenshot({ path: reportShot("p23-42-assets/result-pass-1440.png") });

  // Waiting (P23-52 rule 1): on the course map Lv1 is waiting (no go button), while Lv2 is now.
  await seedAndOpen(page, { ...base, trials: attemptTrials(1, "sameDay", pass, true) }, false);
  await expect(page.getByTestId("course-station-1")).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("course-station-2")).toHaveAttribute("data-state", "now");
  await page.getByTestId("course-station-1").click();
  await expect(page.getByTestId("course-map-detail")).toContainText("から別の日の確認ができます");
  await expect(page.getByTestId("course-map-go")).toHaveCount(0);
  await expect(page.getByTestId("course-self-ok")).toHaveCount(0);
  await page.screenshot({ path: reportShot("p23-42-assets/wait-1440.png") });

  // Delayed pass: a formal level pass, then the next level.
  const sameDay = attempt(1, "sameDay", "midi", "ui-formal-d", OLD);
  const delayed = attempt(1, "delay", "midi", "ui-formal-l", AT);
  await seedAndOpen(page, { ...base, trials: [...attemptTrials(1, "sameDay", sameDay, true), ...attemptTrials(1, "delay", delayed, true)], active: delayed });
  await expect(page.getByTestId("course-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("course-result")).toHaveAttribute("data-formal", "true");
  await expect(page.locator(".gc-sheet h2")).toContainText("10問中 10問で合格");
  await expect(page.getByTestId("course-next-level")).toBeVisible();
  await page.screenshot({ path: reportShot("p23-42-assets/result-formal-1440.png") });

  // All Lv1–3 passed: P23-45 hands over to Lv4, and the screen still says Lv1–3 is complete.
  const trials: unknown[] = [];
  for (const level of [1, 2, 3]) {
    const sd = attempt(level, "sameDay", "midi", `ui-fin-d-${level}`, OLDER);
    const dl = attempt(level, "delay", "midi", `ui-fin-l-${level}`, OLD);
    trials.push(...attemptTrials(level, "sameDay", sd, true), ...attemptTrials(level, "delay", dl, true));
  }
  await seedAndOpen(page, { ...base, trials });
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await expect(page.getByTestId("advanced-level")).toHaveText("Lv4");
  await page.getByTestId("advanced-demo-skip").click();
  await expect(page.getByTestId("advanced-start-panel")).toBeVisible();
  await expect(page.getByTestId("advanced-basics-done")).toContainText("Lv1〜3 は修了");
  await expect(page.locator(".gc-panel")).not.toContainText("全10");
});

test("unreadable course data stays readable as an error and is never reset automatically", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, "{damaged");
  await expect(page.getByTestId("course-unreadable")).toBeVisible();
  await expect(page.getByTestId("course-quarantine")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("loop-vault:guided-course-v1:data"))).toBe("{damaged");
  await page.screenshot({ path: reportShot("p23-42-assets/error-1440.png") });
});

test("narrow states: the ear task, the same-day result and the waiting screen at 768", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 640 });

  const earActive = attempt(1, "sameDay", "self", "ui-narrow-ear");
  const nameTrials = sameDayNameIds(1).map((id) => trial(1, "sameDay", earActive.attemptId, id, "wrong", AT, "self"));
  await seedAndOpen(page, { ...base, trials: nameTrials, active: earActive });
  await expect(page.getByTestId("course-choices")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: reportShot("p23-42-assets/ear-768.png"), fullPage: true });
  let axe = await new AxeBuilder({ page: page as never }).include('[data-testid="guided-course"]').analyze();
  expect(axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);

  const pass = attempt(1, "sameDay", "midi", "ui-narrow-pass");
  await seedAndOpen(page, { ...base, trials: attemptTrials(1, "sameDay", pass, true), active: pass });
  await expect(page.getByTestId("course-result")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: reportShot("p23-42-assets/result-pass-768.png"), fullPage: true });
  axe = await new AxeBuilder({ page: page as never }).include('[data-testid="guided-course"]').analyze();
  expect(axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);

  await seedAndOpen(page, { ...base, trials: attemptTrials(1, "sameDay", pass, true) }, false);
  await expect(page.getByTestId("course-station-1")).toHaveAttribute("data-state", "waiting");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: reportShot("p23-42-assets/wait-768.png"), fullPage: true });
  axe = await new AxeBuilder({ page: page as never }).include('[data-testid="guided-course"]').analyze();
  expect(axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
});

test("the four sizes: natural scrolling, no horizontal overflow, readable header and keyboard heading", async ({ page }) => {
  test.setTimeout(120_000);
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 960, height: 1032 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await seedAndOpen(page, { ...base, trials: [], active: attempt(1, "sameDay", "self", `ui-size-${size.width}`) });
    await assertNoHorizontalOverflow(page);
    await expect(page.locator(".gc-head h1")).toHaveText("コード名から弾く");
    await expect(page.locator(".gc-kicker")).toContainText("ガイド練習");
    await expect(page.getByTestId("course-prompt")).toBeVisible();
    await expect(page.getByTestId("course-next")).toBeVisible();
    await expect(page.getByTestId("dojo-back")).toBeVisible();
    // The screen starts with its header in view, even when the home card was below the fold.
    const headTop = await page.locator(".gc-head").evaluate((element) => element.getBoundingClientRect().top);
    expect(headTop).toBeGreaterThanOrEqual(0);
    const endTop = await page.getByTestId("dojo-back").evaluate((element) => element.getBoundingClientRect().top);
    expect(endTop).toBeGreaterThanOrEqual(0);
    // P23-49: the stage keyboard is 176px (132px in a window 760px high or less); see the stage's value table.
    const keyboard = (await page.locator(".gc-keyboard svg").boundingBox())!;
    expect(Math.round(keyboard.height), `${size.width}: stage keyboard height`).toBe(size.height <= 760 ? 132 : 176);
    const task = (await page.getByTestId("course-prompt").boundingBox())!;
    const region = keyboard;
    expect(Math.abs((task.x + task.width / 2) - (region.x + region.width / 2)), `${size.width}: keyboard centreline`).toBeLessThanOrEqual(1);
    expect(region.width, `${size.width}: keyboard is readable`).toBeGreaterThanOrEqual(450);
    // The keyboard heading wraps and does not overlap itself at 768.
    const heading = page.locator(".gc-keyboard-head");
    await expect(heading).toHaveCSS("flex-wrap", "wrap");
    const boxes = await heading.locator(":scope > *").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    for (let a = 0; a < boxes.length; a += 1) for (let b = a + 1; b < boxes.length; b += 1) {
      const overlap = boxes[a]!.left < boxes[b]!.right - 1 && boxes[b]!.left < boxes[a]!.right - 1 && boxes[a]!.top < boxes[b]!.bottom - 1 && boxes[b]!.top < boxes[a]!.bottom - 1;
      expect(overlap, `${size.width}: keyboard heading children overlap`).toBe(false);
    }
    const chord = await fontPx(page, ".gc-chord");
    if (size.width >= 1440) expect(chord).toBeGreaterThanOrEqual(48);
    else expect(chord).toBeGreaterThanOrEqual(36);
    const clipped = await page.locator('[data-testid="guided-course"] *').evaluateAll((elements) => elements
      .filter((element) => element.children.length === 0 && (element.textContent ?? "").trim().length > 0)
      .filter((element) => element.closest(".sr-only") === null)
      .filter((element) => element.scrollWidth > element.clientWidth + 2)
      .map((element) => ({ text: (element.textContent ?? "").slice(0, 40), className: element.className })));
    expect(clipped, `${size.width}: no clipped text`).toEqual([]);
    await page.screenshot({ path: reportShot(`p23-42-assets/name-${size.width}.png`), fullPage: true });
    const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="guided-course"]').analyze();
    expect(axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  }
});
