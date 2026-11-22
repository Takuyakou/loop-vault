import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp, assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-46: the guided practice hub and the Lv5 listen → play → retry-from-card flow. The basic Lv1–3
 * course is seeded as passed so the shared entry opens the advanced course.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};

const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";
const ASSETS = reportShot("p23-46-assets");

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

async function seed(page: Page): Promise<void> {
  await page.addInitScript((basic) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(basic));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, completedBasicStore());
}

async function openCourse(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

async function chooseLv5(page: Page): Promise<void> {
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-station-5").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  await page.getByTestId("advanced-material-lv5-prac-major-ii-v-i").click();
  await expect(page.getByTestId("advanced-practice-demo")).toBeVisible();
}

async function emit(page: Page, notes: number[], on: boolean): Promise<void> {
  await page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: { emit: (n: number[], on: boolean) => void } }).__p12Midi.emit(notes, on), { notes, on });
}

async function playChord(page: Page, notes: number[]): Promise<void> {
  await emit(page, notes, true);
  await page.waitForTimeout(350);
  await emit(page, notes, false);
  await page.waitForTimeout(200);
}

const DM7 = [50, 57, 60, 65];
const G7 = [43, 55, 59, 65];
const G7_WRONG = [43, 55, 59, 61];
const CMAJ7 = [48, 55, 59, 64];

test("P23-46 home guidance, the Lv5 hub and the demo at 1440 and 768", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("home-guide")).toContainText("コードを、名前・耳・進行の中で弾けるようにします");
  await page.screenshot({ path: `${ASSETS}/home-guide-1440.png` });
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await chooseLv5(page);
  await expect(page.getByTestId("advanced-practice-materials").locator("button")).toHaveCount(6);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv5-hub-1440.png`, fullPage: true });
  await page.getByTestId("advanced-practice-play").click();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("advanced-practice-phase")).not.toHaveText("見本を聴いて、鍵盤とカードを追いましょう");
  await page.screenshot({ path: `${ASSETS}/lv5-demo-playing-1440.png`, fullPage: true });
  await page.getByTestId("advanced-practice-stop").click();
  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv5-hub-768.png`, fullPage: true });
});

test("P23-46 listen, play, miss G7, then replay from the second card to Cmaj7", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await chooseLv5(page);
  await page.getByTestId("advanced-practice-play").click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${ASSETS}/lv5-demo-playing-midi-1440.png`, fullPage: true });
  await page.getByTestId("advanced-practice-stop").click();
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 1");

  await playChord(page, DM7);
  await playChord(page, G7_WRONG);
  await playChord(page, CMAJ7);
  await expect(page.getByTestId("advanced-feedback-text")).toBeVisible();
  await expect(page.getByTestId("advanced-review-reason")).toContainText("2枚目");
  await expect(page.getByTestId("advanced-review-reason")).toContainText("G7");
  await page.screenshot({ path: `${ASSETS}/lv5-review-g7-1440.png`, fullPage: true });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-advanced-v1:data")!));
  expect(stored.trials).toHaveLength(1);
  expect(stored.trials[0].practice).toBe(true);
  expect(stored.trials[0].result).toBe("wrong");
  expect(stored.trials[0].steps).toHaveLength(3);

  await page.getByTestId("advanced-replay-card").click();
  await expect(page.getByTestId("advanced-feedback-text")).not.toContainText("2枚目から通せました");
  await playChord(page, G7);
  await playChord(page, CMAJ7);
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("2枚目から通せました");
  await page.screenshot({ path: `${ASSETS}/lv5-replay-from-g7-1440.png`, fullPage: true });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:guided-course-advanced-v1:data")!));
  expect(after.trials).toHaveLength(1);
});

test("P23-46 Lv8 group selection shows the vocabulary comparison and progressions", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await openCourse(page);
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-station-8").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-practice-groups")).toBeVisible();
  await page.getByTestId("advanced-group-nine").click();
  await expect(page.getByTestId("advanced-practice-title")).toHaveText("Dm7 → Dm9");
  await expect(page.getByTestId("advanced-practice-cards").locator("li")).toHaveCount(2);
  await page.screenshot({ path: `${ASSETS}/lv8-nine-comparison-1440.png`, fullPage: true });
  await page.getByTestId("advanced-group-thirteen").click();
  await expect(page.getByTestId("advanced-practice-title")).toHaveText("G7 → G13");
  await page.screenshot({ path: `${ASSETS}/lv8-thirteen-comparison-1440.png`, fullPage: true });
});
