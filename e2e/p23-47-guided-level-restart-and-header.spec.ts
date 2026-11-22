import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp, assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-47: restarting the displayed level and the one-line guide header. The basic Lv1–3 course is
 * seeded through the frozen bank JSON so the Lv1 question is the real authored item.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};

const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";
const ASSETS = reportShot("p23-47-assets");

function item(id: string) {
  return BANK.items.find((entry) => entry.id === id)!;
}

function basicStoreWithLv1Progress(answered = 4) {
  const attempt = { level: 1, block: "sameDay", attemptId: "p47-lv1", startedAt: AT, mode: "midi" as const };
  const ids = BANK.sets["1"]!.name.sameDay.slice(0, answered);
  const trials = ids.map((id) => {
    const target = item(id);
    return {
      trialId: `${attempt.attemptId}:${id}`, attemptId: attempt.attemptId, block: "sameDay", itemId: id, level: 1,
      quality: target.quality, root: target.root, result: "correct", sealedNotes: target.referenceNotes,
      speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: AT, sealedAt: AT,
    };
  });
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
    const delayIds = sets.name.delay;
    for (const [ids, block, at] of [[sameIds, "sameDay", OLD], [delayIds, "delay", AT]] as const) {
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
  return {
    app: "loopvault-guided-course", fileVersion: 1,
    schema: "loopvault-guided-course", version: 1,
    bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId,
    trials,
  };
}

async function seed(page: Page, basic: unknown): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(payload));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, basic);
}

async function openGuide(page: Page, enter = true): Promise<void> {
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  if (enter) await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

async function headerGeometry(page: Page) {
  return page.evaluate(() => {
    const h1 = document.querySelector<HTMLElement>(".gc-head h1")!;
    const head = document.querySelector<HTMLElement>(".gc-head")!;
    const card = document.querySelector<HTMLElement>(".gc-card")!;
    const style = getComputedStyle(h1);
    return {
      h1Height: h1.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
      headWidth: head.getBoundingClientRect().width,
      cardWidth: card.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

async function dialogGeometry(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".gc-dialog")!;
    const continueButton = document.querySelector<HTMLElement>('[data-testid="level-restart-cancel"]')!;
    const confirmButton = document.querySelector<HTMLElement>('[data-testid="level-restart-confirm"]')!;
    const panelStyle = getComputedStyle(panel);
    const continueStyle = getComputedStyle(continueButton);
    const confirmStyle = getComputedStyle(confirmButton);
    const panelRect = panel.getBoundingClientRect();
    const continueRect = continueButton.getBoundingClientRect();
    const confirmRect = confirmButton.getBoundingClientRect();
    return {
      background: panelStyle.backgroundColor,
      panelWidth: panelRect.width,
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      continueBackground: continueStyle.backgroundColor,
      continueBorderWidth: continueStyle.borderTopWidth,
      confirmBackground: confirmStyle.backgroundColor,
      confirmColor: confirmStyle.color,
      confirmBorder: confirmStyle.borderTopColor,
      continueHeight: continueRect.height,
      confirmHeight: confirmRect.height,
      buttonGap: confirmRect.left - continueRect.right,
      viewportWidth: window.innerWidth,
    };
  });
}

test("P23-47 Lv1 5/20: the title stays on one line and the restart dialog pauses and cancels", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, basicStoreWithLv1Progress(4));
  await openDojo(page, "no-midi");
  await openGuide(page);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-midi", "off");

  const geometry = await headerGeometry(page);
  expect(geometry.headWidth).toBeGreaterThanOrEqual(700);
  expect(geometry.h1Height).toBeLessThanOrEqual(geometry.lineHeight * 1.6);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.cardWidth).toBeGreaterThanOrEqual(700);
  await page.screenshot({ path: `${ASSETS}/lv1-question-1440.png`, fullPage: true });

  await page.getByTestId("course-restart").click();
  await expect(page.getByTestId("level-restart-title")).toHaveText("Lv1を最初からやり直しますか？");
  await expect(page.getByTestId("level-restart-body")).toHaveText("今回の確認（5 / 20問目）を終了し、最初の見本に戻ります。これまでの合格記録は残ります。");
  await expect(page.getByTestId("level-restart-cancel")).toHaveText("5問目から続ける");
  await expect(page.getByTestId("level-restart-confirm")).toHaveText("Lv1を最初から");
  await expect(page.getByTestId("level-restart-cancel")).toBeFocused();
  const dialog = await dialogGeometry(page);
  expect(dialog.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(dialog.background).toBe("rgb(17, 27, 42)");
  expect(dialog.confirmBackground).toBe("rgb(17, 27, 42)");
  expect(dialog.confirmBorder).toBe("rgb(138, 106, 52)");
  expect(dialog.confirmColor).toBe("rgb(230, 189, 116)");
  expect(dialog.continueBackground).toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(dialog.continueBorderWidth)).toBeGreaterThanOrEqual(1);
  expect(dialog.continueHeight).toBeGreaterThanOrEqual(40);
  expect(dialog.confirmHeight).toBeGreaterThanOrEqual(40);
  expect(dialog.buttonGap).toBeGreaterThanOrEqual(8);
  expect(dialog.panelWidth).toBeLessThanOrEqual(431);
  expect(dialog.panelLeft).toBeGreaterThanOrEqual(16);
  expect(dialog.panelRight).toBeLessThanOrEqual(dialog.viewportWidth - 16);
  await page.screenshot({ path: `${ASSETS}/lv1-restart-dialog-1440.png`, fullPage: true });
  await page.getByTestId("level-restart-cancel").click();
  await expect(page.getByTestId("level-restart-title")).toHaveCount(0);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await expect(page.getByTestId("course-restart")).toBeFocused();
});

test("P23-47 the dialog pauses MIDI capture and confirming starts Lv1's first round", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, basicStoreWithLv1Progress(4));
  await openDojo(page, "midi");
  await openGuide(page);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-midi", "on");

  await page.getByTestId("course-restart").click();
  await expect(page.getByTestId("level-restart-title")).toBeVisible();
  // The dialog pauses capture: a chord played now is not recorded.
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!).trials.length);
  await page.evaluate(() => (window as typeof window & { __p12Midi: { emit: (notes: number[], on: boolean) => void } }).__p12Midi.emit([48, 52, 55], true));
  await page.waitForTimeout(400);
  const during = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!).trials.length);
  expect(during).toBe(before);
  await page.evaluate(() => (window as typeof window & { __p12Midi: { emit: (notes: number[], on: boolean) => void } }).__p12Midi.emit([48, 52, 55], false));

  await page.getByTestId("level-restart-cancel").click();
  await expect(page.getByTestId("level-restart-title")).toHaveCount(0);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");

  await page.getByTestId("course-restart").click();
  await page.getByTestId("level-restart-confirm").click();
  await expect(page.getByTestId("course-demo")).toBeVisible();
  await expect(page.getByTestId("course-demo-name")).toHaveText("C");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!));
  expect(stored.rounds["1"]).toBeTruthy();
  expect(stored.trials).toHaveLength(4);
  await page.screenshot({ path: `${ASSETS}/lv1-after-restart-1440.png`, fullPage: true });

  // Reopening the guide keeps the new round instead of the old fifth question.
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await openGuide(page);
  await expect(page.getByTestId("course-demo")).toBeVisible();
  await expect(page.getByTestId("course-prompt-name")).toHaveCount(0);
});

test("P23-47 768: the Lv1 title, controls and dialog do not overlap or scroll sideways", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 768, height: 640 });
  await seed(page, basicStoreWithLv1Progress(4));
  await openDojo(page, "no-midi");
  await openGuide(page);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await assertNoHorizontalOverflow(page);
  const geometry = await headerGeometry(page);
  expect(geometry.h1Height).toBeLessThanOrEqual(geometry.lineHeight * 1.6);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${ASSETS}/lv1-question-768.png`, fullPage: true });
  // P23-52: level select moved to the course map; restart stays reachable in the operations row.
  await expect(page.getByTestId("guided-level-select")).toHaveCount(0);
  await expect(page.getByTestId("course-midi")).toHaveCount(0);
  await expect(page.getByTestId("course-restart")).toBeVisible();
  await page.getByTestId("course-restart").click();
  await expect(page.getByTestId("level-restart-title")).toBeVisible();
  await expect(page.getByTestId("level-restart-body")).toContainText("5 / 20問目");
  const narrow = await dialogGeometry(page);
  expect(narrow.background).toBe("rgb(17, 27, 42)");
  expect(narrow.panelLeft).toBeGreaterThanOrEqual(16);
  expect(narrow.panelRight).toBeLessThanOrEqual(narrow.viewportWidth - 16);
  expect(narrow.continueHeight).toBeGreaterThanOrEqual(40);
  expect(narrow.confirmHeight).toBeGreaterThanOrEqual(40);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv1-restart-dialog-768.png`, fullPage: true });
  await page.getByTestId("level-restart-cancel").click();
  await expect(page.getByTestId("course-restart")).toBeFocused();
});

test("P23-47 Lv8 free practice restart returns to the first material and keeps the official side", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore());
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await openGuide(page, false);
  await page.getByTestId("course-station-8").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  await page.getByTestId("advanced-group-nine").click();
  await expect(page.getByTestId("advanced-practice-title")).toHaveText("Dm7 → Dm9");
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-advanced-v1:data")!));
  await page.getByTestId("advanced-restart").click();
  await expect(page.getByTestId("level-restart-title")).toHaveText("Lv8の自由練習を最初からやり直しますか？");
  await expect(page.getByTestId("level-restart-body")).toHaveText("最初の教材に戻ります。正式確認の続きは保存されます。");
  await expect(page.getByTestId("level-restart-cancel")).toHaveText("キャンセル");
  await expect(page.getByTestId("level-restart-cancel")).toBeFocused();
  await expect(page.getByTestId("level-restart-confirm")).toHaveText("Lv8の自由練習を最初から");
  const practiceDialog = await dialogGeometry(page);
  expect(practiceDialog.background).toBe("rgb(17, 27, 42)");
  expect(practiceDialog.confirmBackground).toBe("rgb(17, 27, 42)");
  expect(practiceDialog.confirmBorder).toBe("rgb(138, 106, 52)");
  await page.screenshot({ path: `${ASSETS}/lv8-restart-dialog-1440.png`, fullPage: true });
  await page.getByTestId("level-restart-confirm").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-advanced-v1:data")!));
  expect(after.free).toBeUndefined();
  expect(after.rounds["8"]).toBeTruthy();
  expect(after.trials.length).toBe(before.trials.length);
});
