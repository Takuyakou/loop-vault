import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-55 (W1–W4): wrong + hesitant (> 2.5s) chord-name answers are collected into practice
 * on both the result sheet (⑧) and the waiting/due course-map station, while still counting
 * as correct toward passing and never flagging ear/progression questions by elapsed time.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string;
  policyVersion: string;
  pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};

const BASIC_KEY = "loop-vault:guided-course-v1:data";
const ADV_KEY = "loop-vault:guided-course-advanced-v1:data";
const ASSETS = "p23-55-assets";

const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

const LV4_SAME_DAY_IDS = [
  "lv4-sd-C-a",
  "lv4-sd-C-b",
  "lv4-sd-Cm-a",
  "lv4-sd-Cm-b",
  "lv4-sd-Fmaj7-a",
  "lv4-sd-Fmaj7-b",
  "lv4-sd-G7-a",
  "lv4-sd-G7-b",
  "lv4-sd-Am7-a",
  "lv4-sd-Am7-b",
  "lv4-sd-Bm7b5-a",
  "lv4-sd-Bm7b5-b",
  "lv4-sd-Cmaj7-a",
  "lv4-sd-Cmaj7-b",
  "lv4-sd-Ebm7-a",
  "lv4-sd-Ebm7-b",
  "lv4-sd-F-a",
  "lv4-sd-F-b",
  "lv4-sd-Bb7-a",
  "lv4-sd-Bb7-b",
] as const;

function basicItem(id: string) {
  const found = BANK.items.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`missing basic item ${id}`);
  return found;
}

function lv1SameDayStore(options: {
  readonly wrongIndexes: readonly number[];
  readonly slowIndexes: readonly number[];
  readonly earSpeedMs: number;
  readonly active: boolean;
  readonly at?: string;
}) {
  const at = options.at ?? TWO_HOURS_AGO;
  const sets = BANK.sets["1"]!;
  const nameIds = sets.name.sameDay;
  const earIds = sets.ear?.items ?? [];
  const attemptId = "lv1-weak-attempt";
  const wrongSet = new Set(options.wrongIndexes);
  const slowSet = new Set(options.slowIndexes);
  const trials = [
    ...nameIds.map((id, index) => {
      const item = basicItem(id);
      const isWrong = wrongSet.has(index);
      return {
        trialId: `${attemptId}:${id}`,
        attemptId,
        block: "sameDay",
        itemId: id,
        level: 1,
        quality: item.quality,
        root: item.root,
        result: isWrong ? "wrong" : "correct",
        sealedNotes: isWrong ? [60, 61, 62] : item.referenceNotes,
        speedMs: slowSet.has(index) ? 3000 : 1000,
        hintUsed: false,
        selfConfirmed: false,
        midiConfirmed: true,
        startedAt: at,
        sealedAt: at,
      };
    }),
    ...earIds.map((id) => {
      const item = basicItem(id);
      return {
        trialId: `${attemptId}:${id}`,
        attemptId,
        block: "sameDay",
        itemId: id,
        level: 1,
        quality: item.quality,
        root: item.root,
        result: "correct",
        sealedNotes: item.referenceNotes,
        speedMs: options.earSpeedMs,
        hintUsed: false,
        selfConfirmed: false,
        midiConfirmed: true,
        startedAt: at,
        sealedAt: at,
      };
    }),
  ];
  return {
    app: "loopvault-guided-course",
    fileVersion: 1,
    schema: "loopvault-guided-course",
    version: 1,
    bankVersion: BANK.version,
    policyVersion: BANK.policyVersion,
    pairId: BANK.pairId,
    ...(options.active ? { active: { level: 1, block: "sameDay", attemptId, startedAt: at, mode: "midi" } } : {}),
    trials,
  };
}

function completedBasicStore() {
  const trials = [];
  for (const level of [1, 2, 3]) {
    const sets = BANK.sets[String(level)]!;
    for (const [ids, block, at] of [
      [[...sets.name.sameDay, ...(sets.ear?.items ?? [])], "sameDay", OLD],
      [sets.name.delay, "delay", TWO_HOURS_AGO],
    ] as const) {
      const attemptId = `basic-${level}-${block}`;
      for (const id of ids) {
        const item = basicItem(id);
        trials.push({
          trialId: `${attemptId}:${id}`,
          attemptId,
          block,
          itemId: id,
          level,
          quality: item.quality,
          root: item.root,
          result: "correct",
          sealedNotes: item.referenceNotes,
          speedMs: 1000,
          hintUsed: false,
          selfConfirmed: false,
          midiConfirmed: true,
          startedAt: at,
          sealedAt: at,
        });
      }
    }
  }
  return {
    app: "loopvault-guided-course",
    fileVersion: 1,
    schema: "loopvault-guided-course",
    version: 1,
    bankVersion: BANK.version,
    policyVersion: BANK.policyVersion,
    pairId: BANK.pairId,
    trials,
  };
}

function lv4SameDayResultStore() {
  const attemptId = "lv4-weak-attempt";
  const at = TWO_HOURS_AGO;
  return {
    app: "loopvault-guided-course-advanced",
    fileVersion: 1,
    schema: "loopvault-guided-course-advanced",
    version: 1,
    bankVersion: "p23-45-advanced-v1",
    active: attemptId,
    attempts: [{
      attemptId,
      level: 4,
      block: "sameDay",
      setId: "sameDay",
      practice: false,
      mode: "midi",
      itemIds: [...LV4_SAME_DAY_IDS],
      startedAt: at,
    }],
    trials: LV4_SAME_DAY_IDS.map((id, index) => ({
      trialId: `${attemptId}:${id}`,
      attemptId,
      level: 4,
      block: "sameDay",
      setId: "sameDay",
      itemId: id,
      practice: false,
      result: "correct",
      steps: [],
      sealedNotes: [60, 64, 67],
      speedMs: index === 0 ? 3200 : index === 5 ? 9000 : 1000,
      hintUsed: false,
      selfConfirmed: false,
      midiConfirmed: true,
      startedAt: at,
      sealedAt: at,
    })),
  };
}

async function seedAndOpenMap(page: Page, basic: unknown, advanced?: unknown) {
  await page.addInitScript(
    ({ bKey, aKey, bVal, aVal }) => {
      localStorage.setItem(bKey, JSON.stringify(bVal));
      if (aVal === undefined) localStorage.removeItem(aKey);
      else localStorage.setItem(aKey, JSON.stringify(aVal));
    },
    { bKey: BASIC_KEY, aKey: ADV_KEY, bVal: basic, aVal: advanced },
  );
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
}

test("W1: Lv1 result collects 2 wrong + 3 slow name items (ignoring slow ear) into weak practice", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpenMap(page, lv1SameDayStore({ wrongIndexes: [0, 1], slowIndexes: [2, 3, 4], earSpeedMs: 6000, active: true }));
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("course-result")).toBeVisible();
  await expect(page.getByTestId("course-wrong-practice")).toHaveText("間違えた・迷った問題を練習（5問）");
  await expect(page.getByTestId("course-result-slow")).toHaveText("正解でも 2.5 秒より長くかかった問題が 3 問あります（合格には数えます）");
  await captureReportShot(page, `${ASSETS}/w1-result-1440.png`);

  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, `${ASSETS}/w1-result-768.png`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("course-wrong-practice").click();
  await expect(page.getByTestId("course-progress")).toHaveText("間違えた・迷った問題の練習 1 / 5");
});

test("W2: slow correct answers still count toward passing (18/20 remains passed)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpenMap(page, lv1SameDayStore({ wrongIndexes: [0, 1], slowIndexes: [2, 3, 4], earSpeedMs: 6000, active: true }));
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("course-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("course-result")).toContainText("20問中 18問で合格");
});

test("W3: waiting Lv1 station on the course map offers weak practice for its 3 slow items", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpenMap(page, lv1SameDayStore({ wrongIndexes: [], slowIndexes: [0, 5, 10], earSpeedMs: 6000, active: false }));
  const lv1Station = page.getByTestId("course-station-1");
  await expect(lv1Station).toHaveAttribute("data-state", "waiting");
  await lv1Station.click();
  const weakBtn = page.getByTestId("course-map-weak");
  await expect(weakBtn).toBeVisible();
  await expect(weakBtn).toHaveText("迷った・間違えた問題を練習（3問）");
  await captureReportShot(page, `${ASSETS}/w3-map-1440.png`);

  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, `${ASSETS}/w3-map-768.png`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await weakBtn.click();
  await expect(page.getByTestId("course-progress")).toHaveText("間違えた・迷った問題の練習 1 / 3");
  await page.getByRole("button", { name: /コース/ }).click();
  await expect(page.getByTestId("course-map")).toBeVisible();
});

test("W4: advanced Lv4 counts slow single-chord C/E (3.2s) but not slow progression (9.0s)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpenMap(page, completedBasicStore(), lv4SameDayResultStore());
  await page.getByTestId("course-station-4").click();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-result")).toBeVisible();
  await expect(page.getByTestId("advanced-wrong-practice")).toHaveText("間違えた・迷った問題を練習（1問）");
  await expect(page.getByTestId("advanced-result-slow")).toHaveText("正解でも 2.5 秒より長くかかった問題が 1 問あります（合格には数えます）");
  await page.getByTestId("advanced-wrong-practice").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("間違えた・迷った問題の練習 1 / 1");
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("C/E");
});
