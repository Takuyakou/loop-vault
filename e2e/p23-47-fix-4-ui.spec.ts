import { expect, test, type Page } from "@playwright/test";
import { openApp, chooseTextSetting } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-47-fix-4 (追記 2): the Chord Dojo home (the guide's wide card, what each card shows, hover like Bass Practice,
 * no pop-in), the Voicing Loop picker's 試聴, the large Live MIDI window, the Bass Practice home's first row, and the
 * Vault's top row.
 */

const TEAL = "rgb(66, 216, 198)";
const RING = `${TEAL} 0px 0px 0px 1px inset`;
const WELL = "rgb(12, 20, 30)";
const LINE = "rgb(43, 60, 80)";
const KEYS = {
  jazz: "loop-vault:jazz-progressions-v1:data",
  ear: "loop-vault:ear-practice-v1:data",
};
const AT = "2026-11-08T00:00:00.000Z";
const seed = (page: Page, key: string, value: unknown) => page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value });

async function openDojoHome(page: Page): Promise<void> {
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await expect(page.getByTestId("dojo-home")).not.toHaveAttribute("data-loading", "true");
}

test("the guide is its own group under the four cards: where the course is, what pressing does, nine named stops", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojoHome(page);
  const guide = page.getByTestId("home-guide");
  await expect(guide).toHaveAttribute("data-wide", "true");
  await expect(page.locator(".dojo-home-p20-main > .dojo-home-p20-card")).toHaveCount(4);
  await expect(page.locator(".dojo-home-p20-main [data-testid=home-guide]")).toHaveCount(0);
  // P23-67: 「順番に学ぶ」 stays (the guide's own heading, the only one on the home); 「よく使う練習」 is gone, so the right
  // column starts at the four cards' top.
  await expect(page.locator(".dojo-home-guide-group")).toContainText("順番に学ぶ");
  await expect(page.locator(".dojo-home-p20-section-title")).toHaveText(["順番に学ぶ見本を見て弾き、Lv1 から段を進めます"]);
  const spacing = await page.evaluate(() => {
    const main = document.querySelector(".dojo-home-p20-main")!.getBoundingClientRect();
    const sub = document.querySelector(".dojo-home-p20-sub > :first-child")!.getBoundingClientRect();
    return { subTop: sub.top, mainTop: main.top };
  });
  expect(Math.abs(spacing.subTop - spacing.mainTop), `right column top ${JSON.stringify(spacing)}`).toBeLessThanOrEqual(1);
  // The nine stops, each with its level and its short name; one of them is the current one.
  const stops = guide.locator(".dojo-home-guide-rail li");
  await expect(stops).toHaveCount(9);
  await expect(guide.locator('.dojo-home-guide-rail li[data-state="now"]')).toHaveCount(1);
  await expect(guide.locator(".dojo-home-guide-name")).toHaveText(["メジャーとマイナー", "4種類のセブンス", "12キーで引き出す", "配置を選ぶ", "進行をつなぐ", "キーを変える", "耳から進行", "響きを広げる", "取り出す"]);
  await expect(stops.nth(4)).toHaveAttribute("title", "Lv5 進行を覚えてつなぐ");
  // Not started: the level, what the first step is, and 「始める」. No arrow (the filled words say what pressing does).
  await expect(page.getByTestId("home-guide-material")).toHaveText("Lv1");
  await expect(page.getByTestId("home-guide-hint")).toContainText("最初の響き C");
  await expect(guide.locator(".dojo-home-guide-go")).toHaveText("始める");
  await expect(guide.locator(".dojo-home-guide-go")).toHaveCSS("background-color", TEAL);
  await expect(guide.locator(".dojo-home-chev")).toHaveCount(0);
  await expect(page.getByTestId("home-guide-count")).toHaveCount(0);
  // The place: under the four cards, as wide as the two columns of cards; the right column starts at the first card.
  const box = (await guide.boundingBox())!;
  const ear = (await page.getByTestId("home-ear").boundingBox())!;
  const drill = (await page.getByTestId("home-drill").boundingBox())!;
  const standard = (await page.getByTestId("home-standard").boundingBox())!;
  const today = (await page.getByTestId("home-today").boundingBox())!;
  expect(box.y).toBeGreaterThan(ear.y + ear.height);
  expect(Math.round(box.x)).toBe(Math.round(ear.x));
  expect(Math.round(box.x + box.width)).toBe(Math.round(drill.x + drill.width));
  expect(box.height).toBeGreaterThanOrEqual(130);
  expect(box.height).toBeLessThanOrEqual(152);
  expect(Math.abs(today.y - standard.y)).toBeLessThanOrEqual(1);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await captureReportShot(page, "p23-47-fix-4-assets/dojo-home-1440.png");
});

test("a started course shows what is left, 「続きから」, and the answered count on the current stop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
  if (await page.getByTestId("course-demo").count()) await page.getByTestId("course-demo-skip").click();
  await page.getByTestId("course-self-ok").click();
  await page.getByTestId("course-next").click();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  await page.getByTestId("dojo-back").click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  const guide = page.getByTestId("home-guide");
  await expect(page.getByTestId("home-guide-material")).toHaveText("Lv1");
  await expect(page.getByTestId("home-guide-status")).toHaveText(/^メジャーとマイナー・残り \d+ 問$/);
  await expect(page.getByTestId("home-guide-hint")).toHaveCount(0);
  await expect(guide.locator(".dojo-home-guide-go")).toHaveText("続きから");
  await expect(page.getByTestId("home-guide-count")).toHaveText(/^1\/\d+$/);
  const left = Number((await page.getByTestId("home-guide-status").innerText()).match(/残り (\d+) 問/)![1]);
  const total = Number((await page.getByTestId("home-guide-count").innerText()).split("/")[1]);
  expect(left, "the answered one and what is left make the set").toBe(total - 1);
  const bar = await guide.locator('.dojo-home-guide-rail li[data-state="now"] .dojo-home-guide-bar i').evaluate((element) => element.getBoundingClientRect().width);
  expect(bar).toBeGreaterThan(0);
});

test("定番の進行: its two lists are two rows — the name, the laps, one segment for each progression", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, KEYS.jazz, { app: "loopvault-jazz-progressions", fileVersion: 1, version: 1, revision: 1, operations: [], laps: { "jazz-progressions-001": { 0: { count: 1, lastAt: AT } } } });
  await openDojoHome(page);
  const card = page.getByTestId("home-standard");
  await expect(card.locator(".dojo-home-p20-row")).toHaveCount(2);
  await expect(card.locator(".dojo-home-p20-stat")).toHaveCount(0);
  await expect(page.getByTestId("home-jazz-count")).toHaveText(/^1 \/ \d+$/);
  await expect(page.getByTestId("home-original-count")).toHaveText(/^0 \/ \d+$/);
  const jazzTotal = Number((await page.getByTestId("home-jazz-count").innerText()).split("/")[1]);
  const jazz = page.getByTestId("home-open-jazz");
  await expect(jazz).toContainText("Jazz Progressions");
  await expect(jazz).toContainText("完奏");
  await expect(jazz.locator(".dojo-home-p20-pips i")).toHaveCount(jazzTotal);
  await expect(jazz.locator(".dojo-home-p20-pips i[data-on]")).toHaveCount(1);
  await expect(jazz.locator(".dojo-home-p20-pips i[data-on]")).toHaveCSS("background-color", TEAL);
  await expect(page.getByTestId("home-open-original").locator(".dojo-home-p20-pips i[data-on]")).toHaveCount(0);
  // A row is a button of its own (the card's ring stays, the row gets its own).
  await jazz.hover();
  await expect(jazz).toHaveCSS("box-shadow", RING);
  await jazz.click();
  await expect(page.locator("#dojo-builtin-jazz-progressions")).toBeInViewport();
});

test("2-5-1 Master: what 続きから opens next, the range line, no Form row; the next cell is outlined in the picture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojoHome(page);
  const card = page.getByTestId("home-master");
  await expect(card.locator(".dojo-home-form-row")).toHaveCount(0);
  await expect(card.locator(".dojo-home-p20-bar")).toHaveCount(0);
  await expect(card.locator(".dojo-home-p20-stat b")).toHaveText("0 / 48");
  await expect(card.locator(".dojo-home-p20-stat")).toContainText("マスターしたマス");
  await expect(page.getByTestId("home-master-next")).toHaveText("次Form A ・ C");
  await expect(card.getByTestId("master-range-label")).toHaveText("学習順 A → B → C → D");
  await expect(page.getByTestId("home-master-art").locator("rect[data-next]")).toHaveCount(1);
  await expect(page.getByTestId("home-master-art").locator("rect[data-next]")).toHaveAttribute("stroke", /.+/);
  const master = (await card.boundingBox())!;
  const standard = (await page.getByTestId("home-standard").boundingBox())!;
  expect(Math.round(master.height)).toBe(Math.round(standard.height));
});

test("耳で弾く: the score on a 100-wide scale with the best mark; ボイシングドリル: the four groups as buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const record = (play: string, at: string, index: number, wrongs: number) => ({ at, play, questionId: `q-${play}`, source: "bank", level: 1, length: 3, chordLevel: 1, kind: "三和音", index, given: false, manual: false, wrongs, hint: 0, replays: 0, judge: "core" });
  // p1 (older): 2 of 3 at the first try = 67. p2 (newer): 1 of 3 = 33.
  await seed(page, KEYS.ear, { app: "loopvault-ear-practice", fileVersion: 1, version: 1, revision: 1, records: [
    record("p1", "2026-11-01T00:00:00.000Z", 0, 0), record("p1", "2026-11-01T00:00:00.000Z", 1, 0), record("p1", "2026-11-01T00:00:00.000Z", 2, 1),
    record("p2", AT, 0, 0), record("p2", AT, 1, 1), record("p2", AT, 2, 2),
  ] });
  await openDojoHome(page);
  const ear = page.getByTestId("home-ear");
  await expect(page.getByTestId("home-ear-last")).toHaveText("33");
  await expect(ear.locator(".dojo-home-p20-stat")).toContainText("点");
  await expect(ear.locator(".dojo-home-p20-stat")).toContainText("前回");
  await expect(page.getByTestId("home-ear-best")).toHaveText("ベスト 67");
  const scale = (await page.getByTestId("home-ear-scale").boundingBox())!;
  const fill = (await page.getByTestId("home-ear-scale").locator("i").boundingBox())!;
  const mark = (await page.getByTestId("home-ear-scale").locator("u").boundingBox())!;
  expect(Math.abs(fill.width / scale.width - 0.33), "the fill is 33 of 100").toBeLessThanOrEqual(0.01);
  expect(Math.abs((mark.x + mark.width / 2 - scale.x) / scale.width - 0.67), "the best mark is at 67 of 100").toBeLessThanOrEqual(0.01);
  await expect(ear.locator(".dojo-home-p20-chip")).toHaveCount(0);

  const drill = page.getByTestId("home-drill");
  await expect(page.getByTestId("home-drill-best")).toHaveText("まだ");
  const groups = drill.locator(".dojo-home-p20-stage-links .dojo-home-p20-link");
  await expect(groups).toHaveText(["① 循環コード", "② ダイアトニック", "③ テンションの形", "④ 短い転調"]);
  for (const group of await groups.all()) {
    await expect(group).toHaveAttribute("aria-label", / \d+ 組$/);
    await expect(group).toHaveCSS("text-decoration-line", "none");
    await expect(group).toHaveCSS("background-color", WELL);
  }
  // At 1440 the four make two lines of two.
  const tops = await groups.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(2);
  expect(tops[0]).toBe(tops[1]);
  expect(tops[2]).toBe(tops[3]);
});

test("the four cards line up: one height in a row, and the entries on the card's bottom line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojoHome(page);
  const cards = await page.evaluate(() => ["home-standard", "home-master", "home-ear", "home-drill"].map((id) => {
    const card = document.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
    const box = card.getBoundingClientRect();
    const links = card.querySelector<HTMLElement>(".dojo-home-p20-links")!.getBoundingClientRect();
    return { id, height: Math.round(box.height), gap: Math.round(box.bottom - links.bottom) };
  }));
  expect(cards[0]!.height).toBe(cards[1]!.height);
  expect(cards[2]!.height).toBe(cards[3]!.height);
  for (const card of cards) {
    expect(card.height, `${card.id}: the card's height`).toBeGreaterThanOrEqual(214);
    expect(card.height, `${card.id}: the card's height`).toBeLessThanOrEqual(224);
    expect(card.gap, `${card.id}: the entries end at the card's bottom padding`).toBeGreaterThanOrEqual(11);
    expect(card.gap, `${card.id}: the entries end at the card's bottom padding`).toBeLessThanOrEqual(15);
  }
});

test("the right column: one stacked bar for today's four flows, the 12 keys counted by state, the two counts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojoHome(page);
  const today = page.getByTestId("home-today");
  await expect(today).toContainText("目安");
  await expect(page.getByTestId("dojo-theme")).toContainText("テーマ");
  await expect(page.getByTestId("dojo-theme")).not.toContainText("中心");
  const flows = today.locator(".dojo-home-today-flows > div");
  await expect(flows).toHaveCount(4);
  const counts = await flows.evaluateAll((elements) => elements.map((element) => Number(element.querySelector("b")!.textContent)));
  await expect(flows.locator("span")).toHaveText(["復習", "型", "登録した音", "進行"]);
  // The bar has one part for each flow that has something, as wide as its share.
  const parts = page.getByTestId("home-today-mix").locator("i");
  await expect(parts).toHaveCount(counts.filter((count) => count > 0).length);
  const grows = await parts.evaluateAll((elements) => elements.map((element) => Number(getComputedStyle(element).flexGrow)));
  expect(grows).toEqual(counts.filter((count) => count > 0));
  await expect(page.getByTestId("practice-start")).toHaveCSS("background-color", TEAL);
  // コードの型: the three states and their numbers make 12.
  const shape = await page.getByTestId("home-shape-counts").locator("b").evaluateAll((elements) => elements.map((element) => Number(element.textContent)));
  expect(shape.reduce((sum, value) => sum + value, 0)).toBe(12);
  await expect(page.getByTestId("home-shape-counts")).toContainText("速く弾けた");
  await expect(page.getByTestId("home-shape-counts")).toContainText("遅かった");
  await expect(page.getByTestId("home-shape-counts")).toContainText("まだ");
  await expect(page.getByTestId("home-shape")).not.toContainText("緑 = 合格");
  // 自分の進行・登録した音: one line each — the name, what it is, the number.
  for (const [id, count] of [["home-saved", "home-saved-count"], ["home-wanted", "home-wanted-count"]] as const) {
    const row = (await page.getByTestId(id).boundingBox())!;
    expect(row.height, `${id} is one line`).toBeLessThanOrEqual(52);
    await expect(page.getByTestId(count)).toHaveText(/^\d+$/);
  }
  await expect(page.getByTestId("home-saved")).toContainText("Vault の進行で練習");
  await expect(page.getByTestId("home-wanted")).toContainText("使いたい音を覚える");
});

test("a card's hover is an inset ring and a lighter surface, as in Bass Practice; nothing moves", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojoHome(page);
  for (const id of ["home-standard", "home-master", "home-ear", "home-drill", "home-guide"]) {
    const card = page.getByTestId(id);
    const before = (await card.boundingBox())!;
    await expect(card).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await card.hover({ position: { x: 20, y: 20 } });
    await expect(card).toHaveCSS("box-shadow", RING);
    const after = (await card.boundingBox())!;
    expect(after).toEqual(before);
    await page.mouse.move(5, 5);
    await expect(card).not.toHaveCSS("box-shadow", RING);
  }
  await page.getByTestId("home-drill").hover({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("home-drill").locator(".lv-cd-art-hand")).toHaveCSS("animation-name", "lv-cd-hand");
  await page.getByTestId("home-master").hover({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("home-master").locator(".lv-cd-art-sweep")).toHaveCSS("animation-name", "lv-cd-sweep");
  await page.getByTestId("home-guide").hover({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("home-guide").locator('.dojo-home-guide-rail li[data-state="now"]')).toHaveCSS("animation-name", "lv-cd-now");
  // The right column's cards that open a screen react the same way; 今日のおまかせ (two buttons, no whole-card press) does not.
  for (const id of ["home-shape", "home-saved", "home-wanted"]) {
    await page.getByTestId(id).hover({ position: { x: 12, y: 12 } });
    await expect(page.getByTestId(id)).toHaveCSS("box-shadow", RING);
  }
  await page.getByTestId("home-today").hover({ position: { x: 12, y: 12 } });
  await expect(page.getByTestId("home-today")).not.toHaveCSS("box-shadow", RING);
});

test("opening the Chord Dojo again shows the records at once (no — that turns into a number)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojoHome(page);
  await page.locator('[data-nav="home"]').click();
  await page.locator('[data-nav="chord-dojo"]').click();
  // The second open within the same session renders the kept records in its first frame.
  await expect(page.getByTestId("dojo-home")).not.toHaveAttribute("data-loading", "true", { timeout: 50 });
  await expect(page.getByTestId("home-guide-material")).toHaveText(/^Lv\d|総合/);
});

test("the loading words of the Chord Dojo appear only after 400ms", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  const status = page.locator(".dojo > p[role=status][aria-busy=true]");
  if (await status.count()) await expect(status).toHaveCSS("visibility", "hidden");
});

test("Voicing Loop picker: picking another progression stops the 試聴 of the one before", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p528Direct=1");
  await expect(page.locator("#main-content")).toBeVisible();
  for (const [name, text] of [["明るい循環", "| Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | Am7 | Dm7 | G7 |"], ["ツーファイブ", "| Dm7 | G7 | Cmaj7 |"]] as const) {
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill(text);
    await chooseTextSetting(capture, "text-progression-key", "C major");
    await capture.getByTestId("text-progression-name").fill(name);
    await capture.getByTestId("text-progression-save").click();
  }
  await page.locator('[data-nav="voicing-loop"]').click();
  const audition = page.locator('[aria-label="この進行を試聴"], [aria-label="この進行を止める"]').first();
  await audition.click();
  await expect(audition).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(5, 600);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('[aria-label="この進行を試聴"], [aria-label="この進行を止める"]').first()).toHaveAttribute("aria-pressed", "false");
});

test("the large Live MIDI window draws a piano and keeps a 1280px column", async ({ page }) => {
  await page.setViewportSize({ width: 1865, height: 956 });
  await openApp(page);
  await page.locator('[data-nav="live-midi"]').click();
  const preview = page.getByTestId("live-midi-web-preview");
  await expect(preview).toBeVisible();
  await preview.evaluate((element) => Object.assign((element as HTMLElement).style, { inset: "0", width: "100vw", height: "100vh", maxWidth: "none" }));
  const keys = page.getByTestId("live-midi-mini-keys");
  await expect.poll(async () => Math.round((await keys.boundingBox())!.height)).toBeGreaterThanOrEqual(110);
  expect(Math.round((await keys.boundingBox())!.width)).toBe(1280);
  await expect(keys.locator('[data-label="C4"]')).toHaveCount(1);
  await expect(keys.locator('.lv-live-mini-key:not([data-black])').first()).toHaveCSS("background-color", "rgb(223, 230, 238)");
  await captureReportShot(page, "p23-47-fix-4-assets/live-midi-large.png");
  // The small window keeps the thin strip.
  await preview.evaluate((element) => Object.assign((element as HTMLElement).style, { width: "420px", height: "260px" }));
  await expect.poll(async () => Math.round((await keys.boundingBox())!.height)).toBe(18);
});

test("Bass Practice home: no explanation line, no 「聴いてまねる」 heading and no 「?」 key help button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  const home = page.getByTestId("bass-practice-home");
  await expect(home).toBeVisible();
  await expect(home).not.toContainText("聴いて、歌って、ベースで弾く練習です。");
  await expect(home.locator(".lv-bh-heading, .lv-bh-top")).toHaveCount(0);
  await expect(home).not.toContainText("聴いてまねる");
  await expect(home.locator(".lv-bh-group")).toHaveText(["弾いて確かめる"]);
  await expect(home.locator(".lv-bh-help")).toHaveCount(0);
  await expect(home.getByRole("button", { name: "キー操作", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("bass-home-help")).toHaveCount(0);
  await captureReportShot(page, "p23-47-fix-4-assets/bass-home-1440.png");
});

test("Vault: the search, 「選ぶと鳴らす」 and the order are one row of the same dark controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.locator('[data-nav="vault"]').click();
  const search = page.locator("#vault-search");
  const auto = page.getByRole("button", { name: "選ぶと鳴らす" });
  const sort = page.locator("#vault-sort");
  await expect(search).toBeVisible();
  // One height, one corner, one dark well, one line — and no grey system box.
  for (const control of [search, auto, sort]) {
    expect(Math.round((await control.boundingBox())!.height)).toBe(40);
    await expect(control).toHaveCSS("background-color", WELL);
    await expect(control).toHaveCSS("border-top-color", LINE);
    await expect(control).toHaveCSS("border-top-left-radius", "10px");
  }
  await expect(sort).toHaveCSS("appearance", "none");
  expect(await sort.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("svg");
  // 選ぶと鳴らす is the app's switch: a track and a knob that slides when it is on.
  const mark = auto.locator(".lv-vault-auto-mark");
  const knob = () => mark.evaluate((element) => getComputedStyle(element, "::after").transform);
  expect(Math.round((await mark.boundingBox())!.width)).toBe(32);
  expect(Math.round((await mark.boundingBox())!.height)).toBe(18);
  await expect(auto).toHaveAttribute("aria-pressed", "false");
  await expect.poll(knob).toBe("none");
  await auto.click();
  await expect(auto).toHaveAttribute("aria-pressed", "true");
  await expect.poll(knob).toBe("matrix(1, 0, 0, 1, 14, 0)");
  await expect(mark).toHaveCSS("background-color", "rgb(27, 106, 98)");
  await auto.click();
  await expect(auto).toHaveAttribute("aria-pressed", "false");
  // The 「/」 key hint shows while the box is empty and not focused.
  const key = page.locator(".lv-vault-search-key");
  await page.mouse.click(700, 700);
  await expect(key).toBeVisible();
  await expect(key).toHaveText("/");
  await search.focus();
  await expect(key).toBeHidden();
  await search.fill("2-5-1");
  await page.mouse.click(700, 700);
  await expect(key).toBeHidden();
  await search.fill("");
  await page.mouse.click(700, 700);
  await expect(key).toBeVisible();
  await captureReportShot(page, "p23-47-fix-4-assets/vault-top-1440.png");
});
