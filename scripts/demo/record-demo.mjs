/* global console, fetch, setTimeout, document */
// P25-15 (M8): records the README demo GIF with the app's own Playwright video recording.
//
//   node scripts/demo/record-demo.mjs
//
// Uses synthetic data only (text intake with the lead's progression; the Chord Dojo shows one question
// without answering it). Output: docs/images/v3-demo.gif (960px wide, 15 fps, loop, no sound).
// `ffmpeg` comes from PATH or FFMPEG_PATH; it is deliberately NOT a package.json script or dependency.
//
// Re-record:
//   1. npm run build
//   2. node scripts/demo/record-demo.mjs
//   3. look at docs/images/v3-demo.gif and commit it with the README change
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workDir = join(root, "p89-generated", "p25-demo");
const videoDir = join(workDir, "video");
const outDir = join(root, "docs", "images");
const outFile = join(outDir, "v3-demo.gif");
const port = Number(process.env.LOOP_VAULT_DEMO_PORT ?? 4188);
const baseURL = `http://127.0.0.1:${port}`;
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

/** The progression the lead's demo storyboard uses (synthetic). */
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |";

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function hasFfmpeg() {
  const probe = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" });
  return probe.status === 0;
}

function startPreview() {
  const child = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root, shell: true, stdio: "ignore",
  });
  return child;
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await wait(250);
  }
  throw new Error(`the preview server did not start on ${baseURL}`);
}

async function main() {
  if (!existsSync(join(root, "dist", "index.html"))) {
    throw new Error("dist/index.html is missing: run `npm run build` first.");
  }
  if (!hasFfmpeg()) {
    console.error(`ffmpeg was not found (PATH or FFMPEG_PATH). Install ffmpeg and run this again. Nothing was changed.`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(outDir, { recursive: true });
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });

  const server = startPreview();
  try {
    await waitForServer();
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.evaluate(() => document.fonts.ready);
    await wait(1400);

    // Scene 1: text intake — paste, get cards, choose one, change its shape (② ルートレス), save it.
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
    const capture = page.getByTestId("text-progression-capture");
    const input = capture.getByTestId("text-progression-input");
    await input.click();
    await input.fill(PROGRESSION);
    await wait(1200);
    const em7 = capture.getByTestId("text-preview-band").filter({ hasText: /Em7/ }).first();
    await em7.click();
    await wait(900);
    await capture.getByTestId("text-card-dock").locator('[data-shape="rootless"]').click();
    await wait(1400);
    await capture.getByTestId("text-progression-name").fill("デモの進行");
    await capture.getByTestId("text-progression-save").click();
    await page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).waitFor();
    await wait(1000);

    // Scene 2: Voicing Loop — open the saved progression and play it (playhead, fingerings, keyboard).
    await page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).click();
    const workspace = page.getByTestId("voicing-loop-workspace");
    await workspace.waitFor();
    await page.getByLabel("カウントイン").selectOption("0");
    await page.getByRole("button", { name: "開始", exact: true }).click();
    await wait(9200);
    await page.getByRole("button", { name: "停止", exact: true }).click().catch(() => undefined);

    // Scene 3: Chord Dojo — one question from today's practice.
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByTestId("practice-start").click();
    await wait(8200);

    const video = page.video();
    await context.close();    await browser.close();
    const webm = await video.path();
    const gifArgs = (width) => [
      "-y", "-i", webm,
      "-vf", `fps=15,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`,
      "-loop", "0", outFile,
    ];
    let converted = spawnSync(ffmpeg, gifArgs(960), { stdio: "inherit" });
    if (converted.status !== 0) throw new Error("ffmpeg could not make the GIF");
    let size = statSync(outFile).size;
    if (size > 8 * 1024 * 1024) {
      converted = spawnSync(ffmpeg, gifArgs(800), { stdio: "inherit" });
      if (converted.status !== 0) throw new Error("ffmpeg could not make the smaller GIF");
      size = statSync(outFile).size;
    }
    console.log(`wrote ${outFile} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    if (size > 8 * 1024 * 1024) console.error("the GIF is still over 8MB: shorten the recording or the pauses.");
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
