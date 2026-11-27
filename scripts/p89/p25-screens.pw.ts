// P25 evidence screenshots (not a product contract). Run via `npm run p89:screens -- P25`.
// Synthetic data only: the in-memory Vault and the E2E MIDI fixture. Screens are the ones
// DS-1's stages change (the rename, the 「?」 face, 「鍵盤で入れる」's key caps, the `[C]歌詞`
// lines and the two width fixes); the later groups add their own screens here.
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openApp, waitForSidebarSettled } from "../../e2e/helpers/app";
import { practiceFromVault } from "../../e2e/helpers/practice";
import { loadMidiForPreAnalysis } from "../../e2e/helpers/app";
import { buildScenarioMidi, p10Scenario } from "../../src/testing/p10SyntheticSongs";
import { homeFixture } from "../../e2e/helpers/p12DojoHome";
import { openDojo } from "../../e2e/helpers/p12";

const NAME = process.env.P89_SCREENS_NAME ?? "P25";
const OUT = join(process.cwd(), "p89-generated", NAME);
/** The progression the lead's photo list uses for every Capture screen. */
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |";
/** E: two lines of 歌詞 with the chords written inside the words. */
const LYRICS = "[C]きょうも[G]あるく[Am]みちを[F]\n[C]かぜの[G]なかを[Am]あるいて[F]";
/** P25 V32: a chord sheet as a person writes it — the setting lines and the `---` section headings. */
const SHEET = [
  "Key: D minor",
  "BPM: 108",
  "Time Signature: 4/4",
  "",
  "--- A Section ---",
  "",
  "| Dm11 | Em11 |",
  "| Dm11 | Bbmaj9(#11) |",
  "| Gm9 | Abm9 |",
  "| Am11 | A7(#9,b13) |",
  "",
  "--- B Section ---",
  "",
  "| Dm9 | Fmaj9/E |",
  "| Ebmaj9(#11) | D13(#11) |",
  "| Gm11 | C13 |",
  "| Fmaj9 | Em11 Eb13(#11) |",
].join("\n");
const WANTED = (process.env.P25_SHOTS ?? "").split(",").map((item) => item.trim()).filter(Boolean);

const captured: string[] = [];
const failed: { screen: string; reason: string }[] = [];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

async function openTextCapture(page: Page) {
  await page.goto("/");
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await expect(capture).toBeVisible();
  return capture;
}

test("P25 evidence screens", async ({ page }) => {
  test.setTimeout(420_000);
  mkdirSync(OUT, { recursive: true });
  page.on("dialog", (dialog) => void dialog.accept());

  async function shot(name: string, reach: () => Promise<void>) {
    if (WANTED.length > 0 && !WANTED.includes(name)) return;
    try {
      await reach();
      await settle(page);
      await waitForSidebarSettled(page);
      await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", caret: "hide" });
      captured.push(name);
    } catch (error) {
      failed.push({ screen: name, reason: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) });
    }
  }

  // 09-help: the 「?」 at the band's right end with its three headings.
  await shot("09-help", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await capture.getByTestId("text-help").click();
    await expect(page.getByTestId("text-help-face")).toBeVisible();
  });

  // 14-keys-band: 「鍵盤で入れる」 on, its length buttons showing their key caps.
  await shot("14-keys-band", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill("| Cmaj7 |");
    await capture.getByTestId("text-keyboard-toggle").click();
    await expect(capture.getByTestId("keyboard-entry-band")).toBeVisible();
  });

  // 15-chordpro: two lines of 歌詞 with `[C]` chords, just pasted.
  await shot("15-chordpro", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(LYRICS);
    await expect(capture.getByTestId("text-preview-band").first()).toBeVisible();
  });

  // 16-chordpro-clean: the same lines after 「整えたテキストに置き換える」.
  await shot("16-chordpro-clean", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(LYRICS);
    await capture.getByTestId("text-normalize-band").getByRole("button", { name: /整えたテキストに置き換える/ }).click();
    await expect(capture.getByTestId("text-normalize-undo")).toBeVisible();
    await expect(capture.getByTestId("text-progression-input")).toHaveValue("| C | G | Am | F |\n| C | G | Am | F |");
  });

  // 17-settings: the 「進行エディタの計測」 block in 設定.
  await shot("17-settings", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await openApp(page);
    await page.locator('[data-nav="settings"]').click();
    await expect(page.getByTestId("settings-view")).toBeVisible();
    const developer = page.locator("#settings-developer");
    await developer.scrollIntoViewIfNeeded();
    const disclosure = developer.getByRole("button").first();
    if (await disclosure.getAttribute("aria-expanded") !== "true") await disclosure.click();
    await page.getByTestId("settings-correction-metrics").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("settings-correction-metrics")).toBeInViewport();
  });

  // 18-saved: after saving, the one notice with the Voicing Loop button (V27: no panel under the preview).
  await shot("18-saved", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await capture.getByTestId("text-progression-name").fill("P25 進行エディタ");
    await capture.getByTestId("text-progression-save").click();
    // The bottom-right notice is the only word after a save; it carries the practice button.
    await expect(page.getByRole("button", { name: "Voicing Loopで練習", exact: true })).toBeVisible();
  });

  // 60-text-card-hover: the same progression as 18, with the second (unselected) card hovered (V31).
  await shot("60-text-card-hover", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await capture.getByTestId("standard-text-preview").getByTestId("text-preview-band").nth(1).hover();
    await page.waitForTimeout(250);
  });

  // 61-sheet-settings: a chord sheet with `Key:` / `BPM:` / `Time Signature:` and `---` headings (V32).
  await shot("61-sheet-settings", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(SHEET);
    await expect(capture.getByTestId("text-progression-key-value")).toHaveText("譜面: D マイナー");
  });

  // 62-select-menu: the Voicing Loop's key list, opened in the app's look (V34).
  await shot("62-select-menu", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLoop(1440, 900);
    await page.locator("#voicing-loop-key").click();
    await expect(page.locator("#lv-select-menu")).toBeVisible();
  });

  // 63-shape-hover: the shape menu with シェル under the pointer (V35).
  await shot("63-shape-hover", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLoop(1440, 900);
    await page.getByTestId("voicing-loop-shape-button").click();
    const menu = page.getByTestId("voicing-loop-shape-menu");
    await expect(menu).toHaveAttribute("data-presence", "shown");
    await menu.locator('[data-shape="shell"]').hover();
    await page.waitForTimeout(200);
  });

  // 64-voicing-braces: the sheet whose first chord carries its own notes, that card chosen (V37).
  await shot("64-voicing-braces", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(
      "| Cmaj7{C3 G3 E4 B4 D5} | Dm7 | G7{F3 B3 E4 A4} | Cmaj7 |");
    await capture.getByTestId("text-preview-band").first().click();
    await expect(capture.getByTestId("text-dock-key").first()).toBeVisible();
  });

  // ---- CC-1 stage 03: the selected card's band (C). Em7 is the first card of bar 2 (the third card). ----
  async function openDock(width: number, height: number, url = "/") {
    await page.setViewportSize({ width, height });
    if (url !== "/") {
      await page.goto(url);
      await page.locator('[data-nav="capture"]').click();
      await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
    }
    const capture = url === "/" ? await openTextCapture(page) : page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await capture.getByTestId("text-preview-band").filter({ hasText: /^.*Em7/ }).first().click();
    await expect(capture.getByTestId("text-card-dock")).toBeVisible();
    return capture;
  }
  const dockOf = (capture: Awaited<ReturnType<typeof openTextCapture>>) => capture.getByTestId("text-card-dock");
  const scopeButton = (capture: Awaited<ReturnType<typeof openTextCapture>>, scope: string) => dockOf(capture).locator(`[data-scope="${scope}"]`);

  await shot("01-dock", async () => { await openDock(1440, 900); });
  await shot("02-inversion", async () => {
    const capture = await openDock(1440, 900);
    await dockOf(capture).getByRole("button", { name: "転回を上げる" }).click();
    await expect(dockOf(capture).getByTestId("text-dock-source")).toContainText("手で直した音");
  });
  await shot("03-scope-all", async () => {
    const capture = await openDock(1440, 900);
    await scopeButton(capture, "all").click();
    await dockOf(capture).locator('[data-shape="rootless"]').click();
  });
  await shot("04-scope-same", async () => {
    const capture = await openDock(1440, 900);
    await scopeButton(capture, "same").click();
    await dockOf(capture).getByRole("button", { name: "1 オクターブ下げる" }).click();
  });
  // CC-1 stage 04 (C7): Em7 at シェル, then F♯ added (the name is rewritten) / thinned to two notes (cannot read).
  const pressKey = async (capture: Awaited<ReturnType<typeof openTextCapture>>, pc: number, lit: boolean) => {
    const keys = dockOf(capture).getByTestId("text-dock-key");
    const notes = await keys.evaluateAll((items) => items.map((item) => ({ note: Number((item as HTMLElement).dataset.note), on: item.getAttribute("aria-pressed") === "true" })));
    const low = Math.min(...notes.filter((item) => item.on).map((item) => item.note));
    const target = notes.find((item) => item.note % 12 === pc && item.on === lit && item.note > low) ?? notes.find((item) => item.note % 12 === pc && item.on === lit);
    await dockOf(capture).locator(`[data-testid="text-dock-key"][data-note="${target!.note}"]`).click();
  };
  await shot("05-renamed", async () => {
    const capture = await openDock(1440, 900);
    await dockOf(capture).locator('[data-shape="shell"]').click();
    await pressKey(capture, 6, false);
    await expect(dockOf(capture).getByTestId("text-dock-notice")).toContainText("に書き換えました");
  });
  await shot("06-unread", async () => {
    const capture = await openDock(1440, 900);
    await dockOf(capture).locator('[data-shape="shell"]').click();
    await pressKey(capture, 11, true);
    await pressKey(capture, 7, true);
    await expect(dockOf(capture).getByTestId("text-dock-notice")).toContainText("音から名前を決められません");
  });
  await shot("07-midi-on", async () => {
    const capture = await openDock(1440, 900, "/?p12=midi");
    await page.evaluate(async () => { await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
    await dockOf(capture).getByTestId("text-dock-midi").click();
    await page.evaluate(() => (window as typeof window & { __p12Midi: { emit: (notes: number[]) => void } }).__p12Midi.emit([52, 55, 59, 62]));
    await expect(dockOf(capture).getByTestId("text-dock-midi")).toHaveAttribute("aria-pressed", "true");
  });
  await shot("08-midi-off", async () => {
    const capture = await openDock(1440, 900);
    await dockOf(capture).getByTestId("text-dock-midi").click();
    await expect(dockOf(capture).getByTestId("text-dock-midi-face")).toContainText("MIDI 未接続");
  });
  await shot("10-none", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await expect(capture.getByTestId("text-card-dock-closed")).toBeVisible();
  });
  await shot("11-rest", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill("| C _ |");
    await capture.getByTestId("text-preview-rest").first().click();
    await expect(capture.getByTestId("text-dock-name")).toHaveText("休符");
  });
  await shot("12-dock-1280", async () => { await openDock(1280, 720); });
  await shot("13-dock-1920", async () => { await openDock(1920, 1080); });
  for (const [name, shape] of [["37-dock-shape-2", "rootless"], ["38-dock-shape-3", "triad"], ["39-dock-shape-4", "quartal"], ["39b-dock-shape-shell", "shell"]] as const) {
    await shot(name, async () => {
      const capture = await openDock(1440, 900);
      await dockOf(capture).locator(`[data-shape="${shape}"]`).click();
      await expect(dockOf(capture).locator(`[data-shape="${shape}"]`)).toHaveAttribute("aria-pressed", "true");
    });
  }
  await shot("40-dock-tension", async () => {
    const capture = await openDock(1440, 900);
    await dockOf(capture).locator('[data-shape="shell"]').click();
    await dockOf(capture).getByTestId("text-dock-tension").click();
    await expect(dockOf(capture).getByTestId("text-dock-tension")).toContainText("+9(F♯)");
  });
  await shot("41-dock-tension-none", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Cmaj9 |");
    await capture.getByTestId("text-preview-band").first().click();
    await dockOf(capture).locator('[data-shape="shell"]').click();
    await expect(dockOf(capture).getByTestId("text-dock-tension")).toContainText("+9(D)");
    await page.screenshot({ path: join(OUT, "41-dock-tension-none-cmaj7.png"), animations: "disabled", caret: "hide" });
    await capture.getByTestId("text-preview-band").nth(1).click();
    await dockOf(capture).locator('[data-shape="shell"]').click();
    await expect(dockOf(capture).getByTestId("text-dock-tension")).toContainText("なし");
  });
  await shot("42-dock-fallback", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill("| Cm7b5 |");
    await capture.getByTestId("text-preview-band").first().click();
    await dockOf(capture).locator('[data-shape="triad"]').click();
    await expect(dockOf(capture).getByTestId("text-dock-notice")).toContainText("ルートレス + 広げる");
  });

  // ---- V15: the same fallback at the 1470 window (the five shapes inside, the notice on one line) ----
  await shot("42b-dock-fallback-1470", async () => {
    await page.setViewportSize({ width: 1470, height: 919 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill("| Cm7b5 |");
    await capture.getByTestId("text-preview-band").first().click();
    await dockOf(capture).locator('[data-shape="triad"]').click();
    await expect(dockOf(capture).getByTestId("text-dock-notice")).toHaveText("代わり:ルートレス + 広げる");
  });
  // ---- V20: 「鍵盤で入れる」 (54 nothing held, 54b C・E・G・B♭ held) and V19 the 「?」 (55) ----
  async function openKeys() {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?p12=midi");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 |");
    await capture.getByTestId("text-keyboard-toggle").click();
    await page.evaluate(async () => { await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
    await expect(capture.getByTestId("keyboard-device")).toBeVisible();
    return capture;
  }
  await shot("54-keys-entry", async () => {
    const capture = await openKeys();
    await expect(capture.getByTestId("keyboard-held-name")).toHaveText("—");
  });
  await shot("54b-keys-entry-held", async () => {
    const capture = await openKeys();
    await page.evaluate(() => (window as typeof window & { __p12Midi: { emit: (notes: number[]) => void } }).__p12Midi.emit([60, 64, 67, 70]));
    await expect(capture.getByTestId("keyboard-held-name")).toHaveText("C7");
  });
  await shot("55-help", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await capture.getByTestId("text-help").click();
    await expect(page.getByTestId("text-help-writing")).toBeVisible();
  });
  await shot("55b-help-bottom", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const capture = await openTextCapture(page);
    await capture.getByTestId("text-progression-input").fill(PROGRESSION);
    await capture.getByTestId("text-help").click();
    const face = page.getByTestId("text-help-face");
    await expect(face).toBeVisible();
    await face.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(face.getByText("元に戻す(入力欄の外でも)")).toBeVisible();
  });

  // ---- CC-1 stages 08 / 11: Voicing Loop's 「形 ▼」 and 弾き合わせ (the progression is the fixture's eight chords) ----
  type Midi = { connect: () => Promise<void>; emit: (notes: number[], on?: boolean) => void; pedal: (down: boolean) => void };
  async function openLoop(width: number, height: number, midi = true) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { try { localStorage.removeItem("lv-voicing-loop-play-along"); localStorage.removeItem("lv-voicing-loop-play-along-mode"); localStorage.removeItem("loop-vault:voicing-loop-shape:v1"); } catch { /* fresh page */ } }).catch(() => undefined);
    await page.goto(`/?p527Status=p533-rules${midi ? "&p12=midi" : ""}`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    if (midi) await page.evaluate(async () => { await (window as unknown as { __p12Midi: Midi }).__p12Midi.connect(); });
    await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  }
  const midiCall = (call: string, args: unknown[]) => page.evaluate(([name, values]) => {
    const midi = (window as unknown as { __p12Midi: Record<string, (...a: unknown[]) => void> }).__p12Midi;
    midi[name as string]!(...(values as unknown[]));
  }, [call, args] as const);
  const guideNotes = () => page.locator("[data-guide-hand='left'], [data-guide-hand='right']").evaluateAll((keys) =>
    keys.map((key) => Number((key as HTMLElement).dataset.midiNote)));
  async function playAlongOn(mode: "chord" | "exact" = "chord") {
    await page.getByRole("switch", { name: "弾き合わせ", exact: true }).click();
    if (mode === "exact") await page.getByRole("group", { name: "判定", exact: true }).getByRole("button", { name: "押さえ方どおり" }).click();
  }
  async function chooseLoopShape(shape: string) {
    await page.getByTestId("voicing-loop-shape-button").click();
    await page.getByTestId("voicing-loop-shape-menu").locator(`[data-shape="${shape}"]`).click();
  }

  await shot("25-vl-off", async () => { await openLoop(1440, 900); });
  await shot("26-vl-on-ok", async () => {
    await openLoop(1440, 900); await playAlongOn("exact");
    const notes = await guideNotes(); await midiCall("emit", [notes]);
    await expect(page.locator("[data-play-along='ok']").first()).toBeVisible();
  });
  // 26b (P25 V10): the same screen just after 弾き合わせ is turned off again (nothing else moved).
  await shot("26b-vl-on-ok-off", async () => {
    await openLoop(1440, 900); await playAlongOn("exact");
    const notes = await guideNotes(); await midiCall("emit", [notes]);
    await expect(page.locator("[data-play-along='ok']").first()).toBeVisible();
    await page.getByRole("switch", { name: "弾き合わせ", exact: true }).click();
    await expect(page.getByTestId("voicing-loop-play-along-judge")).toBeHidden();
    await page.waitForTimeout(300);
  });
  await shot("27-vl-on-wrong", async () => {
    await openLoop(1440, 900); await playAlongOn();
    const notes = await guideNotes(); await midiCall("emit", [[...notes.slice(0, -1), notes[notes.length - 1]! + 1]]);
    await expect(page.locator("[data-play-along='wrong']").first()).toBeVisible();
  });
  await shot("28-vl-on-pedal", async () => {
    await openLoop(1440, 900); await playAlongOn();
    const notes = await guideNotes();
    await midiCall("pedal", [true]); await midiCall("emit", [[notes[0]! + 1]]); await midiCall("emit", [[notes[0]! + 1], false]);
    await midiCall("emit", [notes]);
  });
  await shot("29-vl-recall", async () => {
    await openLoop(1440, 900); await playAlongOn();
    const notes = await guideNotes();
    await page.getByRole("button", { name: "思い出す（コード名のみ）" }).click();
    await midiCall("emit", [notes]);
  });
  // 29b (P25 V7): the same screen just after switching back to 覚える (the hands come back in the same place).
  await shot("29b-vl-recall-learn", async () => {
    await openLoop(1440, 900); await playAlongOn();
    const notes = await guideNotes();
    await page.getByRole("button", { name: "思い出す（コード名のみ）" }).click();
    await midiCall("emit", [notes]);
    await expect(page.getByTestId("voicing-loop-current-recall")).toBeVisible();
    await page.getByRole("button", { name: "覚える（Voicing表示）" }).click();
    await expect(page.getByTestId("voicing-loop-current-voicing")).toHaveAttribute("data-presence", "shown");
    await page.waitForTimeout(300);
  });
  const secondLoop = async (width: number, height: number, scale?: string) => {
    await openLoop(width, height); await playAlongOn();
    await page.getByLabel("カウントイン").selectOption("0");
    await page.getByRole("button", { name: "開始", exact: true }).click();
    // Card 1 played right in loop 1; the rest passes; then loop 2's first card is played again.
    const notes = await guideNotes(); await midiCall("emit", [notes]); await midiCall("emit", [notes, false]);
    await expect(page.getByTestId("voicing-loop-status")).toContainText("1 周完了", { timeout: 60_000 });
    const again = await guideNotes(); await midiCall("emit", [again]);
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
    // 表示 16: the narrow cards show the small marks.
    if (scale) await page.getByRole("button", { name: scale, exact: true }).first().click();
  };
  await shot("30-vl-cards", async () => { await secondLoop(1440, 900); });
  await shot("31-vl-cards-compact", async () => {
    page.setDefaultTimeout(20_000);
    // 表示 16 needs 16 groups: `| C | Am | F | G |` ×16 (64 bars) saved from the text intake, opened in Voicing Loop.
    // The lead (answer 3): a window where 表示 16 makes the cards narrow (1440 keeps them wide).
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/?p12=midi");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill(`| ${Array(16).fill("C | Am | F | G").join(" | ")} |`);
    await capture.getByTestId("text-progression-name").fill("P25 表示 16");
    await capture.getByTestId("text-progression-save").click();
    await page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).click();
    await page.evaluate(async () => { await (window as unknown as { __p12Midi: Midi }).__p12Midi.connect(); });
    await page.getByRole("button", { name: "自動生成", exact: true }).click();
    await playAlongOn();
    await page.getByLabel("カウントイン").selectOption("0");
    await page.getByRole("button", { name: "開始", exact: true }).click();
    await midiCall("emit", [await guideNotes()]);
    await page.waitForTimeout(2500);
    await midiCall("emit", [[], false]);
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
    await page.getByRole("button", { name: "16", exact: true }).click();
    // The point of this photo is the narrow 16-group cards.
    await expect(page.getByTestId("voicing-loop-timeline")).toBeVisible();
  });
  await shot("32-vl-no-midi", async () => { await openLoop(1440, 900, false); await expect(page.getByTestId("voicing-loop-play-along-no-midi")).toBeVisible(); });
  await shot("33-vl-chord-mode", async () => {
    await openLoop(1440, 900); await chooseLoopShape("rootless"); await playAlongOn();
    await page.getByLabel("カウントイン").selectOption("0");
    await page.getByRole("button", { name: "開始", exact: true }).click();
    await midiCall("emit", [await guideNotes()]);
    await expect(page.getByTestId("voicing-loop-play-along-mark").first()).toHaveAttribute("data-result", "hit");
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
  });
  await shot("34-vl-1280", async () => { await secondLoop(1280, 720); });
  await shot("35-vl-1920", async () => { await secondLoop(1920, 1080); });
  // 36: a progression saved from the repository's synthetic MIDI (the MIDI-import e2e's own), opened from the Vault.
  await shot("36-vl-bulk-source", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await openApp(page);
    await loadMidiForPreAnalysis(page, buildScenarioMidi(p10Scenario("plain-8")), "p25-bulk.mid");
    await page.getByTestId("pre-analysis-analyze").click();
    const workspace = page.getByTestId("correction-workspace");
    await expect(workspace).toBeVisible();
    await workspace.getByTestId("correction-segment").first().click();
    await workspace.getByTestId("correction-save-form").getByRole("button", { name: /Vault に保存/, exact: true }).click();
    const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
    await form.locator('input[name="progression-title"]').fill("P25 元MIDI の進行");
    await form.getByRole("button", { name: /保存/, exact: true }).click();
    await expect(form).toBeHidden();
    await practiceFromVault(page, "Voicing Loop", "P25 元MIDI の進行");
    await expect(page.getByRole("button", { name: "この進行を元の音に", exact: true })).toBeVisible();
  });
  // 46b / 46c: 弾き合わせ on at 1024×768 and 768×640 (I1 / I2 案 D: the judge sits in the keyboard legend row).
  for (const [name, width, height] of [["46b-vl-1024-on", 1024, 768], ["46c-vl-768-on", 768, 640]] as const) {
    await shot(name, async () => {
      await openLoop(width, height); await playAlongOn();
      await expect(page.getByTestId("voicing-loop-play-along-judge")).toBeVisible();
    });
  }
  await shot("43-vl-source", async () => { await openLoop(1440, 900); });
  await shot("44-vl-source-menu", async () => {
    await openLoop(1440, 900); await chooseLoopShape("rootless");
    await page.getByTestId("voicing-loop-shape-button").click();
    await expect(page.getByRole("group", { name: "ルートレスの並び" })).toBeVisible();
  });
  await shot("44b-vl-basic-parts", async () => {
    await openLoop(1440, 900);
    await page.getByTestId("voicing-loop-shape-button").click();
    const menu = page.getByTestId("voicing-loop-shape-menu");
    await menu.getByTestId("voicing-loop-shape-tension").check();
    await menu.getByTestId("voicing-loop-shape-spread").check();
    await expect(page.getByTestId("voicing-loop-shape-button")).toContainText("+ テンション + 広げる");
  });
  await shot("45-vl-source-1280", async () => { await openLoop(1280, 720); });
  await shot("46-vl-shape-4", async () => {
    await openLoop(1440, 900); await chooseLoopShape("quartal");
    await page.getByLabel("カウントイン").selectOption("0");
    await page.getByRole("button", { name: "開始", exact: true }).click();
    await page.waitForTimeout(800);
  });

  // ---- CC-2 stage 16 (N9): the band while it rises, and a chord card under the pointer ----
  {
    const name = "47-dock-motion";
    if (WANTED.length === 0 || WANTED.includes(name)) {
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        // A machine-wide "reduce motion" would finish the rise at once; the photo needs the moving frame.
        await page.emulateMedia({ reducedMotion: "no-preference" });
        const capture = await openTextCapture(page);
        await capture.getByTestId("text-progression-input").fill(PROGRESSION);
        await capture.getByTestId("text-preview-band").filter({ hasText: /^.*Em7/ }).first().click();
        const opacity = () => page.evaluate(() => {
          const dock = document.querySelector("[data-testid='text-card-dock']");
          return dock ? Number(getComputedStyle(dock).opacity) : -1;
        });
        let value = -1;
        for (let i = 0; i < 80; i += 1) {
          value = await opacity();
          if (value >= 0.3 && value <= 0.7) break;
          await page.waitForTimeout(6);
        }
        expect(value, "the band is caught while it rises").toBeGreaterThanOrEqual(0.3);
        expect(value).toBeLessThanOrEqual(0.7);
        // Hold the very frame that was measured, so the photo is the 0.3–0.7 one.
        await page.evaluate(() => document.getAnimations().forEach((animation) => animation.pause()));
        await page.screenshot({ path: join(OUT, `${name}.png`), animations: "allow", caret: "hide" });
        await page.evaluate(() => document.getAnimations().forEach((animation) => animation.play()));
        captured.push(name);
      } catch (error) {
        failed.push({ screen: name, reason: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) });
      }
    }
  }
  await shot("48-vl-card-hover", async () => {
    await openLoop(1440, 900);
    const card = page.locator(".lv-vl-event-wrap").nth(2);
    await card.hover();
    await expect.poll(() => card.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(-2);
  });

  // 49/50: V2-V4 — 耳で弾く's choosing screen (the title row over both columns), then a pressable card under the pointer.
  async function openEar() {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDojo(page, "midi");
    await page.evaluate(() => window.localStorage.removeItem("loop-vault:ear-practice-settings:v1"));
    await page.getByTestId("ear-open").click();
    await expect(page.getByTestId("ear-start")).toBeVisible();
  }
  await shot("49-ear-choose", openEar);
  await shot("50-ear-card-hover", async () => {
    await openEar();
    await page.getByTestId("ear-start").click();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("ear-run")).toHaveAttribute("data-phase", "play");
    const card = page.getByTestId("ear-card-2");
    await card.hover();
    await expect.poll(() => card.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(-2);
  });

  // ---- V23: the next-chord palette (56–59). ----
  async function openSuggestion(width: number, height: number, text = PROGRESSION) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill(text);
    return capture;
  }
  const paletteOf = () => page.getByRole("dialog", { name: "次のコード" });
  await shot("56-next-ghost", async () => {
    const capture = await openSuggestion(1440, 900);
    await expect(capture.getByTestId("text-suggestion-ghost")).toBeVisible();
  });
  await shot("56b-next-pending", async () => {
    const capture = await openSuggestion(1440, 900);
    await capture.getByTestId("text-suggestion-ghost").click();
    await paletteOf().getByRole("button", { name: "2 拍 2" }).click();
    await paletteOf().getByTestId("text-suggestion-add").first().click();
    await expect(capture.locator("[data-testid='text-suggestion-ghost'] [data-pending='true']").first()).toBeVisible();
  });
  await shot("57-palette", async () => {
    // The bar before is one chord, so the length stays 「1 小節」 (V26-3).
    const capture = await openSuggestion(1440, 900, "| Fmaj7 | Em7 |");
    await capture.getByTestId("text-suggestion-ghost").click();
    await expect(paletteOf()).toBeVisible();
    await expect(paletteOf().getByRole("button", { name: "1 小節 1" })).toHaveAttribute("aria-pressed", "true");
  });
  await shot("57b-palette-above", async () => {
    const capture = await openSuggestion(1440, 620);
    await capture.getByTestId("text-suggestion-ghost").click();
    await expect(paletteOf()).toBeVisible();
  });
  await shot("58-palette-1024", async () => {
    const capture = await openSuggestion(1024, 720);
    await capture.getByTestId("text-suggestion-ghost").click();
    await expect(paletteOf()).toBeVisible();
  });
  await shot("59-palette-hover", async () => {
    const text = "| Fmaj7 | E7 | Am7 | C7 |";
    // After V27 the preview's under-side stays empty; the palette (V26-1) has the whole working area at 900.
    const capture = await openSuggestion(1440, 900, text);
    for (let index = 1; index <= 3; index += 1) {
      await capture.getByTestId("text-progression-name").fill(`P25 V24 丸サ ${index}`);
      await capture.getByTestId("text-progression-save").click();
      await expect(page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).first()).toBeVisible();
      await capture.getByTestId("text-progression-input").fill(text);
    }
    const toastClose = page.locator("[data-toast-tone] .lv-toast-close");
    while (await toastClose.count() > 0) await toastClose.first().click();
    await capture.getByTestId("text-suggestion-ghost").click();
    const liked = paletteOf().locator("[data-category='好み'] [data-testid='text-suggestion-preview']").first();
    await expect(liked).toBeVisible();
    await liked.hover();
    await page.waitForTimeout(300);
    // V28: the candidate's own explanation tip is gone; hovering shows no tooltip at all.
    await expect(page.getByRole("tooltip").filter({ visible: true })).toHaveCount(0);
  });

  // 19/20-bar-1280: F1 — the MIDI correction workspace's tool row at 1280×720 with a review card.
  await shot("bar-1280", async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await openApp(page);
    await loadMidiForPreAnalysis(page, buildScenarioMidi(p10Scenario("melody-track-8")), "p25-f1.mid");
    await page.getByTestId("pre-analysis-analyze").click();
    await expect(page.getByTestId("correction-workspace")).toBeVisible();
    const closeButtons = page.locator("[data-toast-tone] .lv-toast-close");
    while (await closeButtons.count() > 0) await closeButtons.first().click();
    await page.getByTestId("correction-control-bar").getByRole("button", { name: "次の要確認" }).click();
    await expect(page.locator('[data-testid="correction-card"][data-review][aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByTestId("correction-control-bar")).toBeInViewport();
  });

  // 21..24-page: F2 — the progression page at three widths.
  for (const [name, width, height] of [["page-1920", 1920, 1080], ["page-1280", 1280, 720], ["page-1440", 1440, 900]] as const) {
    await shot(name, async () => {
      await page.setViewportSize({ width, height });
      // The seeded Vault comes from the page's own query, so open it directly (no second navigation).
      await page.goto("/?p104=normal");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("#main-content")).toBeVisible();
      await page.locator('[data-nav="vault"]').click();
      await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
      await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
      expect(overflow).toBe(0);
      await page.getByTestId("correction-workspace").evaluate((node) => node.scrollIntoView());
    });
  }

  // 51..53: V13 — the three 「続きから」 bands (Voicing Loop's picker, the Chord Dojo home, the Bass Practice home).
  async function seedResume() {
    await page.goto("/");
    await page.evaluate(({ jazz, at }) => {
      localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(jazz));
      localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify({ version: 1, entries: [
        { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at },
        { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at },
        { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at },
      ] }));
      localStorage.setItem("loop-vault:voicing-loop-recents:v1", JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
      localStorage.setItem("loop-vault:voicing-loop-last:v1", JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
    }, { jazz: homeFixture("many"), at: new Date().toISOString() });
  }
  await shot("51-resume-vl", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedResume();
    await page.goto("/?p527Status=vl15-picker");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    await expect(page.getByTestId("voicing-loop-resume")).toBeVisible();
    await page.mouse.move(600, 880);
  });
  await shot("52-resume-cd", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedResume();
    await page.goto("/");
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.getByTestId("home-resume")).toBeVisible();
    await page.mouse.move(600, 880);
  });
  await shot("53-resume-bp", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="bass-practice"]').click();
    if (await page.getByTestId("bass-home-resume").count() === 0) {
      // One finished 度数 attempt gives the home its band (the P23-41 route).
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
    }
    await expect(page.getByTestId("bass-home-resume")).toBeVisible();
    await page.mouse.move(600, 880);
  });

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ synthetic: true, captured, failed }, null, 2));
  expect(failed).toEqual([]);
});

/**
 * P25 V14: Voicing Loop's motion on video (`recordVideo`), for the lead to read frame by frame. Runs only with
 * `P25_MOTION=1` (`P25_MOTION=1 P25_SHOTS=none npm run p89:screens -- P25`). Each motion is one `.webm` in
 * `p89-generated/P25/motion/`; each direction is one `.png` of the frames every 0.03 s side by side (ffmpeg from
 * `FFMPEG_PATH` or `PATH`), cut to the part that moves.
 */
test("P25 V14 motion videos", async ({ browser }, testInfo) => {
  test.skip(process.env.P25_MOTION !== "1", "P25_MOTION=1 records the motion videos");
  test.setTimeout(300_000);
  const dir = join(OUT, "motion");
  const raw = join(dir, "raw");
  mkdirSync(raw, { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  const size = { width: 1440, height: 900 };
  type Clip = { readonly name: string; readonly at: number; readonly box: { x: number; y: number; width: number; height: number } };
  const made: string[] = [];

  async function record(name: string, act: (page: Page, mark: (clip: string, box: Clip["box"]) => void) => Promise<void>) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: size, deviceScaleFactor: 1,
      colorScheme: "dark", locale: "ja-JP", reducedMotion: "no-preference", recordVideo: { dir: raw, size } });
    const page = await context.newPage();
    const start = Date.now();
    const clips: Clip[] = [];
    await act(page, (clip, box) => clips.push({ name: clip, at: (Date.now() - start) / 1000, box }));
    await page.waitForTimeout(700);
    const video = page.video()!;
    await context.close();
    const webm = join(dir, `${name}.webm`);
    await video.saveAs(webm);
    made.push(`${name}.webm`);
    for (const clip of clips) {
      // From a little before the press to 0.66 s after it: 27 frames, 0.03 s apart (the video's own frames repeat).
      const box = { x: Math.max(0, Math.floor(clip.box.x - 8)), y: Math.max(0, Math.floor(clip.box.y - 8)) };
      const width = Math.min(size.width - box.x, Math.ceil(clip.box.width + 16));
      const height = Math.min(size.height - box.y, Math.ceil(clip.box.height + 16));
      const scale = Math.min(1, 360 / width);
      const png = join(dir, `${clip.name}.png`);
      const result = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", Math.max(0, clip.at - 0.15).toFixed(3), "-i", webm, "-t", "0.81",
        "-vf", `fps=100/3,crop=${width}:${height}:${box.x}:${box.y},scale=${Math.round(width * scale)}:-2,tile=27x1:padding=4:color=0x333333`,
        "-frames:v", "1", png]);
      if (result.status !== 0) throw new Error(`ffmpeg ${clip.name}: ${String(result.stderr)}`);
      made.push(`${clip.name}.png`);
    }
  }
  async function open(page: Page, midi = false) {
    await page.goto(`/?p527Status=p533-rules${midi ? "&p12=midi" : ""}`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    if (midi) await page.evaluate(async () => { await (window as unknown as { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
    await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
    await page.waitForTimeout(800);
  }
  const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
  const union = (a: Clip["box"], b: Clip["box"]) => {
    const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
  };

  await record("v14-shape-menu", async (page, mark) => {
    await open(page);
    const button = page.getByTestId("voicing-loop-shape-button");
    const at = (await button.boundingBox())!;
    const area = { x: at.x, y: at.y, width: 360, height: 560 };
    mark("v14-shape-menu-open", area); await button.click(); await page.waitForTimeout(700);
    mark("v14-shape-menu-close", area); await button.click(); await page.waitForTimeout(700);
  });
  await record("v14-fingering", async (page, mark) => {
    await open(page);
    const area = await box(page, "[data-testid='voicing-loop-current-panel']");
    const toggle = page.getByRole("switch", { name: "おすすめ運指を表示", exact: true });
    mark("v14-fingering-off", area); await toggle.click(); await page.waitForTimeout(700);
    mark("v14-fingering-on", area); await toggle.click(); await page.waitForTimeout(700);
  });
  await record("v14-learn-recall", async (page, mark) => {
    await open(page);
    const area = union(await box(page, "[data-testid='voicing-loop-display-group']"), await box(page, "[data-testid='voicing-loop-current-panel']"));
    mark("v14-recall", area); await page.getByRole("button", { name: "思い出す（コード名のみ）" }).click(); await page.waitForTimeout(700);
    mark("v14-learn", area); await page.getByRole("button", { name: "覚える（Voicing表示）" }).click(); await page.waitForTimeout(700);
  });
  await record("v14-play-along", async (page, mark) => {
    await open(page, true);
    const area = union(await box(page, "[data-testid='voicing-loop-timeline']"), await box(page, ".lv-vl-legend-row"));
    const toggle = page.getByRole("switch", { name: "弾き合わせ", exact: true });
    mark("v14-play-along-on", area); await toggle.click(); await page.waitForTimeout(700);
    mark("v14-play-along-off", area); await toggle.click(); await page.waitForTimeout(700);
  });
  await record("v14-shape-source", async (page, mark) => {
    await open(page);
    const area = union(await box(page, "[data-testid='voicing-loop-controls']"), await box(page, "[data-testid='voicing-loop-current-next']"));
    await page.getByTestId("voicing-loop-shape-button").click(); await page.waitForTimeout(500);
    mark("v14-shape-to-shell", area); await page.getByTestId("voicing-loop-shape-menu").locator('[data-shape="shell"]').click(); await page.waitForTimeout(700);
    const source = (name: string) => page.getByTestId("voicing-loop-source-group").getByRole("button", { name, exact: true });
    mark("v14-source-to-midi", area); await source("元MIDI").click(); await page.waitForTimeout(700);
    mark("v14-source-to-generated", area); await source("自動生成").click(); await page.waitForTimeout(700);
  });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ synthetic: true, frameStep: 0.03, frames: 27, made }, null, 2));
});
