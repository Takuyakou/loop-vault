import { test, expect, type Locator, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";

/**
 * P22-01 §2: the Chord Dojo home. One filled primary (the resume band, or the "start the guide" button when there is
 * nothing to resume), eight cards that are each one hit area, and the small links inside a card that must go to their
 * own screen without pressing the card.
 * P23-47-fix-4: 今日のおまかせ's 始める is filled too (the adopted mock; it starts a practice at once). The other seven
 * cards' primaries are their names and stay unfilled.
 */
const at = "2026-11-08T00:00:00.000Z";
const RECENT_KEY = "loop-vault:dojo-recent:v1";
const seedRecent = (page: Page, entries: readonly unknown[]) =>
  page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: RECENT_KEY, value: { version: 1, entries } });

interface CardSpec {
  /** The card (the `article`/`section` the primary is in). */
  readonly id: string;
  /** The primary's accessible name. */
  readonly name: string;
  /** The screen the primary opens. */
  readonly destination: (page: Page) => Locator;
  /** A screen that would only appear if the card advanced a second time. */
  readonly deeper?: (page: Page) => Locator;
  /** The free (non-control) part of the card, clicked to prove the whole card is the hit area. */
  readonly blank: (card: Locator) => Locator;
  /** P23-27 H7: the today card has two buttons, not one whole-card hit area. */
  readonly wholeCard?: boolean;
}

const cards: readonly CardSpec[] = [
  { id: "home-standard", name: "定番の進行", destination: (page) => page.locator(".dojo-builtin-page"), deeper: (page) => page.locator("[data-dojo-screen=practice]"), blank: (card) => card.locator(".dojo-home-p20-desc") },
  { id: "home-master", name: "2-5-1 Master 続きから", destination: (page) => page.getByTestId("master251"), blank: (card) => card.locator(".dojo-home-p20-desc") },
  { id: "home-ear", name: "耳で弾く", destination: (page) => page.getByTestId("ear-practice"), blank: (card) => card.locator(".dojo-home-p20-desc") },
  { id: "home-drill", name: "ボイシングドリル", destination: (page) => page.getByTestId("drill-list"), deeper: (page) => page.locator("[data-dojo-screen=voicing-drill]"), blank: (card) => card.locator(".dojo-home-p20-desc") },
  { id: "home-saved", name: "自分の進行", destination: (page) => page.getByRole("heading", { name: "自分の進行", exact: true }), blank: (card) => card.locator(".dojo-home-one-line > span").first() },
  { id: "home-wanted", name: "登録した音", destination: (page) => page.getByRole("heading", { name: "登録した音", exact: true }), blank: (card) => card.locator(".dojo-home-one-line > span").first() },
  { id: "home-shape", name: "型の一覧", destination: (page) => page.getByRole("heading", { name: "型の一覧", exact: true }), blank: (card) => card.locator(".dojo-keys") },
  { id: "home-today", name: "始める", destination: (page) => page.locator("[data-dojo-screen=practice]"), blank: (card) => card.locator("[data-testid=dojo-theme]"), wholeCard: false },
];

const primaryOf = (page: Page, card: CardSpec) => card.id === "home-today" ? page.getByTestId("practice-start") : page.getByTestId(card.id).locator(".dojo-card-primary");

/** The filled background of an element (used to prove only one control is filled). */
const background = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);

test.describe("P22-01 §2: one filled primary", () => {
  test("with 続きから the resume band is the only filled primary", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedRecent(page, [{ kind: "standard", id: "ii-v-i-major", key: 0, random: false, at }]);
    await openDojo(page, "no-midi");
    await expect(page.getByTestId("home-resume")).toContainText("定番の進行");
    await expect(page.locator('[data-primary="true"]')).toHaveCount(1);
    await expect(page.getByTestId("home-resume-go")).toHaveAttribute("data-primary", "true");
    const filled = await background(page.getByTestId("home-resume-go"));
    expect(filled).not.toBe("rgba(0, 0, 0, 0)");
    for (const card of cards) {
      await expect(primaryOf(page, card), `${card.name}: the card's primary is not filled`).toHaveCount(1);
      if (card.id === "home-today") expect(await background(primaryOf(page, card)), "始める is filled (P23-47-fix-4)").toBe(filled);
      else expect(await background(primaryOf(page, card)), `${card.name}: the card's primary is not filled`).not.toBe(filled);
    }
  });

  test("without 続きから the band's 「ガイド練習を始める」 is the only data-primary", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "no-midi");
    await expect(page.getByTestId("home-resume")).toContainText("まずは");
    await expect(page.locator('[data-primary="true"]')).toHaveCount(1);
    // P23-47-fix-4: with nothing to resume, the band starts the guide (a newcomer's first step).
    await expect(page.locator('[data-primary="true"]')).toHaveText("ガイド練習を始める");
    const filled = await background(page.locator('[data-primary="true"]'));
    expect(filled).not.toBe("rgba(0, 0, 0, 0)");
    for (const card of cards) {
      const primary = primaryOf(page, card);
      await expect(primary, `${card.name}: the card has one primary`).toHaveCount(1);
      if (card.id === "home-today") expect(await background(primary), "始める is filled (P23-47-fix-4)").toBe(filled);
      else expect(await background(primary), `${card.name}: the card's primary is not filled`).not.toBe(filled);
    }
    await page.locator('[data-primary="true"]').click();
    await expect(page.getByTestId("guided-course")).toBeVisible();
  });
});

test.describe("P22-01 §2: every card is one hit area", () => {
  // P25 T3: click only. Every primary is a native <button>, so Enter and Space reach the same onClick.
  test("each whole-card hit area opens its own screen once (click)", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "no-midi");
    for (const card of cards) {
      if (card.wholeCard === false) continue;
      const primary = primaryOf(page, card);
      await expect(primary, `${card.name}: the card has one primary`).toHaveCount(1);
      await primary.click();
      await expect(card.destination(page), `${card.name} opens its screen`).toBeVisible();
      await expect(page.getByTestId("dojo-home"), `${card.name} leaves the home`).toHaveCount(0);
      if (card.deeper) await expect(card.deeper(page), `${card.name} does not advance twice`).toHaveCount(0);
      if (card.id === "home-today") {
        await expect(page.locator("[data-dojo-cursor]"), "today's practice starts at its first task").toHaveAttribute("data-dojo-cursor", /^0:/);
        await expect(page.locator(".dojo-result")).not.toContainText("合いました");
      }
      await page.getByTestId("dojo-back").click();
      await expect(page.getByTestId("dojo-home"), `${card.name} returns to the home`).toBeVisible();
    }
  });

  test("clicking the free part of a card (its description) opens the card", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "no-midi");
    for (const card of cards) {
      if (card.wholeCard === false) continue;
      const blank = card.blank(page.getByTestId(card.id));
      await expect(blank, `${card.name}: the blank part is on screen`).toBeVisible();
      // P23-38: the fifth card makes the home taller; scroll the card into view before using the pointer.
      await blank.scrollIntoViewIfNeeded();
      const box = await blank.boundingBox();
      expect(box, `${card.name}: the blank part has a box`).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await expect(card.destination(page), `${card.name}: the blank part opens the card`).toBeVisible();
      await page.getByTestId("dojo-back").click();
      await expect(page.getByTestId("dojo-home")).toBeVisible();
    }
  });
});

test.describe("P22-01 §2: the small links in a card", () => {
  const links = [
    {
      id: "home-open-jazz",
      name: "Jazz Progressions",
      check: async (page: Page) => {
        await expect(page.locator(".dojo-builtin-page")).toBeVisible();
        // The card's own primary opens this list at the top; this link opens it at the Jazz group.
        await expect(page.locator("#dojo-builtin-jazz-progressions")).toBeInViewport();
      },
    },
    {
      id: "home-ear-records",
      name: "記録を見る",
      check: async (page: Page) => {
        await expect(page.getByTestId("ear-records")).toBeVisible();
      },
    },
    {
      id: "home-drill-stage-2",
      name: "② 覚えて弾く (the drill's stage link)",
      check: async (page: Page) => {
        await expect(page.getByTestId("drill-list")).toBeVisible();
        // It opens the list at that stage, not at the top and not in a practice.
        await expect.poll(async () => (await page.getByTestId("drill-stage-section-2").boundingBox())?.y ?? -1).toBeLessThan(320);
        await expect(page.locator("[data-dojo-screen=voicing-drill]")).toHaveCount(0);
      },
    },
    {
      id: "home-today-details",
      name: "中身を見る",
      check: async (page: Page) => {
        // This one must not leave the home at all: it only opens the detail body.
        await expect(page.getByTestId("dojo-home")).toBeVisible();
        await expect(page.getByTestId("home-today-details-body")).toBeVisible();
        // The fine numbers (the plan rows and the time budget) still live inside 中身を見る.
        await expect(page.getByTestId("home-today-details-body")).toContainText("1回の目安");
        await expect(page.getByTestId("home-today-details-body")).toContainText("復習");
        await expect(page.locator("[data-dojo-screen=practice]")).toHaveCount(0);
      },
    },
  ] as const;

  // P25 T3: click only. Each link is a native <button>, so Enter reaches the same onClick.
  for (const link of links) {
    test(`${link.name} goes to its own place (click)`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openDojo(page, "no-midi");
      const control = page.getByTestId(link.id);
      await expect(control).toBeVisible();
      await control.click();
      await link.check(page);
    });
  }

  test("the card's own primary opens the standard list at the top, unlike the Jazz link", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "no-midi");
    await primaryOf(page, cards[0]!).click();
    await expect(page.locator(".dojo-builtin-page")).toBeVisible();
    await expect(page.locator("#dojo-builtin-jazz-progressions")).not.toBeInViewport();
  });
});

test("P23-47-fix-4: a bar has the shape of its number (segments for a count, a 100-wide scale for the ear score)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  // 定番の進行: one segment for each progression of the list, in each of its two rows.
  for (const [row, count] of [["home-open-jazz", "home-jazz-count"], ["home-open-original", "home-original-count"]] as const) {
    await expect(page.getByTestId(count)).toHaveText(/^\d+ \/ \d+$/);
    const [done, total] = (await page.getByTestId(count).innerText()).split("/").map((part) => Number(part.trim()));
    await expect(page.getByTestId(row).locator(".dojo-home-p20-pips i")).toHaveCount(total!);
    await expect(page.getByTestId(row).locator(".dojo-home-p20-pips i[data-on]")).toHaveCount(done!);
  }
  // The plain percentage bars are gone: 2-5-1 Master's 48 cells are its picture, and the drill's seconds have no full length.
  await expect(page.getByTestId("dojo-home").locator(".dojo-home-p20-bar")).toHaveCount(0);
  for (const id of ["home-master", "home-drill"]) await expect(page.getByTestId(id).locator(".dojo-home-p20-pips, .dojo-home-p20-scale")).toHaveCount(0);
  // 耳で弾く: the score is a first-try rate (0–100). Without a score the scale is empty and no best mark is drawn.
  await expect(page.getByTestId("home-ear").locator(".dojo-home-p20-scale")).toHaveCount(1);
  await expect(page.getByTestId("home-ear").locator(".dojo-home-p20-scale")).toHaveAttribute("data-empty", "true");
  await expect(page.getByTestId("home-ear-best")).toHaveCount(0);
  await expect(page.getByTestId("home-ear-last")).toHaveText("まだ");
});

test("P22-01 §2: the four practice cards make two rows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const boxes = await page.evaluate(() => [...document.querySelectorAll(".dojo-home-p20-main > *")].map((element) => ({
    top: Math.round(element.getBoundingClientRect().top),
  })));
  expect(boxes, "four practice cards (P23-47-fix-4: the guide is its own wide card under them)").toHaveLength(4);
  // P23-27 H1: the four cards are a 2 × 2 grid. The row height and the last line inside the card are
  // p23-27-dojo-home.spec.ts "P23-31 C8" (row 1/2 is level, the last line stays inside the card).
  const tops = [...new Set(boxes.map((box) => box.top))];
  expect(tops, "the cards make two rows").toHaveLength(2);
});

test("P22-01 §2: the eight card names are two sizes (the four big 17px, the four small 14px)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const headings = await page.evaluate(() => {
    const ids = ["home-standard", "home-master", "home-ear", "home-drill", "home-saved", "home-wanted", "home-shape", "home-today"];
    return ids.map((id) => {
      const card = document.querySelector(`[data-testid=${id}]`) as HTMLElement;
      const heading = card.querySelector("h2,h3") as HTMLElement;
      const style = getComputedStyle(heading);
      return { id, fontSize: style.fontSize, fontWeight: style.fontWeight, y: Math.round(heading.getBoundingClientRect().y) };
    });
  });
  expect(headings, "eight card names").toHaveLength(8);
  // P23-27 H4/H8: the four big cards' titles are 17px; the four small cards keep 14px.
  const bigIds = new Set(["home-standard", "home-master", "home-ear", "home-drill"]);
  const big = headings.filter((item) => bigIds.has(item.id));
  const small = headings.filter((item) => !bigIds.has(item.id));
  expect(big.every((item) => item.fontSize === "17px"), `17px for the big cards ${JSON.stringify(big)}`).toBe(true);
  expect(small.every((item) => item.fontSize === "14px"), `14px for the small cards ${JSON.stringify(small)}`).toBe(true);
  // P23-31b: the four big card names are bold 17px; the four small ones stay regular 14px.
  expect(big.every((item) => item.fontWeight === "700"), `700 for the big cards ${JSON.stringify(big)}`).toBe(true);
  expect(small.every((item) => item.fontWeight === "400"), `400 for the small cards ${JSON.stringify(small)}`).toBe(true);
});
