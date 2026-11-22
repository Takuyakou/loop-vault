import { test, expect, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

/**
 * P20 §3: every kind in §1.2 records on its first card, shows up in 続きから, and reopens at the start of the same
 * item / mode / stage / key. Everything here is synthetic localStorage data.
 */
const DOJO = "loop-vault:chord-dojo-txt-jazz-v1:data";
const RECENT = "loop-vault:dojo-recent:v1";

const readRecent = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries[0], RECENT);
const readDojo = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), DOJO);
const note = (page: Page, pitch = 60) => page.evaluate((pitch) => {
  const midi = (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean, spread?: number) => void } }).__p12Midi;
  midi.emit([pitch], true, 0);
  setTimeout(() => midi.emit([pitch], false, 0), 80);
}, pitch);

async function backTwice(page: Page) {
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).not.toBeVisible();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
}
async function backHome(page: Page, kind: string) {
  if (kind === "master" || kind === "today") {
    await page.getByTestId("dojo-back").click();
  } else if (kind === "ear") {
    await page.keyboard.press("Escape");
    await page.getByTestId("dojo-back").click();
  } else {
    await backTwice(page);
  }
  await expect(page.getByTestId("dojo-home")).toBeVisible();
}
async function resume(page: Page, practice: string) {
  await expect(page.getByTestId("home-resume")).toContainText(practice);
  await page.getByTestId("home-resume-go").click();
}

test("続きから: 定番の進行 records and resumes at the same key and the lap head", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").first().getByRole("button", { name: / を練習する$/ }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  await expect(page.locator(".dojo-result")).toContainText("合いました");
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "standard", random: false });
  await backHome(page, "standard");
  await resume(page, "定番の進行");
  await expect(page.locator("[data-dojo-screen=practice]")).toContainText("ii–V–I");
  await expect(page.locator(".dojo-result")).not.toContainText("合いました");
});

test("続きから: Jazz records at the changed stage and resumes there", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.getByTestId("home-open-jazz").click();
  await page.locator("[data-jazz-item]").first().getByTestId("jazz-open").click();
  await expect(page.getByTestId("dojo-jazz")).toBeVisible();
  await page.getByRole("button", { name: /覚えて弾く/ }).first().click();
  await expect(page.getByTestId("dojo-jazz")).toHaveAttribute("data-jazz-stage", "recall");
  await note(page);
  await page.waitForTimeout(250);
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "jazz", stage: "recall" });
  await backHome(page, "jazz");
  await resume(page, "Jazz Progressions");
  await expect(page.getByTestId("dojo-jazz")).toHaveAttribute("data-jazz-stage", entry.stage);
  await expect(page.getByTestId("dojo-jazz")).toHaveAttribute("data-jazz-key", String(entry.key));
  await expect(page.getByTestId("dojo-jazz")).toHaveAttribute("data-jazz-card", "0");
});

test("続きから: Original records and resumes at the same key", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.getByTestId("home-open-original").click();
  await page.locator(".dojo-original-card").first().getByRole("button", { name: / を練習する$/ }).click();
  await expect(page.getByTestId("dojo-original")).toBeVisible();
  await note(page);
  await page.waitForTimeout(250);
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "original" });
  await backHome(page, "original");
  await resume(page, "Original Practice");
  await expect(page.getByTestId("dojo-original")).toHaveAttribute("data-original-key", String(entry.key));
  await expect(page.getByTestId("dojo-original")).toHaveAttribute("data-original-card", "0");
});

test("続きから: 2-5-1 Master records and resumes the same Form and mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
  await expect(page.getByTestId("master251")).toBeVisible();
  await note(page);
  await page.waitForTimeout(250);
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "master" });
  await backHome(page, "master");
  await resume(page, "2-5-1 Master");
  await expect(page.getByTestId("master251")).toHaveAttribute("data-form", entry.master.form);
  await expect(page.getByTestId("master251")).toHaveAttribute("data-practice", entry.master.kind);
});

test("続きから: 耳で弾く records and resumes at the start screen", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByTestId("ear-open").click();
  await page.getByTestId("ear-start").click();
  await expect(page.getByTestId("ear-run")).toBeVisible();
  await page.waitForTimeout(250);
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "ear", id: "ear" });
  await backHome(page, "ear");
  await resume(page, "耳で弾く");
  await expect(page.getByTestId("ear-start")).toBeVisible();
  await expect(page.getByTestId("ear-run")).toHaveCount(0);
});

test("続きから: ボイシングドリル records at the changed key and stage", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
  await page.getByTestId("drill-open-cycle-a").click();
  await expect(page.getByTestId("dojo-drill")).toBeVisible();
  await page.getByTestId("drill-start").click();
  await page.getByTestId("drill-key-select").selectOption("7");
  await page.getByRole("button", { name: /覚えて弾く/ }).first().click();
  if (await page.getByTestId("drill-start").isVisible()) await page.getByTestId("drill-start").click();
  await note(page);
  await page.waitForTimeout(250);
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "drill", id: "cycle-a", stage: "recall", key: 7 });
  await backHome(page, "drill");
  await resume(page, "ボイシングドリル");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-set", "cycle-a");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-stage", "recall");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-key", "7");
  await expect(page.getByTestId("dojo-drill")).toHaveAttribute("data-drill-card", "0");
});

test("続きから: 自分の進行 records and resumes the same saved progression", async ({ page }) => {
  await page.goto("/?p12=no-midi&p104=normal");
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.getByRole("button", { name: "自分の進行", exact: true }).click();
  const card = page.locator(".dojo-list .dojo-card").first();
  const savedName = await card.locator("h2").innerText();
  await card.getByRole("button", { name: "全体を練習する" }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "saved" });
  await backHome(page, "saved");
  await resume(page, "自分の進行");
  await page.locator(".dojo-practice-records>summary").click();
  await expect(page.locator(".dojo-record-context")).toContainText(savedName);
});

test("続きから: 登録した音 records and resumes the same voicing", async ({ page }) => {
  await page.goto("/?p12=no-midi&p104=normal");
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.getByRole("button", { name: "登録した音", exact: true }).click();
  await page.locator(".dojo-list .dojo-card").first().getByRole("button", { name: "これを練習する" }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "voicing" });
  await backHome(page, "voicing");
  await resume(page, "登録した音");
  await expect(page.locator("[data-dojo-screen=practice]")).toContainText("登録した音");
});

test("続きから: コードの型 records and resumes the same shape", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "型の一覧", exact: true }).click();
  await page.locator(".dojo-list .dojo-card").first().getByRole("button", { name: "これを練習する" }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "shape" });
  await backHome(page, "shape");
  await resume(page, "コードの型");
  await expect(page.locator("[data-dojo-screen=practice]")).toContainText("メジャー・基本");
});

test("続きから: 今日のおまかせ resumes the plan at its current cursor and never rewinds", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByTestId("practice-start").click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  await page.getByRole("button", { name: "とばす", exact: true }).click();
  await expect(page.locator("[data-dojo-cursor]")).toHaveAttribute("data-dojo-cursor", /^1:/);
  const during = (await readDojo(page)).today;
  expect(during.cursor.taskIndex).toBe(1);
  await backHome(page, "today");
  const entry = await readRecent(page);
  expect(entry).toMatchObject({ kind: "today", id: "today" });
  await expect.poll(async () => (await readDojo(page)).today?.cursor.taskIndex).toBe(1);
  await expect.poll(async () => (await readDojo(page)).today?.cursor).toEqual(during.cursor);
  await expect.poll(async () => (await readDojo(page)).today?.taskResults).toEqual(during.taskResults);

  // The card's own 「続きから始める」 and the 続きから row both continue at the same cursor.
  await page.getByTestId("practice-start").click();
  await expect(page.locator("[data-dojo-cursor]")).toHaveAttribute("data-dojo-cursor", /^1:/);
  await backHome(page, "today");
  await resume(page, "今日のおまかせ");
  await expect(page.locator("[data-dojo-cursor]")).toHaveAttribute("data-dojo-cursor", /^1:/);
  await expect.poll(async () => (await readDojo(page)).today?.cursor).toEqual(during.cursor);
  await expect.poll(async () => (await readDojo(page)).today?.taskResults).toEqual(during.taskResults);
});

test("続きから: a renamed saved progression keeps working, and a removed one is hidden", async ({ page }) => {
  await page.goto("/?p12=no-midi&p104=normal");
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.getByRole("button", { name: "自分の進行", exact: true }).click();
  await page.locator(".dojo-list .dojo-card").first().getByRole("button", { name: "全体を練習する" }).click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  const entry = await readRecent(page);
  expect(entry.kind).toBe("saved");
  await backHome(page, "saved");
  await expect(page.getByTestId("home-resume")).not.toHaveCount(0);
  const before = await page.getByTestId("home-resume").innerText();

  await page.goto("/?p12=no-midi&p104=renamed");
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  const renamed = await page.getByTestId("home-resume").innerText();
  expect(renamed).toContain("改名");
  expect(renamed).not.toBe(before);
  await page.getByTestId("home-resume-go").click();
  await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
  await page.locator(".dojo-practice-records>summary").click();
  await expect(page.locator(".dojo-record-context")).toContainText("改名");

  await page.goto("/?p12=no-midi&p104=none");
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("home-recent-0")).toHaveCount(0);
  await expect(page.getByTestId("home-resume")).not.toContainText("改名");
  expect((await readRecent(page)).id).toBe(entry.id); // the setting is not deleted just because the item is gone
});
