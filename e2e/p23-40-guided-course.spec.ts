import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openDojo } from "./helpers/p12";
import { assertNoHorizontalOverflow } from "./helpers/app";

/**
 * P23-40: the guided course Lv1–3 replaces the P23-38 single-session guide behind the same fifth home card.
 * The ordinary Dojo records must stay byte-identical; the course writes only its own store.
 */
const COURSE_KEY = "loop-vault:guided-course-v1:data";
const DOJO_KEY = "loop-vault:chord-dojo-txt-jazz-v1:data";
const FIRST_LV1_NAME = "Fm";
const FIRST_LV1_NOTES = [56, 60, 65];

async function courseValue(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), COURSE_KEY);
}

async function dojoValue(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), DOJO_KEY);
}

async function enterCourse(page: Page): Promise<void> {
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  if (await page.getByTestId("course-map").count()) await page.getByTestId("course-map-go").click();
  if (await page.getByTestId("course-demo").count()) await page.getByTestId("course-demo-skip").click();
}

async function emit(page: Page, notes: readonly number[], on: boolean): Promise<void> {
  await page.evaluate(({ notes, on }) => (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean) => void } }).__p12Midi.emit([...notes], on), { notes, on });
}

test("the guide card stays on the home and opens the course (no second entry, no material chooser)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  // P23-47-fix-4: the guide is its own wide card under the four practice cards, not a fifth card of the grid.
  const cards = page.locator(".dojo-home-p20-main > .dojo-home-p20-card");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".dojo-home-p20-main [data-testid=home-guide]")).toHaveCount(0);
  await expect(page.getByTestId("home-guide")).toHaveAttribute("data-wide", "true");
  await expect(page.getByTestId("home-guide")).toContainText("ガイド練習");
  await expect(page.getByTestId("home-guide")).toContainText("コードを、名前・耳・進行の中で弾けるようにします");
  await expect(page.getByTestId("home-guide-hint")).toContainText("最初の響き C");
  await expect(page.getByTestId("home-guide-change")).toHaveCount(0);
  await expect(page.getByTestId("guided-entry")).toHaveCount(0);
  await enterCourse(page);
  await expect(page.getByTestId("course-prompt-name")).toHaveText(FIRST_LV1_NAME);
  await expect(page.getByTestId("course-level")).toHaveText("Lv1");
  await expect(page.getByTestId("course-instruction")).toBeFocused();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("home-guide-material")).toHaveText("Lv1");
});

test("a correct MIDI answer is sealed, recorded in the course store, and never in the Dojo records", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "midi");
  const dojoBefore = await dojoValue(page);
  await enterCourse(page);
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-midi", "on");
  await expect(page.getByTestId("course-prompt-name")).toHaveText(FIRST_LV1_NAME);
  await page.waitForTimeout(300);
  await emit(page, FIRST_LV1_NOTES, true);
  await page.waitForTimeout(120);
  await emit(page, FIRST_LV1_NOTES, false);
  await expect(page.getByTestId("course-feedback-text")).toHaveAttribute("data-result", "correct");
  await expect(page.getByTestId("course-feedback-text")).toHaveAttribute("data-ok", "true");
  await expect.poll(async () => {
    const raw = await courseValue(page);
    return raw === null ? 0 : JSON.parse(raw).trials.length;
  }).toBe(1);
  const course = JSON.parse((await courseValue(page))!);
  expect(course.app).toBe("loopvault-guided-course");
  expect(course.fileVersion).toBe(1);
  expect(course.trials[0].midiConfirmed).toBe(true);
  expect(course.trials[0].sealedNotes).toEqual(expect.arrayContaining(FIRST_LV1_NOTES));
  expect(await dojoValue(page)).toBe(dojoBefore);
  await page.getByTestId("course-next").click();
  await expect(page.getByTestId("course-progress")).toHaveText("コード名 2 / 20");
  await page.getByTestId("dojo-back").click();
  expect(await dojoValue(page)).toBe(dojoBefore);
});

test("MIDI-less self confirmation is recorded as self evidence, never as a formal pass", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openDojo(page, "no-midi");
  await enterCourse(page);
  await expect(page.getByTestId("course-self-ok")).toBeVisible();
  await page.getByTestId("course-self-ok").click();
  await expect(page.getByTestId("course-feedback-text")).toContainText("弾けた（自己確認）");
  await expect(page.getByTestId("course-next")).toBeEnabled();
  const course = JSON.parse((await courseValue(page))!);
  expect(course.trials[0].selfConfirmed).toBe(true);
  expect(course.trials[0].midiConfirmed).toBe(false);
});

test("unreadable course data keeps the bytes and blocks the screen (no silent reset)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((key) => localStorage.setItem(key, "{damaged"), COURSE_KEY);
  await openDojo(page, "no-midi");
  await enterCourse(page);
  await expect(page.getByTestId("course-unreadable")).toBeVisible();
  await expect(page.getByTestId("course-quarantine")).toBeVisible();
  expect(await courseValue(page)).toBe("{damaged");
});

test("the course screen fits the four required sizes and has no critical axe violations", async ({ page }) => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 960, height: 1032 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openDojo(page, "no-midi");
    await enterCourse(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByTestId("course-prompt")).toBeVisible();
    await expect(page.getByTestId("course-next")).toBeVisible();
    await expect(page.getByTestId("dojo-back")).toBeVisible();
    const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="guided-course"]').analyze();
    expect(axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  }
});
