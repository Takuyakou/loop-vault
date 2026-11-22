import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo, type MidiControl } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-49: the guide-course "stage" for the basic Lv1–3 demo and question screens. The measurements are the
 * lead's value table; the photos are the eleven mock states plus three unchanged screens.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; prompt: "name" | "ear"; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const sameDayNameIds = (level: number) => BANK.sets[String(level)]!.name.sameDay;
const AT = new Date().toISOString();
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();

const emit = (page: Page, notes: number[], on = true) =>
  page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, on), { notes, on });

async function play(page: Page, notes: number[]): Promise<void> {
  await emit(page, notes, true);
  await page.waitForTimeout(300);
  await emit(page, notes, false);
  await page.waitForTimeout(200);
}

async function openStage(page: Page, mode: "midi" | "no-midi" = "midi"): Promise<void> {
  await openDojo(page, mode);
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

async function skipDemo(page: Page): Promise<void> {
  await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
}

const box = (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});

test("the demo and the question are a stage, and a key press sounds once", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStage(page);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "demo");
  await expect(page.getByTestId("course-demo-notes")).toHaveText("C3 · E3 · G3");
  await captureReportShot(page, "p23-49-assets/demo-1440.png");

  await skipDemo(page);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "question");
  await expect(page.getByTestId("course-midi")).toHaveCount(0);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 1 / 20");
  await captureReportShot(page, "p23-49-assets/q-wait-1440.png");

  // The stage's on/off setting is a real checkbox with the switch's size.
  const auto = page.getByTestId("course-auto-advance");
  await expect(auto).toHaveAttribute("type", "checkbox");
  const autoBox = await box(page, '[data-testid="course-auto-advance"]');
  expect(Math.round(autoBox.width)).toBe(38);
  expect(Math.round(autoBox.height)).toBe(22);
  await auto.check();
  await expect(auto).toBeChecked();
  await auto.uncheck();
  await expect(auto).not.toBeChecked();

  const waitingTop = (await box(page, ".gc-keyboard svg")).y;

  // Wrong: raise the third of the first item.
  const first = item(sameDayNameIds(1)[0]!);
  const wrong = first.referenceNotes.map((note, index) => index === 1 ? note + 1 : note);
  await play(page, wrong);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "wrong");
  expect(Math.abs((await box(page, ".gc-keyboard svg")).y - waitingTop)).toBeLessThanOrEqual(1);
  await captureReportShot(page, "p23-49-assets/q-wrong-1440.png");

  // Next question, answered correctly.
  await page.getByTestId("course-next").click();
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 2 / 20");
  await expect(page.getByTestId("guided-course")).not.toHaveAttribute("data-result", "wrong");
  const second = item(sameDayNameIds(1)[1]!);
  await play(page, second.referenceNotes);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "correct");
  expect(Math.abs((await box(page, ".gc-keyboard svg")).y - waitingTop)).toBeLessThanOrEqual(1);
  await captureReportShot(page, "p23-49-assets/q-correct-1440.png");
});

for (const size of [
  { width: 1440, height: 900, head: 60, name: 112, widthPx: 1088, heightPx: 176, bottom: 76 },
  { width: 1366, height: 768, head: 60, name: 112, widthPx: 1014, heightPx: 176, bottom: 76 },
  { width: 1280, height: 720, head: 52, name: 84, widthPx: 928, heightPx: 132, bottom: 64 },
  { width: 1024, height: 768, head: 60, name: 112, widthPx: 840, heightPx: 176, bottom: 76 },
  { width: 768, height: 640, head: 88, name: 72, widthPx: 672, heightPx: 132, bottom: 64 },
] as const) {
  test(`the stage keeps the value table at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    await openStage(page);
    await skipDemo(page);
    await assertNoHorizontalOverflow(page);
    const head = await box(page, ".gc-head");
    expect(Math.round(head.height), "top bar").toBe(size.head);
    const name = await page.getByTestId("course-prompt-name").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(Math.round(name), "chord name").toBe(size.name);
    const svg = await box(page, ".gc-keyboard svg");
    expect(Math.round(svg.width), "keyboard width").toBe(size.widthPx);
    expect(Math.round(svg.height), "keyboard height").toBe(size.heightPx);
    const bottom = await box(page, ".gc-card-bottom");
    expect(Math.round(bottom.height), "action row").toBe(size.bottom);
    const scroll = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, inner: window.innerHeight }));
    if (size.width !== 768) expect(Math.abs(scroll.height - scroll.inner), "no vertical movement").toBeLessThanOrEqual(1);
  });
}

test("1280: the waiting and wrong states keep the stage", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStage(page);
  await skipDemo(page);
  await captureReportShot(page, "p23-49-assets/q-wait-1280.png");
  const first = item(sameDayNameIds(1)[0]!);
  await play(page, first.referenceNotes.map((note, index) => index === 1 ? note + 1 : note));
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "wrong");
  await captureReportShot(page, "p23-49-assets/q-wrong-1280.png");
});

test("1024: the waiting state keeps the 1440 shape", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await openStage(page);
  await skipDemo(page);
  await captureReportShot(page, "p23-49-assets/q-wait-1024.png");
});

test("768: the demo and the wrong state stack the top bar in two rows", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 640 });
  await openStage(page);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "demo");
  await captureReportShot(page, "p23-49-assets/demo-768.png");
  await skipDemo(page);
  const first = item(sameDayNameIds(1)[0]!);
  await play(page, first.referenceNotes.map((note, index) => index === 1 ? note + 1 : note));
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-result", "wrong");
  await captureReportShot(page, "p23-49-assets/q-wrong-768.png");
});

test("without MIDI the self choices sit in the action row", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStage(page, "no-midi");
  await skipDemo(page);
  await expect(page.getByTestId("course-self-ok")).toBeVisible();
  await expect(page.getByTestId("course-self-miss")).toBeVisible();
  await captureReportShot(page, "p23-49-assets/q-self-1440.png");
});

test("the ear question keeps its two choices and the smaller root label", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const active = { level: 1, block: "sameDay" as const, attemptId: "p2349-ear", startedAt: AT, mode: "self" as const };
  const trials = sameDayNameIds(1).map((id) => {
    const target = item(id);
    return {
      trialId: `${active.attemptId}:${id}`, attemptId: active.attemptId, block: "sameDay", itemId: id, level: 1,
      quality: target.quality, root: target.root, result: "correct", sealedNotes: target.referenceNotes,
      speedMs: 1200, hintUsed: false, selfConfirmed: true, midiConfirmed: false, startedAt: AT, sealedAt: AT,
    };
  });
  await page.addInitScript((store) => localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...store })), {
    schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId,
    trials, active,
  });
  await openStage(page);
  await expect(page.getByTestId("course-prompt")).toContainText("一番低い音は");
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "question");
  await captureReportShot(page, "p23-49-assets/ear-1440.png");
});

test("the unchanged advanced question, practice and result keep their old shape", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const trials: unknown[] = [];
  for (const level of [1, 2, 3]) {
    for (const [ids, block, at] of [[[...BANK.sets[String(level)]!.name.sameDay, ...(BANK.sets[String(level)]!.ear?.items ?? [])], "sameDay", OLD], [BANK.sets[String(level)]!.name.delay, "delay", AT]] as const) {
      const attemptId = `p2349-basic-${level}-${block}`;
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
  await page.addInitScript((store) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...store }));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, { schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials });
  await openStage(page);
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await page.getByTestId("advanced-demo-skip").click();
  await page.getByTestId("advanced-start").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  await captureReportShot(page, "p23-49-assets/lv4-question-1440.png");

  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-station-5").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  await page.getByTestId("advanced-material-lv5-prac-major-ii-v-i").click();
  await expect(page.getByTestId("advanced-practice-demo")).toBeVisible();
  await captureReportShot(page, "p23-49-assets/lv5-practice-1440.png");
});

test("the unchanged same-day result screen at 1440", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const active = { level: 1, block: "sameDay" as const, attemptId: "p2349-result", startedAt: AT, mode: "midi" as const };
  const ids = [...sameDayNameIds(1), ...(BANK.sets["1"]!.ear?.items ?? [])];
  const trials = ids.map((id) => {
    const target = item(id);
    return {
      trialId: `${active.attemptId}:${id}`, attemptId: active.attemptId, block: "sameDay", itemId: id, level: 1,
      quality: target.quality, root: target.root, result: "wrong", sealedNotes: [], hintUsed: false,
      selfConfirmed: false, midiConfirmed: true, startedAt: AT, sealedAt: AT,
    };
  });
  await page.addInitScript((store) => localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify({ app: "loopvault-guided-course", fileVersion: 1, ...store })), {
    schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId,
    trials, active,
  });
  await openStage(page);
  await expect(page.getByTestId("course-result")).toBeVisible();
  await captureReportShot(page, "p23-49-assets/result-1440.png");
});
