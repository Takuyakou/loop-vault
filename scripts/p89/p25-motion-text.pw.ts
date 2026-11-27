// P25 V14: the text intake's motions on video (帯の開く・閉じる、鍵盤で入れるの開く・閉じる). Synthetic data only.
// Each motion gets a .webm and a .png of the frames every 0.03s side by side, in p89-generated/P25/motion/.
// ffmpeg: FFMPEG_PATH, else `ffmpeg` on PATH.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { openApp } from "../../e2e/helpers/app";

const OUT = join(process.cwd(), "p89-generated", "P25", "motion");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |";
const SIZE = { width: 1440, height: 900 };
/** The frames: 0.1s before the press to 0.5s after (20 frames at 0.03s). */
const BEFORE = 0.1;
const FRAMES = 20;

async function openText(page: Page) {
  await page.goto("/");
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(PROGRESSION);
  await page.evaluate(() => document.fonts.ready);
  return capture;
}

/** One video: `ready` sets the screen up, `act` is the press that starts the motion. */
async function record(browser: Browser, name: string, crop: { y: number; height: number }, ready: (page: Page) => Promise<void>, act: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, colorScheme: "dark", locale: "ja-JP", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const start = Date.now();
  await ready(page);
  await page.waitForTimeout(400);
  const at = (Date.now() - start) / 1000;
  await act(page);
  await page.waitForTimeout(800);
  const video = page.video()!;
  await context.close();
  const webm = join(OUT, `${name}.webm`);
  renameSync(await video.path(), webm);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(Math.max(0, at - BEFORE)), "-i", webm,
    "-vf", `fps=100/3,crop=${SIZE.width}:${crop.height}:0:${crop.y},scale=iw*0.4:-1,tile=${FRAMES}x1`, "-frames:v", "1", join(OUT, `${name}.png`)]);
}

test("P25 V14 text motion videos", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const em7 = (page: Page) => page.getByTestId("text-preview-band").filter({ hasText: /^.*Em7/ }).first();
  const lower = { y: 300, height: 600 };
  await record(browser, "text-dock-open", lower, async (page) => { await openText(page); }, async (page) => { await em7(page).click(); });
  await record(browser, "text-dock-close", lower, async (page) => {
    await openText(page);
    await em7(page).click();
    await expect(page.getByTestId("text-card-dock")).toHaveAttribute("data-presence", "shown");
  }, async (page) => { await page.getByTestId("text-dock-close").click(); });
  const whole = { y: 60, height: 840 };
  await record(browser, "text-keys-open", whole, async (page) => { await openText(page); }, async (page) => { await page.getByTestId("text-keyboard-toggle").click(); });
  await record(browser, "text-keys-close", whole, async (page) => {
    await openText(page);
    await page.getByTestId("text-keyboard-toggle").click();
    await expect(page.getByTestId("keyboard-entry-band")).toHaveAttribute("data-presence", "shown");
  }, async (page) => { await page.getByTestId("keyboard-close").click(); });
});
