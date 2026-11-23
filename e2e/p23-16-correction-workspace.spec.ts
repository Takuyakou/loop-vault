import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { assertNoHorizontalOverflow, createSavedProgression, dropMidi, openApp, openCapture, openVault, chooseTextSetting } from "./helpers/app";

/** P23-16: the correction workspace's four points (W1–W7, C1–C5). */

const SIZES = [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const;
type SongRequest = { fromBeat: number; bpm: number; notes: { startBeat: number }[] };
const songRequest = (page: Page) => page.evaluate(() => (window as unknown as { __lvWorkspaceSong?: SongRequest }).__lvWorkspaceSong);

async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? []).map((animation) => animation.finished.catch(() => undefined))));
}

async function importScenario(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
}

async function saveText(page: Page, text: string, key: string, name: string) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  await chooseTextSetting(capture, "text-progression-key", key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

async function openProgressionPage(page: Page) {
  await openApp(page);
  await saveText(page, "| Ebmaj7 | Cm7 | Fm7 Bb7 | Ebmaj7 | Abmaj7 | Gm7 C7 | Fm7 | Bb7 |", "Eb major", "夜のループ");
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("W1: the playback row is ▶ 再生 · |◀ 最初から · ↻ ループ; ↻ ループ needs a range and then loops it", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const row = workspace.getByRole("group", { name: "再生" });
  const play = row.getByTestId("correction-play-song");
  await expect(play).toHaveText("▶ 再生");
  await expect(row.getByTestId("correction-go-start")).toHaveText("|◀ 最初から");
  const loop = row.getByTestId("correction-loop");
  await expect(loop).toHaveText("↻ ループ");
  await expect(loop).toBeDisabled(); // no range chosen yet
  await expect(loop).toHaveAttribute("aria-pressed", "false"); // off at first in capture, as before (no loop)

  await play.click();
  await expect(play).toHaveText("■ 停止");
  await play.click();
  await expect(play).toHaveText("▶ 再生");

  // A one-bar range (bar 2), looped: it plays from the range and starts over at its end.
  await workspace.getByTestId("correction-card").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "この小節を保存する範囲にする" }).click();
  await expect(loop).toBeEnabled();
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await expect(workspace.getByTestId("correction-range-chip")).toContainText("くり返し");
  await play.click();
  const first = (await songRequest(page))!;
  expect(first.fromBeat).toBe(4);
  expect(Math.max(...first.notes.map((note) => note.startBeat))).toBeLessThan(4); // only up to the range's end
  await page.evaluate(() => { (window as unknown as { __lvWorkspaceSong?: unknown }).__lvWorkspaceSong = undefined; });
  await expect.poll(async () => (await songRequest(page))?.fromBeat, { timeout: 6000 }).toBe(4); // started over
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
});

test("W1/W2 (answer 1): at 1280 the bar keeps one line with only the marks and 「共通 BPM」, the names unchanged; at 1440 the words show", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const bar = workspace.getByTestId("correction-control-bar");
  const row = workspace.getByRole("group", { name: "再生" });
  const start = row.getByRole("button", { name: "曲の先頭へ（Home）", exact: true });
  const loop = row.getByRole("button", { name: "ループ OFF", exact: true });
  const match = row.getByRole("button", { name: "共通の BPM に合わせる", exact: true });
  const oneLine = async () => {
    const middles = await bar.locator("button, input, .lv-cw-time").evaluateAll((items) => items.filter((item) => item.getBoundingClientRect().height > 0).map((item) => item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2));
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThan(6);
  };

  // 1440: the words as the instruction has them (only 「／ 8小節」 steps aside).
  await expect(start.locator(".lv-playback-word")).toBeVisible();
  await expect(loop.locator(".lv-playback-word")).toBeVisible();
  await expect(match.locator(".lv-cw-word-long")).toBeVisible();
  await expect(match.locator(".lv-cw-word-short")).toBeHidden();
  await oneLine();

  for (const height of [800, 720]) {
    await page.setViewportSize({ width: 1280, height });
    await settle(page);
    await expect(start.locator(".lv-playback-word")).toBeHidden();
    await expect(loop.locator(".lv-playback-word")).toBeHidden();
    await expect(start).toContainText("|◀");
    await expect(loop).toContainText("↻");
    await expect(match.locator(".lv-cw-word-long")).toBeHidden();
    await expect(match.locator(".lv-cw-word-short")).toBeVisible();
    expect(await match.locator(".lv-cw-word-short").evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"共通 BPM"');
    await expect(workspace.getByTestId("correction-position").locator(".lv-cw-time-total")).toBeHidden();
    await expect(start).toHaveAttribute("title", "曲の先頭へ（Home）");
    await expect(loop).toHaveAttribute("title", "保存する範囲を選ぶと、くり返せます");
    await expect(match).toHaveAttribute("title", /共通 BPM（120）で鳴らす/);
    await oneLine();
  }
  await match.click(); // 「曲の BPM に戻す」 keeps its words and still fits at 1280
  await expect(row.getByRole("button", { name: "曲の BPM に戻す", exact: true })).toHaveText("曲の BPM に戻す");
  await oneLine();
});

test("W2/C2: the song's 96 plays first; 共通の BPM に合わせる plays 120 (carrying on while playing); back to 96; the saved BPM stays 96", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  await expect(page.getByTestId("global-bpm-value")).toHaveAttribute("aria-valuenow", "120");
  const tempo = workspace.getByTestId("correction-tempo");
  await tempo.fill("96");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("96");
  const play = workspace.getByTestId("correction-play-song");
  const match = workspace.getByTestId("correction-match-global-bpm");
  await expect(match).toHaveText("共通の BPM に合わせる");

  await play.click();
  expect((await songRequest(page))!.bpm).toBe(96);
  await match.click(); // while playing: it does not stop, it carries on at the new speed
  await expect(match).toHaveText("曲の BPM に戻す");
  await expect(match).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await songRequest(page))!.bpm).toBe(120);
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(tempo).toHaveValue("96"); // the song's BPM is not changed
  await match.click();
  await expect.poll(async () => (await songRequest(page))!.bpm).toBe(96);
  await play.click();

  await match.click();
  await workspace.getByTestId("correction-save-name").fill("BPM 96 の曲");
  await workspace.getByTestId("correction-save-form").getByRole("button", { name: /曲全体を保存/ }).click();
  await page.locator('form[role="dialog"]').getByRole("button", { name: "保存", exact: true }).click();
  await page.locator('[data-nav="vault"]').click();
  await expect(page.getByTestId("vault-preview")).toContainText("96 BPM");
});

test("W2: a song without a BPM of its own plays at the app-wide BPM, its field shows that BPM, and has no button", async ({ page }) => {
  await openProgressionPage(page); // a text progression saved without a BPM
  const workspace = page.getByTestId("correction-workspace");
  const tempo = workspace.getByTestId("correction-tempo");
  const play = workspace.getByTestId("correction-play-song");
  const played = () => page.evaluate(() => (window as unknown as { __lvProgressionPlayback?: { request: { bpm: number } } }).__lvProgressionPlayback?.request.bpm);
  await expect(workspace.getByTestId("correction-match-global-bpm")).toHaveCount(0);
  await expect(tempo).toHaveValue("120"); // the speed it plays at, not 96
  await play.click();
  expect(await played()).toBe(120);
  await play.click();

  // The app-wide BPM changes: the field and the sound follow (answer 2).
  await page.getByTestId("global-bpm-value").dblclick();
  await page.getByTestId("global-bpm-input").fill("100");
  await page.getByTestId("global-bpm-input").press("Enter");
  await expect(tempo).toHaveValue("100");
  await play.click();
  expect(await played()).toBe(100);
  await play.click();

  // A BPM typed in the field becomes the song's: the button appears and it plays at 90.
  await tempo.fill("90");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("90");
  await expect(workspace.getByTestId("correction-match-global-bpm")).toHaveText("共通の BPM に合わせる");
  await play.click();
  expect(await played()).toBe(90);
  await play.click();
});

test("W3/C3: the save box has the new song's name; a changed name makes that song; an empty name cannot be saved", async ({ page }) => {
  await importScenario(page, "plain-8");
  const form = page.getByTestId("correction-workspace").getByTestId("correction-save-form");
  const name = form.getByTestId("correction-save-name");
  await expect(name).toHaveAccessibleName("新しい曲の名前");
  await expect(name).toHaveValue("plain-8.mid · 1–8小節");
  const save = form.getByRole("button", { name: /曲全体を保存/ });
  await name.fill("");
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("title", "名前を入れると保存できます");
  await name.fill("夜の取り込み");
  await save.click();
  const dialog = page.locator('form[role="dialog"]');
  await expect(dialog.locator('input[name="progression-title"]')).toHaveValue("夜の取り込み"); // the same name
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".lv-toast").filter({ hasText: "進行を Vault に保存しました。" })).toBeVisible();
  await page.locator('[data-nav="vault"]').click();
  await expect(page.locator(".lv-vault-row").filter({ hasText: "夜の取り込み" })).toHaveCount(1);
});

test("W4: the keys in one line; 「?」 shows them all, Esc and a click outside close it", async ({ page }) => {
  await importScenario(page, "plain-8");
  const help = page.getByTestId("correction-keys-help");
  expect((await help.boundingBox())!.height).toBeLessThan(44);
  const more = help.getByTestId("correction-keys-more");
  await more.click();
  const all = page.getByRole("dialog", { name: "キーの操作" });
  await expect(all).toContainText("小節の行の右クリック：その小節を消して詰める");
  await expect(all).toContainText("ショートカット一覧");
  await page.keyboard.press("Escape");
  await expect(all).toHaveCount(0);
  await expect(more).toBeFocused();
  await more.click();
  await expect(all).toBeVisible();
  await page.getByTestId("correction-piano-roll").click({ position: { x: 5, y: 5 } });
  await expect(all).toHaveCount(0);
});

test("W5/W7/C4: on the progression page — the same row and help, ♯ ♭ candidate names, no name field, whole names at 1280 and no page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openProgressionPage(page);
  await settle(page);
  const workspace = page.getByTestId("correction-workspace");
  await expect(workspace.getByRole("group", { name: "再生" }).getByTestId("correction-go-start")).toHaveText("|◀ 最初から");
  await expect(workspace.getByTestId("correction-loop")).toHaveAttribute("aria-pressed", "true"); // the range loops here, as before
  await expect(workspace.getByTestId("correction-keys-more")).toBeVisible();
  await expect(workspace.getByTestId("correction-save-name")).toHaveCount(0);
  // W7 ①: a one-bar card's whole name; nothing clipped.
  await expect(workspace.getByTestId("correction-card").first().locator(".lv-cw-card-name")).toHaveText("E♭maj7");
  const clipped = await workspace.locator(".lv-cw-card-name").evaluateAll((names) => names.filter((name) => (name as HTMLElement).offsetWidth > 0 && name.scrollWidth > name.clientWidth + 0.5).map((name) => name.textContent));
  expect(clipped).toEqual([]);
  // W7 ②: the page does not scroll up and down.
  const main = await page.locator("#main-content").evaluate((element) => [element.scrollHeight, element.clientHeight]);
  expect(main[0]).toBeLessThanOrEqual(main[1]!);
  // W5: the names to change to, shown as chord names (♭, no 「b」).
  await workspace.getByTestId("correction-card").first().click();
  const names = workspace.getByTestId("correction-name-candidates").locator(".lv-cw-alt-name");
  await expect(names.first()).toHaveClass(/lv-chordname/);
  const texts = await names.allTextContents();
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) expect(text, text).not.toMatch(/[A-G]b|#/);
  expect(texts.some((text) => text.includes("♭"))).toBe(true);
});

test("W6: a thin card's middle selects it; no 「＋」 is drawn beside a thin card", async ({ page }) => {
  await page.goto("/?p104=long");
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first().getByRole("button", { name: /進行を開く/ }).click();
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByRole("button", { name: "全体", exact: true }).click();
  await settle(page);
  const thin = workspace.locator('[data-chord-card][data-size="bare"], [data-chord-card][data-size="tiny"]');
  expect(await thin.count()).toBeGreaterThan(0);
  const blocked = await thin.evaluateAll((cards) => cards.filter((card) => {
    const box = card.getBoundingClientRect();
    if (box.right <= 0 || box.left >= window.innerWidth) return false;
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) !== card;
  }).length);
  expect(blocked).toBe(0);
  const last = workspace.locator("[data-progression-card-stage] [data-chord-card]").last();
  await last.click();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  const insertsOverThin = await workspace.locator(".lv-cw-insert").evaluateAll((buttons) => buttons.filter((button) => {
    const box = button.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('[data-chord-card][data-size="bare"], [data-chord-card][data-size="tiny"]')]
      .some((card) => { const c = card.getBoundingClientRect(); return box.right > c.left && box.left < c.right; });
  }).length);
  expect(insertsOverThin).toBe(0);
});

test("C5: four sizes, no horizontal overflow, no serious or critical axe findings; Space still plays and stops", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await assertNoHorizontalOverflow(page);
    const result = await new AxeBuilder({ page: page as never }).include('[data-testid="correction-workspace"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`), `${width}x${height}`).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await workspace.getByTestId("correction-follow").focus();
  await page.keyboard.press("Space");
  await expect(workspace.getByTestId("correction-play-song")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(workspace.getByTestId("correction-play-song")).toHaveAttribute("aria-pressed", "false");
});

test("answer 3: 「この曲」 and 「MIDIと以前の操作」 open whole and pressable below the workspace at four sizes", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "P23-16 の面");
  await page.evaluate(() => localStorage.setItem("loop-vault:progression-midi-export-enabled:v1", "true"));
  await openVault(page);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  for (const [panelName, item] of [["MIDIと以前の操作", "元の MIDI・以前の操作"], ["この曲", "この曲の情報を見る"]] as const) {
    await detail.getByRole("button", { name: "そのほか", exact: true }).click();
    await detail.getByRole("button", { name: item, exact: true }).click();
    const panel = detail.locator(`[aria-label="${panelName}"]`);
    for (const [width, height] of [[1280, 720], [1280, 800], [1440, 900], [1024, 768]] as const) {
      await page.setViewportSize({ width, height });
      await settle(page);
      for (const close of await page.locator(".lv-toast-list button[aria-label='閉じる']").all()) await close.click({ timeout: 1000 }).catch(() => undefined);
      await expect(page.locator(".lv-toast-list button[aria-label='閉じる']")).toHaveCount(0);
      await panel.scrollIntoViewIfNeeded();
      const seen = await panel.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const items = [...element.querySelectorAll<HTMLElement>("button, input, select")].filter((item) => item.getBoundingClientRect().height > 0);
        const missed = items.filter((item) => {
          item.scrollIntoView({ block: "nearest" });
          const r = item.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !(hit === item || item.contains(hit));
        }).map((item) => item.textContent || item.getAttribute("aria-label"));
        return { fits: box.height <= innerHeight, items: items.length, missed };
      });
      expect(seen.fits, `${panelName} ${width}x${height} fits the window`).toBe(true);
      expect(seen.items).toBeGreaterThan(0);
      expect(seen.missed, `${panelName} ${width}x${height}`).toEqual([]);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await detail.getByRole("button", { name: "そのほか", exact: true }).click();
    await detail.getByRole("button", { name: item, exact: true }).click();
    await expect(panel).toHaveCount(0);
  }
  // Closed again, the page keeps W7 ②: no page scroll at 1280x720.
  await page.setViewportSize({ width: 1280, height: 720 });
  await settle(page);
  expect(await page.evaluate(() => { const main = document.getElementById("main-content")!; return main.scrollHeight - main.clientHeight; })).toBeLessThanOrEqual(1);
});
