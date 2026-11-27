import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-55: the ear stairs in Lv7's practice (two-chord functions, the bass line before the chords).
 * Lv7 is reached from the course map (P23-52): its station, then 「自由に練習する」.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
const AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const ASSETS = "p23-55-assets";

function completedBasicStore() {
  const trials = [];
  for (const level of [1, 2, 3]) {
    const sets = BANK.sets[String(level)]!;
    for (const [ids, block, at] of [[[...sets.name.sameDay, ...(sets.ear?.items ?? [])], "sameDay", OLD], [sets.name.delay, "delay", AT]] as const) {
      const attemptId = `basic-${level}-${block}`;
      for (const id of ids) {
        const item = BANK.items.find((entry) => entry.id === id)!;
        trials.push({
          trialId: `${attemptId}:${id}`, attemptId, block, itemId: id, level,
          quality: item.quality, root: item.root, result: "correct", sealedNotes: item.referenceNotes,
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

async function openLv7Practice(page: Page): Promise<void> {
  await page.addInitScript((basic) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(basic));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, completedBasicStore());
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await page.getByTestId("course-station-7").click();
  await page.getByRole("button", { name: "自由に練習する" }).click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
}

test("Lv7 practice opens with the two-chord functions and the bass lines", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLv7Practice(page);
  const materials = page.locator('[data-testid^="advanced-material-"]');
  await expect(materials.first()).toHaveText("2コードの機能（I → ?）");
  await expect(materials.nth(1)).toHaveText("ベースから: ii–V–I（長調）");
  await page.getByTestId("advanced-material-lv7-prac-func").click();
  await expect(page.getByTestId("advanced-practice-detail")).toContainText("IV・V・vi・ii・iii・♭VII");
  await expect(page.getByTestId("advanced-practice-run")).toHaveText("自分で弾く（7問）");
  await captureReportShot(page, `${ASSETS}/func-hub-1440.png`);
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 7");
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("耳から再現");
  await expect(page.getByTestId("advanced-detail")).toHaveText("2コード・キー C のカデンツを聴いてから");
  await captureReportShot(page, `${ASSETS}/func-question-1440.png`);
});

test("the bass line comes first, then the same progression in chords", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLv7Practice(page);
  await page.getByTestId("advanced-material-lv7-prac-bass-minor").click();
  await expect(page.getByTestId("advanced-practice-cards")).toContainText("Bm7♭5");
  await expect(page.getByTestId("advanced-practice-detail")).toHaveText("1問目はベースだけ（根音を一番下で）、2問目は同じ進行を和音で");
  await captureReportShot(page, `${ASSETS}/bass-hub-1440.png`);
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 2");
  await expect(page.getByTestId("advanced-detail")).toHaveText("ベースだけ。各和音の根音を一番下で弾く（上の音は弾かなくてよい）");
  await captureReportShot(page, `${ASSETS}/bass-question-1440.png`);
  for (const [width, height, name] of [[1280, 720, "bass-question-1280"], [768, 640, "bass-question-768"]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await assertNoHorizontalOverflow(page);
    await captureReportShot(page, `${ASSETS}/${name}.png`);
  }
});

test("P23-57: Lv7 practice lists 12 runs including reordered and outside-key ear runs", async ({ page }) => {
  test.setTimeout(90_000);
  const WIDE_ASSETS = "p23-57-assets";
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLv7Practice(page);
  const materials = page.locator('[data-testid^="advanced-material-"]');
  await expect(materials).toHaveCount(12);
  await assertNoHorizontalOverflow(page);
  await page.getByTestId("advanced-material-lv7-prac-wide-out").click();
  await expect(page.getByTestId("advanced-practice-run")).toHaveText("自分で弾く（5問）");
  await captureReportShot(page, `${WIDE_ASSETS}/wide-hub-1440.png`);
  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, `${WIDE_ASSETS}/wide-hub-768.png`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 5");
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("耳から再現");
  await expect(page.getByTestId("advanced-detail")).toHaveText("4コード・キー C のカデンツを聴いてから");
  await captureReportShot(page, `${WIDE_ASSETS}/wide-question-1440.png`);
  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, `${WIDE_ASSETS}/wide-question-768.png`);
});
