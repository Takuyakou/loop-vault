import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression, openApp, openTextCapture } from "./helpers/app";

/**
 * P23-25: the Bass Practice home comes first and picks one of the five practices; the practice screen's top row
 * names the practice and 「‹ Bass Practice」 goes back. These are the C1-C6 checks of the instruction.
 * P23-62: the five practices are named in Japanese, the three echo practices run on the shared 3-step stage
 * (1 聴く → 2 弾く → 3 結果), and the old purple 「自己評価」 badge is gone from those three.
 */
const HOME = "[data-testid='bass-practice-home']";
const PRACTICE_FILE = "loop-vault:practice-v1:data";

const MODES = [
  { name: "度数", mode: "degree", view: "degree-echo-view", tags: ["度数", "別のキーで"] },
  { name: "リズム", mode: "rhythm", view: "rhythm-echo-view", tags: ["リズム", "3 つの難しさ"] },
  { name: "ルートの動き", mode: "root-motion", view: "root-motion-echo-view", tags: ["ルートの動き", "Vault の進行も使える"] },
  { name: "コード進行のベース", mode: "bassline", view: "bassline-echo-view", tags: ["進行の上で", "Vault の進行も使える"] },
  { name: "MIDI のベースライン", mode: "midi", view: "midi-bass-library", tags: ["MIDI を読み込める"] },
] as const;

/** P23-62/P23-63/P23-64: all five practices sit on the shared stage frame (no badge in the top band). */
const STAGE_MODES = new Set(["degree", "rhythm", "root-motion", "bassline", "midi"]);

const card = (page: Page, mode: string) => page.locator(`[data-testid='bass-home-card'][data-mode='${mode}']`);
const modebar = (page: Page) => page.locator(".bass-modebar");
const back = (page: Page) => modebar(page).getByRole("button", { name: "‹ Bass Practice" });

async function openBassHome(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

/** The same, without reloading: a Vault progression saved in this page must stay available. */
async function enterBassHome(page: Page) {
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

/** The practice file the controller keeps; used only to count records, never to change them. */
const practiceFile = (page: Page) => page.evaluate((key) => {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw) as {
    attempts?: { rating?: string }[];
    sessions?: { abandoned?: boolean }[];
  };
}, PRACTICE_FILE);

const abandonedSessions = async (page: Page) => ((await practiceFile(page))?.sessions ?? [])
  .filter((session) => session.abandoned).length;

/** The お手本 notes of the exercise on screen — the same labels identify the same phrase. */
const readAnswerNotes = async (page: Page) => page.getByTestId("degree-echo-view")
  .locator("[data-testid='bp-lane'] .bp-note")
  .evaluateAll((notes) => notes.map((note) => note.getAttribute("aria-label")));

/** Degree Echo to 3 結果 without a microphone: listen, play without a take, then look at the answer. */
async function degreeToReview(page: Page) {
  const view = page.getByTestId("degree-echo-view");
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
  await expect(view).toHaveAttribute("data-stage-step", "2");
  return view;
}

test("C1 P1/P4 + C2: the home comes first and all five practices open and come back", async ({ page }) => {
  test.setTimeout(90_000);
  await openBassHome(page);

  // P1: the home is the screen; the practices are mounted but out of sight behind it.
  // P23-26 X1 (B): the page name is the top band's title only — the home starts at h2 and skips no level.
  // P23-47-fix-4 #4: the explanation line is gone. P23-67: 「聴いてまねる」 is gone too — the home starts with the cards;
  // 「弾いて確かめる」 (over the MIDI card) stays.
  await expect(page.locator(HOME)).not.toContainText("聴いて、歌って、ベースで弾く練習です。");
  await expect(page.locator(HOME).locator(".lv-bh-heading, .lv-bh-top")).toHaveCount(0);
  await expect(page.locator(HOME)).not.toContainText("聴いてまねる");
  await expect(page.locator(HOME).locator(".lv-bh-group")).toHaveText(["弾いて確かめる"]);
  const headings = await page.locator(HOME).evaluate((home) => (
    [...home.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent }))
  ));
  expect(headings).toEqual([
    { level: 2, text: "楽器どの練習にも同じ設定を使います" },
    { level: 2, text: "この 7 日弾き終えた回数" },
  ]);
  await expect(page.getByTestId("degree-echo-view")).toBeHidden();
  await expect(modebar(page)).toBeHidden();

  // P4: the five-button bar is gone — one card per practice, in the drawn order.
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect(await page.locator("[data-testid='bass-home-card']").evaluateAll((cards) => (
    cards.map((entry) => entry.getAttribute("data-mode"))
  ))).toEqual(["degree", "rhythm", "root-motion", "bassline", "midi"]);

  // C2: each practice opens from its card, names itself in the top row and 「‹ Bass Practice」 comes back.
  // P23-62: the cards name the practices in Japanese and carry the tags the practice is about.
  for (const { name, mode, view, tags } of MODES) {
    await expect(card(page, mode).locator(".lv-bh-card-name")).toHaveText(name);
    expect(await card(page, mode).locator(".lv-bh-tags > span").evaluateAll((entries) => entries.map((entry) => entry.textContent)))
      .toEqual([...tags]);
    await card(page, mode).click();
    await expect(page.locator(HOME)).toBeHidden();
    const practice = page.getByTestId(view);
    await expect(practice).toBeVisible();
    await expect(back(page)).toBeVisible();
    await expect(modebar(page).locator(".bass-mode-name")).toHaveText(name);
    await expect(modebar(page).getByRole("tab")).toHaveCount(0);
    if (STAGE_MODES.has(mode)) {
      // P23-62/P23-63/P23-64: the removed badge is gone from the top band; MIDI opens on its song library first.
      await expect(modebar(page).locator(".bass-mode-badge")).toHaveCount(0);
      if (mode !== "midi") {
        expect(await practice.locator(".bp-step").evaluateAll((steps) => steps.map((step) => step.textContent?.trim())))
          .toEqual(["1聴く", "2弾く", "3結果"]);
        await expect(practice).toHaveAttribute("data-stage-step", "0");
        await expect(practice.locator(".bp-meta")).toContainText("BPM");
      }
    }
    await back(page).click();
    await expect(page.locator(HOME)).toBeVisible();
    await expect(practice).toBeHidden();
  }
});

test("C5: with no record the home has no 続きから and shows the empty week", async ({ page }) => {
  await openBassHome(page);

  await expect(page.getByTestId("bass-home-resume")).toHaveCount(0);
  await expect(page.getByTestId("bass-home-week-sum")).toHaveText("この 7 日は、まだ弾いていません");
  expect(await page.getByTestId("bass-home-week").locator(".lv-bh-week-day").count()).toBe(7);
  for (const { mode } of MODES) {
    await expect(card(page, mode)).toContainText("まだ弾いていません");
    await expect(card(page, mode).getByTestId("bass-home-card-week").locator("i[data-on='true']")).toHaveCount(0);
  }
  // Looking at the home is not a practice: no record appears from it.
  expect(((await practiceFile(page))?.attempts ?? []).filter((attempt) => attempt.rating)).toHaveLength(0);
});

test("C1 P5 + C4: one attempt feeds 続きから/最後/この 7 日, and the Home's 続きから skips the home", async ({ page }) => {
  test.setTimeout(150_000);
  // The Home shows its 続きから only once the Vault has something in it, so put one progression there first.
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 | Dm7 | G7 |");
  await capture.getByTestId("text-progression-name").fill("P23-25 Home fixture");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();

  await enterBassHome(page);
  await card(page, "degree").click();
  const view = await degreeToReview(page);
  await view.locator("[data-review-rating='good']").click();
  // P23-62: the attempt is written by 「次のフレーズ」, as the review screen's primary action wrote it before.
  await view.getByTestId("degree-next").click();
  await expect.poll(async () => ((await practiceFile(page))?.attempts ?? []).filter((attempt) => attempt.rating).length).toBe(1);

  await back(page).click();
  await expect(page.locator(HOME)).toBeVisible();
  await expect(page.getByTestId("bass-home-resume")).toContainText("度数");
  await expect(card(page, "degree")).toContainText("最後: 今日");
  await expect(page.getByTestId("bass-home-week-sum")).toContainText("この 7 日で 1 回");
  await expect(card(page, "degree").getByTestId("bass-home-card-week").locator("i[data-on='true']")).toHaveCount(1);

  // C4: the app Home's 「続きから」 names the practice, so it lands there and not on the picking screen.
  await page.locator('[data-nav="home"]').click();
  const resume = page.locator("[data-testid='home-continue'][data-continue-kind='bass-practice']");
  await expect(resume).toBeVisible();
  await resume.getByRole("button", { name: "続きをやる" }).click();
  await expect(view).toBeVisible();
  await expect(modebar(page).locator(".bass-mode-name")).toHaveText("度数");
  await expect(page.locator(HOME)).toBeHidden();
});

test("C3 P6: Degree Echo keeps its question behind the home, and coming back abandons nothing", async ({ page }) => {
  test.setTimeout(120_000);
  await openBassHome(page);
  await card(page, "degree").click();
  const view = await degreeToReview(page);
  const notes = await readAnswerNotes(page);
  expect(notes.length).toBeGreaterThan(0);
  const abandonedBefore = await abandonedSessions(page);
  // The practice file is the one the controller keeps, and Degree Echo has a session in it already.
  expect(((await practiceFile(page))?.sessions ?? []).length).toBeGreaterThan(0);

  await back(page).click();
  await expect(page.locator(HOME)).toBeVisible();
  await expect(view).toBeHidden();
  await card(page, "degree").click();

  await expect(view).toBeVisible();
  await expect(view).toHaveAttribute("data-practice-state", "review");
  // P23-62: the exercise is read from the お手本 lane (the old 「答え」 box is gone); the same phrase is still there.
  expect(await readAnswerNotes(page)).toEqual(notes);
  expect(await abandonedSessions(page)).toBe(abandonedBefore);
});

test("C4 P7: a Vault progression opened from Bassline Echo reaches the same practice", async ({ page }) => {
  test.setTimeout(90_000);
  await openApp(page);
  await createSavedProgression(page, "P23-25 Fixture");

  await enterBassHome(page);
  await card(page, "bassline").click();
  const bassline = page.getByTestId("bassline-echo-view");
  // P23-63: the Vault progression picker sits inside the top band's 条件 panel.
  await page.getByTestId("bassline-conditions").click();
  await page.getByTestId("vault-progression-picker-open").click();
  await page.getByTestId("vault-progression-picker-candidate").first().click();
  await page.getByTestId("vault-progression-picker-confirm").click();

  await expect(page.getByTestId("bassline-progression-select")).toHaveValue("vault");
  await expect(page.getByTestId("bassline-conditions")).toContainText(/Vault進行/);
  await page.getByTestId("bassline-conditions").click();
  await expect(bassline.locator("[data-testid='bp-lane']")).toBeVisible();
  await expect(bassline.getByTestId("bassline-listen")).toBeVisible();
});

test("C6: four widths stay inside the window, axe is clean and the keys are the same", async ({ page }) => {
  test.setTimeout(120_000);
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 640 },
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await openBassHome(page);
    await assertNoHorizontalOverflow(page);

    // Numbers instead of eyes: the cards stay inside the screen, keep a usable width and never overlap.
    const box = await page.evaluate(() => {
      const home = document.querySelector<HTMLElement>("[data-testid='bass-practice-home']")!;
      const rect = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
      };
      const columns = [...home.querySelectorAll<HTMLElement>(":scope > .lv-bh-column")].map(rect);
      const cards = [...home.querySelectorAll<HTMLElement>("[data-testid='bass-home-card']")].map(rect);
      const week = home.querySelector<HTMLElement>("[data-testid='bass-home-week']")!;
      return { home: rect(home), columns, cards, week: rect(week), body: { client: document.body.clientWidth, scroll: document.body.scrollWidth } };
    });
    const overlaps = (a: typeof box.home, b: typeof box.home) =>
      a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1;
    for (const entry of box.cards) {
      expect(entry.x).toBeGreaterThanOrEqual(box.home.x - 1);
      expect(entry.right).toBeLessThanOrEqual(box.home.right + 1);
      expect(entry.width).toBeGreaterThanOrEqual(140);
    }
    for (let left = 0; left < box.cards.length; left += 1) {
      for (let right = left + 1; right < box.cards.length; right += 1) {
        expect(overlaps(box.cards[left]!, box.cards[right]!), `cards ${left}/${right} overlap at ${size.width}`).toBe(false);
      }
    }
    expect(box.columns).toHaveLength(2);
    expect(overlaps(box.columns[0]!, box.columns[1]!), `the two columns overlap at ${size.width}`).toBe(false);
    expect(box.week.width).toBeGreaterThan(0);
    expect(box.body.scroll).toBeLessThanOrEqual(box.body.client + 1);

    await page.screenshot({ path: `p89-generated/p23-25/bass-home-${size.width}x${size.height}.png`, fullPage: true });
    await card(page, "degree").click();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: `p89-generated/p23-25/bass-degree-${size.width}x${size.height}.png`, fullPage: true });
    await back(page).click();
    await expect(page.locator(HOME)).toBeVisible();
  }

  // C6: no serious/critical accessibility violation on the picking screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBassHome(page);
  const axe = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
  }))).toEqual([]);

  // C6/P23-65: the home has no 「?」 key help button; each practice screen opens its own stage keys.
  await expect(page.locator(HOME).getByRole("button", { name: "キー操作", exact: true })).toHaveCount(0);
  await card(page, "degree").click();
  await page.locator(".bass-mode-tools").getByRole("button", { name: "キー操作" }).click();
  const practiceKeys = await page.getByRole("dialog", { name: "キー操作" }).innerText();
  expect(practiceKeys).toBe("Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ · T 別のキーで");
  expect(practiceKeys).not.toContain("S 歌う");
});
