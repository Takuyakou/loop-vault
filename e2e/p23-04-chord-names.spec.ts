import { expect, test, type Page } from "@playwright/test";
import { openTextCapture, chooseTextSetting } from "./helpers/app";
import { openDojo } from "./helpers/p12";
import { practiceFromVault } from "./helpers/practice";

/** P23-04: chord names with ♯ ♭, degrees in one form (Ⅱm7), and the large name with its kind at 0.8×. */

/** The first call opens the app; later calls stay on the same page (the browser Vault lives in memory). */
async function saveText(page: Page, text: string, key: string, name: string) {
  const capture = page.getByTestId("text-progression-capture");
  if (!(await capture.isVisible())) await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill(text);
  await chooseTextSetting(capture, "text-progression-key", key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText("保存しました")).toBeVisible();
}

const settle = (page: Page) => page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
  .map((animation) => animation.finished.catch(() => undefined))));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("the Vault shows chord names with ♯ ♭ and degrees as Ⅱm7", async ({ page }) => {
  await saveText(page, "| F#m7 | Bm7 | E7 | Amaj7 |", "A major", "P23-04 A");
  await saveText(page, "| Ebmaj7 | Cm7 | Fm7 | Bb7 |", "Eb major", "P23-04 Eb");
  // 「コードカードに度数を表示」 on (P23-26 S4: the setting is the shared switch now)
  await page.locator('[data-nav="settings"]').click();
  const degrees = page.getByRole("switch", { name: /コードカードに度数を表示/ });
  if (!(await degrees.isChecked())) await degrees.check();
  await page.locator('[data-nav="vault"]').click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(2);
  await settle(page);

  const labels = await page.locator(".lv-vault-chip-label").allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label, label).not.toContain("#");
    expect(label, label).not.toMatch(/[A-G]b/);
  }
  expect(labels.some((label) => /[♯♭]/.test(label))).toBe(true);

  const shownDegrees = await page.locator(".lv-vault-chip-degree").allTextContents();
  expect(shownDegrees.length).toBeGreaterThan(0);
  for (const degree of shownDegrees) expect(degree, degree).toMatch(/^[♭♯]?[Ⅰ-Ⅶ]/);
});

test("Voicing Loop draws the current chord's kind at 0.8× of the root", async ({ page }) => {
  await saveText(page, "| F#m7 | Bm7 | E7 | Amaj7 |", "A major", "P23-04 A");
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-progression").first().click();
  await practiceFromVault(page, "Voicing Loop");
  const panel = page.getByTestId("voicing-loop-current-panel");
  await expect(panel.locator(".lv-chordname")).toBeVisible();
  const sizes = await panel.locator(".lv-chordname").evaluate((name) => ({
    root: parseFloat(getComputedStyle(name.querySelector(".lv-chordname-root")!).fontSize),
    kind: parseFloat(getComputedStyle(name.querySelector(".lv-chordname-kind")!).fontSize),
    text: name.textContent,
  }));
  expect(sizes.text).toBe("F♯m7");
  expect(Math.abs(sizes.kind - sizes.root * 0.8)).toBeLessThanOrEqual(0.5);
});

test("Chord Dojo practice cards show degrees with the Roman numeral glyphs", async ({ page }) => {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "王道進行", exact: true }) })
    .getByRole("button", { name: / を練習する$/ }).click();
  await expect(page.locator(".dojo-chord-cards > button")).toHaveCount(4);
  const shown = await page.locator(".dojo-endless-degree").allTextContents();
  expect(shown.length).toBeGreaterThan(0);
  for (const degree of shown) expect(degree, degree).not.toMatch(/[IViv]/);
});

/** P23-04-fix-1: the degree list in the top row and the sans Roman numerals. */
async function openOudou(page: Page) {
  await openDojo(page, "no-midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name: "王道進行", exact: true }) })
    .getByRole("button", { name: / を練習する$/ }).click();
  await expect(page.locator(".dojo-chord-cards > button")).toHaveCount(4);
}

test("the practice top row shows its degree list as Ⅱm7", async ({ page }) => {
  await openOudou(page);
  const list = page.locator(".dojo-endless-name i");
  await expect(list).toBeVisible();
  const text = await list.innerText();
  expect(text).toMatch(/[Ⅰ-Ⅶ]/);
  expect(text, text).not.toMatch(/[IViv]/);
});

test("the card degrees use LV Symbols, whose Ⅳ is built from Inter's I and V", async ({ page }) => {
  await openOudou(page);
  const degree = page.locator(".dojo-endless-degree").filter({ hasText: "Ⅳ" }).first();
  await expect(degree).toBeVisible();
  const result = await degree.evaluate(async (element) => {
    const style = getComputedStyle(element);
    await document.fonts.load(`${style.fontWeight} ${style.fontSize} "LV Symbols"`, "Ⅳ");
    await document.fonts.load(`${style.fontWeight} ${style.fontSize} Inter`, "IV");
    const measure = (text: string, family: string) => {
      const span = document.createElement("span");
      span.textContent = text;
      span.style.cssText = `position:absolute;white-space:nowrap;font-size:${style.fontSize};font-weight:${style.fontWeight};font-family:${family}`;
      element.appendChild(span);
      const width = span.getBoundingClientRect().width;
      span.remove();
      return width;
    };
    return {
      loaded: document.fonts.check('700 12px "LV Symbols"', "Ⅳ"),
      numeral: measure("Ⅳ", style.fontFamily),
      inter: measure("IV", "Inter"),
    };
  });
  expect(result.loaded).toBe(true);
  expect(Math.abs(result.numeral - result.inter), JSON.stringify(result)).toBeLessThanOrEqual(1.5);
});
