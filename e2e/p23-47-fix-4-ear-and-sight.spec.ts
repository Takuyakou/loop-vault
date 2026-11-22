import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openDojo, type MidiControl } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-47-fix-4: the Lv1 ear question is decided by the played notes and bass (no major/minor choice),
 * the answer heading becomes the audition card, replays pause judging, and the capstone sight chart can be
 * practised without MIDI without recording anything.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; prompt: "name" | "ear"; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-19T00:00:00.000Z";
// The advanced items are copied here as pitch-class answers: the product modules import a JSON that Playwright's
// Node loader refuses without an import attribute, and the judge only needs the required pitch classes.
const LV7_IDS = Array.from({ length: 10 }, (_, index) => `lv7-sd-${String(index + 1).padStart(2, "0")}`);
const CAP_NAME_IDS = Array.from({ length: 24 }, (_, index) => `cap-name-${String(index + 1).padStart(2, "0")}`);
const CAP_PROG_IDS = Array.from({ length: 5 }, (_, index) => `cap-prog-${String(index + 1).padStart(2, "0")}`);
const CAP_SIGHT_IDS = Array.from({ length: 3 }, (_, index) => `cap-sight-${String(index + 1).padStart(2, "0")}`);
const LV7_FIRST = [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]]; // C G Am F (i-v-vi-iv in C)
const CAP_PROG_FIRST = [[54, 58, 61], [61, 65, 68], [63, 66, 70], [59, 63, 66]]; // F# C# D#m B
const SIGHT_FIRST = [
  [60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65],
  [60, 64, 67, 71], [52, 56, 59, 62], [53, 57, 60, 64], [55, 59, 62],
];

const emit = (page: Page, notes: number[], on = true) =>
  page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, on), { notes, on });
const disconnect = (page: Page) =>
  page.evaluate(async () => { await (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.disconnect(); });
const connect = (page: Page) =>
  page.evaluate(async () => { await (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.connect(); });

async function play(page: Page, notes: number[]): Promise<void> {
  await emit(page, notes, true);
  await page.waitForTimeout(350);
  await emit(page, notes, false);
  await page.waitForTimeout(250);
}

async function playSequence(page: Page, chords: readonly { referenceNotes: readonly number[] }[], holdMs = 700): Promise<void> {
  for (const chord of chords) {
    await emit(page, [...chord.referenceNotes], true);
    await page.waitForTimeout(holdMs);
    await emit(page, [...chord.referenceNotes], false);
    await page.waitForTimeout(150);
  }
}

function seededNameTrials(level: number, attemptId: string): unknown[] {
  return BANK.sets[String(level)]!.name.sameDay.map((id) => {
    const target = item(id);
    return {
      trialId: `${attemptId}:${id}`, attemptId, block: "sameDay", itemId: id, level,
      quality: target.quality, root: target.root, result: "correct", sealedNotes: target.referenceNotes,
      speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: AT, sealedAt: AT,
    };
  });
}

async function openEarReady(page: Page, level: 1 | 2, priorLevels: readonly number[] = []): Promise<void> {
  const attemptId = `e-ear-${level}`;
  const active = { level, block: "sameDay" as const, attemptId, startedAt: AT, mode: "midi" as const };
  await seed(page, { ...basicStore([...completedBasicTrials(priorLevels), ...seededNameTrials(level, attemptId)]), active });
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  await waitEarReady(page);
}

async function waitEarReady(page: Page): Promise<void> {
  await expect.poll(async () => (await page.getByTestId("course-feedback-text").textContent()) ?? "", { timeout: 15_000 }).toContain("弾いてください");
}

function basicStore(trials: unknown[]) {
  return { schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials };
}

function completedBasicTrials(levels: readonly number[] = [1, 2, 3]): unknown[] {
  const trials: unknown[] = [];
  for (const level of levels) {
    for (const [ids, block, at] of [[[...BANK.sets[String(level)]!.name.sameDay, ...(BANK.sets[String(level)]!.ear?.items ?? [])], "sameDay", OLD], [BANK.sets[String(level)]!.name.delay, "delay", AT]] as const) {
      const attemptId = `e-${level}-${block}`;
      for (const id of ids) {
        const target = item(id);
        trials.push({
          trialId: `${attemptId}:${id}`, attemptId, block, itemId: id, level,
          quality: target.quality, root: target.root, result: "correct", sealedNotes: target.referenceNotes,
          speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: at, sealedAt: at,
        });
      }
    }
  }
  return trials;
}

function advancedStore(attempt: { level: string | number; block: "sameDay" | "delay"; setId: string; attemptId: string; startedAt: string; mode: "midi"; practice: boolean; itemIds: readonly string[] }, trials: unknown[] = []) {
  return { schema: "loopvault-guided-course-advanced", version: 1, bankVersion: "p23-45.advanced.v1", attempts: [attempt], active: attempt.attemptId, trials };
}

function advancedTrial(attempt: { attemptId: string; block: "sameDay" | "delay"; level: string }, itemId: string): unknown {
  return {
    trialId: `${attempt.attemptId}:${itemId}`, attemptId: attempt.attemptId, block: attempt.block, setId: attempt.block,
    itemId, level: attempt.level, result: "correct", steps: [], sealedNotes: [],
    speedMs: 1200, hintUsed: false, selfConfirmed: false, midiConfirmed: true, practice: false, startedAt: OLD, sealedAt: OLD,
  };
}

async function seed(page: Page, basic: unknown, advanced?: unknown): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...(payload.basic as object) }));
    if (payload.advanced === undefined) localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
    else localStorage.setItem("loop-vault:guided-course-advanced-v1:data", JSON.stringify({ app: "loopvault-guided-course-advanced", fileVersion: 1, ...(payload.advanced as object) }));
  }, { basic, advanced });
}

const courseValue = (page: Page) => page.evaluate(() => localStorage.getItem("loop-vault:guided-course-v1:data"));
const advancedValue = (page: Page) => page.evaluate(() => localStorage.getItem("loop-vault:guided-course-advanced-v1:data"));
const trialCount = (raw: string | null) => raw === null ? 0 : (JSON.parse(raw) as { trials: unknown[] }).trials.length;

test("E1/E2: the wrong bass and a missing tone give the reason, then the heading is the answer card", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEarReady(page, 1);
  const ear = item("lv1-e-132");
  await captureReportShot(page, "p23-47-fix-4-assets/ear-q-1440.png");

  // E1: A♭ in the bass.
  await play(page, [56, 60, 65]);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "wrong");
  await expect(page.getByTestId("course-feedback-detail")).toHaveText("一番下の音が A♭ です（F を指定）");
  await expect(page.getByTestId("course-chord-card")).toBeVisible();
  await expect(page.getByTestId("course-prompt-name")).toHaveText("Fm");
  await expect(page.getByTestId("course-example-label")).toContainText("一番低い音はF。上の音は別の配置でも弾けます");
  await captureReportShot(page, "p23-47-fix-4-assets/ear-wrong-1440.png");
  void ear;

  // E2: the third is missing.
  await page.getByTestId("course-next").click();
  await waitEarReady(page);
  await play(page, [57, 64]);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "wrong");
  await expect(page.getByTestId("course-feedback-detail")).toContainText("D♭ がありません");
});

test("E1 at 768: the ear question and the answer card", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 768, height: 640 });
  await openEarReady(page, 1);
  await captureReportShot(page, "p23-47-fix-4-assets/ear-q-768.png", { fullPage: true });
  await play(page, [56, 60, 65]);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "wrong");
  await expect(page.getByTestId("course-chord-card")).toBeVisible();
  await captureReportShot(page, "p23-47-fix-4-assets/ear-wrong-768.png", { fullPage: true });
});

test("E3/E4: a replay is not judged; the next answer needs no hint", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEarReady(page, 1);
  const first = item("lv1-e-132");
  // E3: start a replay, then play the right notes while it is still sounding.
  await page.getByTestId("course-hint").click();
  await expect(page.getByTestId("course-feedback-text")).toContainText("再生中");
  await emit(page, first.referenceNotes, true);
  await page.waitForTimeout(400);
  await emit(page, first.referenceNotes, false);
  await expect(page.getByTestId("course-feedback-text")).not.toContainText("入力がありませんでした");
  await expect(page.getByTestId("guided-course")).not.toHaveAttribute("data-result", "correct");
  await waitEarReady(page);
  await play(page, first.referenceNotes);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "correct");
  await expect(page.getByTestId("course-hint-note")).toBeVisible();

  // E4: the next question is answered from the first presentation, without a hint.
  await page.getByTestId("course-next").click();
  await waitEarReady(page);
  const second = item(BANK.sets["1"]!.ear!.items[1]!);
  await play(page, second.referenceNotes);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "correct");
  await expect(page.getByTestId("course-hint-note")).toHaveCount(0);
});

test("E5: Lv2 ear is saved as a hint-free correct trial", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEarReady(page, 2, [1]);
  await expect(page.locator(".gc-kicker")).toContainText("Lv2");
  await play(page, item("lv2-e-139").referenceNotes);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "correct");
  await expect.poll(async () => {
    const raw = await courseValue(page);
    if (raw === null) return false;
    return JSON.parse(raw).trials.some((trial: { itemId: string; result: string; hintUsed: boolean }) => trial.itemId === "lv2-e-139" && trial.result === "correct" && trial.hintUsed === false);
  }).toBe(true);
});

async function replayOnEar(page: Page, feedback: string): Promise<void> {
  await expect(page.getByTestId(feedback)).not.toContainText("標準の提示");
  await page.waitForTimeout(7_800);
  await page.getByTestId("advanced-listen").click();
  let sawPlaying = false;
  for (let i = 0; i < 24; i += 1) {
    const text = (await page.getByTestId(feedback).textContent()) ?? "";
    expect(text).not.toContain("入力がありませんでした");
    if (text.includes("再生中・終わったら弾いてください")) sawPlaying = true;
    await page.waitForTimeout(250);
  }
  expect(sawPlaying).toBe(true);
}

test("E6: Lv7 replay does not time out and the answer can follow", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const attempt = { level: 7, block: "sameDay" as const, setId: "sameDay", attemptId: "e-lv7", startedAt: OLD, mode: "midi" as const, practice: false, itemIds: LV7_IDS };
  await seed(page, basicStore(completedBasicTrials()), advancedStore(attempt));
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await connect(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  await replayOnEar(page, "advanced-feedback-text");
  await expect.poll(async () => (await page.getByTestId("advanced-feedback-text").textContent()) ?? "", { timeout: 20_000 }).not.toContain("再生中");
  await playSequence(page, LV7_FIRST.map((notes) => ({ referenceNotes: notes })));
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("正解", { timeout: 10_000 });
});

test("E7: the capstone ear replay does not time out and the answer can follow", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const attempt = { level: "capstone", block: "sameDay" as const, setId: "sameDay", attemptId: "e-cap-ear", startedAt: OLD, mode: "midi" as const, practice: false, itemIds: [...CAP_NAME_IDS, ...CAP_PROG_IDS] };
  const trials = CAP_NAME_IDS.map((id) => advancedTrial(attempt, id));
  await seed(page, basicStore(completedBasicTrials()), advancedStore(attempt, trials));
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await connect(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  await replayOnEar(page, "advanced-feedback-text");
  await expect.poll(async () => (await page.getByTestId("advanced-feedback-text").textContent()) ?? "", { timeout: 20_000 }).not.toContain("再生中");
  await playSequence(page, CAP_PROG_FIRST.map((notes) => ({ referenceNotes: notes })));
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("正解", { timeout: 10_000 });
});

function sightAttempt() {
  return { level: "capstone", block: "sameDay" as const, setId: "sameDay", attemptId: "e-sight", startedAt: OLD, mode: "midi" as const, practice: false, itemIds: CAP_SIGHT_IDS };
}

async function holdBars(page: Page, chords: readonly (readonly number[])[], bars: number, beatMs: number, onBar?: (index: number) => Promise<void>): Promise<void> {
  for (let index = 0; index < bars; index += 1) {
    if (onBar !== undefined) await onBar(index);
    const chord = chords[index % chords.length]!;
    await emit(page, [...chord], true);
    await page.waitForTimeout(beatMs * 4);
    await emit(page, [...chord], false);
  }
}

test("E8: a connected sight run is judged and records one trial", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sight = sightAttempt();
  await seed(page, basicStore(completedBasicTrials()), advancedStore(sight));
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await connect(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-sight-chart")).toBeVisible();
  const before = trialCount(await advancedValue(page));
  await page.getByTestId("advanced-sight-tempo").selectOption("100");
  await page.getByTestId("advanced-sight-start").click();
  // Count-in (4 beats) then the eight bars; the chord is held across each bar.
  await page.waitForTimeout(600 * 4);
  await holdBars(page, SIGHT_FIRST, 8, 600);
  await expect(page.getByTestId("advanced-feedback-text")).not.toContainText("8小節の拍を確認しました", { timeout: 15_000 });
  await expect.poll(async () => trialCount(await advancedValue(page)), { timeout: 15_000 }).toBe(before + 1);
});

test("E9: a disconnect mid-run asks to restart and records nothing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sight = sightAttempt();
  await seed(page, basicStore(completedBasicTrials()), advancedStore(sight));
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await connect(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-sight-chart")).toBeVisible();
  const before = trialCount(await advancedValue(page));
  await page.getByTestId("advanced-sight-tempo").selectOption("100");
  await page.getByTestId("advanced-sight-start").click();
  await page.waitForTimeout(600 * 4);
  await holdBars(page, SIGHT_FIRST, 3, 600);
  await disconnect(page);
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("記録していません");
  await expect(page.getByTestId("advanced-sight-retry")).toBeVisible();
  expect(trialCount(await advancedValue(page))).toBe(before);
});

test("E10: an unconnected beat practice stays practice when MIDI connects mid-run", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sight = sightAttempt();
  await seed(page, basicStore(completedBasicTrials()), advancedStore(sight));
  await page.goto("/?p12=no-midi");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-sight-chart")).toBeVisible();
  const before = trialCount(await advancedValue(page));
  await expect(page.getByTestId("advanced-sight-start")).toHaveText("拍の練習を始める");
  await page.getByTestId("advanced-sight-tempo").selectOption("100");
  await page.getByTestId("advanced-sight-start").click();
  await page.waitForTimeout(600 * 4);
  await holdBars(page, SIGHT_FIRST, 2, 600);
  await connect(page);
  await holdBars(page, SIGHT_FIRST.slice(2), 6, 600);
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("8小節の拍を確認しました", { timeout: 15_000 });
  await expect(page.getByTestId("advanced-sight-summary")).toHaveCount(0);
  expect(trialCount(await advancedValue(page))).toBe(before);
});
