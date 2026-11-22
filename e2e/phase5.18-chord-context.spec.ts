import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression, openApp, openVault, openBassPractice } from "./helpers/app";
import { bassPracticeFromVault } from "./helpers/practice";

/** P23-63: the chord names the stage's lane draws above お手本 (the old inline chord box is the lane's chord row). */
const laneChords = (page: import("@playwright/test").Page) =>
  page.locator("[data-testid='bassline-echo-view'] [aria-label='コードの段']");

test("P5.18 production default is keyboard-operable without 320px overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);
  await assertNoHorizontalOverflow(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await openBassPractice(page, "度数");
  await expect(page.locator(".bass-mode-name")).toHaveText("度数");
  // P23-62: the six-step echo flow is the shared 3-step stage (1 聴く → 2 弾く → 3 結果) with the お手本 lane.
  const degree = page.getByTestId("degree-echo-view");
  expect(await degree.locator(".bp-step").evaluateAll((steps) => steps.map((step) => step.textContent?.trim())))
    .toEqual(["1聴く", "2弾く", "3結果"]);
  await expect(degree).toHaveAttribute("data-stage-step", "0");
  await expect(degree.getByTestId("bp-lane")).toBeVisible();
  const scrollContract = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    const root = document.querySelector<HTMLElement>("#root");
    if (!main || !root) {
      throw new Error("App scroll owners are unavailable");
    }

    main.scrollTop = 120;
    return {
      outerOverflowY: [
        getComputedStyle(document.documentElement).overflowY,
        getComputedStyle(document.body).overflowY,
        getComputedStyle(root).overflowY,
      ],
      rootHeight: root.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      mainOverflowY: getComputedStyle(main).overflowY,
      mainCanScroll: main.scrollHeight > main.clientHeight,
      mainScrollTop: main.scrollTop,
    };
  });
  // P23-31b O2 (form B): the page is clipped, not hidden, so nothing can scroll it.
  expect(scrollContract.outerOverflowY).toEqual(["clip", "clip", "clip"]);
  expect(scrollContract.rootHeight).toBe(scrollContract.viewportHeight);
  expect(scrollContract.mainOverflowY).toBe("auto");
  expect(scrollContract.mainCanScroll).toBe(true);
  expect(scrollContract.mainScrollTop).toBeGreaterThan(0);

  await openBassPractice(page, "リズム");
  const rhythm = page.getByTestId("rhythm-echo-view");
  // P23-62: リズム runs on the same stage. The band keeps the practice's name (the badge and the sentence are
  // gone), the tempo it plays at is the stage's meta line, and ▶ お手本を聴く is the stage's own listen button.
  await expect(page.locator(".bass-mode-name")).toHaveText("リズム");
  await expect(page.locator(".bass-mode-badge")).toHaveCount(0);
  expect(await rhythm.locator(".bp-step").evaluateAll((steps) => steps.map((step) => step.textContent?.trim())))
    .toEqual(["1聴く", "2弾く", "3結果"]);
  await expect(rhythm.locator(".bp-meta")).toContainText(/\d+ BPM/);
  await expect(rhythm.getByTestId("rhythm-listen")).toBeVisible();
  await openBassPractice(page, "コード進行のベース");

  // P23-63: コード進行のベース is the shared stage; every setting lives in the top band's 条件 panel.
  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await expect(page.locator(".bass-mode-badge")).toHaveCount(0);
  expect(await bassline.locator(".bp-step").evaluateAll((steps) => steps.map((step) => step.textContent?.trim())))
    .toEqual(["1聴く", "2弾く", "3結果"]);
  await expect(bassline.locator(".bp-meta")).toContainText(/\d+ BPM/);
  const conditions = page.getByTestId("bassline-conditions");
  await expect(conditions).toContainText("レベル 1");
  await conditions.click();
  const panel = page.getByRole("dialog", { name: "コード進行のベースの条件" });
  await expect(panel).toBeVisible();
  const listenMode = panel.getByTestId("chord-context-listen-mode");
  await expect(listenMode).toHaveValue("bass-and-chords");
  await expect(listenMode).toContainText("ベースのみ");
  const timbre = panel.getByTestId("chord-context-timbre");
  await expect(timbre).toHaveValue("electric");
  await timbre.selectOption("piano");
  await expect(timbre).toHaveValue("piano");
  await assertNoHorizontalOverflow(page);

  const bpm = panel.getByTestId("chord-context-effective-bpm");
  await bpm.fill("100");
  await panel.getByTestId("chord-context-bpm-plus-four").click();
  await expect(bpm).toHaveValue("104");

  // 弾く時に鳴らす is the take's accompaniment (the old 演奏 radio and its layer list are gone).
  const takeAccompaniment = panel.getByTestId("chord-context-play-mode");
  await expect(takeAccompaniment).toHaveValue("chords-only");
  await expect(takeAccompaniment).toContainText("コード + メトロノーム");
  await conditions.click();
  await expect(panel).toBeHidden();

  const listen = bassline.getByTestId("bassline-listen");
  await listen.focus();
  await page.keyboard.press("Enter");
  await expect(listen).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(listen).toHaveAttribute("aria-label", "お手本を聴く");
  await assertNoHorizontalOverflow(page);
});

test("P5.18 remains operable with reduced motion and an effective 200% scale", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 720 });
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await openBassPractice(page, "Bassline Echo");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });

  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("2");
  await assertNoHorizontalOverflow(page);

  const durations = await bassline.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  const parseDuration = (value: string) => Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1_000;
  }));
  expect(durations.every(({ animation, transition }) =>
    parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);

  // The whole flow is still operable at this scale: the 条件 panel and ▶ お手本.
  await page.getByTestId("bassline-conditions").click();
  const panel = page.getByRole("dialog", { name: "コード進行のベースの条件" });
  await expect(panel).toBeVisible();
  await panel.getByTestId("chord-context-bpm-plus-four").click();
  await expect(panel.getByTestId("chord-context-effective-bpm")).toHaveValue("124");
  await page.getByTestId("bassline-conditions").click();
  await expect(panel).toBeHidden();

  const listen = bassline.getByTestId("bassline-listen");
  await listen.click();
  await expect(listen).toHaveAttribute("aria-label", "止める", { timeout: 10_000 });
  await listen.click();
  await expect(listen).toHaveAttribute("aria-label", "お手本を聴く");
  await assertNoHorizontalOverflow(page);
});

test("P5.18.1 selects a preset and key before confirming a Vault source from Bassline Echo", async ({ page }) => {
  test.setTimeout(45_000);
  await openApp(page);
  await createSavedProgression(page, "P5.18.1 Bassline source picker");
  await openVault(page);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await bassPracticeFromVault(page, "P5.18.1 Bassline source picker");

  const bassline = page.getByTestId("bassline-echo-view");
  const selector = page.getByTestId("bassline-progression-select");
  await expect(bassline).toBeVisible();
  await expect(selector).toHaveValue("vault");
  await expect(page.getByTestId("bassline-conditions")).toContainText("Vault進行");

  await selector.selectOption("generated");
  await expect(selector).toHaveValue("generated");
  await expect(laneChords(page)).toContainText("Dm7");

  expect(await selector.locator("option").count()).toBeGreaterThanOrEqual(10);
  await selector.selectOption("pop-four-chords");
  await expect(selector).toHaveValue("pop-four-chords");
  await expect(page.getByTestId("bassline-conditions")).toContainText("Pop Four Chords");
  await expect(page.getByTestId("chord-context-tempo")).toContainText("元のテンポ: 92 BPM");
  await expect(laneChords(page)).toContainText("Am");

  const keySelector = page.getByTestId("bassline-preset-key-select");
  await expect(keySelector).toHaveValue("C major");
  await keySelector.selectOption("D major");
  await expect(keySelector).toHaveValue("D major");
  await expect(page.getByTestId("bassline-conditions")).toContainText("D");
  await expect(laneChords(page)).toContainText("Bm");

  await page.getByTestId("vault-progression-picker-open").click();
  await expect(page.getByTestId("vault-progression-picker")).toBeVisible();
  await page.getByTestId("vault-progression-picker-candidate").first().click();
  await page.getByTestId("vault-progression-picker-confirm").click();
  await expect(selector).toHaveValue("vault");
  await expect(page.getByTestId("bassline-conditions")).toContainText("Vault進行");
  await expect(bassline).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
test("P5.18.2 keeps the live Vault title discoverable and keyboard-operable at narrow and scaled layouts", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);
  await createSavedProgression(page, "P5.18.2 Responsive Vault Title");
  await openVault(page);
  await page.locator(".lv-vault-row").first().locator("button").last().click();
  await bassPracticeFromVault(page, "P5.18.2 Responsive Vault Title");

  const bassline = page.getByTestId("bassline-echo-view");
  await expect(bassline).toBeVisible();
  await page.getByTestId("vault-progression-picker-open").click();
  const picker = page.getByTestId("vault-progression-picker");
  const candidate = picker.getByTestId("vault-progression-picker-candidate").first();
  await expect(picker.getByTestId("vault-progression-picker-candidate-title").first()).toHaveText("P5.18.2 Responsive Vault Title");
  await expect(candidate).toHaveAccessibleName(/P5\.18\.2 Responsive Vault Title.*C major.*BPM/);
  await assertNoHorizontalOverflow(page);

  const search = picker.getByTestId("vault-progression-picker-search");
  await search.fill("responsive vault");
  expect(await picker.getByTestId("vault-progression-picker-candidate").count()).toBeGreaterThan(0);
  await search.focus();
  await page.keyboard.press("ArrowDown");
  const selectedCandidate = picker.locator("[data-testid='vault-progression-picker-candidate'][aria-pressed='true']");
  await expect(selectedCandidate).toBeFocused();

  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(picker).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
