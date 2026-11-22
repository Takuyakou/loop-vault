import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-52: Course Map (①), Result Sheet (⑧), removal of `GuidedLevelSelect`, and Rule 1
 * ("start the next station while a delayed check waits, capped at two pending").
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string;
  policyVersion: string;
  pairId: string;
  items: { id: string; level: number; prompt: string; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};

const BASIC_KEY = "loop-vault:guided-course-v1:data";
const HOUR = 60 * 60 * 1000;

interface SeedTrial {
  trialId: string;
  attemptId: string;
  block: "sameDay" | "delay";
  itemId: string;
  level: 1 | 2 | 3;
  quality: string;
  root: number;
  result: "correct" | "wrong";
  sealedNotes: number[];
  speedMs?: number;
  hintUsed: boolean;
  selfConfirmed: boolean;
  midiConfirmed: boolean;
  startedAt: string;
  sealedAt: string;
}

function makeTrials(
  level: 1 | 2 | 3,
  block: "sameDay" | "delay",
  attemptId: string,
  at: string,
  wrongIds: ReadonlySet<string> = new Set(),
): SeedTrial[] {
  const set = BANK.sets[String(level)]!;
  const ids = block === "delay"
    ? set.name.delay
    : [...set.name.sameDay, ...(set.ear?.items ?? [])];
  return ids.map((id) => {
    const entry = BANK.items.find((candidate) => candidate.id === id)!;
    const wrong = wrongIds.has(id);
    return {
      trialId: `${attemptId}:${id}`,
      attemptId,
      block,
      itemId: id,
      level,
      quality: entry.quality,
      root: entry.root,
      result: wrong ? "wrong" : "correct",
      sealedNotes: wrong ? [60, 63, 66] : entry.referenceNotes,
      ...(wrong ? {} : { speedMs: 1100 }),
      hintUsed: false,
      selfConfirmed: false,
      midiConfirmed: true,
      startedAt: at,
      sealedAt: at,
    };
  });
}

function wrapBasicStore(trials: readonly SeedTrial[], active?: {
  level: 1 | 2 | 3;
  block: "sameDay" | "delay";
  attemptId: string;
  startedAt: string;
  mode: "midi" | "self";
}) {
  return {
    app: "loopvault-guided-course",
    fileVersion: 1,
    schema: "loopvault-guided-course",
    version: 1,
    bankVersion: BANK.version,
    policyVersion: BANK.policyVersion,
    pairId: BANK.pairId,
    trials,
    ...(active === undefined ? {} : { active }),
  };
}

async function openSeededMap(page: Page, store: ReturnType<typeof wrapBasicStore> | undefined): Promise<void> {
  if (store !== undefined) {
    await page.addInitScript(([key, payload]) => {
      localStorage.setItem(key, JSON.stringify(payload));
    }, [BASIC_KEY, store] as const);
  }
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
}

async function captureSizes(page: Page, prefix: string): Promise<void> {
  for (const [width, height] of [[1440, 900], [1280, 720], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await assertNoHorizontalOverflow(page);
    await captureReportShot(page, `p23-52-assets/${prefix}-${width}.png`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
}

test("M1: fresh record shows course map with Lv1 now, others locked, no due banner, and starts Lv1 demo", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSeededMap(page, undefined);
  await expect(page.getByTestId("course-station-1")).toHaveAttribute("data-state", "now");
  for (const id of ["2", "3", "4", "5", "6", "7", "8", "capstone"]) {
    await expect(page.getByTestId(`course-station-${id}`)).toHaveAttribute("data-state", "locked");
  }
  await expect(page.getByTestId("course-due")).toHaveCount(0);
  await expect(page.getByTestId("course-map-go")).toContainText("始める");
  await captureSizes(page, "map-m1");
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("course-demo")).toBeVisible();
  await expect(page.getByTestId("course-level")).toHaveText("Lv1");
});

test("M2: Lv1 passed 40h ago shows due banner, Lv1 due, Lv2 now, later hides banner, and starts Lv2", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const t40h = new Date(Date.now() - 40 * HOUR).toISOString();
  await openSeededMap(page, wrapBasicStore(makeTrials(1, "sameDay", "lv1-sd", t40h)));
  const due = page.getByTestId("course-due");
  await expect(due).toBeVisible();
  await expect(due).toContainText("Lv1 の「別の日にもう一度」ができます");
  await expect(due).toContainText("10問、3分ほど");
  await expect(page.getByTestId("course-station-1")).toHaveAttribute("data-state", "due");
  await expect(page.getByTestId("course-station-2")).toHaveAttribute("data-state", "now");
  await captureSizes(page, "map-m2");

  await page.getByTestId("course-due-later").click();
  await expect(page.getByTestId("course-due")).toHaveCount(0);
  await page.getByTestId("course-map-go").click();
  // P23-54: Lv2 opens with its four-sevenths comparison demo before Q1.
  await expect(page.getByTestId("course-demo")).toBeVisible();
  await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await expect(page.getByTestId("course-level")).toHaveText("Lv2");
});

test("M3: Lv1 passed 2h ago shows no due banner, Lv1 waiting, and Lv2 now", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t2h = new Date(Date.now() - 2 * HOUR).toISOString();
  await openSeededMap(page, wrapBasicStore(makeTrials(1, "sameDay", "lv1-sd", t2h)));
  await expect(page.getByTestId("course-due")).toHaveCount(0);
  await expect(page.getByTestId("course-station-1")).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("course-station-2")).toHaveAttribute("data-state", "now");
});

test("M4: Lv1 and Lv2 same-day passed 2h ago locks Lv3 with Lv1 delayed reason and no go button", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const t2h = new Date(Date.now() - 2 * HOUR).toISOString();
  const t1h = new Date(Date.now() - 1 * HOUR).toISOString();
  await openSeededMap(page, wrapBasicStore([
    ...makeTrials(1, "sameDay", "lv1-sd", t2h),
    ...makeTrials(2, "sameDay", "lv2-sd", t1h),
  ]));
  await page.getByTestId("course-station-3").click();
  await expect(page.getByTestId("course-station-3")).toHaveAttribute("data-state", "locked");
  await expect(page.getByTestId("course-map-locked-reason")).toHaveText("Lv1 の別の日の確認が終わると始められます");
  await expect(page.getByTestId("course-map-go")).toHaveCount(0);
  await captureSizes(page, "map-m4");
});

test("M5: Lv1-2 done and Lv3 same-day passed 2h ago opens Lv4 official demo (not practice)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t72h = new Date(Date.now() - 72 * HOUR).toISOString();
  const t48h = new Date(Date.now() - 48 * HOUR).toISOString();
  const t24h = new Date(Date.now() - 24 * HOUR).toISOString();
  const t2h = new Date(Date.now() - 2 * HOUR).toISOString();
  await openSeededMap(page, wrapBasicStore([
    ...makeTrials(1, "sameDay", "lv1-sd", t72h),
    ...makeTrials(1, "delay", "lv1-dl", t48h),
    ...makeTrials(2, "sameDay", "lv2-sd", t48h),
    ...makeTrials(2, "delay", "lv2-dl", t24h),
    ...makeTrials(3, "sameDay", "lv3-sd", t2h),
  ]));
  await expect(page.getByTestId("course-station-4")).toHaveAttribute("data-state", "now");
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await expect(page.getByTestId("advanced-level")).toHaveText("Lv4");
  await expect(page.locator(".gc-head")).not.toContainText("自由練習");
});

test("M6: clicking due banner start opens Lv1 delayed question 1", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const t40h = new Date(Date.now() - 40 * HOUR).toISOString();
  await openSeededMap(page, wrapBasicStore(makeTrials(1, "sameDay", "lv1-sd", t40h)));
  await page.getByTestId("course-due-start").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await expect(page.getByTestId("course-level")).toHaveText("Lv1");
  await expect(page.getByTestId("course-progress")).toHaveText("復習 1 / 10");
});

test("M7: completed basic same-day (19/20) shows result sheet ⑧ with bars, 3 boxes, and returns to map", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const t72h = new Date(Date.now() - 72 * HOUR).toISOString();
  const t48h = new Date(Date.now() - 48 * HOUR).toISOString();
  const nowIso = new Date().toISOString();
  const lv2Min7Id = BANK.sets["2"]!.name.sameDay.find((id) => BANK.items.find((item) => item.id === id)?.quality === "min7")!;
  const trials = [
    ...makeTrials(1, "sameDay", "lv1-sd", t72h),
    ...makeTrials(1, "delay", "lv1-dl", t48h),
    ...makeTrials(2, "sameDay", "lv2-sd", nowIso, new Set([lv2Min7Id])),
  ];
  await openSeededMap(page, wrapBasicStore(trials, {
    level: 2,
    block: "sameDay",
    attemptId: "lv2-sd",
    startedAt: nowIso,
    mode: "midi",
  }));
  await page.getByTestId("course-map-go").click();
  const result = page.getByTestId("course-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("20問中 19問で合格");
  await expect(result).toContainText("合格の線は 18問");
  await expect(page.getByTestId("course-result-bars").locator(".gc-qb")).toHaveCount(4);
  await expect(page.getByTestId("course-result-boxes").locator(".gc-nx")).toHaveCount(3);
  await captureSizes(page, "result-m7");

  await page.getByTestId("course-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await expect(page.getByTestId("course-station-2")).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("course-station-3")).toHaveAttribute("data-state", "now");
});

test("M8: question screen has no guided-level-select; back goes to map and map back goes to home", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const nowIso = new Date().toISOString();
  await openSeededMap(page, wrapBasicStore([], {
    level: 1,
    block: "sameDay",
    attemptId: "lv1-active",
    startedAt: nowIso,
    mode: "midi",
  }));
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
  await expect(page.getByTestId("guided-level-select")).toHaveCount(0);
  await expect(page.getByTestId("dojo-back")).toContainText("コース");

  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await expect(page.getByTestId("dojo-back")).toContainText("Chord Dojo");

  await page.getByTestId("dojo-back").click();
  await expect(page.locator('[data-focus-key="home:guide:open"]')).toBeVisible();
});
