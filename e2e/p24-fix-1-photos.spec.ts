import { expect, test, type Page } from "@playwright/test";
import { homeFixture } from "./helpers/p12DojoHome";
import { chooseTextSetting } from "./helpers/app";

/**
 * P24-fix-1 items 7 and 8: the photos the review asked for.
 *
 * - The 続ける band's colours were captured mid-animation; every shot here waits for
 *   `document.getAnimations()` to finish first (item 7).
 * - The empty text screen was captured while the MIDI/テキスト switch was still moving; the same wait is
 *   used before that shot, and the old P24-05 files are retaken.
 * - The new set goes to `p89-generated/P24-fix-1/`; the old photos are kept (item 8).
 */
const AT = "2026-11-08T00:00:00.000Z";
const SIZES = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const HOMES = {
  cd: { band: "[data-testid='home-resume']", button: "[data-testid='home-resume-go']" },
  bp: { band: "[data-testid='bass-home-resume']", button: "[data-testid='bass-home-resume-open']" },
  vl: { band: "[data-testid='voicing-loop-resume']", button: "[data-testid='voicing-loop-resume-go']" },
} as const;
type HomeKey = keyof typeof HOMES;

/** Wait for fonts and every running animation (the review saw mid-animation colours). */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const animations = typeof document.getAnimations === "function" ? document.getAnimations() : [];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  await page.waitForTimeout(60);
}

async function seed(page: Page): Promise<void> {
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
  await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), {
    version: 1,
    entries: [
      { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at: AT },
      { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at: AT },
      { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at: AT },
    ],
  });
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
  }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
}

async function finishOneDegreeAttempt(page: Page): Promise<void> {
  await page.goto("/");
  await settle(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
  await view.locator("[data-review-rating='good']").click();
  await view.getByTestId("degree-next").click();
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();
}

async function openHome(page: Page, key: HomeKey): Promise<void> {
  if (key === "cd") {
    await page.goto("/");
    await page.locator('[data-nav="chord-dojo"]').click();
  } else if (key === "bp") {
    await page.goto("/");
    await page.locator('[data-nav="bass-practice"]').click();
  } else {
    await page.goto("/?p527Status=vl15-picker");
    await page.locator('[data-nav="voicing-loop"]').click();
  }
  await settle(page);
  await expect(page.locator(HOMES[key].band)).toBeVisible();
}

test("I1: the three 続ける bands, taken after every animation has finished", async ({ page }) => {
  test.setTimeout(300_000);
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await finishOneDegreeAttempt(page);

  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const key of ["bp", "cd", "vl"] as const) {
      await openHome(page, key);
      await page.screenshot({ path: `p89-generated/P24-02/I1-${key}-${size.width}-normal.png` });
      if (size.width === 1440) {
        await page.screenshot({ path: `p89-generated/P24-fix-1/I1-${key}-1440-normal.png` });
      }
      await page.locator(HOMES[key].button).hover();
      await settle(page);
      await page.screenshot({ path: `p89-generated/P24-02/I1-${key}-${size.width}-hover.png` });
    }
  }
});

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

const LONG = Array.from({ length: 32 }, (_value, index) => `| ${["Cmaj7", "Am7", "Dm7", "G7"][index % 4]} |`).join("\n");

const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

async function openText(page: Page): Promise<void> {
  await page.goto("/");
  await settle(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await settle(page);
  await expect(inputOf(page)).toBeVisible();
}

async function openKeyboard(page: Page): Promise<void> {
  await page.goto("/?p12=midi");
  await settle(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await captureOf(page).getByTestId("text-keyboard-toggle").click();
  await page.evaluate(async () => {
    await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect();
  });
  await expect(captureOf(page).getByTestId("keyboard-device")).toBeVisible();
  await settle(page);
}

async function play(page: Page, notes: readonly number[]): Promise<void> {
  await page.evaluate((values) => (window as typeof window & { __p12Midi: { emit: (notes: number[]) => void } }).__p12Midi.emit([...values]), notes);
  await page.evaluate((values) => (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean) => void } }).__p12Midi.emit([...values], false), notes);
}

test("D and E: the text screen's photos, taken after every animation has finished", async ({ page }) => {
  test.setTimeout(300_000);
  const Cmaj7 = [48, 52, 55, 59];
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await openText(page);
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-05/D-empty-${size.width}.png` });
    await page.screenshot({ path: `p89-generated/P24-fix-1/D-empty-${size.width}.png` });

    await inputOf(page).fill(MAIN);
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-fix-1/D-pasted-${size.width}.png` });

    await inputOf(page).fill(ERRORS);
    await chooseTextSetting(captureOf(page), "text-progression-key", "C major");
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-fix-1/D-errors-${size.width}.png` });

    await inputOf(page).fill(LONG);
    await inputOf(page).evaluate((element: HTMLTextAreaElement) => { element.scrollTop = element.scrollHeight; });
    await captureOf(page).getByTestId("standard-text-preview-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-fix-1/D-long-${size.width}.png` });

    await openKeyboard(page);
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-fix-1/E-on-${size.width}.png` });
    await page.evaluate((values) => (window as typeof window & { __p12Midi: { emit: (notes: number[]) => void } }).__p12Midi.emit([...values]), Cmaj7);
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-fix-1/E-holding-${size.width}.png` });
    await page.evaluate((values) => (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean) => void } }).__p12Midi.emit([...values], false), Cmaj7);
    await settle(page);
    const chords = [Cmaj7, [45, 48, 52, 55], [50, 53, 57, 60], [43, 50, 53, 59]];
    for (let index = 1; index < 17; index += 1) await play(page, chords[index % 4]!);
    await settle(page);
    await page.screenshot({ path: `p89-generated/P24-fix-1/E-long-${size.width}.png` });
  }
});
