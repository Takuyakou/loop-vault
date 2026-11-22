import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openApp, openTextCapture, openBassPractice } from "./helpers/app";

/**
 * P23-06b: Rhythm Echo and Bassline Echo play at the app-wide BPM in the header; a song's own BPM is only
 * announced (「曲 n」), never taken.
 */
const globalValue = (page: Page) => page.getByTestId("global-bpm-value");
const shown = async (page: Page) => Number(await globalValue(page).getAttribute("aria-valuenow"));
const main = (page: Page) => page.locator("#main-content");

async function setGlobalBpm(page: Page, bpm: number) {
  await globalValue(page).dblclick();
  const input = page.getByTestId("global-bpm-input");
  await input.fill(String(bpm));
  await input.press("Enter");
  await expect.poll(() => shown(page)).toBe(bpm);
}

async function openBassTab(page: Page, tab: "リズム" | "コード進行のベース") {
  // P23-62: the nav press brings the picker back asynchronously; wait for it before choosing the card. (Looking
  // for the card first can catch the old practice, and the helper's back button disappears once the picker is up.)
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await openBassPractice(page, tab);
}

async function saveProgression(page: Page) {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 | Dm7 | G7 |");
  await capture.getByTestId("text-progression-name").fill("P23-06b Fixture");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

test("E1 the app-wide BPM reaches Rhythm Echo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await setGlobalBpm(page, 132);
  await openBassTab(page, "リズム");
  const rhythm = page.getByTestId("rhythm-echo-view");
  // P23-62: the page has no tempo field any more — the stage's meta line shows the BPM the rhythm runs at,
  // and the practice's own settings (「条件」) say the tempo is the app-wide one.
  await expect(main(page)).toContainText("132 BPM");
  await expect(rhythm.locator(".bp-meta")).toHaveText("4/4 · 132 BPM · 1 小節");
  await page.getByTestId("rhythm-conditions").click();
  await expect(page.locator(".bp-tools-panel")).toContainText("いま 132 BPM");
});

test("E2 a change in the app-wide BPM waits for the next Rhythm Echo problem", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await setGlobalBpm(page, 132);
  await openBassTab(page, "リズム");
  const rhythm = page.getByTestId("rhythm-echo-view");
  await expect(rhythm.locator(".bp-meta")).toContainText("132 BPM");

  await rhythm.getByTestId("rhythm-listen").click();
  await expect(rhythm).toHaveAttribute("data-practice-state", "heard", { timeout: 20_000 });

  // A problem already under way keeps its own speed; the header's new BPM is announced for the next one.
  await setGlobalBpm(page, 140);
  await expect(rhythm.locator(".bp-meta")).toContainText("132 BPM");
  await page.getByTestId("rhythm-conditions").click();
  await expect(page.locator(".bp-tools-panel")).toContainText("いま 132 BPM（次のリズムから 140 BPM）");
  await page.getByTestId("rhythm-conditions").click();

  // 次のリズム is the moment the app-wide BPM is taken up.
  await rhythm.getByRole("button", { name: "録らずに弾く" }).click();
  await rhythm.getByRole("button", { name: /弾けた・答えを見る/ }).click();
  await rhythm.locator("[data-review-rating='good']").click();
  await rhythm.getByTestId("rhythm-next").click();
  await expect(rhythm).toHaveAttribute("data-stage-step", "0", { timeout: 20_000 });
  await expect(rhythm.locator(".bp-meta")).toContainText("140 BPM");
  await expect.poll(() => shown(page)).toBe(140);
});

test("E3 Bassline Echo follows the same BPM, and +4 moves the header too", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await setGlobalBpm(page, 132);
  await openBassTab(page, "コード進行のベース");
  await page.getByTestId("bassline-conditions").click();
  const field = page.getByTestId("chord-context-effective-bpm");
  await expect(field).toHaveValue("132");
  await page.getByTestId("chord-context-bpm-plus-four").click();
  await expect(field).toHaveValue("136");
  await expect.poll(() => shown(page)).toBe(136);
});

test("E4 choosing a preset announces its BPM and keeps the app-wide one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await setGlobalBpm(page, 132);
  await openBassTab(page, "コード進行のベース");
  await page.getByTestId("bassline-conditions").click();
  await page.getByTestId("bassline-progression-select").selectOption("pop-four-chords");
  const field = page.getByTestId("chord-context-effective-bpm");
  await expect(field).toHaveValue("132");
  const song = page.getByTestId("global-bpm-song");
  await expect(song).toHaveText("曲 92");
  await song.click();
  await expect(song).toHaveCount(0);
  await expect.poll(() => shown(page)).toBe(92);
  await page.getByTestId("bassline-conditions").click();
  await expect(field).toHaveValue("92");
});

test("E5 Voicing Loop plays at the BPM the header was set to by Bassline Echo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveProgression(page);
  await setGlobalBpm(page, 92);
  await page.locator('[data-nav="voicing-loop"]').click();
  // P23-32 K4: the saved progression opens in the Voicing Loop, which plays at the header's app-wide BPM.
  await expect(page.locator("#voicing-loop-bpm")).toHaveCount(0);
  await expect.poll(() => shown(page)).toBe(92);
});

test("E6 both bass echoes have no serious accessibility violations", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  for (const tab of ["リズム", "コード進行のベース"] as const) {
    await openBassTab(page, tab);
    // Scan only once the practice is on screen and the stage's colour transitions have finished.
    await expect(page.getByTestId(tab === "リズム" ? "rhythm-echo-view" : "bassline-echo-view")).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all((document.getElementById("main-content")?.getAnimations({ subtree: true }) ?? [])
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const result = await new AxeBuilder({ page: page as never })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = result.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious");
    const summary = blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 12).map((node) => node.target.join(" > ")),
      count: violation.nodes.length,
    }));
    expect(blocking, `${tab}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
  }
});
