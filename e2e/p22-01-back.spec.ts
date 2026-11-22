import { test, expect, type Page } from "@playwright/test";
import { openDojo, type MidiControl } from "./helpers/p12";
import { builtinChords } from "./helpers/p12-3";

/**
 * P22-01 §4B: one back button, at the same top-left corner on every screen, one level up; the four practice screens
 * have no second quit control, and the random-key screen keeps its own 「結果を見て終わる」.
 */
const X = 264;
const Y = 105;
const back = (page: Page) => page.getByTestId("dojo-back");
const emit = (page: Page, notes: readonly number[], on = true) =>
  page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit([...notes], on), { notes, on });

async function openBuiltin(page: Page) {
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await expect(page.locator(".dojo-builtin-page")).toBeVisible();
}
const builtinCard = (page: Page, name: string) => page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name, exact: true }) });

async function openEndless(page: Page) {
  await openBuiltin(page);
  await page.getByTestId("dojo-random-toggle").click();await builtinCard(page, "王道進行").getByRole("button",{name:/ を練習する$/}).click();
  await expect(page.locator("[data-dojo-screen=endless]")).toBeVisible();
}

/** Plays one key of 王道進行 as a player does: only the changing notes go off/on. */
async function clearOneKey(page: Page) {
  const key = Number(await page.locator("[data-endless-key]").getAttribute("data-endless-key"));
  const chords = builtinChords("ouudou", key).map((chord) => chord.notes);
  let previous: number[] = [];
  for (const [index, notes] of chords.entries()) {
    const off = previous.filter((note) => !notes.includes(note));
    const on = notes.filter((note) => !previous.includes(note));
    if (off.length) await emit(page, off, false);
    if (on.length) await emit(page, on, true);
    if (index < chords.length - 1) await expect(page.locator(".dojo-endless-cards>button").nth(index)).toHaveAttribute("data-state", "done");
    previous = notes;
  }
  await expect(page.locator(".dojo-endless-clear")).toBeVisible();
  await emit(page, previous, false);
}

/** Every screen the step names, and how to open it from the home. */
const screens: readonly { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: "一覧（定番の進行）", open: async (page) => { await openBuiltin(page); } },
  { name: "一覧（型の一覧）", open: async (page) => { await page.getByTestId("home-shape").locator(".dojo-card-primary").click(); await expect(page.getByRole("heading", { name: "型の一覧", exact: true })).toBeVisible(); } },
  { name: "一覧（自分の進行）", open: async (page) => { await page.getByTestId("home-saved").locator(".dojo-card-primary").click(); await expect(page.getByRole("heading", { name: "自分の進行", exact: true })).toBeVisible(); } },
  { name: "一覧（登録した音）", open: async (page) => { await page.getByTestId("home-wanted").locator(".dojo-card-primary").click(); await expect(page.getByRole("heading", { name: "登録した音", exact: true })).toBeVisible(); } },
  { name: "一覧（ボイシングドリル）", open: async (page) => { await page.getByTestId("home-drill").locator(".dojo-card-primary").click(); await expect(page.getByTestId("drill-list")).toBeVisible(); } },
  { name: "練習（定番の進行）", open: async (page) => { await openBuiltin(page); await builtinCard(page, "王道進行").getByRole("button", { name: / を練習する$/ }).click(); await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible(); } },
  { name: "練習（ランダムキー）", open: async (page) => { await openEndless(page); } },
  { name: "練習（Jazz Progressions）", open: async (page) => { await openBuiltin(page); await page.locator("[data-jazz-item=jazz-progressions-001]").getByTestId("jazz-open").click(); await expect(page.getByTestId("dojo-jazz")).toBeVisible(); } },
  { name: "練習（Original Practice）", open: async (page) => { await openBuiltin(page); await page.locator(".dojo-original-card[data-original=op-traditional-passing]").getByRole("button", { name: / を練習する$/ }).click(); await expect(page.getByTestId("dojo-original")).toBeVisible(); } },
  { name: "練習（ボイシングドリル）", open: async (page) => { await page.getByTestId("home-drill").locator(".dojo-card-primary").click(); await page.locator(".dojo-drill-set").first().getByRole("button", { name: "練習する" }).click(); await expect(page.getByTestId("dojo-drill")).toBeVisible(); } },
  { name: "耳で弾く", open: async (page) => { await page.getByTestId("ear-open").click(); await expect(page.getByTestId("ear-practice")).toBeVisible(); } },
  { name: "2-5-1 Master", open: async (page) => { await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click(); await expect(page.getByTestId("master251")).toBeVisible(); } },
  { name: "耳の記録", open: async (page) => { await page.getByTestId("ear-open").click(); await page.getByTestId("ear-open-records").click(); await expect(page.getByTestId("ear-records")).toBeVisible(); } },
];

test.describe("P22-01 §4B-1: the back button sits at one corner", () => {
  for (const screen of screens) {
    test(`${screen.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDojo(page, "midi");
      await screen.open(page);
      await expect(back(page)).toHaveCount(1);
      const box = await back(page).boundingBox();
      expect(box, "the back button has a box").not.toBeNull();
      expect(Math.abs(box!.x - X), `x at 1440x900 ${JSON.stringify(box)}`).toBeLessThanOrEqual(2);
      expect(Math.abs(box!.y - Y), `y at 1440x900 ${JSON.stringify(box)}`).toBeLessThanOrEqual(2);
      // It is the first thing at the top left of the content: nothing visible sits above it or to its left.
      const before = await page.evaluate(({ x, y }) => {
        const content = document.getElementById("main-content");
        if (!content) return ["no #main-content"];
        return [...content.querySelectorAll<HTMLElement>("button, a, h1, h2, [role=heading]")]
          .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 && getComputedStyle(element).visibility !== "hidden"; })
          .filter((element) => { const rect = element.getBoundingClientRect(); return rect.left < x - 2 && rect.top < y + 20; })
          .map((element) => (element.className || element.tagName).toString().slice(0, 40));
      }, { x: X, y: Y });
      expect(before, "nothing is to the left of the back button").toEqual([]);
    });
  }
});

/** The practice screens that have their own list, and where their back button goes. */
const practices: readonly { name: string; open: (page: Page) => Promise<void>; list: (page: Page) => ReturnType<Page["locator"]> }[] = [
  { name: "定番の進行", open: screens[5]!.open, list: (page) => page.locator(".dojo-builtin-page") },
  { name: "ランダムキー", open: screens[6]!.open, list: (page) => page.locator(".dojo-builtin-page") },
  { name: "Jazz Progressions", open: screens[7]!.open, list: (page) => page.locator(".dojo-builtin-page") },
  { name: "Original Practice", open: screens[8]!.open, list: (page) => page.locator(".dojo-builtin-page") },
  { name: "ボイシングドリル", open: screens[9]!.open, list: (page) => page.getByTestId("drill-list") },
];

test.describe("P22-01 §4B-3: the four practice screens have one way out", () => {
  for (const practice of practices) {
    test(`${practice.name}: the back button goes to its list`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDojo(page, "midi");
      await practice.open(page);
      await back(page).click();
      await expect(practice.list(page)).toBeVisible();
      await expect(page.getByTestId("dojo-home")).toHaveCount(0);
    });

    test(`${practice.name}: Esc goes to its list, and there is no やめる button`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDojo(page, "midi");
      await practice.open(page);
      await expect(page.getByRole("button", { name: "やめる（Esc）" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /やめる/ })).toHaveCount(0);
      await page.locator("body").press("Escape");
      await expect(practice.list(page)).toBeVisible();
    });
  }
});

test.describe("P22-01 §4B-3: the random key keeps its own way out", () => {
  test("one cleared key, then 結果を見て終わる shows the summary", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "midi");
    await openEndless(page);
    await clearOneKey(page);
    await page.getByRole("button", { name: "結果を見て終わる（Esc）" }).click();
    await expect(page.locator(".dojo-endless-summary")).toBeVisible();
    await expect(page.locator("[data-dojo-screen=endless]")).toHaveAttribute("data-endless-phase", "summary");
  });

  test("one cleared key, then the back button goes to the list without a summary", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "midi");
    await openEndless(page);
    await clearOneKey(page);
    await back(page).click();
    await expect(page.locator(".dojo-builtin-page")).toBeVisible();
    await expect(page.locator(".dojo-endless-summary")).toHaveCount(0);
    await expect(page.locator("[data-dojo-screen=endless]")).toHaveCount(0);
  });
});
