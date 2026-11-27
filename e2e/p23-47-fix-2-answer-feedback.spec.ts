import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp, assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-47-fix-2: Lv1 triads ask for the fifth, the correct answer stays on the keyboard, Enter advances
 * once, auto-advance waits for the release, and the result can replay only the wrong items.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";
const ASSETS = reportShot("p23-47-fix-2-assets");

const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const nameIds = BANK.sets["1"]!.name.sameDay;
const earIds = BANK.sets["1"]!.ear!.items;

function trial(attemptId: string, id: string, result: "correct" | "wrong", hintUsed = false) {
  const target = item(id);
  return {
    trialId: `${attemptId}:${id}:${result}:${hintUsed}`, attemptId, block: "sameDay", itemId: id, level: 1,
    quality: target.quality, root: target.root, result, sealedNotes: target.referenceNotes,
    speedMs: 1000, hintUsed, selfConfirmed: false, midiConfirmed: true, startedAt: AT, sealedAt: AT,
  };
}

function storeWithProgress(answered = 4) {
  const attempt = { level: 1, block: "sameDay", attemptId: "p472-lv1", startedAt: AT, mode: "midi" as const };
  const trials = nameIds.slice(0, answered).map((id) => trial(attempt.attemptId, id, "correct"));
  return {
    app: "loopvault-guided-course", fileVersion: 1,
    schema: "loopvault-guided-course", version: 1,
    bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId,
    trials, active: attempt,
  };
}

function completedBasicStore() {
  const trials = [];
  for (const level of [1, 2, 3]) {
    const sets = BANK.sets[String(level)]!;
    const sameIds = [...sets.name.sameDay, ...(sets.ear?.items ?? [])];
    for (const [ids, block, at] of [[sameIds, "sameDay", OLD], [sets.name.delay, "delay", AT]] as const) {
      const attemptId = `basic-${level}-${block}`;
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
  return { app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials };
}

function resultStore() {
  const attempt = { level: 1, block: "sameDay", attemptId: "p472-result", startedAt: AT, mode: "midi" as const };
  const wrong = new Set([nameIds[0]!, nameIds[9]!, nameIds[19]!]);
  const trials = [
    ...nameIds.map((id) => trial(attempt.attemptId, id, wrong.has(id) ? "wrong" : "correct")),
    ...earIds.map((id) => trial(attempt.attemptId, id, "correct")),
  ];
  return {
    app: "loopvault-guided-course", fileVersion: 1,
    schema: "loopvault-guided-course", version: 1,
    bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId,
    trials,
  };
}

async function seed(page: Page, store: unknown): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(payload));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, store);
}

async function openGuide(page: Page, enter = true): Promise<void> {
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  if (enter) await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

const midi = (page: Page, notes: number[], on = true) =>
  page.evaluate(({ notes, on }) => (window as unknown as { __p12Midi: { emit: (n: number[], on: boolean, spread?: number) => void } }).__p12Midi.emit(notes, on, 10), { notes, on });

test("P23-47-fix-2 Lv1 Am: A-C is not enough, A-C-E is correct, the example stays and Enter advances once", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, storeWithProgress(4));
  await openDojo(page, "midi");
  await openGuide(page);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await expect(page.getByTestId("course-prompt-name")).toHaveText("Am");
  await page.screenshot({ path: `${ASSETS}/lv1-question-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv1-question-768.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // A and C only: the answer is incomplete and names the missing fifth.
  await midi(page, [57, 60], true);
  await page.waitForTimeout(1600);
  await midi(page, [57, 60], false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("不正解");
  await expect(page.getByTestId("course-feedback-detail")).toContainText("E");
  await expect(page.getByTestId("course-example-notes")).toBeVisible();

  // Retry on a fresh load (the init seed restores the same 5/20 position): hold A and C, add E
  // during capture, then release.
  await page.reload();
  await openDojo(page, "midi");
  await openGuide(page);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await expect(page.getByTestId("course-prompt-name")).toHaveText("Am");
  await midi(page, [57, 60], true);
  await page.waitForTimeout(300);
  await midi(page, [64], true);
  await page.waitForTimeout(200);
  await midi(page, [57, 60, 64], false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("正解");
  await expect(page.getByTestId("course-feedback-detail")).toHaveCount(0);
  await expect(page.getByTestId("course-example-notes")).toHaveText("C4 · E4 · A4");
  await expect(page.getByTestId("course-instruction")).toHaveText("鍵盤で正解の一例を確認できます");
  await page.screenshot({ path: `${ASSETS}/lv1-correct-1440.png`, fullPage: true });
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("course-break")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 6 / 20");
  await page.waitForTimeout(250);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 6 / 20");

  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv1-correct-768.png`, fullPage: true });
});

test("P23-47-fix-2 the restart dialog uses the amber confirm and Enter/Tab follow the focus", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, storeWithProgress(4));
  await openDojo(page, "no-midi");
  await openGuide(page);
  await page.getByTestId("course-restart").click();
  await expect(page.getByTestId("level-restart-cancel")).toBeFocused();
  const style = await page.evaluate(() => {
    const confirm = getComputedStyle(document.querySelector('[data-testid="level-restart-confirm"]')! as HTMLElement);
    return { border: confirm.borderTopColor, color: confirm.color, background: confirm.backgroundColor };
  });
  expect(style.border).toBe("rgb(138, 106, 52)");
  expect(style.color).toBe("rgb(230, 189, 116)");
  expect(style.background).toBe("rgb(17, 27, 42)");
  await page.screenshot({ path: `${ASSETS}/lv1-dialog-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv1-dialog-768.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  // Enter on the focused continue returns to the same question.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("level-restart-title")).toHaveCount(0);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  // Tab moves to the restart button; Enter confirms the restart.
  await page.getByTestId("course-restart").click();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("level-restart-confirm")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("course-demo")).toBeVisible();
});

test("P23-47-fix-2 auto-advance waits 1.2s, keeps the example, can be stopped and stays on", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, storeWithProgress(4));
  await openDojo(page, "midi");
  await openGuide(page);
  await page.getByTestId("course-auto-advance").check();
  await expect(page.getByTestId("course-auto-advance")).toBeChecked();
  await page.screenshot({ path: `${ASSETS}/lv1-auto-advance-1440.png`, fullPage: true });

  await midi(page, [57, 60, 64], true);
  await page.waitForTimeout(150);
  await midi(page, [57, 60, 64], false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("✓ 正解");
  await expect(page.getByTestId("course-answer-guide")).toContainText("まもなく次の問題へ");
  await expect(page.getByTestId("course-example-notes")).toBeVisible();
  // Holding the keys keeps the question.
  await midi(page, [57, 60, 64], true);
  await page.waitForTimeout(1300);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await expect(page.getByTestId("course-answer-guide")).toContainText("鍵盤を離すと");
  await midi(page, [57, 60, 64], false);
  await expect(page.getByTestId("course-break")).toBeVisible();
  await page.getByTestId("course-break-next").click();
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 6 / 20");

  // The next correct answer can be stopped with "この答えを見返す".
  await midi(page, item(nameIds[5]!).referenceNotes, true);
  await page.waitForTimeout(150);
  await midi(page, item(nameIds[5]!).referenceNotes, false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("✓ 正解");
  await page.getByTestId("course-view-answer").click();
  await expect(page.getByTestId("course-answer-guide")).toContainText("自動進行を止めました");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 6 / 20");
  await expect(page.getByTestId("course-example-notes")).toBeVisible();
  // The preference survives reload.
  await page.reload();
  await openDojo(page, "midi");
  await openGuide(page);
  await expect(page.getByTestId("course-auto-advance")).toBeChecked();
});

test("P23-47-fix-2 a 17/20 result replays only its three wrong items and returns to the same result", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, resultStore());
  await openDojo(page, "midi");
  await openGuide(page);
  await expect(page.getByTestId("course-result")).toBeVisible();
  await expect(page.getByTestId("course-result")).toContainText("17");
  await expect(page.getByTestId("course-result")).toContainText("20");
  await page.screenshot({ path: `${ASSETS}/lv1-result-1440.png`, fullPage: true });
  await page.getByTestId("course-wrong-practice").click();
  await expect(page.getByTestId("course-wrong-practice")).toBeVisible();
  await expect(page.getByTestId("course-progress")).toHaveText("間違えた・迷った問題の練習 1 / 3");
  await expect(page.getByTestId("guided-course")).toContainText("点数には反映されません");
  await page.screenshot({ path: `${ASSETS}/lv1-wrong-practice-1440.png`, fullPage: true });
  const wrongIds = [nameIds[0]!, nameIds[9]!, nameIds[19]!];
  for (let i = 0; i < wrongIds.length; i += 1) {
    await expect(page.getByTestId("course-progress")).toHaveText(`間違えた・迷った問題の練習 ${i + 1} / 3`);
    await page.waitForTimeout(300);
    await midi(page, item(wrongIds[i]!).referenceNotes, true);
    await page.waitForTimeout(150);
    await midi(page, item(wrongIds[i]!).referenceNotes, false);
    await expect(page.getByTestId("course-feedback-text")).toHaveText("正解");
    await page.getByTestId("course-next").click();
    await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("course-practice-summary")).toContainText("3問すべて弾けました");
  await page.getByTestId("course-practice-back").click();
  await expect(page.getByTestId("course-result")).toContainText("17");
  await expect(page.getByTestId("course-result")).toContainText("20");
  await expect(page.getByTestId("course-wrong-practice")).toBeVisible();
});

test("P23-47-fix-2 free practice retries the same item without increasing the count", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, { app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials: [] });
  await openDojo(page, "midi");
  await openGuide(page, false);
  await page.getByTestId("course-station-2").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("course-practice")).toBeVisible();
  await expect(page.getByTestId("course-progress")).toHaveText("練習 1 / 20");
  await page.waitForTimeout(200);
  const first = item(BANK.sets["2"]!.name.sameDay[0]!);
  await midi(page, [first.root + 48], true);
  await page.waitForTimeout(1600);
  await midi(page, [first.root + 48], false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("不正解");
  await page.getByTestId("course-practice-retry").click();
  await expect(page.getByTestId("course-progress")).toHaveText("練習 1 / 20");
  await expect(page.getByTestId("course-feedback-text")).toHaveText("演奏を待っています");
  await midi(page, first.referenceNotes, true);
  await page.waitForTimeout(150);
  await midi(page, first.referenceNotes, false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("正解");
  await page.screenshot({ path: `${ASSETS}/lv1-free-practice-1440.png`, fullPage: true });
  await page.getByTestId("course-next").click();
  await expect(page.getByTestId("course-progress")).toHaveText("練習 2 / 20");
});

test("P23-47-fix-2 advanced free practice retries the same material without advancing", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore());
  await openDojo(page, "midi");
  await openGuide(page);
  await page.getByTestId("advanced-demo-skip").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  await page.locator('[data-testid^="advanced-material-"]').first().click();
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 1");
  await page.waitForTimeout(300);
  await midi(page, [49], true);
  await page.waitForTimeout(1600);
  await midi(page, [49], false);
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("2枚目");
  await midi(page, [49], true);
  await page.waitForTimeout(1600);
  await midi(page, [49], false);
  await expect(page.getByTestId("advanced-feedback-text")).toHaveText("不正解");
  await page.getByTestId("advanced-practice-retry").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 1");
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("1枚目");
});

test("P23-47-fix-2 Lv4 free practice hides the answer before the ear answer is confirmed", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore());
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await openGuide(page, false);
  await page.getByTestId("course-station-7").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  await page.locator('[data-testid^="advanced-material-"]').first().click();
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("耳から再現");
  await expect(page.getByTestId("advanced-example-notes")).toHaveCount(0);
  await expect(page.locator(".gc-keyboard")).toContainText("押している音");
});
