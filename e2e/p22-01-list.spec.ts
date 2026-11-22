import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

/**
 * P22-01 §3 (step D): the list of 定番の進行. A card starts its practice when pressed (the list's key, or the random key
 * while 「ランダム」 is on); 「今日のテーマにする」 is in the card's 「…」; the group row stays in view; the last practised ones
 * are on top. The card's other controls never start a practice.
 */
const RECENT_KEY = "loop-vault:dojo-recent:v1";
const card = (page: Page, name: string) => page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
const primary = (page: Page, name: string) => card(page, name).getByRole("button", { name: `${name} を練習する`, exact: true });
const practice = (page: Page) => page.locator("[data-dojo-screen=practice]");
const listShown = (page: Page) => expect(page.locator(".dojo-builtin-page")).toBeVisible();

async function openList(page: Page) {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await listShown(page);
}

test("pressing the card starts ① in the list's key, once (click, Enter, Space, and the card's free part)", async ({ page }) => {
  await openList(page);
  await page.getByRole("combobox", { name: "定番のキー" }).selectOption("2");
  for (const how of ["click", "Enter", "Space", "blank"] as const) {
    if (how === "click") await primary(page, "王道進行").click();
    else if (how === "blank") { const box = (await card(page, "王道進行").locator(".dojo-builtin-chords").boundingBox())!; await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); }
    else { await primary(page, "王道進行").focus(); await page.keyboard.press(how); }
    await expect(practice(page), how).toBeVisible();
    // ① 見て弾く, the first chord: it started once and did not move on by itself.
    await expect(page.locator(".dojo"), how).toHaveAttribute("data-dojo-cursor", /^0:see:0:0$/);
    await expect(page.locator(".dojo-chord-cards strong").first(), how).toHaveText("Gmaj7");
    await page.getByTestId("dojo-back").click();
    await listShown(page);
  }
});

test("「ランダム」 on: pressing a card opens the random-key practice; off: the list's key again", async ({ page }) => {
  await openList(page);
  const toggle = page.getByTestId("dojo-random-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await primary(page, "王道進行").click();
  await expect(page.locator("[data-dojo-screen=endless]")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await listShown(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");          // kept while the list is open
  await toggle.click();
  await primary(page, "王道進行").click();
  await expect(practice(page)).toBeVisible();
  // Leaving for the Chord Dojo home and opening the list again: off.
  await page.getByTestId("dojo-back").click();
  await toggle.click();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await expect(page.getByTestId("dojo-random-toggle")).toHaveAttribute("aria-pressed", "false");
});

test("「…」 → 今日のテーマにする sets today's theme as before; Esc and a press outside close the menu", async ({ page }) => {
  await openList(page);
  const more = card(page, "王道進行").getByRole("button", { name: "そのほかの操作" });
  const menu = card(page, "王道進行").getByRole("menu");
  for (const how of ["click", "Enter", "Space"] as const) {
    if (how === "click") await more.click(); else { await more.focus(); await page.keyboard.press(how); }
    await expect(menu, how).toBeVisible();
    await listShown(page);                                               // 「…」 never starts the practice
    await page.keyboard.press("Escape");
    await expect(menu, how).toHaveCount(0);
    await listShown(page);                                               // Esc closed the menu, not the list
  }
  await more.click();
  await page.locator(".dojo-builtin-page h1").click();
  await expect(menu).toHaveCount(0);
  await listShown(page);
  await more.click();
  await menu.getByRole("menuitem", { name: "今日のテーマにする" }).click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("dojo-theme")).toContainText("Fmaj7 G7 Em7");   // 王道進行 in the list's key (C)
});

test("the card's own key controls (a long progression) and 「…」 never start the practice", async ({ page }) => {
  await openList(page);
  const blues = card(page, "ジャズブルース");
  const select = blues.getByRole("combobox");
  await select.selectOption({ index: 1 });
  await select.click();
  await page.keyboard.press("Escape");
  await blues.getByTestId("dojo-omakase").click();
  await blues.getByTestId("dojo-omakase").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await listShown(page);
  await expect(practice(page)).toHaveCount(0);
});

test("the group row stays in view while the list scrolls; its buttons still jump", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);
  const jump = page.locator(".dojo-builtin-jump");
  await page.locator("#dojo-builtin-jazz-progressions").scrollIntoViewIfNeeded();
  await page.locator("[data-jazz-item]").last().scrollIntoViewIfNeeded();
  const box = await jump.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThan(900);
  await expect(jump).toBeInViewport();
  // A jump puts the group's heading just under the sticky row, not under it.
  for (const [button, group] of [[1, "#dojo-builtin-jpop"], [0, "#dojo-builtin-basics"]] as const) {
    await jump.getByRole("button").nth(button).click();
    await expect.poll(async () => {
      const [bar, heading] = await Promise.all([jump.boundingBox(), page.locator(`${group}>h2`).boundingBox()]);
      return heading!.y >= bar!.y + bar!.height - 1 && heading!.y < bar!.y + bar!.height + 40;
    }).toBe(true);
  }
});

test("the help 「?」 opens and closes; the legend names T, SD and D", async ({ page }) => {
  await openList(page);
  const help = page.getByTestId("dojo-list-help");
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".dojo-builtin-head [role=note]")).toContainText("ランダム");
  await help.click();
  await expect(page.locator(".dojo-builtin-head [role=note]")).toBeHidden();
  await expect(page.locator(".dojo-builtin-head").getByTestId("dojo-fn-legend")).toHaveText(/T トニック.*SD サブドミナント.*D ドミナント/);
});

test("「最近やった」: the standard progressions practised last, on top; none, no row", async ({ page }) => {
  await openList(page);
  await expect(page.getByTestId("dojo-recent-row")).toHaveCount(0);
  await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 1, entries: [
    { kind: "standard", id: "ii-v-i-major", key: 5, random: false, at: "2026-11-08T00:00:01.000Z" },
    { kind: "jazz", id: "jazz-progressions-001-main", key: 0, stage: "see", at: "2026-11-08T00:00:00.000Z" },
  ] })), { key: RECENT_KEY });
  await openList(page);
  const row = page.getByTestId("dojo-recent-row");
  await expect(row.locator(".dojo-recent-card")).toHaveCount(1);
  await expect(row.locator(".dojo-recent-card")).toContainText("ii–V–I");
  await row.locator(".dojo-recent-card").click();
  await expect(practice(page)).toBeVisible();
  await expect(page.locator(".dojo-chord-cards strong").first()).toHaveText("Gm7");
});

/** §3-2: the other lists have the same frame — the card is the hit area; its own controls (Jazz versions) stay its own. */
test("Jazz and the drill: the free part of a card opens it; a Jazz version button does not", async ({ page }) => {
  const clickMiddle = async (target: ReturnType<Page["locator"]>) => { const box = (await target.boundingBox())!; await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); };
  await openList(page);
  const jazz = page.locator("[data-jazz-item]").filter({ has: page.getByTestId("jazz-list-version") }).first();
  await jazz.scrollIntoViewIfNeeded();
  await jazz.getByTestId("jazz-list-version").last().click();
  await listShown(page);
  await expect(jazz.getByTestId("jazz-list-version").last()).toHaveAttribute("aria-pressed", "true");
  await clickMiddle(jazz.locator(".dojo-builtin-chords"));
  await expect(page.getByTestId("dojo-jazz")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await page.getByTestId("dojo-back").click();
  await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
  await expect(page.getByTestId("drill-list")).toBeVisible();
  await expect(page.getByTestId("drill-list").getByTestId("dojo-fn-legend")).toBeVisible();
  await clickMiddle(page.getByTestId("drill-degrees-cycle-a"));
  await expect(page.locator("[data-dojo-screen=voicing-drill]")).toBeVisible();
});

// Five sizes: the top of the list (with 「最近やった」) and a group jump; nothing sticks out sideways. (The photos are taken apart.)
const SIZES = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [768, 640]] as const;
test.describe("P22-01 §3 five sizes", () => {
  for (const [width, height] of SIZES) {
    test(`list ${width}x${height}: nothing sticks out sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 1, entries: [
        { kind: "standard", id: "ouudou", key: 0, random: false, at: "2026-11-08T00:00:02.000Z" },
        { kind: "standard", id: "ii-v-i-major", key: 0, random: true, at: "2026-11-08T00:00:01.000Z" },
      ] })), { key: RECENT_KEY });
      await openList(page);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); });
      const wide = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".dojo-builtin-page, .dojo-builtin-page *")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").map((e) => e.className));
      expect(wide).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator(".dojo-builtin-jump").getByRole("button").nth(1).click();
      await expect(page.locator("#dojo-builtin-jpop>h2")).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
