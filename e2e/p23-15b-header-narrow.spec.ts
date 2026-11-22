import { expect, test, type Page } from "@playwright/test";

/**
 * P23-15b: the progression page's top row must not stick out at any width, and every button in it stays inside
 * the page column and pressable. Below 560px the MIDI control keeps its name but drops its words, and the
 * buttons move to a second line.
 */
async function openSavedLong(page: Page) {
  await page.goto("/?p104=long");
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
}

async function metrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("#main-content") as HTMLElement;
    const mainBox = main.getBoundingClientRect();
    const row = document.querySelector(".lv-progression-row") as HTMLElement;
    const title = row.querySelector(".lv-progression-title") as HTMLElement;
    const buttons = Array.from(row.querySelectorAll<HTMLElement>("button"));
    return {
      mainAcross: main.scrollWidth - main.clientWidth,
      mainRight: Math.round(mainBox.right),
      titleWidth: Math.round(title.getBoundingClientRect().width),
      titleTop: Math.round(title.getBoundingClientRect().top),
      backTop: Math.round((row.querySelector(".lv-progression-back") as HTMLElement).getBoundingClientRect().top),
      overRight: buttons
        .filter((button) => button.getBoundingClientRect().right > mainBox.right + 1)
        .map((button) => ({
          name: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
          right: Math.round(button.getBoundingClientRect().right),
        })),
      buttons: buttons.map((button) => ({
        name: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
        right: Math.round(button.getBoundingClientRect().right),
        width: Math.round(button.getBoundingClientRect().width),
        visible: button.getBoundingClientRect().width > 0 && getComputedStyle(button).visibility !== "hidden",
      })),
    };
  });
}

test("P23-15b: the top row fits every width from 1440 down to 320", async ({ page }) => {
  test.setTimeout(90_000);
  await openSavedLong(page);
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 640], [480, 720], [360, 700], [320, 700]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const data = await metrics(page);
    expect(data.mainAcross, `${width}px: no sideways overflow`).toBeLessThanOrEqual(1);
    expect(data.overRight, `${width}px: every button inside the page column`).toEqual([]);
    expect(data.titleWidth, `${width}px: the title keeps 80px`).toBeGreaterThanOrEqual(80);
    expect(data.buttons.every((button) => button.visible), `${width}px: every button is there`).toBe(true);
    // The MIDI control keeps its name at every width.
    await expect(page.getByRole("button", { name: "MIDI を DAW へ" })).toHaveCount(1);
    if (width <= 559) {
      // The song's progressions shrink (two separations in this fixture): inside the page column, still pressable.
      const selector = await page.evaluate(() => {
        const main = document.querySelector("#main-content") as HTMLElement;
        const mainRight = main.getBoundingClientRect().right;
        const label = document.querySelector(".lv-progression-selector") as HTMLElement;
        const select = label.querySelector("select") as HTMLSelectElement;
        return {
          overflow: Math.round(label.getBoundingClientRect().right - mainRight),
          selectWidth: Math.round(select.getBoundingClientRect().width),
          options: select.options.length,
          words: (label.textContent ?? "").trim().slice(0, 12),
        };
      });
      expect(selector.overflow, `${width}px: the progression selector inside`).toBeLessThanOrEqual(0);
      expect(selector.selectWidth, `${width}px: the select keeps 120px`).toBeGreaterThanOrEqual(120);
      expect(selector.options, `${width}px: a song with two progressions`).toBeGreaterThan(1);
      expect(selector.words, `${width}px: the label's words are whole`).toContain("この曲の進行");
    }
    if (width >= 1024) {
      expect(Math.abs(data.titleTop - data.backTop), `${width}px: one line`).toBeLessThanOrEqual(4);
    }
  }
});

test("P23-15b: below 560px the MIDI words are hidden but the name stays, and the buttons take a second line", async ({ page }) => {
  await openSavedLong(page);
  await page.setViewportSize({ width: 480, height: 720 });
  await page.waitForTimeout(250);
  const midi = page.getByRole("button", { name: "MIDI を DAW へ" });
  await expect(midi).toHaveCount(1);
  await expect(midi).toBeVisible();
  await expect(midi).toBeEnabled();
  const label = page.locator(".lv-midi-export-label").first();
  await expect(label).toBeHidden();
  const data = await metrics(page);
  // The buttons sit below the title's line.
  const secondLine = await page.evaluate(() => {
    const row = document.querySelector(".lv-progression-row") as HTMLElement;
    const title = row.querySelector(".lv-progression-title") as HTMLElement;
    const favourite = row.querySelector<HTMLElement>(".lv-progression-icon") as HTMLElement;
    return Math.round(favourite.getBoundingClientRect().top - title.getBoundingClientRect().top);
  });
  expect(secondLine, "the buttons are on the second line").toBeGreaterThan(4);
  expect(data.mainAcross).toBeLessThanOrEqual(1);
});

test("P23-15b: at 1024px and wider nothing moves", async ({ page }) => {
  await openSavedLong(page);
  for (const [width, height] of [[1440, 900], [1024, 768]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const label = page.locator(".lv-midi-export-label").first();
    await expect(label).toBeVisible();
    expect((await label.textContent())?.trim()).toBe("MIDI を DAW へ");
  }
});
