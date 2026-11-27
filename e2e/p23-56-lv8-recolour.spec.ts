import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-56: Lv8's recolour questions — the plain progression is named and can be heard, the coloured one is
 * played. Reached from the course map (P23-52): the Lv8 station, 「自由に練習する」, then the group's
 * 「進行の中で響きを足す」. The official counts are checked by the Vitest specs (levels, bank, review).
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
const AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const ASSETS = "p23-56-assets";

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

test("a recolour question names the plain progression, plays it on request, and asks for the coloured one", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((basic) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(basic));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, completedBasicStore());
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await page.getByTestId("course-station-8").click();
  await page.getByRole("button", { name: "自由に練習する" }).click();
  await page.getByTestId("advanced-group-thirteen").click();
  await page.getByTestId("advanced-material-lv8-prac-recolour-thirteen").click();
  await expect(page.getByTestId("advanced-practice-run")).toHaveText("自分で弾く（7問）");
  await captureReportShot(page, `${ASSETS}/recolour-hub-1440.png`);
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-progress")).toHaveText("1 / 7");
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("Dm9 → G13 → Cmaj9");
  await expect(page.getByTestId("advanced-detail")).toHaveText("元の進行 Dm7 → G7 → Cmaj7。響きを足して弾く");
  await page.getByTestId("advanced-listen-plain").click();
  // The plain progression is a comparison, not the answer: no hint is recorded.
  await expect(page.getByTestId("advanced-hint-note")).toHaveCount(0);
  await captureReportShot(page, `${ASSETS}/recolour-1440.png`);
  for (const [width, height, name] of [[1280, 720, "recolour-1280"], [768, 640, "recolour-768"]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await assertNoHorizontalOverflow(page);
    expect(await page.getByTestId("advanced-feedback").evaluate((element) => element.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(await page.locator(".gc-keyboard-head").evaluate((element) => element.getBoundingClientRect().top));
    await captureReportShot(page, `${ASSETS}/${name}.png`);
  }
});
