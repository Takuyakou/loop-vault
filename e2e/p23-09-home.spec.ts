import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

/**
 * P23-09: the Home rebuilt to the adopted mock. Two columns whose bottoms line up at 1440×900 with no vertical scroll,
 * one column on a narrow window, keyboard reach, axe, and the hover motion of 取り込む.
 */
async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
}

/** The save toasts sit over the Home's lower rows; close them before measuring. */
async function clearToasts(page: Page) {
  for (let index = 0; index < 12; index += 1) {
    const closes = page.locator(".lv-toast-close");
    if (await closes.count() === 0) return;
    await closes.first().click();
  }
}

async function saveText(page: Page, name: string, text: string, key: string) {
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await expect(capture).toBeVisible();
  await capture.getByTestId("text-progression-input").fill(text);
  await capture.getByTestId("text-progression-key").selectOption(key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

const EIGHT: [string, string, string][] = [
  ["夜のループ", "| Bm9 | Bb9 | Gmaj9/A | Em9/B | Dadd9/F# | Gmaj7 | A7sus4 | Bm9 |", "D major"],
  ["王道の 4 小節", "| Fmaj7 | G7 | Em7 | Am7 |", "C major"],
  ["ボサの入り", "| Dmaj9 | B7 | Em9 | A13 |", "D major"],
  ["ジャズの 2-5-1", "| Fm7 | Bb7 | Ebmaj7 | Ebmaj7 |", "Eb major"],
  ["マイナーの循環", "| Am7 | Dm7 | E7 | Am7 |", "A minor"],
  ["明るい循環", "| Cmaj7 | Am7 | Dm7 | G7 |", "C major"],
  ["長いスケッチ", "| C#m7b5 | Dmaj7 | Eadd9 | Bbmaj7 | Cm7 | F7 | Abmaj7 | G7 | C#m7b5 | Dmaj7 | Eadd9 | Bbmaj7 | Cm7 | F7 | Abmaj7 | G7 |", "C major"],
  ["ゆっくり下がる", "| Cmaj7 | Bm7b5 | Bbmaj7 | Am7 |", "C major"],
];

async function homeWithEight(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  for (const [name, text, key] of EIGHT) await saveText(page, name, text, key);
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-today-loop")).toBeVisible();
  await clearToasts(page);
  await page.mouse.move(2, 2);
  await settle(page);
}

const bottom = (page: Page, label: string) => page.locator(`section[aria-label='${label}']`).evaluate((element) => element.getBoundingClientRect().bottom);
const noVerticalScroll = (page: Page) => page.evaluate(() => {
  const main = document.getElementById("main-content")!;
  return main.scrollHeight <= main.clientHeight && document.documentElement.scrollHeight <= document.documentElement.clientHeight;
});

test("C2/G2: at 1440×900 with 8 progressions nothing scrolls and the two column bottoms line up (both drawer tabs)", async ({ page }) => {
  test.setTimeout(180_000);
  await homeWithEight(page);
  await expect(page.getByTestId("home-recent-row")).toHaveCount(4);
  expect(await noVerticalScroll(page)).toBe(true);
  expect(Math.abs(await bottom(page, "最近入れた進行") - await bottom(page, "自分の引き出し"))).toBeLessThanOrEqual(1);
  // G1: the right column is 380px wide and sits to the right of the left one.
  const right = await page.locator(".lv-home-col[data-col='right']").boundingBox();
  const left = await page.locator(".lv-home-col[data-col='left']").boundingBox();
  expect(right!.width).toBeCloseTo(380, 0);
  expect(right!.x).toBeGreaterThan(left!.x + left!.width);
  await page.getByRole("radio", { name: "キーで聴く" }).click();
  await settle(page);
  expect(await noVerticalScroll(page)).toBe(true);
  expect(Math.abs(await bottom(page, "最近入れた進行") - await bottom(page, "自分の引き出し"))).toBeLessThanOrEqual(1);
});

test("G3/C8: one column on a narrow window in the decided order; no sideways overflow at the four sizes; axe clean with nothing excluded", async ({ page }) => {
  test.setTimeout(180_000);
  await homeWithEight(page);
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await expect(page.getByTestId("home-today-loop")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking, `${width}x${height}: ${JSON.stringify(blocking.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" > ")) })), null, 2)}`).toEqual([]);
  }
  // At 768×640 the six blocks stack in one column, top to bottom.
  const order = ["今日のループ", "続きから", "取り込む", "練習", "最近入れた進行", "自分の引き出し"];
  const boxes = await Promise.all(order.map((label) => page.locator(`section[aria-label='${label}']`).boundingBox()));
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index]!.y, order[index]).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height - 1);
    expect(Math.abs(boxes[index]!.x - boxes[0]!.x), order[index]).toBeLessThanOrEqual(1);
  }
});

test("N3: the recent rows' 練習 is not dimmed before hover", async ({ page }) => {
  test.setTimeout(180_000);
  await homeWithEight(page);
  const opacities = await page.locator(".lv-home-recent-actions").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity));
  expect(opacities).toEqual(["1", "1", "1", "1"]);
});

test("C7/N2: a recent chord and a 今日のループ chord play and the Home stays", async ({ page }) => {
  test.setTimeout(180_000);
  await homeWithEight(page);
  const chip = page.getByTestId("home-recent-row").first().locator(".lv-home-recent-chip").first();
  await chip.click();
  await expect(chip).toHaveAttribute("data-playing", "true");
  await expect(page.locator('[data-nav="home"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-progression-detail-view]")).toHaveCount(0);
  await page.getByTestId("home-today-loop").locator("[data-home-loop-chord='0']").click();
  await expect(page.locator('[data-nav="home"]')).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("home-today-loop")).toBeVisible();
});

test("C9: Tab reaches every control of the Home; the drawer tabs switch with ← →", async ({ page }) => {
  test.setTimeout(180_000);
  await homeWithEight(page);
  const total = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>("#main-content button, #main-content [tabindex], #main-content a[href], #main-content input, #main-content select")]
      .filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled && element.getClientRects().length > 0);
    controls.forEach((element, index) => element.setAttribute("data-p2309-tab", String(index)));
    return controls.length;
  });
  expect(total).toBeGreaterThan(30);
  await page.locator("#main-content").focus();
  const reached = new Set<string>();
  for (let step = 0; step < total + 40; step += 1) {
    await page.keyboard.press("Tab");
    const mark = await page.evaluate(() => document.activeElement?.getAttribute("data-p2309-tab") ?? null);
    if (mark !== null) reached.add(mark);
    if (reached.size === total) break;
  }
  expect(reached.size).toBe(total);

  const opened = page.getByRole("radio", { name: "よく開く" });
  await opened.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "キーで聴く" })).toBeFocused();
  await expect(page.getByTestId("home-drawer-keys")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(opened).toBeFocused();
  await expect(page.getByTestId("home-drawer-opened")).toBeVisible();
});

test("I1/I2: hover moves the MIDI arrow, the text box's arrow and boxes; with reduced motion nothing moves", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveText(page, "取り込むの確認", "| Dm7 | G7 | Cmaj7 |", "C major");
  await page.locator('[data-nav="home"]').click();
  await clearToasts(page);
  await settle(page);
  const midiArrow = page.locator(".lv-home-drop > svg");
  const text = page.locator(".lv-home-row-button");
  const transform = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).transform);
  expect(await transform(".lv-home-drop > svg")).toBe("none");
  await page.locator(".lv-home-drop").hover();
  await expect.poll(() => transform(".lv-home-drop > svg")).toBe("matrix(1, 0, 0, 1, 0, 3)");
  await text.hover();
  await expect.poll(() => transform(".lv-home-text-arrow")).toBe("matrix(1, 0, 0, 1, 2, 0)");
  // The boxes light from the left: the later ones wait longer.
  const delays = await page.locator(".lv-home-text-chips > span").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transitionDelay));
  expect(delays.map((delay) => delay.split(",")[0]!.trim())).toEqual(["0s", "0.07s", "0.14s"]);
  await expect.poll(() => page.locator(".lv-home-text-chips > span").last().evaluate((element) => getComputedStyle(element).color)).toBe("rgb(242, 246, 252)");

  await page.mouse.move(2, 2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".lv-home-drop").hover();
  await page.waitForTimeout(250);
  expect(await transform(".lv-home-drop > svg")).toBe("none");
  await text.hover();
  await page.waitForTimeout(250);
  expect(await transform(".lv-home-text-arrow")).toBe("none");
  expect(await transform(".lv-home-text-chips > span")).toBe("none");
  // The app's reduced-motion base already shortens every transition to a hair (1e-05s); the Home adds none of its own.
  expect(Number.parseFloat(await midiArrow.evaluate((element) => getComputedStyle(element).transitionDuration))).toBeLessThan(0.001);
});

test("C4 (in the app): opening practices from the Home fills よく開く in that order with the counts", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await saveText(page, "二度開く", "| Dm7 | G7 | Cmaj7 |", "C major");
  await saveText(page, "一度開く", "| Am7 | Dm7 | E7 |", "A minor");
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-drawer-opened")).toContainText("今週はまだ開いていません");
  const practise = async (name: string) => {
    await page.getByTestId("home-recent-row").filter({ hasText: name }).getByRole("button", { name: "練習", exact: true }).click();
    await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
    await page.locator('[data-nav="home"]').click();
    await expect(page.getByTestId("home-today-loop")).toBeVisible();
  };
  await practise("二度開く");
  await practise("一度開く");
  await practise("二度開く");
  const rows = page.getByTestId("home-top-opened-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("二度開く");
  await expect(rows.nth(0)).toContainText("2 回");
  await expect(rows.nth(1)).toContainText("一度開く");
  await expect(rows.nth(1)).toContainText("1 回");
  await rows.nth(1).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
});

test("X1/P23-61 §7: at 1024×768 (narrow menu) a practised row is read as its label alone", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await saveText(page, "X1 の進行", "| Dm7 | G7 | Cmaj7 |", "C major");
  await page.locator('[data-nav="home"]').click();
  await page.getByTestId("home-recent-row").first().getByRole("button", { name: "練習", exact: true }).click();
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
  // P23-61 §7: the 今日弾きました dot is gone, so the row is named by its label only.
  await expect(page.getByRole("button", { name: "Voicing Loop", exact: true })).toBeVisible();
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);
  await expect(page.locator('[data-nav="chord-dojo"]')).toHaveAttribute("aria-label", "Chord Dojo");
});
