import { expect, test, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { loadMidiForPreAnalysis, openApp, openBassPractice, openTextCapture, waitForSidebarSettled } from "./helpers/app";
import { openDojo, type MidiControl } from "./helpers/p12";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { emptyStore } from "../src/domain/chordDojo/store";
import { emptyMaster } from "../src/domain/master251/model";

/**
 * P25 V21: no button's words fold onto a second line. Every screen is opened at the app's smallest window
 * (tauri.conf.json minWidth × minHeight) and at 1024 / 1280 / 1440, and each rendered `button`'s text is measured with
 * `Range.getClientRects()`: the text of one inline run (the text nodes that share a block box inside the button) must
 * sit on one line. Buttons whose parts are stacked on purpose (a title block over a detail block, a <br>) are separate
 * runs; a Bass Practice card's description sentence is prose and is left out.
 * Synthetic data only: the in-memory Vault, the p104 / p527 fixtures and the E2E MIDI fixture.
 */
const SIZES = [
  { width: 768, height: 640 },
  { width: 1024, height: 720 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
] as const;
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |";
const midi = (page: Page) => page.evaluate(async () => { await (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.connect(); });

async function boot(page: Page, url = "/") {
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
}
async function textCapture(page: Page) {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill(PROGRESSION);
  return capture;
}
async function vaultPage(page: Page) {
  await boot(page, "/?p104=normal");
  await page.locator('[data-nav="vault"]').click();
  await expect(page.locator(".lv-vault-row").first()).toBeVisible();
}
async function dojoCourse(page: Page) {
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

const SCREENS: Record<string, (page: Page) => Promise<void>> = {
  home: (page) => openApp(page),
  "capture-midi": async (page) => {
    await openApp(page);
    await page.locator('[data-nav="capture"]').click();
    await expect(page.locator("[data-capture-midi-drop-zone]").first()).toBeVisible();
  },
  "capture-pre-analysis": async (page) => {
    await openApp(page);
    await loadMidiForPreAnalysis(page, buildScenarioMidi(p10Scenario("melody-track-8")), "p25-v21.mid");
  },
  "correction-workspace": async (page) => {
    await openApp(page);
    await loadMidiForPreAnalysis(page, buildScenarioMidi(p10Scenario("melody-track-8")), "p25-v21.mid");
    await page.getByTestId("pre-analysis-analyze").click();
    await expect(page.getByTestId("correction-workspace")).toBeVisible();
  },
  "capture-text": async (page) => { await textCapture(page); },
  "text-dock": async (page) => {
    const capture = await textCapture(page);
    // Below 1024 the text screen shows one pane at a time.
    const previewTab = capture.getByRole("tab", { name: "プレビュー", exact: true });
    if (await previewTab.isVisible()) await previewTab.click();
    await capture.locator('[data-testid="text-preview-band"][data-chord="Em7"]:visible').first().click();
    await expect(capture.getByTestId("text-card-dock")).toBeVisible();
  },
  "text-help": async (page) => {
    const capture = await textCapture(page);
    await capture.getByTestId("text-help").click();
    await expect(page.getByTestId("text-help-face")).toBeVisible();
  },
  "text-keys": async (page) => {
    await boot(page, "/?p12=midi");
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 |");
    await capture.getByTestId("text-keyboard-toggle").click();
    await midi(page);
    await expect(capture.getByTestId("keyboard-device")).toBeVisible();
  },
  vault: vaultPage,
  "progression-page": async (page) => {
    await vaultPage(page);
    await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
    await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
  },
  "vl-picker": async (page) => {
    await boot(page, "/?p527Status=vl15-picker");
    await page.locator('[data-nav="voicing-loop"]').click();
  },
  "vl-workspace": async (page) => {
    await boot(page, "/?p527Status=p533-rules&p12=midi");
    await page.locator('[data-nav="voicing-loop"]').click();
    await midi(page);
    await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  },
  "dojo-home": (page) => openDojo(page, "midi"),
  "dojo-standard-list": async (page) => {
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "定番の進行", exact: true }).click();
    await expect(page.locator(".dojo-builtin-page")).toBeVisible();
  },
  "dojo-standard-practice": async (page) => {
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "定番の進行", exact: true }).click();
    await page.locator(".dojo-builtin-card").first().getByRole("button", { name: /を練習する$/ }).click();
    await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible();
  },
  "dojo-course-map": dojoCourse,
  "dojo-course-practice": async (page) => {
    await dojoCourse(page);
    if (await page.getByTestId("course-map").count()) await page.getByTestId("course-map-go").click();
    if (await page.getByTestId("course-demo").count()) await page.getByTestId("course-demo-skip").click();
  },
  "dojo-ear": async (page) => {
    await openDojo(page, "midi");
    await page.getByTestId("ear-open").click();
    await expect(page.getByTestId("ear-start")).toBeVisible();
  },
  "dojo-ear-run": async (page) => {
    await openDojo(page, "midi");
    await page.getByTestId("ear-open").click();
    await page.getByTestId("ear-start").click();
    await expect(page.getByTestId("ear-run")).toBeVisible();
  },
  "dojo-drill-list": async (page) => {
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
    await expect(page.getByTestId("drill-list")).toBeVisible();
  },
  "dojo-drill": async (page) => {
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click();
    await page.locator('[data-testid^="drill-open-"]').first().click();
    await expect(page.getByTestId("dojo-drill")).toBeVisible();
  },
  "dojo-master251": async (page) => {
    const file = emptyStore();
    file.master251 = emptyMaster();
    file.master251.session = { cell: "A:0", seed: 123, paused: false, mode: "learn" };
    await page.addInitScript((data) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(data)), file);
    await openDojo(page, "midi");
    await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
    await expect(page.getByTestId("master251")).toBeVisible();
  },
  "bass-home": async (page) => {
    await openApp(page);
    await page.locator('[data-nav="bass-practice"]').click();
    await expect(page.getByTestId("bass-home-card").first()).toBeVisible();
  },
  "bass-degree": async (page) => {
    await openApp(page);
    await page.locator('[data-nav="bass-practice"]').click();
    await openBassPractice(page, "度数");
    await expect(page.getByTestId("degree-echo-view")).toBeVisible();
  },
  "bass-rhythm": async (page) => {
    await openApp(page);
    await page.locator('[data-nav="bass-practice"]').click();
    await openBassPractice(page, "リズム");
  },
  settings: async (page) => {
    await openApp(page);
    await page.locator('[data-nav="settings"]').click();
    await expect(page.getByTestId("settings-view")).toBeVisible();
  },
  "command-palette": async (page) => {
    await openApp(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "探す" })).toBeVisible();
  },
};

/** Every rendered button whose one inline run takes two lines or more. */
function foldedButtons(page: Page) {
  return page.evaluate(() => {
    const isInline = (element: Element) => getComputedStyle(element).display.startsWith("inline") && getComputedStyle(element).display !== "inline-block" && getComputedStyle(element).display !== "inline-flex" && getComputedStyle(element).display !== "inline-grid";
    const lineCount = (rects: DOMRect[]) => {
      const sorted = rects.filter((rect) => rect.width > 0 && rect.height > 0).sort((a, b) => a.top - b.top);
      let lines = 0;
      let bottom = -Infinity;
      for (const rect of sorted) {
        if (rect.top >= bottom - 1) { lines += 1; bottom = rect.bottom; } else bottom = Math.max(bottom, rect.bottom);
      }
      return lines;
    };
    const found: { text: string; run: string; lines: number }[] = [];
    for (const button of document.querySelectorAll("button")) {
      // Closed <details> keep their contents laid out but unrendered (content-visibility); those are not on screen.
      if (!button.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) continue;
      // One run = the text nodes sharing a block box, split at <br> (a line the markup breaks on purpose).
      const runs = new Map<string, { box: Element; rects: DOMRect[]; words: string }>();
      let breaks = 0;
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof HTMLBRElement) breaks += 1;
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
        let box = node.parentElement!;
        while (box !== button && isInline(box)) box = box.parentElement!;
        const range = document.createRange();
        range.selectNodeContents(node);
        const key = `${[...button.querySelectorAll("*")].indexOf(box)}:${breaks}`;
        const run = runs.get(key) ?? { box, rects: [], words: "" };
        run.rects.push(...range.getClientRects());
        run.words += node.textContent;
        runs.set(key, run);
      }
      for (const { box, rects, words } of runs.values()) {
        // A card's description is a sentence of prose, not a label: it may run on to a second line.
        if (box.matches(".lv-bh-card-text")) continue;
        const lines = lineCount(rects);
        if (lines >= 2) found.push({ text: (button.textContent ?? "").replace(/\s+/g, " ").trim(), run: `${box.tagName.toLowerCase()}.${[...box.classList].join(".")} 「${words.replace(/\s+/g, " ").trim()}」`, lines });
      }
    }
    return found;
  });
}

for (const [screen, reach] of Object.entries(SCREENS)) {
  test(`V21 no button's words fold: ${screen}`, async ({ page }) => {
    test.setTimeout(90_000);
    page.on("dialog", (dialog) => void dialog.accept());
    const folded: string[] = [];
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await reach(page);
      await page.evaluate(() => document.fonts.ready);
      await waitForSidebarSettled(page);
      for (const item of await foldedButtons(page)) folded.push(`${screen}\t${size.width}x${size.height}\t${item.text}\t${item.run}\t${item.lines}`);
    }
    if (process.env.P25_V21_REPORT) appendFileSync(process.env.P25_V21_REPORT, folded.map((line) => `${line}\n`).join(""));
    expect(folded).toEqual([]);
  });
}
