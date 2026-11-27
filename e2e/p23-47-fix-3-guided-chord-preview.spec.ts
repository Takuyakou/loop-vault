import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openApp, assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { reportShot } from "./helpers/reportShots";

/**
 * P23-47-fix-3: the demo buttons also play, and the visible single chord is the audition card.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const OLD = "2026-11-17T00:00:00.000Z";
const AT = "2026-11-18T00:00:00.000Z";
const ASSETS = reportShot("p23-47-fix-3-assets");
const item = (id: string) => BANK.items.find((entry) => entry.id === id)!;
const nameIds = BANK.sets["1"]!.name.sameDay;

function progressStore(answered = 4) {
  const attempt = { level: 1, block: "sameDay", attemptId: "p473-lv1", startedAt: AT, mode: "midi" as const };
  const trials = nameIds.slice(0, answered).map((id) => {
    const target = item(id);
    return {
      trialId: `${attempt.attemptId}:${id}`, attemptId: attempt.attemptId, block: "sameDay", itemId: id, level: 1,
      quality: target.quality, root: target.root, result: "correct", sealedNotes: target.referenceNotes,
      speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: AT, sealedAt: AT,
    };
  });
  return { app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials, active: attempt };
}

function completedBasic() {
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

test("P23-47-fix-3 the basic demo advances and plays from 次の見本 and もう1周", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, { app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials: [] });
  await openDojo(page, "no-midi");
  await openGuide(page);
  await expect(page.getByTestId("course-demo-card")).toBeVisible();
  await expect(page.getByTestId("course-demo-name")).toHaveText("C");
  await expect(page.getByTestId("course-demo-card")).not.toHaveAttribute("data-playing", "true");
  await page.screenshot({ path: `${ASSETS}/lv1-demo-1440.png`, fullPage: true });

  await page.getByTestId("course-demo-next").click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("Cm");
  await expect(page.getByTestId("course-demo-card")).toHaveAttribute("data-playing", "true");
  await page.waitForTimeout(1600);
  await page.getByTestId("course-demo-next").click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("F");
  await expect(page.getByTestId("course-demo-notes")).toHaveText("F3 · A3 · C4");
  await page.waitForTimeout(1600);
  await page.getByTestId("course-demo-next").click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("Fm");
  await page.waitForTimeout(1600);
  await page.getByTestId("course-demo-again").click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("C");
  await expect(page.getByTestId("course-demo-card")).toHaveAttribute("data-playing", "true");

  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv1-demo-768.png`, fullPage: true });
});

test("P23-47-fix-3 the basic chord card is the hint before the answer and the example after it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, progressStore(4));
  await openDojo(page, "midi");
  await openGuide(page);
  await expect(page.getByTestId("course-prompt-name")).toHaveText("Am");
  await page.screenshot({ path: `${ASSETS}/lv1-question-card-1440.png`, fullPage: true });

  await page.getByTestId("course-chord-card").click();
  await expect(page.getByTestId("course-chord-card-hint")).toHaveText("ヒントを聴きました");
  // The card plays the hint but never shows the example keyboard before the answer.
  await expect(page.getByTestId("course-example-notes")).toHaveCount(0);
  await midi(page, [57, 60, 64], true);
  await page.waitForTimeout(150);
  await midi(page, [57, 60, 64], false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("正解");
  await expect(page.getByTestId("course-chord-card-hint")).toHaveText("カードを押すと正解の一例を聴けます");
  await page.getByTestId("course-chord-card").click();
  await expect(page.getByTestId("course-chord-card")).toHaveAttribute("data-playing", "true");
  // Enter on the card plays only; it does not advance.
  await page.getByTestId("course-chord-card").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");

  // With auto-advance on, pressing the card stops that question's reservation.
  await page.getByTestId("course-restart").click();
  await page.getByTestId("level-restart-confirm").click();
  await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 1 / 20");
  for (let i = 0; i < 4; i += 1) {
    await expect(page.getByTestId("course-progress")).toHaveText(`コード名 ${i + 1} / 20`);
    await page.waitForTimeout(150);
    const target = item(nameIds[i]!);
    await midi(page, target.referenceNotes, true);
    await page.waitForTimeout(120);
    await midi(page, target.referenceNotes, false);
    await expect(page.getByTestId("course-feedback-text")).toHaveText("正解");
    await page.getByTestId("course-next").click();
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("course-prompt-name")).toHaveText("Am");
  await page.getByTestId("course-auto-advance").check();
  await midi(page, [57, 60, 64], true);
  await page.waitForTimeout(150);
  await midi(page, [57, 60, 64], false);
  await expect(page.getByTestId("course-feedback-text")).toHaveText("✓ 正解");
  await page.getByTestId("course-chord-card").click();
  await expect(page.getByTestId("course-answer-guide")).toContainText("自動進行を止めました");
  await page.waitForTimeout(1400);
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 5 / 20");
  await page.screenshot({ path: `${ASSETS}/lv1-correct-card-1440.png`, fullPage: true });

  await page.setViewportSize({ width: 768, height: 640 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `${ASSETS}/lv1-correct-card-768.png`, fullPage: true });
});

test("P23-47-fix-3 Lv4 demo card and Lv5 progression switch the sounding card", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, completedBasic());
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await openGuide(page);
  await expect(page.getByTestId("advanced-demo-card")).toBeVisible();
  await page.getByTestId("advanced-demo-card").click();
  await expect(page.getByTestId("advanced-demo-card")).toHaveAttribute("data-playing", "true");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ASSETS}/lv4-demo-card-1440.png`, fullPage: true });
  await page.getByTestId("advanced-demo-next").click();
  await expect(page.getByTestId("advanced-demo-card")).toHaveAttribute("data-playing", "true");
  await expect(page.getByTestId("advanced-demo-name")).not.toHaveText("Cmaj7");
  await page.waitForTimeout(1600);

  // Lv5's practice material demo: open via the course map.
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-station-5").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-practice-panel")).toBeVisible();
  await page.locator('[data-testid^="advanced-material-"]').first().click();
  await page.getByTestId("advanced-practice-play").click();
  await expect(page.getByTestId("advanced-practice-phase")).toBeVisible();
  await expect(page.locator('[data-testid="advanced-practice-card-0"]')).toHaveAttribute("data-current", "true", { timeout: 10_000 });
  await page.screenshot({ path: `${ASSETS}/lv5-demo-sequence-1440.png`, fullPage: true });
});

test("P23-47-fix-3 the free practice card replays without a hint and ear screens have no card", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, { app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1, bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials: [] });
  await openDojo(page, "midi");
  await openGuide(page, false);
  await page.getByTestId("course-station-2").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("course-practice-card")).toBeVisible();
  await page.getByTestId("course-practice-card").click();
  await expect(page.getByTestId("course-practice-card-hint")).toHaveText("カードを押すと音をもう一度聴けます");
  await expect(page.getByTestId("course-practice-card")).toHaveAttribute("data-playing", "true");
  await page.screenshot({ path: `${ASSETS}/lv1-practice-card-1440.png`, fullPage: true });

  // Lv7 ear practice keeps the answer hidden and shows no card.
  await seed(page, completedBasic());
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await openGuide(page, false);
  await page.getByTestId("course-station-7").click();
  await page.getByTestId("course-map-practice").click();
  await page.locator('[data-testid^="advanced-material-"]').first().click();
  await page.getByTestId("advanced-practice-run").click();
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("耳から再現");
  await expect(page.getByTestId("advanced-chord-card")).toHaveCount(0);
});
