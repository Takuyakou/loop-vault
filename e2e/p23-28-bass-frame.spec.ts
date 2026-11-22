import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

/**
 * P23-28: the frame shared by the five practices — the one-line top band, the numbered flow and the two carried-over
 * fixes (F8). C1-C6 of the instruction.
 *
 * P23-62 replaced the frame of 度数・リズム・ルートの動き with the shared stage (1 聴く → 2 弾く → 3 結果, no right
 * column, no in-practice 7 days). P23-63 moved コード進行のベース there too, and P23-64 puts MIDI のベースライン
 * on the same stage frame (the top band has no badge or sentence; clicking the card opens the song library first, and
 * opening a song runs on the 3-step stage checked in p23-62-bass-stage.spec.ts).
 */
const HOME = "[data-testid='bass-practice-home']";
const PRACTICE_FILE = "loop-vault:practice-v1:data";

const MODES = [
  { name: "度数", mode: "degree", view: "degree-echo-view", staged: true },
  { name: "リズム", mode: "rhythm", view: "rhythm-echo-view", staged: true },
  { name: "ルートの動き", mode: "root-motion", view: "root-motion-echo-view", staged: true },
  { name: "コード進行のベース", mode: "bassline", view: "bassline-echo-view", staged: true },
  { name: "MIDI のベースライン", mode: "midi", view: "midi-bass-library", staged: true },
] as const;

/** P23-62/P23-63: the sentence the direct-stage practices carry in place of the band's description. */
const STAGE_SAY: Record<"degree" | "rhythm" | "root-motion" | "bassline", string> = {
  degree: "聴いて、同じフレーズを弾きます",
  rhythm: "聴いて、同じリズムを弾きます",
  "root-motion": "聴いて、ルートの動きを見分けます",
  bassline: "コード進行の上で、ベースラインを聴いて弾きます",
};

const GENERIC_KEYS = "Space 聴く / 停止 · R 録音 · H ヒント · 1–4 自己評価 · N 次へ · Esc 停止（各練習の既存操作を優先）";
/** P23-62/P23-63/P23-64: the staged practices' own line in 「?」 (度数 appends 「T 別のキーで」; ベース records and advances). */
const STAGE_KEYS: Record<"degree" | "rhythm" | "root-motion" | "bassline" | "midi", string> = {
  degree: "Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ · T 別のキーで",
  rhythm: "Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ",
  "root-motion": "Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ",
  bassline: "Space 聴く・お手本 · H ヒント · R 録って弾く・録り直す · Esc 止める · N 記録して次へ",
  midi: "Space 聴く・止める · R 録って弾く・もう一度 · Esc 止める · N 次の区間",
};
/** The stage's foot at 段 1 (1 聴く), where every staged practice opens. */
const STAGE_FOOT_KEYS = "Space 聴く · H ヒント · R 録って弾く";

const card = (page: Page, mode: string) => page.locator(`[data-testid='bass-home-card'][data-mode='${mode}']`);
const modebar = (page: Page) => page.locator(".bass-modebar");
const back = (page: Page) => modebar(page).getByRole("button", { name: "‹ Bass Practice" });

/** The copies of `name` printed as their whole text inside the stage on screen (P23-28 F2: no second header). */
const printedNames = (page: Page, name: string) => page.locator(".bass-stage:not([hidden])").evaluate((root, text) => (
  [...root.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,p")]
    .filter((element) => element.textContent?.trim() === text)
    .map((element) => element.className)
), name);

async function openPicker(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

async function enterPicker(page: Page) {
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
}

const practiceFile = (page: Page) => page.evaluate((key) => {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw) as {
    attempts?: { rating?: string }[];
    sessions?: { abandoned?: boolean; completedCount?: number }[];
  };
}, PRACTICE_FILE);

const counts = async (page: Page) => {
  const file = await practiceFile(page);
  return { sessions: (file?.sessions ?? []).length, abandoned: (file?.sessions ?? []).filter((entry) => entry.abandoned).length, attempts: (file?.attempts ?? []).length };
};

/**
 * 度数 to 段 3 without a microphone: 段 1 の ▶ → 「録らずに弾く」 → 「弾けた・答えを見る」. Nothing is recorded; the
 * answer is out and no rating is chosen yet.
 */
async function degreeToResult(page: Page) {
  const view = page.getByTestId("degree-echo-view");
  await view.locator("[data-testid='degree-listen']").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByRole("button", { name: "録らずに弾く" }).click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByRole("button", { name: /弾けた・答えを見る/ }).click();
  await expect(view).toHaveAttribute("data-stage-step", "2");
  await expect(view).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
  return view;
}

test("C1 (F1-F7): the frame of all five practices", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);

  for (const entry of MODES) {
    await card(page, entry.mode).click();
    await expect(page.getByTestId(entry.view)).toBeVisible();

    // P23-62: the top band is still back · kicker · name (15px) · (the practice's own chips) · 入力 · 楽器 · 「?」.
    await expect(back(page)).toBeVisible();
    const name = modebar(page).locator(".bass-mode-name");
    await expect(name).toHaveText(entry.name);
    expect(await name.evaluate((element) => getComputedStyle(element).fontSize)).toBe("15px");
    await expect(modebar(page).locator(".bass-mode-kicker")).toHaveText(entry.mode === "midi" ? "弾いて確かめる" : "聴いてまねる");
    // P23-62/P23-63/P23-64: the top band hands the sentence to the stage and drops the badge for every practice.
    await expect(modebar(page).locator(".bass-mode-desc")).toHaveText("");
    await expect(modebar(page).locator(".bass-mode-desc")).toHaveAttribute("aria-hidden", "true");
    if (entry.mode !== "midi") await expect(page.getByTestId(entry.view).locator(".bp-say")).toHaveText(STAGE_SAY[entry.mode]);
    await expect(modebar(page).locator(".bass-mode-badge")).toHaveCount(0);
    const settings = modebar(page).locator(".bass-mode-tools").getByRole("button", { name: /4弦・右利き・0〜12$/ });
    await expect(settings).toBeVisible();

    // F5: the keys live in 「?」 — each staged practice carries its own `data-stage-keys` line.
    await modebar(page).locator(".bass-mode-tools").getByRole("button", { name: "キー操作" }).click();
    const keys = page.getByRole("dialog", { name: "キー操作" });
    await expect(keys).toBeVisible();
    const stageKeys = keys.locator("[data-stage-keys]");
    await expect(stageKeys).toHaveText(STAGE_KEYS[entry.mode]);
    if (entry.mode === "degree") await expect(stageKeys).toContainText("T 別のキーで");
    else await expect(stageKeys).not.toContainText("T 別のキーで");
    await expect(keys).not.toContainText(GENERIC_KEYS);
    await page.keyboard.press("Escape");
    await expect(keys).toHaveCount(0);
    // F5: the old box in 度数's right column is gone.
    await expect(page.getByText("キーボード操作", { exact: true })).toHaveCount(0);

    if (entry.mode !== "midi") {
      const stage = page.getByTestId(entry.view);
      await expect(stage.locator(".bp-frame-scroll")).toBeVisible();
      await expect(stage).toHaveAttribute("data-stage-step", "0");

      // P23-62: 1 聴く → 2 弾く → 3 結果 — three steps, the number in a span, one current step.
      const steps = stage.locator(".bp-steps");
      await expect(steps.locator(".bp-step")).toHaveCount(3);
      await expect(steps.locator(".bp-step-line")).toHaveCount(2);
      await expect(steps.locator("[aria-current='step']")).toHaveCount(1);
      expect(await steps.locator(".bp-step").evaluateAll((elements) => elements.map((element) => (element.textContent ?? "").trim()))).toEqual(["1聴く", "2弾く", "3結果"]);
      expect(await steps.locator(".bp-step-no").allInnerTexts()).toEqual(["1", "2", "3"]);
      const currentIndex = await steps.locator(".bp-step").evaluateAll((elements) => elements.findIndex((element) => element.getAttribute("aria-current") === "step"));
      const backgrounds = await steps.locator(".bp-step").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
      expect(currentIndex).toBe(0);
      // The current step's colour comes from the stage CSS (`--bp-accent-soft`), and only the current one carries it.
      expect(backgrounds[currentIndex]).toBe("rgb(42, 37, 80)");
      for (let index = 0; index < backgrounds.length; index += 1) {
        if (index !== currentIndex) expect(backgrounds[index]).not.toBe(backgrounds[currentIndex]);
      }
      expect(backgrounds[1]).toBe(backgrounds[2]);

      // The stage's own pieces: the lane and the keys at the foot (the band no longer prints a second header).
      await expect(stage.locator("[data-testid='bp-lane']")).toHaveCount(1);
      const foot = stage.locator(".bp-foot");
      await expect(foot).toBeVisible();
      await expect(foot).toHaveText(STAGE_FOOT_KEYS);
      await expect(stage.locator(".bass-echo-main .lv-section-kicker")).toHaveCount(0);
      expect(await stage.locator(".bass-echo-main h2").evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))).not.toContain(entry.name);

      // P23-62: no right column and no in-practice 7 days at all.
      await expect(page.locator("[class*='bass-echo-rail']")).toHaveCount(0);
      await expect(page.locator("[data-testid='bass-mode-week']")).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
    } else {
      // MIDI のベースライン: opens on its library view cleanly without any right column.
      await expect(page.getByTestId(entry.view)).toBeVisible();
      await expect(page.locator("[class*='bass-echo-rail']")).toHaveCount(0);
      await expect(page.locator("[data-testid='bass-mode-week']")).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
    }

    await back(page).click();
    await expect(page.locator(HOME)).toBeVisible();
  }
});

test("C2: the top band stays on one line at 1440 and 1280 and never leaves the window at 768", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    for (const entry of MODES) {
      await enterPicker(page);
      await card(page, entry.mode).click();
      await expect(page.getByTestId(entry.view)).toBeVisible();
      await assertNoHorizontalOverflow(page);
      const bar = await page.evaluate(() => {
        const back = document.querySelector<HTMLElement>(".bass-mode-back")!.getBoundingClientRect();
        const question = document.querySelector<HTMLElement>(".bass-mode-tools [aria-label='キー操作']")!.getBoundingClientRect();
        const bar = document.querySelector<HTMLElement>(".bass-modebar")!.getBoundingClientRect();
        return { backTop: Math.round(back.top), questionTop: Math.round(question.top), height: Math.round(bar.height), right: Math.round(bar.right) };
      });
      if (size.width >= 1280) {
        // One line: 「‹ Bass Practice」 and 「?」 share the same top (within 4px).
        expect(Math.abs(bar.backTop - bar.questionTop), `${entry.mode} at ${size.width}`).toBeLessThanOrEqual(4);
        expect(bar.height, `${entry.mode} at ${size.width}`).toBeLessThanOrEqual(48);
      }
      expect(bar.right).toBeLessThanOrEqual(size.width);
      await back(page).click();
      await expect(page.locator(HOME)).toBeVisible();
    }
  }
});

test("C3: the practice's name is printed once — the top band's, not a second header", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);
  for (const entry of MODES.filter((candidate) => candidate.mode !== "midi")) {
    await card(page, entry.mode).click();
    await expect(page.getByTestId(entry.view)).toBeVisible();
    const printed = await printedNames(page, entry.name);
    expect(printed, `${entry.mode}`).toHaveLength(1);
    expect(printed[0]).toContain("bass-mode-name");
    await back(page).click();
    await expect(page.locator(HOME)).toBeVisible();
  }
});

/**
 * C4 (P23-62): the practice's own 7 days box was removed together with the right column, on purpose. The picking
 * screen's card is now the only place the practice's 7 days appears, so this checks the same fact from that side:
 * before any practice no card has a lit day, and one finished practice lights exactly one day and moves 「最後」 to
 * 「今日」.
 */
test("C4: the home card's 7 days and 最後 follow a finished practice", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);
  // No record yet: every card is empty and says so.
  for (const entry of MODES) {
    await expect(card(page, entry.mode).getByTestId("bass-home-card-week").locator("i[data-on='true']")).toHaveCount(0);
    await expect(card(page, entry.mode).locator(".lv-bh-last")).toHaveText("まだ弾いていません");
  }
  await expect(page.getByTestId("bass-home-week-sum")).toHaveText("この 7 日は、まだ弾いていません");

  // One finished 度数 practice, without a microphone.
  await card(page, "degree").click();
  const view = await degreeToResult(page);
  await view.locator("[data-review-rating='good']").click();
  await expect(view.locator("[data-testid='degree-next']")).toBeEnabled();
  await view.locator("[data-testid='degree-next']").click();
  await expect.poll(async () => (await practiceFile(page))?.attempts?.length ?? 0).toBe(1);
  expect((await practiceFile(page))?.attempts?.[0]?.rating).toBe("good");

  await back(page).click();
  await expect(page.locator(HOME)).toBeVisible();
  const week = card(page, "degree").getByTestId("bass-home-card-week");
  await expect(week.locator("i")).toHaveCount(7);
  await expect(week.locator("i[data-on='true']")).toHaveCount(1);
  await expect(card(page, "degree").locator(".lv-bh-last")).toHaveText("最後: 今日");
  const sum = page.getByTestId("bass-home-week-sum");
  await expect(sum).toContainText("この 7 日で");
  await expect(sum.locator("b")).toHaveText("1");
  // The other four practices were not touched: their cards stay empty.
  for (const entry of MODES.filter((candidate) => candidate.mode !== "degree")) {
    await expect(card(page, entry.mode).getByTestId("bass-home-card-week").locator("i[data-on='true']")).toHaveCount(0);
    await expect(card(page, entry.mode).locator(".lv-bh-last")).toHaveText("まだ弾いていません");
  }
});

test("C5 (F8-1): the left menu's Bass Practice comes back to the picking screen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);
  for (const entry of MODES) {
    await card(page, entry.mode).click();
    await expect(page.getByTestId(entry.view)).toBeVisible();
    await expect(page.locator(HOME)).toBeHidden();
    // The same menu item, pressed again: the practices stay mounted behind the picking screen.
    await page.locator('[data-nav="bass-practice"]').click();
    await expect(page.locator(HOME)).toBeVisible();
    await expect(page.getByTestId(entry.view)).toBeHidden();
    await expect(modebar(page).locator(".bass-mode-name")).toHaveText(entry.name);
  }
});

test("C5 (F8-2): opening the picking screen and leaving writes no empty 「途中でやめた」", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("#main-content")).toBeVisible();
  expect(await counts(page)).toEqual({ sessions: 0, abandoned: 0, attempts: 0 });

  // Open the picking screen: a session exists (the practice's own record), but nothing was practised.
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
  await expect.poll(async () => (await practiceFile(page))?.sessions?.length ?? 0).toBe(1);
  expect(await counts(page)).toEqual({ sessions: 1, abandoned: 0, attempts: 0 });

  // Leave without practising.
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-continue").or(page.locator("#main-content")).first()).toBeVisible();
  await expect.poll(async () => (await counts(page)).sessions).toBe(1);
  expect(await counts(page)).toEqual({ sessions: 1, abandoned: 0, attempts: 0 });

  // Opening a practice and leaving it untouched is the same: no 「途中でやめた」.
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
  await card(page, "rhythm").click();
  await expect(page.getByTestId("rhythm-echo-view")).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await expect(page.locator('#main-content')).toBeVisible();
  expect(await counts(page)).toEqual({ sessions: 1, abandoned: 0, attempts: 0 });

  // A practice that really started is still marked as abandoned when left. P23-62: the stage is ready as soon as it
  // is on screen, so listening for the first time — not a 「はじめる」 button — is what starts the practice.
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.locator(HOME)).toBeVisible();
  await card(page, "degree").click();
  const view = page.getByTestId("degree-echo-view");
  await expect(view).toHaveAttribute("data-practice-state", "ready");
  await view.locator("[data-testid='degree-listen']").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await page.locator('[data-nav="home"]').click();
  await expect.poll(async () => (await counts(page)).abandoned).toBe(1);
  expect((await counts(page)).attempts).toBe(0);
});

test("C6: axe is clean and the practice's keys still work", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);
  for (const entry of MODES) {
    await card(page, entry.mode).click();
    await expect(page.getByTestId(entry.view)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const axe = await new AxeBuilder({ page: page as never })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), `${entry.mode}`).toEqual([]);
    await back(page).click();
    await expect(page.locator(HOME)).toBeVisible();
  }

  // The keys the staged 度数 has always answered to: Space is the primary action (聴く), Esc stops it, 1–4 rate.
  await card(page, "degree").click();
  const view = page.getByTestId("degree-echo-view");
  await expect(view).toHaveAttribute("data-practice-state", "ready");
  const play = view.locator("[data-testid='degree-listen']");
  await page.keyboard.press(" ");
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  // Another Space replays; Esc stops the sound (and leaves the stage at 思い出す).
  await page.keyboard.press(" ");
  await expect(play).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(play).toHaveAttribute("aria-label", "お手本を聴く");
  await expect(view).toHaveAttribute("data-practice-state", "recall");
  await back(page).click();
  await page.reload();
  await enterPicker(page);
  await card(page, "degree").click();
  const review = await degreeToResult(page);
  // P23-62: 「1–4」 now only picks the rating; 「N」 commits it and moves on (the old frame committed on the number).
  await page.keyboard.press("3");
  await expect(review.locator("[data-review-rating='good']")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("n");
  await expect.poll(async () => (await practiceFile(page))?.attempts?.length ?? 0).toBe(1);
  await expect(review).toHaveAttribute("data-stage-step", "0", { timeout: 10_000 });
  await expect(review).toHaveAttribute("data-practice-state", "ready");
});

test("the photos: the five practices at 1440x900, Degree and Bassline at three smaller sizes", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPicker(page);
  for (const entry of MODES) {
    await card(page, entry.mode).click();
    await expect(page.getByTestId(entry.view)).toBeVisible();
    await page.evaluate(() => { const main = document.getElementById("main-content"); if (main) main.scrollTop = 0; });
    await page.screenshot({ path: `p89-generated/p23-28/${entry.mode}-1440x900.png`, fullPage: true });
    await back(page).click();
    await expect(page.locator(HOME)).toBeVisible();
  }
  for (const size of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    for (const mode of ["degree", "bassline"] as const) {
      await enterPicker(page);
      await card(page, mode).click();
      await expect(page.getByTestId(MODES.find((entry) => entry.mode === mode)!.view)).toBeVisible();
      await page.evaluate(() => { const main = document.getElementById("main-content"); if (main) main.scrollTop = 0; });
      await page.screenshot({ path: `p89-generated/p23-28/${mode}-${size.width}x${size.height}.png`, fullPage: true });
      await back(page).click();
      await expect(page.locator(HOME)).toBeVisible();
    }
  }
});
