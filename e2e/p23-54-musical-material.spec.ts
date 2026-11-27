import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo, type MidiControl } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-54: what the learner sees of the musical corrections — the Lv2 comparison of the four sevenths and
 * Lv4's slash and connection questions. Cadences, charts and example voicings are checked by
 * `materials.test.ts` and `lv4.test.ts`. The guide opens on the course map (P23-52), so every test
 * enters through `course-map-go`.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
const AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

function basicStore(levels: readonly number[]) {
  const trials = [];
  for (const level of levels) {
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

async function enter(page: Page, basic: unknown): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(payload));
    localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
  }, basic);
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await page.getByTestId("course-map-go").click();
}

/** Hold a chord long enough to be sealed (the same hold as the P23-47-fix-2 progression test). */
async function hold(page: Page, notes: readonly number[]): Promise<void> {
  await page.waitForTimeout(300);
  await page.evaluate((notes) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit([...notes], true), notes);
  await page.waitForTimeout(1600);
  await page.evaluate((notes) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit([...notes], false), notes);
}

test("Lv2 opens with the four sevenths, one note lowered at a time", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, basicStore([1]));
  await expect(page.getByTestId("course-demo")).toBeVisible();
  await expect(page.getByTestId("course-progress")).toHaveText("見本 1 / 4");
  await expect(page.getByTestId("course-demo-name")).toHaveText("Cmaj7");
  await expect(page.getByTestId("course-demo-instruction")).toHaveText("Cmaj7 から 1音ずつ半音下げると、響きが4種類に変わります。押して聴き比べてください");
  const cards = page.locator('[data-testid="course-compare"] .gc-cmp');
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("b")).toHaveText(["Cmaj7", "C7", "Cm7", "Cm7♭5"]);
  await expect(cards.locator(".gc-cmp-note")).toHaveText(["根音・3度・5度・長7度", "●7度が半音下がる", "●3度も半音下がる", "●5度も半音下がる"]);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, "p23-54-assets/lv2-demo-1440.png");
  await cards.nth(1).click();
  await expect(page.getByTestId("course-demo-name")).toHaveText("C7");
  for (const [width, height, name] of [[1280, 720, "lv2-demo-1280"], [768, 640, "lv2-demo-768"]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await assertNoHorizontalOverflow(page);
    await captureReportShot(page, `p23-54-assets/${name}.png`);
  }
  await page.getByTestId("course-demo-skip").click();
  await expect(page.getByTestId("course-demo")).toHaveCount(0);
  await expect(page.getByTestId("course-prompt-name")).toBeVisible();
});

test("Lv4 asks slash chords first, then a connection judged chord by chord", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, basicStore([1, 2, 3]));
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await expect(page.getByTestId("advanced-demo-name")).toHaveText("Cm");
  for (let index = 0; index < 3; index += 1) await page.getByTestId("advanced-demo-next").click();
  await expect(page.getByTestId("advanced-demo-name")).toHaveText("C → C/E → F");
  await captureReportShot(page, "p23-54-assets/lv4-demo-connection-1440.png");
  await page.getByTestId("advanced-demo-start").click();
  await expect(page.getByTestId("advanced-practice-asks")).toContainText("つなぎは2〜3コードを続けて弾く");
  await page.getByTestId("advanced-start").click();
  await page.getByTestId("advanced-auto-advance").setChecked(false);

  const singles: readonly [string, readonly number[]][] = [
    ["C/E", [52, 60, 67]],
    ["G/B", [47, 62, 67]],
    ["Am7/G", [43, 60, 64, 69]],
    ["D/F♯", [42, 62, 69]],
    ["F/G", [43, 60, 65, 69]],
  ];
  for (const [index, [label, notes]] of singles.entries()) {
    await expect(page.getByTestId("advanced-progress")).toHaveText(`${index + 1} / 20`);
    await expect(page.getByTestId("advanced-prompt-name")).toHaveText(label);
    await expect(page.getByTestId("advanced-detail")).toHaveCount(0);
    if (index === 0) await captureReportShot(page, "p23-54-assets/lv4-slash-1440.png");
    await hold(page, notes);
    await expect(page.getByTestId("advanced-feedback-text")).toHaveAttribute("data-result", "correct");
    await page.getByTestId("advanced-next").click();
  }
  await expect(page.getByTestId("course-break")).toBeVisible();
  await page.getByTestId("course-break-next").click();

  await expect(page.getByTestId("advanced-progress")).toHaveText("6 / 20");
  await expect(page.getByTestId("advanced-prompt-name")).toHaveText("C → C/E → F");
  await expect(page.getByTestId("advanced-detail")).toHaveText("最低音が C → E → F と上がる。上の C は残す");
  await captureReportShot(page, "p23-54-assets/lv4-connection-1440.png");
  await hold(page, [48, 60, 64, 67]);
  await expect(page.getByTestId("advanced-feedback-text")).toContainText("2枚目");
  await hold(page, [52, 60, 67]);
  await hold(page, [53, 60, 65, 69]);
  await expect(page.getByTestId("advanced-feedback-text")).toHaveAttribute("data-result", "correct");
  await captureReportShot(page, "p23-54-assets/lv4-connection-done-1440.png");
  await page.setViewportSize({ width: 768, height: 640 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, "p23-54-assets/lv4-connection-done-768.png");
});
