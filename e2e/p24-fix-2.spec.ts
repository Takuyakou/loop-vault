import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openDojo, type MidiControl } from "./helpers/p12";
import { chooseTextSetting } from "./helpers/app";

/**
 * P24-fix-2 items 1–6.
 *
 * 1. a card's small sound mark is shown only when it differs from the rest of the progression
 * 2. the chosen card's row says 「(アプリのおすすめの音)」 (no 「元の MIDI の音ではありません」)
 * 3. 「表記を n か所」 counts tidied chord/bar groups, not each full-width character
 * 4. the Lv4 slash-bass tip holds the bass with the left pinky
 * 5. the keyboard band no longer prints 「押さえている」
 * 6. the transport's 「1 / 8 小節」 is vertically centred with the buttons
 *
 * The photos go to p89-generated/P24-fix-2/.
 */
const AT = "2026-11-22T00:00:00.000Z";
const BANK = JSON.parse(readFileSync("docs/p23-39-contracts/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
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
      const attemptId = `p24-fix2-basic-${level}-${block}`;
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
  // The second question of round 1 missed the written bass of G/B → the Lv4 slash-bass tip.
  const trials = ITEMS.slice(0, 4).map((id, index) => ({
    trialId: `p24-fix2:${id}`, attemptId: "p24-fix2", block: "sameDay", setId: "sameDay", itemId: id, level: 4,
    result: index === 1 ? "wrong" : "correct", steps: [],
    sealedNotes: index === 1 ? [48, 62, 67] : [],
    speedMs: 1200, hintUsed: false, selfConfirmed: false, midiConfirmed: true, practice: false,
    startedAt: AT, sealedAt: AT,
  }));
  return {
    schema: "loopvault-guided-course-advanced", version: 1, bankVersion: "p23-45.advanced.v1",
    attempts: [{ level: 4, block: "sameDay", setId: "sameDay", attemptId: "p24-fix2", startedAt: AT, mode: "midi", practice: false, itemIds: [...ITEMS] }],
    active: "p24-fix2",
    trials,
  };
}

const MAIN = [
  "夜あけの坂道",
  "",
  "[Aメロ]",
  "| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |",
  "坂の上まで 風がのぼる",
  "まだ眠たい 街をぬけて",
  "",
  "[サビ]",
  "｜　Ｆmaj7　　G7 ｜　Em7　　Am7 ｜",
  "手をふるよ 朝のひかりに",
  "| Dm7 G7 | C△7 C7 |",
  "きみの声が まだ聞こえる",
].join("\n");

const ERRORS = [
  "| Dm7 G7 | Cmaj7 Am7 |",
  "| Fmaj7 Xm7 | G7 |",
  "| Em7 Am7 | Hm7 G7 |",
  "| Fmaj7 G7 | Cmaj7 |",
].join("\n");

const play = async (page: Page, notes: number[]) => {
  await emit(page, notes, true);
  await page.waitForTimeout(160);
  await emit(page, notes, false);
  await page.waitForTimeout(200);
};
const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

async function openText(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await expect(inputOf(page)).toBeVisible();
}

async function openKeyboard(page: Page): Promise<void> {
  await page.goto("/?p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await captureOf(page).getByTestId("text-keyboard-toggle").click();
  await page.evaluate(async () => {
    await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect();
  });
  await expect(captureOf(page).getByTestId("keyboard-device")).toBeVisible();
}

test("1+2+3: the card marks, the row's wording and the tidied-count", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openText(page);
  const capture = captureOf(page);
  await inputOf(page).fill(MAIN);
  // 1: every card uses the default sound, so no card prints its small mark (the line keeps its height).
  await expect(capture.getByTestId("text-progression-voicing-state")).toHaveCount(0);
  const heights = await capture.locator('[data-testid="text-preview-band"]').evaluateAll((elements) =>
    [...new Set(elements.map((element) => Math.round((element as HTMLElement).getBoundingClientRect().height)))]);
  expect(heights).toHaveLength(1);
  // 2: the chosen card's row says the app's recommendation, not the (nonexistent) original MIDI.
  const row = capture.getByTestId("text-progression-inspector-row");
  await expect(row).toContainText("(アプリのおすすめの音)");
  await expect(row).not.toContainText("元の MIDI の音ではありません");
  // 3: three full-width bar lines + Ｆmaj7 + C△7 = 5 places (not one per full-width character).
  await expect(capture.getByTestId("text-normalize-band")).toContainText("表記を 5 か所そろえています");
  await expect(capture.locator("[data-layer='over'] [data-changed='true']")).toHaveCount(5);
  await page.screenshot({ path: "p89-generated/P24-fix-2/D-pasted-1440.png" });
  // The errors state, kept as a photo for the lead.
  await inputOf(page).fill(ERRORS);
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await page.screenshot({ path: "p89-generated/P24-fix-2/D-errors-1440.png" });
});

test("1: a played card keeps its mark when the other cards are the default", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeyboard(page);
  const capture = captureOf(page);
  // One typed card (the app's sound) and one played card: only the played one differs.
  await inputOf(page).fill("| Cmaj7 |");
  await expect(inputOf(page)).toHaveValue("| Cmaj7 |");
  await play(page, [45, 48, 52, 55]);
  await expect(inputOf(page)).toHaveValue("| Cmaj7 | Am7 |");
  const marks = capture.getByTestId("text-progression-voicing-state");
  await expect(marks).toHaveCount(1);
  await expect(marks).toContainText("弾いた音");
});

test("4: the Lv4 slash-bass tip holds the bass with the left pinky", async ({ page }) => {
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
  await emit(page, [60, 63, 67]);
  await page.waitForTimeout(300);
  await emit(page, [60, 63, 67], false);
  await page.waitForTimeout(400);
  await page.getByTestId("advanced-next").click();
  await expect(page.getByTestId("course-break")).toBeVisible();
  const tip = page.getByTestId("course-break-tip");
  await expect(tip).toContainText("B");
  // fix-2 item 4: the third wording says 「小指で支えましょう」 (not 「小指か親指」).
  await expect(tip).toContainText("小指で支えましょう");
  await expect(tip).not.toContainText("小指か親指");
  await page.screenshot({ path: "p89-generated/P24-fix-2/G-lv4-slash-bass-break-1440.png" });
});

test("5+6: the band drops 「押さえている」 and the position is centred", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeyboard(page);
  const capture = captureOf(page);
  await inputOf(page).fill("| Cmaj7 |");
  await expect(inputOf(page)).toHaveValue("| Cmaj7 |");
  const band = capture.getByTestId("keyboard-entry-band");
  await expect(band).not.toContainText("押さえている");
  await emit(page, [48, 52, 55, 59]);
  await page.evaluate(() => document.fonts.ready);
  await expect(band).toContainText("Cmaj7");
  await expect(band).not.toContainText("押さえている");
  await expect(capture.getByTestId("keyboard-keys")).toHaveAttribute("aria-label", /押さえている音/);
  await page.screenshot({ path: "p89-generated/P24-fix-2/E-holding-1440.png" });
  // 6: the position's vertical centre matches the transport buttons' centre.
  const delta = await capture.evaluate((root) => {
    const position = root.querySelector<HTMLElement>('[data-testid="text-transport-position"]')!;
    const transport = position.closest<HTMLElement>(".lv-text-transport")!;
    const button = transport.querySelector<HTMLButtonElement>("button")!;
    const a = position.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2));
  });
  expect(delta).toBeLessThanOrEqual(1);
});
