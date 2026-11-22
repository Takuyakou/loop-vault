import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openTextCapture } from "./helpers/app";
import { practiceFromVault } from "./helpers/practice";

/**
 * P22-03: the Home. 「続きから」 is the practice played most recently (Voicing Loop, Chord Dojo or Bass Practice);
 * the two ways into Capture have one shape, and 今日の練習 has a Voicing Loop row without a count.
 */
const LAST_VOICING = "loop-vault:voicing-loop-last:v1";
const DOJO_RECENT = "loop-vault:dojo-recent:v1";

const settle = (page: Page) => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
});

async function saveTextProgression(page: Page, name = "P22-03 Home Fixture") {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 | Dm7 | G7 |");
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-continue")).toBeVisible();
}

async function openVoicingLoopFromHome(page: Page) {
  await page.getByTestId("home-recent-row").first().getByRole("button", { name: "練習", exact: true }).click();
  await expect(page.locator("[data-testid='voicing-loop-workspace']")).toBeVisible();
}

async function practiceOnceInDojo(page: Page) {
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: "進行を開く" }).click();
  await practiceFromVault(page, "Chord Dojo");
  await expect(page.locator("[data-dojo-screen='practice']")).toBeVisible();
  const reveal = page.getByRole("button", { name: "答えを見る（Space）" });
  if (await reveal.count()) await reveal.click();
  await page.getByRole("button", { name: "弾けた（Y）" }).click();
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-continue")).toBeVisible();
}

test("P22-03: the newest Voicing Loop practice becomes 続きから and 続きをやる reopens it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  await openVoicingLoopFromHome(page);
  // The practice screen opened: the small note of this PC is written at that moment.
  expect(await page.evaluate((key) => localStorage.getItem(key), LAST_VOICING)).toContain("ideaId");
  await page.locator('[data-nav="home"]').click();
  const card = page.getByTestId("home-continue");
  await expect(card).toContainText("Voicing Loop");
  await expect(card).toHaveAttribute("data-continue-kind", "voicing-loop");
  await expect(card.getByRole("button", { name: "試聴", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "続きをやる" }).click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await expect(page.locator("[data-testid='voicing-loop-workspace']")).not.toContainText("まだ進行がありません");
});

test("P22-03: the newest Chord Dojo practice becomes 続きから and 続きをやる resumes it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  await practiceOnceInDojo(page);
  const card = page.getByTestId("home-continue");
  await expect(card).toHaveAttribute("data-continue-kind", "chord-dojo");
  await expect(card).toContainText("Chord Dojo");
  await expect(card).not.toContainText("最後に更新");
  // 直し 3: a Vault progression practised from its page is remembered as that progression, not as today's plan.
  await expect(card).toContainText("自分の進行");
  await expect(card).toContainText("P22-03 Home Fixture");
  await expect(card).not.toContainText("今日のおまかせ");
  // P23-61 §1: no empty strip under the row (the card is one row tall).
  await expect(card.locator(".lv-home-strip")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "試聴", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "続きをやる" }).click();
  // The Dojo home's own 「続きから」 resumes into the practice: the same mechanism, not the home.
  await expect(page.locator("[data-dojo-screen='practice']")).toBeVisible();
  await expect(page.getByTestId("dojo-home")).toHaveCount(0);
  // The practice that opened is that progression: its first chord is on the cards.
  await expect(page.locator(".dojo-chord-cards").first()).toContainText("Cmaj7");
});

test("P22-03: nothing practised keeps the old 続きから (the last edited progression)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  const card = page.getByTestId("home-continue");
  await expect(card).toHaveAttribute("data-continue-kind", "edit");
  await expect(card).toContainText("P22-03 Home Fixture");
  await page.mouse.move(5, 5);
  await settle(page);
});

test("P22-03: a progression gone from the Vault, or a Chord Dojo item that cannot open, is not a candidate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "gone", blockId: "gone" }, at: "2026-11-10T10:00:00.000Z" }));
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, entries: [{ kind: "standard", id: "no-such-builtin", key: 0, at: "2026-11-10T11:00:00.000Z" }] }));
  }, { lastKey: LAST_VOICING, recentKey: DOJO_RECENT });
  await saveTextProgression(page);
  const card = page.getByTestId("home-continue");
  await expect(card).toHaveAttribute("data-continue-kind", "edit");
  await expect(card).not.toContainText("Voicing Loop");
  await expect(card).not.toContainText("Chord Dojo");
});

test("P22-03 直し 4: the two ways into Capture are the dotted box and the text button again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  const midi = page.getByRole("button", { name: "MIDI から取り込む" });
  const text = page.getByRole("button", { name: "コード譜のテキストを貼り付け" });
  await expect(midi).toBeVisible();
  await expect(text).toBeVisible();
  // The dotted box carries its own explanation line inside the button.
  await expect(midi).toContainText("取り込むを開いてファイルを選ぶ");
  await expect(midi).toHaveClass(/lv-home-drop/);
  await expect(text).toHaveClass(/lv-home-row-button/);
  await text.click();
  await expect(page.locator("[data-capture-stage='text']")).toBeVisible();
});

test("P22-03: 今日の練習 has three rows; the Voicing Loop row has no count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  const practice = page.locator("section[aria-label='練習']");
  const rows = practice.getByTestId("home-practice-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Voicing Loop");
  await expect(rows.nth(1)).toContainText("Chord Dojo");
  await expect(rows.nth(2)).toContainText("Bass Practice");
  // No round number on the Voicing Loop row (nothing counts its times).
  expect(await rows.nth(0).locator("[role='img']").count()).toBe(0);
  // Nothing practised today: both counted rows say the same words.
  await expect(rows.nth(1)).toContainText("今日はまだ");
  await expect(rows.nth(2)).toContainText("今日はまだ");
  // The two explanations are on the number and the dot row.
  await expect(rows.nth(1).getByTestId("home-practice-week").locator("i")).toHaveCount(7);
  await expect(practice.getByText("この 7 日", { exact: true })).toBeVisible();
});

test("P22-03: a practised day says 今日 n 回", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  await practiceOnceInDojo(page);
  const row = page.getByTestId("home-practice-row").nth(1);
  await expect(row).toContainText(/今日 [1-9]\d* 回/);
});

test("P22-03: the Voicing Loop row shows 前回 when the note is there, and nothing when it is not", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  await openVoicingLoopFromHome(page);
  await page.locator('[data-nav="home"]').click();
  const row = page.getByTestId("home-practice-row").nth(0);
  await expect(row).toContainText(/前回 .+ ・ (今日|昨日|\d+\/\d+)/);
  // The row opens the Voicing Loop itself (the picker).
  await row.click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
});

test("P22-03: the home has no sideways overflow at the five sizes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId("home-continue")).toBeVisible();
    await expect(page.getByTestId("home-practice-row").first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});

test("P22-03 直し 1: coming back to the Chord Dojo tab shows the Dojo home, not the resumed practice", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 900, height: 700 });
  await saveTextProgression(page);
  await practiceOnceInDojo(page);
  await page.getByTestId("home-continue").getByRole("button", { name: "続きをやる" }).click();
  await expect(page.locator("[data-dojo-screen='practice']")).toBeVisible();
  const tabs = page.locator("[data-practice-workspace-tabs]");
  await tabs.getByRole("tab", { name: "Voicing Loop" }).click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await tabs.getByRole("tab", { name: "Chord Dojo" }).click();
  // The resumed practice must not start a second time: the tab shows the Dojo home.
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.locator("[data-dojo-screen='practice']")).toHaveCount(0);
});

test("P22-03 直し 3: today's plan is still remembered as today", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveTextProgression(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.getByTestId("practice-start").click();
  await expect(page.locator("[data-dojo-screen='practice']")).toBeVisible();
  const reveal = page.getByRole("button", { name: "答えを見る（Space）" });
  if (await reveal.count()) await reveal.click();
  await page.getByRole("button", { name: "弾けた（Y）" }).click();
  const newest = await page.evaluate(() => JSON.parse(localStorage.getItem("loop-vault:dojo-recent:v1")!).entries[0]);
  expect(newest.kind).toBe("today");
});
