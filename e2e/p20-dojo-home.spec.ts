import { test, expect, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";
import { drillSetById, drillSetRevision } from "../src/domain/chordDojo/voicingDrill";

/** P20: the home as a reader of the existing records, and the small resume setting it owns. */
const KEYS = {
  jazz: "loop-vault:jazz-progressions-v1:data",
  original: "loop-vault:original-practice-v1:data",
  drill: "loop-vault:voicing-drill-v1:data",
  ear: "loop-vault:ear-practice-v1:data",
  recent: "loop-vault:dojo-recent:v1",
};
const at = "2026-11-08T00:00:00.000Z";
const seed = (page: Page, key: string, value: unknown) => page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value });
const drillFile = () => {
  const set = drillSetById("cycle-a")!;
  const cards = set.cards.map((card) => ({ id: card.id, label: card.label, degree: card.degree, form: card.form, left: [...card.left], right: [...card.right] }));
  const cardMs = [3100, 3100, 3100, 3100];
  return { app: "loopvault-voicing-drill", fileVersion: 1, version: 1, revision: 1, operations: [], sets: { "cycle-a": { [drillSetRevision("cycle-a")]: { cards, keys: { 0: { see: { laps: 1, best: { totalMs: 12400, cardMs, at }, last: { totalMs: 12400, cardMs, marks: [], at } } } } } } } };
};
const jazzFile = () => ({ app: "loopvault-jazz-progressions", fileVersion: 1, version: 1, revision: 1, operations: [], laps: { "jazz-progressions-001": { 0: { count: 1, lastAt: at } } } });
const originalFile = () => ({ app: "loopvault-original-practice", fileVersion: 1, version: 1, revision: 1, operations: [], laps: { ["op-traditional-passing"]: { 0: { count: 1, lastAt: at } } } });
const earRecord = { at, play: "p1", questionId: "q1", source: "bank", level: 1, length: 4, chordLevel: 1, kind: "三和音", index: 0, given: false, manual: false, wrongs: 0, hint: 0, replays: 0, judge: "core" };
const earFile = () => ({ app: "loopvault-ear-practice", fileVersion: 1, version: 1, revision: 1, records: [earRecord] });
const recent = () => ({
  version: 1,
  entries: [
    { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at },
    { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at: "2026-11-07T00:00:00.000Z" },
    { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at: "2026-11-06T00:00:00.000Z" },
  ],
});

test("the home shows the record counts, the drill best and the ear score, and writes none of the record files", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, KEYS.jazz, jazzFile());
  await seed(page, KEYS.original, originalFile());
  await seed(page, KEYS.drill, drillFile());
  await seed(page, KEYS.ear, earFile());
  await seed(page, KEYS.recent, recent());
  await openDojo(page, "no-midi");
  const before = await page.evaluate((keys) => Object.fromEntries(Object.values(keys).map((key) => [key, localStorage.getItem(key)])), KEYS);
  await expect(page.getByTestId("home-jazz-count")).toHaveText(/^\d+ \/ \d+$/);
  await expect(page.getByTestId("home-jazz-count")).not.toContainText("—");
  // P23-47-fix-4: the two rows write their numbers the same way (「1 / 12」「1 / 2」).
  await expect(page.getByTestId("home-original-count")).toHaveText(/^1 \/ \d+$/);
  await expect(page.getByTestId("home-drill-best")).toContainText("12.4 秒");
  await expect(page.getByTestId("home-drill")).toContainText("基本の循環");
  await expect(page.getByTestId("home-ear-last")).toHaveText("100");
  await expect(page.getByTestId("home-resume")).toContainText("定番の進行");
  await expect(page.getByTestId("home-resume")).toContainText("C");
  await expect(page.getByTestId("home-recent-0")).toBeVisible();
  await expect(page.getByTestId("home-recent-1")).toBeVisible();
  const after = await page.evaluate((keys) => Object.fromEntries(Object.values(keys).map((key) => [key, localStorage.getItem(key)])), KEYS);
  expect(after).toEqual(before); // the home reads the records; only its own recent setting may change, and it does not here
  // The resume opens the saved condition at its start (nothing is timed yet).
  await page.getByTestId("home-resume-go").click();
  await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
  await expect(page.locator(".dojo-result")).not.toContainText("合いました");
});

test("opening a practice and coming back without playing records nothing", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").first().getByRole("button", { name: / を練習する$/ }).click();
  await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
  await page.getByRole("button", { name: "定番の進行へ戻る" }).click();
  await page.getByRole("button", { name: "Chord Dojoへ戻る" }).click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.recent)).toBeNull();
});

test("the first card of a practice records it, and Enter resumes it when nothing is focused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").first().getByRole("button", { name: / を練習する$/ }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  await expect(page.locator(".dojo-result")).toContainText("合いました");
  await page.getByRole("button", { name: "定番の進行へ戻る" }).click();
  await page.getByRole("button", { name: "Chord Dojoへ戻る" }).click();
  await expect(page.getByTestId("home-resume")).toContainText("定番の進行");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
});

test("focus returns to the drill stage chip that opened it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  await page.getByTestId("home-drill-stage-2").click();
  await expect(page.getByTestId("drill-list")).toBeVisible();
  await page.getByRole("button", { name: "Chord Dojoへ戻る" }).click();
  await expect(page.getByTestId("home-drill-stage-2")).toBeFocused();
});

test("a broken recent entry is dropped, the valid one is shown, and a broken record file reads as —", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, KEYS.recent, { version: 1, entries: [
    { kind: "standard", id: "ii-v-i-major", key: 99, at },
    { kind: "jazz", id: "jazz-progressions-001", stage: "see", key: 3, at },
  ] });
  await seed(page, KEYS.jazz, { app: "loopvault-jazz-progressions", fileVersion: 1, version: 1, revision: 1, operations: [], laps: { broken: true } });
  await openDojo(page, "no-midi");
  await expect(page.getByTestId("home-jazz-count")).toHaveText("—");
  await expect(page.locator("[data-testid=home-standard]")).toContainText("記録を読めませんでした");
  await expect(page.getByTestId("home-resume")).toContainText("Jazz Progressions");
});

test("the MIDI banner is the only warning on the home", async ({ page }) => {
  await openDojo(page, "no-midi");
  await expect(page.getByTestId("home-midi-banner")).toHaveCount(1);
  await expect(page.getByTestId("dojo-home")).not.toContainText("MIDI 鍵盤がつながっていません。答えを見て「弾けた/まだ」を押す形で進みます。MIDI 鍵盤がつながっていません。");
});

test("while the records load, 続きから is disabled; after they load it is enabled", async ({ page }) => {
  await seed(page, KEYS.recent, { version: 1, entries: [{ kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at }] });
  await page.addInitScript(() => sessionStorage.setItem("p20-home-read-delay", "1500"));
  await openDojo(page, "no-midi");
  await expect(page.getByTestId("home-resume")).toContainText("読み込み中");
  await expect(page.getByTestId("home-resume-go")).toBeDisabled();
  await expect(page.getByTestId("home-resume-go")).toBeEnabled({ timeout: 4000 });
});

test("a broken drill record reads as an error and is not deleted", async ({ page }) => {
  await seed(page, KEYS.drill, { app: "loopvault-voicing-drill", fileVersion: 1, version: 1, revision: 1, operations: [], sets: { broken: true } });
  await seed(page, KEYS.recent, { version: 1, entries: [{ kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at }] });
  await openDojo(page, "no-midi");
  await expect(page.getByTestId("home-resume")).toContainText("今は開けません");
  await expect(page.getByTestId("home-resume-go")).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.drill)).toContain("broken");
});

test("a failed save of the recent setting still leaves the home usable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "loop-vault:dojo-recent:v1") throw new Error("quota");
      return original.call(this, key, value);
    };
  });
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").first().getByRole("button", { name: / を練習する$/ }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  await page.getByRole("button", { name: "定番の進行へ戻る" }).click();
  await page.getByRole("button", { name: "Chord Dojoへ戻る" }).click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("loop-vault:dojo-recent:v1"))).toBeNull();
});

test("1440x900 with 続きから has one filled primary and every practice card is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, KEYS.recent, { version: 1, entries: [{ kind: "standard", id: "ii-v-i-major", key: 0, random: false, at }] });
  await openDojo(page, "no-midi");
  await expect(page.getByTestId("home-resume")).toContainText("定番の進行");
  const scroll = await page.evaluate(() => { const main = document.getElementById("main-content")!; return main.scrollHeight - main.clientHeight; });
  // P23-38: the fifth card (the guide) makes the home one short row taller; the page may scroll a little at 1440.
  expect(scroll).toBeLessThanOrEqual(80);
  await expect(page.locator('[data-primary="true"]')).toHaveCount(1);
  const primary = page.locator('[data-primary="true"]');
  expect(await primary.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  for (const testId of ["home-standard", "home-ear", "home-drill", "home-saved", "home-wanted", "home-shape", "home-today"]) await expect(page.getByTestId(testId)).toBeVisible();
  // P22-01 §2: the six operations the old filled-button test looked at are all still on the home, visible and pressable.
  const operations = [
    page.getByTestId("home-resume-go"),
    page.getByTestId("home-standard").getByRole("button", { name: "定番の進行", exact: true }),
    page.getByRole("button", { name: "2-5-1 Master 続きから" }),
    page.getByTestId("ear-open"),
    page.getByTestId("home-drill").getByRole("button", { name: "ボイシングドリル", exact: true }),
    page.getByTestId("practice-start"),
  ];
  for (const operation of operations) {
    const name = (await operation.getAttribute("aria-label")) ?? (await operation.innerText());
    await expect(operation, `${name} is visible`).toBeVisible();
    await expect(operation, `${name} is enabled`).toBeEnabled();
    const pressable = await operation.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === element || element.contains(hit);
    });
    expect(pressable, `${name} is not covered by another control`).toBe(true);
  }
  await page.screenshot({ path: "p89-generated/p20/home-1440x900-resume.png", fullPage: true });
});