// P14.0-01 evidence screenshots (git-ignored output): the header button in five states, the panel in four,
// the Chord Dojo / Master notices, the Voicing Loop status and the settings line, at three sizes.
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dateKey, emptyStore, type Task } from "../../src/domain/chordDojo/store";
import { emptyMaster } from "../../src/domain/master251/model";

const output = join(process.cwd(), "p89-generated", process.env.P89_SCREENS_NAME ?? "P14.0-01");
const sizes = [[1440, 900], [960, 1032], [768, 640]] as const;
const results: unknown[] = [];
const DOJO_KEY = "loop-vault:chord-dojo-theme-ranges-v1:data";
const SHAPE: Task = { kind: "shape", key: "preset:basic|close|self|any:quality:maj", quality: "maj", preset: "basic", bass: "self", review: false, roots: [0, 5, 2], seconds: 60 };

interface Midi {
  deferOpen: () => void;
  resumeOpen: (fail?: boolean) => void;
  plug: () => Promise<void>;
  unplug: () => Promise<void>;
  stats: { opens: number };
}
const midi = <T,>(page: Page, run: (m: Midi) => T) => page.evaluate(`(${run.toString()})(window.__p12Midi)`) as Promise<Awaited<T>>;
const chip = (page: Page) => page.locator(".lv-midi-chip");

function practiceFile() {
  const file = emptyStore();
  file.knownQualities.maj = { at: "2026-09-01T00:00:00.000Z", nextRecallAt: "2026-11-01T00:00:00.000Z", recallStep: 0 };
  file.today = { date: dateKey(new Date()), tasks: [SHAPE], cursor: { taskIndex: 0, stage: "recall", keyIndex: 0, chordIndex: 0, answerSeen: false, hints: [], tempoResults: [] }, finished: false, added: [], matched: 0, startedAt: new Date().toISOString() };
  return file;
}
function masterFile() {
  const file = emptyStore();
  file.master251 = emptyMaster();
  for (const entry of Object.values(file.master251.cells)) { entry.learnedAt = "2026-10-01T00:00:00Z"; entry.status = "learning"; }
  file.master251.session = { cell: "A:0", seed: 123, paused: false, mode: "recall" };
  return file;
}

type State = "connected" | "off" | "lost" | "error" | "connecting";
/** Opens the app with the saved synthetic input and brings the connection to `state`. */
async function prepare(page: Page, state: State, dojo?: ReturnType<typeof emptyStore>) {
  await page.addInitScript(({ key, file, autoConnect }) => {
    localStorage.setItem("loop-vault:live-midi-preferences:v1", JSON.stringify({ alwaysOnTop: true, showHistory: true, preferredInput: { backendId: "p12-synthetic", name: "合成入力", previousIndex: 0 } }));
    localStorage.setItem("loop-vault:live-midi-connection:v1", JSON.stringify({ autoConnect }));
    if (file) localStorage.setItem(key, JSON.stringify(file));
  }, { key: DOJO_KEY, file: dojo, autoConnect: state === "connected" || state === "lost" });
  await page.goto("/?p12=midi");
  await expect(chip(page)).toBeVisible();
  if (state === "connected" || state === "lost") await expect(chip(page)).toHaveAttribute("data-midi-kind", "connected", { timeout: 3000 });
  if (state === "lost") await midi(page, (m) => m.unplug());
  if (state === "error" || state === "connecting") {
    await midi(page, (m) => m.deferOpen());
    await chip(page).click();
    await page.getByTestId("midi-panel").getByRole("button", { name: "接続", exact: true }).click();
    await expect.poll(() => midi(page, (m) => m.stats.opens)).toBeGreaterThan(0);
    if (state === "error") await midi(page, (m) => m.resumeOpen(true));
    await page.keyboard.press("Escape");
  }
  if (state === "off") await expect(chip(page)).toHaveAttribute("data-midi-kind", "off");
  else await expect(chip(page)).toHaveAttribute("data-midi-kind", state);
}

async function shoot(page: Page, name: string, width: number, height: number) {
  mkdirSync(output, { recursive: true });
  await page.mouse.move(width / 2, height - 2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(180);
  const geometry = await page.evaluate(() => {
    const main = document.querySelector("#main-content");
    return { overflow: Math.max(document.documentElement.scrollWidth - innerWidth, (main?.scrollWidth ?? 0) - (main?.clientWidth ?? 0)) };
  });
  const filename = `${name}@${width}x${height}.png`;
  await page.screenshot({ path: join(output, filename), animations: "disabled" });
  results.push({ name, filename, width, height, ...geometry });
  writeFileSync(join(output, "manifest.json"), JSON.stringify({ captured: results.length, results }, null, 2));
  expect(geometry.overflow, `${filename} horizontal overflow`).toBe(0);
}

for (const [width, height] of sizes) {
  test(`P14.0-01 evidence ${width}x${height}`, async ({ context }) => {
    test.setTimeout(300_000);
    const fresh = async (state: State, dojo?: ReturnType<typeof emptyStore>) => {
      const page = await context.newPage();
      await page.setViewportSize({ width, height });
      await prepare(page, state, dojo);
      return page;
    };
    // Header button: five states. Panel: four.
    for (const state of ["connected", "off", "lost", "error", "connecting"] as const) {
      const page = await fresh(state);
      await shoot(page, `header-${state}`, width, height);
      if (state !== "connecting") {
        await chip(page).click();
        await expect(page.getByTestId("midi-panel")).toBeVisible();
        await shoot(page, `panel-${state}`, width, height);
      }
      await page.close();
    }
    // Chord Dojo: the start screen with the notice (off), and a practice stopped by a drop (lost).
    let page = await fresh("off", practiceFile());
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.getByTestId("midi-required-notice")).toBeVisible();
    await shoot(page, "dojo-start-off", width, height);
    await page.close();
    page = await fresh("connected", practiceFile());
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByTestId("practice-start").click();
    await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
    await midi(page, (m) => m.unplug());
    await expect(page.getByTestId("midi-required-notice")).toBeVisible();
    await shoot(page, "dojo-practice-lost", width, height);
    await page.close();
    // 2-5-1 Master: stopped by a drop (lost), and off.
    for (const state of ["lost", "off"] as const) {
      page = await fresh(state === "off" ? "off" : "connected", masterFile());
      await page.locator('[data-nav="chord-dojo"]').click();
      await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
      if (state === "lost") await midi(page, (m) => m.unplug());
      await expect(page.getByTestId("master251").getByTestId("midi-required-notice")).toBeVisible();
      await shoot(page, `master-${state}`, width, height);
      await page.close();
    }
    // Voicing Loop status (connected and lost).
    for (const state of ["connected", "lost"] as const) {
      page = await fresh(state);
      await page.locator('[data-nav="voicing-loop"]').click();
      await expect(page.getByTestId("voicing-loop-midi-status")).toHaveAttribute("data-midi-kind", state);
      await shoot(page, `voicing-loop-${state}`, width, height);
      await page.close();
    }
    // Settings: the Live MIDI section (connected, then off).
    for (const state of ["connected", "off"] as const) {
      page = await fresh(state);
      await page.locator('[data-nav="settings"]').click();
      await page.locator("#settings-live-midi").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("settings-midi-status")).toHaveAttribute("data-midi-kind", state);
      await shoot(page, `settings-${state}`, width, height);
      await page.close();
    }
  });
}
