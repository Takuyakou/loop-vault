import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openDojo, type MidiControl } from "./helpers/p12";

/**
 * P24-04: the advanced course's break screen now says what the first wrong answer was and offers the
 * same compare panel as Lv1–3. The words come from the stored evidence only; nothing here changes a result.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const AT = "2026-11-22T00:00:00.000Z";
const ATTEMPT = "p24-04-advanced";
const ITEMS = [
  "lv4-sd-C-a", "lv4-sd-C-b", "lv4-sd-Cm-a", "lv4-sd-Cm-b", "lv4-sd-Fmaj7-a",
  "lv4-sd-Fmaj7-b", "lv4-sd-G7-a", "lv4-sd-G7-b", "lv4-sd-Am7-a", "lv4-sd-Am7-b",
  "lv4-sd-Bm7b5-a", "lv4-sd-Bm7b5-b", "lv4-sd-Cmaj7-a", "lv4-sd-Cmaj7-b", "lv4-sd-Ebm7-a",
  "lv4-sd-Ebm7-b", "lv4-sd-F-a", "lv4-sd-F-b", "lv4-sd-Bb7-a", "lv4-sd-Bb7-b",
] as const;

const emit = (page: Page, notes: number[], on = true) =>
  page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, on), { notes, on });

function basicStore() {
  const trials: unknown[] = [];
  for (const level of [1, 2, 3]) {
    for (const [ids, block, at] of [
      [[...BANK.sets[String(level)]!.name.sameDay, ...(BANK.sets[String(level)]!.ear?.items ?? [])], "sameDay", "2026-11-01T00:00:00.000Z"],
      [BANK.sets[String(level)]!.name.delay, "delay", AT],
    ] as const) {
      const attemptId = `p24-04-basic-${level}-${block}`;
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

function advancedStore() {
  // Four questions of the first round are already answered; the second one missed the written bass of G/B.
  const trials = ITEMS.slice(0, 4).map((id, index) => ({
    trialId: `${ATTEMPT}:${id}`, attemptId: ATTEMPT, block: "sameDay", setId: "sameDay", itemId: id, level: 4,
    result: index === 1 ? "wrong" : "correct", steps: [],
    sealedNotes: index === 1 ? [48, 62, 67] : [],
    speedMs: 1200, hintUsed: false, selfConfirmed: false, midiConfirmed: true, practice: false,
    startedAt: AT, sealedAt: AT,
  }));
  return {
    schema: "loopvault-guided-course-advanced", version: 1, bankVersion: "p23-45.advanced.v1",
    attempts: [{ level: 4, block: "sameDay", setId: "sameDay", attemptId: ATTEMPT, startedAt: AT, mode: "midi", practice: false, itemIds: [...ITEMS] }],
    active: ATTEMPT,
    trials,
  };
}

test("P24-04: the Lv4 break names the written bass and offers the compare", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ basic, advanced }) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(basic));
    localStorage.setItem("loop-vault:guided-course-advanced-v1:data", JSON.stringify(advanced));
  }, { basic: basicStore(), advanced: advancedStore() });
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("advanced-prompt")).toBeVisible();
  // Answer the fifth question (any notes) and stop at the round break.
  await emit(page, [60, 63, 67]);
  await page.waitForTimeout(300);
  await emit(page, [60, 63, 67], false);
  await page.waitForTimeout(400);
  await page.getByTestId("advanced-next").click();
  await expect(page.getByTestId("course-break")).toBeVisible();
  await expect(page.getByTestId("course-break-tip")).toContainText("B");
  await expect(page.getByTestId("course-break-play-answer")).toBeVisible();
  await expect(page.getByTestId("course-break-play-played")).toBeVisible();
  await page.screenshot({ path: "p89-generated/P24-04/F-lv4-slash-bass-break.png" });
});
