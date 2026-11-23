import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, waitForSidebarSettled, chooseTextSetting } from "./helpers/app";
import { captureReportShot } from "./helpers/reportShots";

async function clearToasts(page: Page) {
  for (let index = 0; index < 12; index += 1) {
    const closes = page.locator(".lv-toast-close");
    if (await closes.count() === 0) return;
    await closes.first().click();
  }
}

async function saveTextProgression(page: Page, name: string, text: string, key: string) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await expect(capture).toBeVisible();
  await capture.getByTestId("text-progression-input").fill(text);
  await chooseTextSetting(capture, "text-progression-key", key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

async function openHomeWithProgressions(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveTextProgression(page, "夜のループの長い題名の進行を確認するためのタイトル", "| Bm9 | Bb9 | Gmaj9/A | Em9/B | Dadd9/F# | Gmaj7 | A7sus4 | Bm9 |", "D major");
  await saveTextProgression(page, "王道の 4 小節", "| Cmaj7 | Am7 | Dm7 | G7 |", "C major");
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-today-loop")).toBeVisible();
  await clearToasts(page);
  await page.mouse.move(2, 2);
}

test("P23-65 Home Today's Loop: top-right tools align on one row, 3 bottom actions on one row, hint removed, MIDI export starts save", async ({ page }) => {
  test.setTimeout(180_000);
  await openHomeWithProgressions(page);

  await expect(page.getByText("コードを押すと、その音が鳴ります")).toHaveCount(0);

  for (const size of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await waitForSidebarSettled(page);
    await assertNoHorizontalOverflow(page);

    const card = page.getByTestId("home-today-loop");
    const metrics = await card.evaluate((el) => {
      const rect = (node: Element | null) => {
        if (!node) throw new Error("missing element in TodayLoopCard");
        const r = node.getBoundingClientRect();
        return { x: r.left, right: r.right, y: r.top, cy: r.top + r.height / 2, width: r.width };
      };
      const cs = getComputedStyle(el);
      const cardRect = el.getBoundingClientRect();
      const cardInnerRight = cardRect.right - parseFloat(cs.paddingRight);
      const tools = el.querySelector(".lv-home-loop-tools")!;
      const heart = tools.querySelector("button[aria-label^='お気に入り']");
      const swap = Array.from(tools.querySelectorAll("button")).find((btn) => btn.textContent?.includes("他のループ")) ?? null;
      const midi = tools.querySelector("[data-midi-export-control] button");
      const bottomButtons = Array.from(el.querySelectorAll(".lv-home-loop-actions button"));
      const actionsMidi = el.querySelectorAll(".lv-home-loop-actions [data-midi-export-control]").length;
      return {
        cardInnerRight,
        heart: rect(heart),
        swap: rect(swap),
        midi: rect(midi),
        bottomCount: bottomButtons.length,
        bottomTops: bottomButtons.map((b) => b.getBoundingClientRect().top),
        actionsMidi,
      };
    });

    expect(metrics.actionsMidi, `${size.width}: MIDI moved out of bottom actions`).toBe(0);
    expect(metrics.bottomCount, `${size.width}: 3 bottom buttons`).toBe(3);
    expect(Math.max(...metrics.bottomTops) - Math.min(...metrics.bottomTops), `${size.width}: bottom buttons on 1 row`).toBeLessThanOrEqual(1);

    expect(Math.abs(metrics.heart.cy - metrics.swap.cy), `${size.width}: heart and swap vertically centered`).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.swap.cy - metrics.midi.cy), `${size.width}: swap and midi vertically centered`).toBeLessThanOrEqual(1);
    expect(metrics.heart.x, `${size.width}: heart left of swap`).toBeLessThan(metrics.swap.x);
    expect(metrics.swap.right, `${size.width}: swap left of midi`).toBeLessThanOrEqual(metrics.midi.x);
    expect(metrics.midi.right, `${size.width}: midi inside card right padding`).toBeLessThanOrEqual(metrics.cardInnerRight + 0.5);

    if (size.width === 1440 || size.width === 1280) {
      await clearToasts(page);
      await page.mouse.move(2, 2);
      await captureReportShot(page, `p23-65-assets/home-${size.width}.png`);
    }
  }

  // Verify clicking 「MIDI を DAW へ」 on Home triggers MIDI save via Tauri IPC.
  await page.evaluate(() => {
    type MockWindow = Window & {
      __TAURI_INTERNALS__?: { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> };
      __p2365MidiCmds?: string[];
    };
    const w = window as MockWindow;
    w.__p2365MidiCmds = [];
    w.__TAURI_INTERNALS__ = {
      async invoke(cmd, args) {
        w.__p2365MidiCmds?.push(cmd);
        if (cmd === "plugin:dialog|save") return "D:\\exports\\home-loop.mid";
        if (cmd === "save_progression_midi") return { bytesLength: (args?.bytes as number[] | undefined)?.length ?? 0 };
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      },
    };
  });
  await page.locator(".lv-home-loop-tools [data-midi-export-control] button").click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __p2365MidiCmds?: string[] }).__p2365MidiCmds ?? []))
    .toContain("save_progression_midi");
  await expect(page.getByText("MIDIファイルを保存しました。")).toBeVisible();
});

test("P23-65 Chord Dojo home width matches Bass Practice home width (1920 & 1440) and Bass home 「?」 is removed", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);

  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await page.locator('[data-nav="bass-practice"]').click();
    await waitForSidebarSettled(page);
    const bassHome = page.getByTestId("bass-practice-home");
    await expect(bassHome).toBeVisible();
    await expect(bassHome.locator(".lv-bh-group").first()).toContainText("弾いて確かめる");
    await expect(bassHome.locator(".lv-bh-heading")).toHaveCount(0);
    await expect(bassHome).not.toContainText("聴いてまねる");
    await expect(bassHome.getByRole("button", { name: "キー操作", exact: true })).toHaveCount(0);
    await expect(bassHome.locator(".lv-bh-help")).toHaveCount(0);
    await expect(page.getByTestId("bass-home-help")).toHaveCount(0);

    const bassBounds = await page.locator(".bass-practice-shell").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    await clearToasts(page);
    await captureReportShot(page, `p23-65-assets/bass-home-${size.width}.png`);

    await page.locator('[data-nav="chord-dojo"]').click();
    await waitForSidebarSettled(page);
    const dojoHome = page.locator(".dojo-home-p20");
    await expect(dojoHome).toBeVisible();
    const dojoInner = await dojoHome.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
    });

    expect(Math.abs(dojoInner.left - bassBounds.left), `${size.width}: dojo and bass left edges align`).toBeLessThanOrEqual(2);
    expect(Math.abs(dojoInner.right - bassBounds.right), `${size.width}: dojo and bass right edges align`).toBeLessThanOrEqual(2);

    if (size.width === 1920) {
      await clearToasts(page);
      await captureReportShot(page, "p23-65-assets/dojo-home-1920.png");
    }
  }

  // Chord Dojo practice screen keeps max-w-none.
  await page.locator(".dojo-home-p20").getByRole("button", { name: /ガイド練習を始める/ }).first().click();
  const wrapperClass = await page.locator("#main-content > div").getAttribute("class");
  expect(wrapperClass).toContain("max-w-none");
  const wrapperMaxWidth = await page.locator("#main-content > div").evaluate((el) => getComputedStyle(el).maxWidth);
  expect(wrapperMaxWidth).toBe("none");
});
