import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-53: the ear question's sound disc (mock ⑦). The pass lines (rule 3) are checked by the Vitest specs
 * of levels and review; this spec checks only what the learner sees.
 */
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};

/** Lv1's same-day attempt with the 20 name questions answered: the next question is the first ear question. */
function earStore() {
  const at = new Date(Date.now() - 60_000).toISOString();
  const trials = BANK.sets["1"]!.name.sameDay.map((id) => {
    const entry = BANK.items.find((candidate) => candidate.id === id)!;
    return {
      trialId: `ear-seed:${id}`, attemptId: "ear-seed", block: "sameDay", itemId: id, level: 1,
      quality: entry.quality, root: entry.root, result: "correct", sealedNotes: entry.referenceNotes,
      speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: at, sealedAt: at,
    };
  });
  return {
    app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1,
    bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials,
    active: { level: 1, block: "sameDay", attemptId: "ear-seed", startedAt: at, mode: "midi" },
  };
}

async function openEar(page: Page): Promise<void> {
  await page.addInitScript((store) => localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(store)), earStore());
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("course-ear-disc")).toBeVisible();
}

test("the ear question shows the sound disc and the lowest note; the disc replays as a hint", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEar(page);
  await expect(page.getByTestId("course-progress")).toHaveText("耳 1 / 10");
  await expect(page.getByTestId("course-instruction")).toHaveText("聴こえた和音を、そのまま弾く");
  await expect(page.getByTestId("course-prompt-name")).toHaveText("一番低い音は F");
  await expect(page.getByTestId("course-ear-disc")).toHaveCSS("width", "150px");
  await expect(page.getByTestId("course-ear-disc")).toHaveAttribute("data-playing", "true");
  await captureReportShot(page, "p23-53-assets/ear-playing-1440.png");
  await expect(page.getByTestId("course-feedback-text")).toHaveText("弾いてください", { timeout: 10_000 });
  await expect(page.getByTestId("course-ear-disc")).not.toHaveAttribute("data-playing", "true");
  await captureReportShot(page, "p23-53-assets/ear-ready-1440.png");
  await page.getByTestId("course-ear-disc").click();
  await expect(page.getByTestId("course-hint-note")).toBeVisible();
  for (const [width, height, name] of [[1280, 720, "ear-1280"], [768, 640, "ear-768"]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await assertNoHorizontalOverflow(page);
    expect(await page.getByTestId("course-prompt-name").evaluate((element) => element.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(await page.locator(".gc-keyboard-head").evaluate((element) => element.getBoundingClientRect().top));
    await captureReportShot(page, `p23-53-assets/${name}.png`);
  }
});
