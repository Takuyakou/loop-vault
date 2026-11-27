import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp, assertNoHorizontalOverflow } from "./helpers/app";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-45 visual / flow check for the advanced guide course. The basic Lv1–3 store is seeded as fully
 * passed so the shared entry routes to Lv4. Advanced scenarios are driven through the screen itself
 * (or a minimal attempt pointing at the sight charts) so this spec never imports the product bank.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};

const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";
const ASSETS = reportShot("p23-45-assets");

function basicItem(id: string) {
  return BANK.items.find((entry) => entry.id === id)!;
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
        const item = basicItem(id);
        trials.push({
          trialId: `${attemptId}:${id}`, attemptId, block, itemId: id, level,
          quality: item.quality, root: item.root, result: "correct", sealedNotes: item.referenceNotes,
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

/** A minimal advanced store that starts on the capstone sight charts. */
function sightAttemptStore() {
  return {
    app: "loopvault-guided-course-advanced", fileVersion: 1,
    schema: "loopvault-guided-course-advanced", version: 1,
    bankVersion: "p23-45.advanced.v1",
    attempts: [{
      level: "capstone", block: "sameDay", setId: "sameDay", attemptId: "sight-seed", startedAt: OLD,
      mode: "midi", practice: false, itemIds: ["cap-sight-01", "cap-sight-02", "cap-sight-03"],
    }],
    active: "sight-seed",
    trials: [],
  };
}

async function seed(page: Page, basic: unknown, advanced: unknown | undefined): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(payload.basic));
    if (payload.advanced === undefined) localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
    else localStorage.setItem("loop-vault:guided-course-advanced-v1:data", JSON.stringify(payload.advanced));
  }, { basic, advanced });
}

async function openCourse(page: Page, enter = true): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  if (enter) await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

test("P23-45 Lv4 shows the placement examples and an explicit start after Lv3 pass", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore(), undefined);
  await openCourse(page);
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await expect(page.getByTestId("advanced-level")).toHaveText("Lv4");
  await expect(page.getByTestId("advanced-demo-name")).toHaveText("Cm");
  await expect(page.getByTestId("advanced-progress")).toHaveText("見本 1 / 4");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv4-demo-1440.png`, fullPage: true });
  await page.getByTestId("advanced-demo-skip").click();
  await expect(page.getByTestId("advanced-start-panel")).toBeVisible();
  await expect(page.getByTestId("advanced-start-panel")).toContainText("20 問");
  await expect(page.getByTestId("advanced-start-panel")).toContainText("最低音");
  await expect(page.getByTestId("advanced-basics-done")).toContainText("Lv1〜3 は修了");
  await page.screenshot({ path: `${ASSETS}/lv4-start-1440.png`, fullPage: true });
  await page.getByTestId("advanced-start").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 20");
  await expect(page.getByTestId("advanced-self-note")).toContainText("進級判定には含まれません");
  expect((await page.getByTestId("advanced-self-note").boundingBox())!.height).toBeLessThanOrEqual(24);
  await page.screenshot({ path: `${ASSETS}/lv4-question-1440.png`, fullPage: true });
  await page.getByTestId("advanced-self-miss").click();
  await expect(page.getByTestId("advanced-example-label")).toContainText("弾き方の例");
  await page.screenshot({ path: `${ASSETS}/lv4-review-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv4-review-768.png`, fullPage: true });
});

test("P23-45 a completed same-day Lv4 block shows the result and opens the delayed set", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore(), undefined);
  await openCourse(page);
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await page.getByTestId("advanced-demo-skip").click();
  await page.getByTestId("advanced-start").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  for (let index = 0; index < 20; index += 1) {
    await page.getByTestId("advanced-self-miss").click();
    await page.getByTestId("advanced-next").click();
    if ((index + 1) % 5 === 0 && index + 1 < 20) await page.getByTestId("course-break-next").click();
  }
  await expect(page.getByTestId("advanced-result")).toBeVisible();
  await expect(page.getByTestId("advanced-result")).toHaveAttribute("data-ok", "false");
  await expect(page.locator(".gc-sheet h2")).toContainText("20問中 0問");
  await page.screenshot({ path: `${ASSETS}/lv4-failed-result-1440.png`, fullPage: true });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-advanced-v1:data")!));
  expect(stored.trials).toHaveLength(20);
  expect(stored.trials.every((trial: { selfConfirmed: boolean }) => trial.selfConfirmed)).toBe(true);
});

test("P23-45 Lv8 shows the three vocabulary groups through the course map", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore(), undefined);
  await openCourse(page, false);
  await page.getByTestId("course-station-8").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-level")).toHaveText("Lv8");
  await expect(page.getByTestId("advanced-groups")).toBeVisible();
  await expect(page.locator('[data-testid="advanced-groups"] .ac-group')).toHaveCount(3);
  await expect(page.getByTestId("advanced-groups")).toContainText("6・add9・sus");
  await expect(page.getByTestId("advanced-groups")).toContainText("9系");
  await expect(page.getByTestId("advanced-groups")).toContainText("13・ルートレス");
  await expect(page.getByTestId("advanced-start-panel")).toContainText("自由練習");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv8-practice-1440.png`, fullPage: true });
});

test("P23-45 capstone shows the eight-bar sight chart at the learner's tempo", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore(), sightAttemptStore());
  await openCourse(page);
  await expect(page.getByTestId("advanced-sight-chart")).toBeVisible();
  await expect(page.locator('[data-testid="advanced-sight-chart"] li')).toHaveCount(8);
  await expect(page.getByTestId("advanced-sight-start")).toBeVisible();
  await expect(page.getByTestId("advanced-beat")).toContainText("BPM");
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("開始を押すと拍が進みます");
  // P25 V1: without MIDI the sight chart says so in one small line (it was a large warning panel).
  await expect(page.getByTestId("advanced-sight-connection")).toHaveClass("gc-note");
  expect((await page.getByTestId("advanced-sight-connection").boundingBox())!.height).toBeLessThanOrEqual(24);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/capstone-sight-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/capstone-sight-768.png`, fullPage: true });
});

test("P23-45 the course map reaches every level and basic practice records nothing", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasicStore(), undefined);
  await openCourse(page, false);
  await expect(page.locator('[data-testid^="course-station-"]')).toHaveCount(9);
  await expect(page.getByTestId("course-station-4")).toHaveAttribute("data-state", "now");
  await page.getByTestId("course-station-7").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-level")).toHaveText("Lv7");
  await page.screenshot({ path: `${ASSETS}/level-select-lv7-1440.png`, fullPage: true });
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-station-2").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("course-practice")).toBeVisible();
  await expect(page.locator(".gc-head")).toContainText("記録しません");
  await page.screenshot({ path: `${ASSETS}/basic-practice-lv2-1440.png`, fullPage: true });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!).trials.length);
  await page.getByTestId("course-practice-ok").click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-v1:data")!).trials.length);
  expect(after).toBe(before);
});
