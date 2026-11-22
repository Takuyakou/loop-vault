import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo, type MidiControl } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-51: the wrong answer on the keyboard (mock ⑤), the five dots and the pause after each round of five
 * (mocks ③ ⑥), and the demo's comparison (mock ②). The values are the lead's (spec P23-51 §2).
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const lv1 = BANK.sets["1"]!.name.sameDay;
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
const AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

async function emit(page: Page, notes: number[]): Promise<void> {
  await page.evaluate((notes) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, true), notes);
  await page.waitForTimeout(300);
  await page.evaluate((notes) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, false), notes);
}

async function openFresh(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem("loop-vault:guided-course-v1:data");
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  });
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

/** The Lv1 answer at position `index` (0-based); the 3rd one (index 2) moves the third up or down a semitone. */
function lv1Answer(index: number): number[] {
  const target = item(lv1[index]!);
  if (index !== 2) return target.referenceNotes;
  return target.referenceNotes.map((note, at) => at === 1 ? note + (target.quality === "maj" ? -1 : 1) : note);
}

async function answer(page: Page, index: number): Promise<void> {
  await expect(page.getByTestId("course-progress")).toHaveText(`コード名 ${index + 1} / 20`);
  await page.waitForTimeout(250);
  await emit(page, lv1Answer(index));
  await expect(page.getByTestId("course-feedback-text")).toHaveAttribute("data-result", /correct|wrong|incomplete/);
}

test("the demo compares the four chords; the changed note is marked", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFresh(page);
  const cards = page.locator(".gc-cmp");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("course-demo-name")).toHaveText("C");
  // C and F start a pair (no mark); Cm and Fm mark the lowered third.
  await expect(cards.nth(0).locator("u")).toHaveCount(0);
  await expect(cards.nth(1).locator("u")).toHaveCount(1);
  await expect(cards.nth(2).locator("u")).toHaveCount(0);
  await expect(cards.nth(3).locator("u")).toHaveCount(1);
  await cards.nth(2).click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("F");
  await expect(page.getByTestId("course-progress")).toHaveText("見本 3 / 4");
  await captureReportShot(page, "p23-51-assets/demo-1440.png");
  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page);
  expect(await page.getByTestId("course-demo-notes").evaluate((element) => element.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(await page.locator(".gc-keyboard-head").evaluate((element) => element.getBoundingClientRect().top));
  await captureReportShot(page, "p23-51-assets/demo-768.png");
});

test("Lv1: a wrong note is shown on the keyboard, five dots, and the pause after five", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFresh(page);
  await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await expect(page.getByTestId("course-round")).toHaveAttribute("data-round", "1");
  await expect(page.locator('[data-testid="course-round"] [data-dot]')).toHaveCount(5);
  await expect(page.locator('[data-testid="course-round"] [data-dot="now"]')).toHaveCount(1);

  for (let index = 0; index < 5; index += 1) {
    await answer(page, index);
    if (index === 2) {
      const target = item(lv1[2]!);
      await expect(page.getByTestId("course-feedback-text")).toHaveAttribute("data-result", "wrong");
      await expect(page.getByTestId("course-feedback-detail")).toContainText("の代わりに");
      await expect(page.getByTestId("course-why")).toContainText("点線の輪が足りない音です。");
      await expect(page.getByTestId("course-marks-legend")).toContainText("合っていた音");
      await expect(page.locator('[data-result-mark="hit"]')).toHaveCount(target.referenceNotes.length - 1);
      await expect(page.locator('[data-result-mark="wrong"]')).toHaveCount(1);
      await expect(page.locator('[data-result-mark="miss"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="course-round"] [data-dot="bad"]')).toHaveCount(1);
      await captureReportShot(page, "p23-51-assets/wrong-1440.png");
      await page.setViewportSize({ width: 768, height: 640 });
      await page.waitForTimeout(350);
      await assertNoHorizontalOverflow(page);
      expect(await page.getByTestId("course-why").evaluate((element) => element.getBoundingClientRect().bottom))
        .toBeLessThanOrEqual(await page.getByTestId("course-marks-legend").evaluate((element) => element.getBoundingClientRect().top) + 1);
      await captureReportShot(page, "p23-51-assets/wrong-768.png");
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.getByTestId("course-next").click();
  }

  await expect(page.getByTestId("course-break")).toBeVisible();
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "break");
  await expect(page.getByTestId("course-break-score")).toContainText("5問中 4問 正解");
  await expect(page.getByTestId("course-break-score")).toContainText("ここまで 5問中 4問");
  await expect(page.locator(".gc-marker")).toHaveCount(1);
  await expect(page.getByTestId("course-break-next")).toHaveText("次の 5問へ");
  await expect(page.getByTestId("course-break-next")).toBeFocused();
  await captureReportShot(page, "p23-51-assets/break-1440.png");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 6 / 20");
  await expect(page.getByTestId("course-round")).toHaveAttribute("data-round", "2");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!));
  expect(stored.trials).toHaveLength(5);
});

test("ここでやめる leaves after the pause; the five answers are kept", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFresh(page);
  await page.getByTestId("course-demo-skip").click();
  for (let index = 0; index < 5; index += 1) {
    await answer(page, index);
    await page.getByTestId("course-next").click();
  }
  await expect(page.getByTestId("course-break")).toContainText("やめても、次は区切り 2 から始まります");
  await page.getByTestId("course-break-stop").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!));
  expect(stored.trials).toHaveLength(5);
});

function completedBasicStore() {
  const trials = [];
  for (const level of [1, 2, 3]) {
    const sets = BANK.sets[String(level)]!;
    for (const [ids, block, at] of [[[...sets.name.sameDay, ...(sets.ear?.items ?? [])], "sameDay", OLD], [sets.name.delay, "delay", AT]] as const) {
      const attemptId = `basic-${level}-${block}`;
      for (const id of ids) {
        const entry = item(id);
        trials.push({
          trialId: `${attemptId}:${id}`, attemptId, block, itemId: id, level,
          quality: entry.quality, root: entry.root, result: "correct", sealedNotes: entry.referenceNotes,
          speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: at, sealedAt: at,
        });
      }
    }
  }
  return {
    app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1,
    bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials,
  };
}

test("Lv4: marks on the wrong chord and the pause after five", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((basic) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(basic));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, completedBasicStore());
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await page.getByTestId("advanced-demo-skip").click();
  await page.getByTestId("advanced-start").click();
  for (let index = 0; index < 5; index += 1) {
    await expect(page.getByTestId("advanced-progress")).toHaveText(`${index + 1} / 20`);
    await page.waitForTimeout(250);
    // C♯·D·E♭ is no Lv4 chord: every answer is wrong.
    await emit(page, [61, 62, 63]);
    await expect(page.getByTestId("advanced-feedback-text")).toHaveAttribute("data-result", "wrong");
    if (index === 0) {
      await expect(page.locator('[data-result-mark="wrong"]')).toHaveCount(3);
      // The line has height 0 on purpose (it never pushes the keyboard), so Playwright calls it hidden; check its text.
      await expect(page.getByTestId("advanced-why")).toHaveCount(1);
      await expect(page.getByTestId("advanced-why")).toContainText("C/E は");
      await captureReportShot(page, "p23-51-assets/lv4-wrong-1440.png");
    }
    await page.getByTestId("advanced-next").click();
  }
  await expect(page.getByTestId("course-break")).toBeVisible();
  await expect(page.getByTestId("course-break-score")).toContainText("5問中 0問 正解");
  await captureReportShot(page, "p23-51-assets/lv4-break-1440.png");
  await page.getByTestId("course-break-next").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("6 / 20");
});
