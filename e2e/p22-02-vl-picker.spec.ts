import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression } from "./helpers/app";
import { startPracticeFromRow } from "./helpers/voicingLoopPicker";

/**
 * P22-02 / P23-29: the Voicing Loop picker. The row is picked by the first press and the practice starts from
 * the picked row (a second press or Enter) or from the right column's main 「この進行で練習する」; the star sits
 * above the row and never starts the practice; an unavailable row cannot be pressed.
 */
const RECENT_KEY = "loop-vault:voicing-loop-recents:v1";
const ROW = "voicing-loop-progression-row";
const MAIN = "voicing-loop-preview-practice";

const seedRecent = (page: Page) => page.addInitScript(() => {
  localStorage.setItem("loop-vault:voicing-loop-recents:v1",
    JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
});

async function openFixturePicker(page: Page, status = "vl15-picker") {
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await expect(page.getByTestId(ROW).first()).toBeVisible();
}

async function countRecentWrites(page: Page) {
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    const probe = { writes: 0 };
    (window as unknown as { __recents: typeof probe }).__recents = probe;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) probe.writes += 1;
      return original.call(this, name, value);
    };
  }, RECENT_KEY);
}
const recentWrites = (page: Page) => page.evaluate(() => (window as unknown as { __recents: { writes: number } }).__recents.writes);

const openRealPicker = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  // The browser test keeps the Vault in memory only, so each of these starts from its own saved progression.
  await createSavedProgression(page, "P22-02 Row Target");
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId(ROW)).toHaveCount(1);
  await countRecentWrites(page);
};

for (const how of ["click", "Enter", "Space"] as const) {
  test(`P22-02: a row opens its practice once by ${how}`, async ({ page }) => {
    test.setTimeout(180_000);
    await openRealPicker(page);
    if (how === "click") {
      // P23-29 L8: the only row is already picked, so one press starts the practice.
      await startPracticeFromRow(page, page.getByTestId(ROW).first());
    } else {
      await page.getByTestId(MAIN).first().focus();
      await page.keyboard.press(how);
    }
    // P23-32 K4: the practice no longer has a BPM field of its own, so the practice being open is read from its panel.
    await expect(page.getByTestId("voicing-loop-current-panel"), `${how}: the practice opens`).toBeVisible({ timeout: 20_000 });
    expect(await recentWrites(page), `${how}: opened once (one recent write)`).toBe(1);
  });
}

test("P22-02: the star never opens the practice (click, Enter and Space)", async ({ page }) => {
  test.setTimeout(180_000);
  await openRealPicker(page);
  const star = page.getByTestId("voicing-loop-favorite").first();
  const before = await star.getAttribute("aria-pressed");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  await expect(page.getByTestId(ROW).first()).toBeVisible();
  expect(await page.getByTestId("voicing-loop-current-panel").count()).toBe(0);
  for (const how of ["Enter", "Space"] as const) {
    await star.focus();
    const pressed = await star.getAttribute("aria-pressed");
    await page.keyboard.press(how);
    await expect(star).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");
    await expect(page.getByTestId(ROW).first()).toBeVisible();
    expect(await page.getByTestId("voicing-loop-current-panel").count(), `${how} on the star`).toBe(0);
  }
});

test("P22-02: with progressions, the picker has no text entry; the search takes the row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRecent(page);
  await openFixturePicker(page);
  // P23-61 §3: adding a progression is 「取り込む」's job, not this screen's.
  await expect(page.getByRole("button", { name: /テキストで新しい進行/ })).toHaveCount(0);
  const search = (await page.locator("#voicing-loop-progression-search").boundingBox())!;
  // The search's own row (the tool row above the two columns) is the row it takes.
  const row = (await page.getByTestId("voicing-loop-picker-tools").boundingBox())!;
  expect(Math.abs(row.x + row.width - (search.x + search.width)), "the search takes the row").toBeLessThanOrEqual(24);
});

test("P22-02: an unavailable row cannot be pressed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixturePicker(page, "selector-vl07");
  const unavailable = page.getByTestId(ROW).filter({ hasText: "Public capacity case" });
  await expect(unavailable).toHaveAttribute("aria-disabled", "true");
  // P23-29 L6: a row has no practice button of its own at all.
  await expect(unavailable.locator("button[data-testid='voicing-loop-progression-practice']")).toHaveCount(0);
  await expect(unavailable).not.toHaveAttribute("data-selected", "true");
  await expect(unavailable.getByTestId("voicing-loop-progression-reason"))
    .toHaveText("長すぎるため、ここでは練習できません(範囲を分けて保存してください)");
  const box = (await unavailable.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId(ROW)).toHaveCount(3);
  expect(await page.getByTestId("voicing-loop-current-panel").count()).toBe(0);
  await expect(unavailable).not.toHaveAttribute("data-selected", "true");
});

test("P22-29: the chosen progression's main button is the filled one in the right column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixturePicker(page);
  // B: the row's own 「練習する」 is gone; the main control is the right column's button.
  await expect(page.getByTestId(ROW).first().locator("[data-testid='voicing-loop-progression-practice']")).toHaveCount(0);
  const main = page.getByTestId(MAIN);
  await expect(main).toBeVisible();
  await expect(main).toContainText("この進行で練習する");
  // B: the right column's main button is the one `primary` (filled) button of the screen.
  expect(await main.getAttribute("class")).toContain("lv-button-primary");
  // The picked row is the one the right column describes.
  const selectedTitle = await page.locator('[data-testid="voicing-loop-progression-row"][data-selected="true"]').first().innerText();
  const previewTitle = await page.getByTestId("voicing-loop-preview-title").innerText();
  expect(selectedTitle).toContain(previewTitle);
});

test("P22-02: the picker has no sideways overflow at the five sizes", async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await seedRecent(page);
    await openFixturePicker(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId(MAIN)).toBeVisible();
    await expect(page.getByTestId("voicing-loop-favorite").first()).toBeVisible();
  }
});

test("P22-02: the section names are small with the count beside them, and the search is a normal field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRecent(page);
  await openFixturePicker(page);
  const measured = await page.evaluate(() => {
    const heading = document.querySelector("h3")!;
    const count = heading.nextElementSibling as HTMLElement;
    const search = document.querySelector("#voicing-loop-progression-search") as HTMLElement;
    search.focus();
    const style = getComputedStyle(search);
    const title = getComputedStyle(heading);
    const facts = document.querySelector("[data-testid='voicing-loop-progression-choice']")?.textContent;
    const strip = document.querySelector("[data-testid='voicing-loop-progression-chords']");
    return {
      fontSize: title.fontSize,
      fontWeight: title.fontWeight,
      colour: title.color,
      countGap: Math.round(count.getBoundingClientRect().left - heading.getBoundingClientRect().right),
      height: style.height,
      outline: style.outlineColor,
      facts,
      chips: strip?.querySelectorAll(".lv-vl-row-chord").length ?? 0,
    };
  });
  expect(measured.fontSize, "the section name is small").toBe("14px");
  expect(measured.fontWeight).toBe("700");
  expect(measured.colour, "the section name is secondary").toBe("rgb(165, 178, 198)");
  expect(measured.countGap, "the count sits beside the name").toBeLessThanOrEqual(12);
  expect(measured.height, "the search matches the other fields").toBe("40px");
  expect(measured.outline, "the normal focus ring").toBe("rgb(139, 215, 255)");
  // P23-29 L5: the facts are one line of words ({キー} ・ {BPM} ・ {n} 小節) and the chords are role-coloured chips.
  expect(measured.facts).toContain("F♯メジャー");
  expect(measured.facts).toContain("120 BPM");
  expect(measured.facts).toContain("32 小節");
  expect(measured.facts).not.toContain("F# major ·");
  expect(measured.chips).toBeGreaterThan(0);
});

test("P22-02: the empty picker says まだ進行がありません and offers MIDI and text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "まだ進行がありません" })).toBeVisible();
  await page.getByRole("button", { name: "MIDI から取り込む" }).click();
  await expect(page.locator("[data-capture-stage='empty']")).toBeVisible();
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByRole("heading", { name: "まだ進行がありません" })).toBeVisible();
  await page.getByRole("button", { name: "テキストで入力", exact: true }).click();
  await expect(page.locator("[data-capture-stage='text']")).toBeVisible();
});
