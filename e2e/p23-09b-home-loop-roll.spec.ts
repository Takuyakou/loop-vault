import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, chooseTextSetting } from "./helpers/app";

/** P23-09b: the small piano roll under the 今日のループ chord boxes (Q1–Q9). */

async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
}

async function homeWithTwoFiveOne(page: Page, text = "| Dm7 | G7 | Cmaj7 |") {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await capture.getByTestId("text-progression-name").fill("2-5-1 の帯");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-today-loop")).toBeVisible();
  await page.mouse.move(2, 2);
  await settle(page);
}

const roll = (page: Page) => page.getByTestId("home-loop-roll");
const play = (page: Page) => page.getByTestId("home-today-loop").getByRole("button", { name: "今日のループを再生" });
const stop = (page: Page) => page.getByTestId("home-today-loop").getByRole("button", { name: "停止" }).first();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("Q1/Q6: the band sits right under the chord boxes, as wide as them, decorative only", async ({ page }) => {
  await homeWithTwoFiveOne(page);
  const chips = (await page.locator(".lv-home-chips").boundingBox())!;
  const band = (await roll(page).boundingBox())!;
  expect(Math.abs(band.x - chips.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(band.width - chips.width)).toBeLessThanOrEqual(1);
  expect(band.y - (chips.y + chips.height)).toBeGreaterThanOrEqual(0);
  expect(band.y - (chips.y + chips.height)).toBeLessThanOrEqual(12);
  expect(band.height).toBeGreaterThanOrEqual(44);
  expect(band.height).toBeLessThanOrEqual(66);
  await expect(roll(page)).toHaveAttribute("aria-hidden", "true");
  expect(await roll(page).locator("button, a, input, [tabindex]").count()).toBe(0);
});

test("C2: each chord's notes are that chord's tones, and the bars start where the chord boxes start", async ({ page }) => {
  await homeWithTwoFiveOne(page);
  const tones: Record<number, number[]> = { 0: [2, 5, 9, 0], 1: [7, 11, 2, 5], 2: [0, 4, 7, 11] };
  for (const chord of [0, 1, 2]) {
    const pitches = await roll(page).locator(`[data-roll-chord="${chord}"] .lv-home-roll-note`)
      .evaluateAll((notes) => notes.map((note) => Number(note.getAttribute("data-pitch"))));
    expect(pitches.length, `chord ${chord}`).toBeGreaterThanOrEqual(3);
    for (const pitch of pitches) expect(tones[chord], `chord ${chord} pitch ${pitch}`).toContain(pitch % 12);
  }
  for (const chord of [0, 1]) {
    const box = (await page.locator(`[data-home-loop-chord="${chord}"]`).boundingBox())!;
    const note = (await roll(page).locator(`[data-roll-chord="${chord}"] .lv-home-roll-note`).first().boundingBox())!;
    // The note bar is inset 2px inside its cell; the cell starts where the box starts.
    const cell = (await roll(page).locator(`[data-roll-chord="${chord}"]`).boundingBox())!;
    expect(Math.abs(cell.x - box.x), `chord ${chord} cell`).toBeLessThanOrEqual(1);
    expect(Math.abs(note.x - 2 - box.x), `chord ${chord} note`).toBeLessThanOrEqual(1);
  }
});

test("C3: the highest note is the top bar and the lowest note is the bottom bar", async ({ page }) => {
  await homeWithTwoFiveOne(page);
  const notes = await roll(page).locator(".lv-home-roll-note").evaluateAll((elements) =>
    elements.map((element) => ({ pitch: Number(element.getAttribute("data-pitch")), top: element.getBoundingClientRect().top })));
  const high = Math.max(...notes.map((note) => note.pitch));
  const low = Math.min(...notes.map((note) => note.pitch));
  const tops = notes.map((note) => note.top);
  for (const note of notes.filter((item) => item.pitch === high)) expect(note.top).toBeCloseTo(Math.min(...tops), 0);
  for (const note of notes.filter((item) => item.pitch === low)) expect(note.top).toBeCloseTo(Math.max(...tops), 0);
});

test("C4: ▶ shows a white line that moves left to right; stopping removes it", async ({ page }) => {
  await homeWithTwoFiveOne(page);
  const head = page.getByTestId("home-loop-roll-head");
  await expect(head).toHaveCount(0);
  await play(page).click();
  await expect(head).toBeVisible();
  const first = (await head.boundingBox())!.x;
  await page.waitForTimeout(700);
  const later = (await head.boundingBox())!.x;
  expect(later).toBeGreaterThan(first);
  await stop(page).click();
  await expect(head).toHaveCount(0);
});

test("C4: with reduced motion there is no line; the notes of the sounding chord are marked", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await homeWithTwoFiveOne(page);
  await play(page).click();
  await expect(roll(page).locator('[data-roll-chord][data-current="true"]')).toHaveCount(1);
  await expect(page.getByTestId("home-loop-roll-head")).toHaveCount(0);
  await stop(page).click();
  await expect(roll(page).locator('[data-current="true"]')).toHaveCount(0);
});

test("C6: four sizes, no sideways overflow, no serious or critical axe findings", async ({ page }) => {
  // Eight chords, so the narrow widths hide some boxes (and the same cells).
  await homeWithTwoFiveOne(page, "| Dm7 | G7 | Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 |");
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await expect(roll(page)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    // Q3: as many cells as chord boxes are shown, each starting where its box starts.
    const lined = await page.evaluate(() => {
      const shown = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((element) => getComputedStyle(element).display !== "none").map((element) => element.getBoundingClientRect().left);
      return { boxes: shown("[data-home-loop-chord]"), cells: shown("[data-roll-chord]") };
    });
    expect(lined.cells.length, `${width}x${height}`).toBe(lined.boxes.length);
    lined.cells.forEach((left, index) => expect(Math.abs(left - lined.boxes[index]!), `${width}x${height} cell ${index}`).toBeLessThanOrEqual(1));
    const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking.map((violation) => violation.id), `${width}x${height}`).toEqual([]);
  }
});
