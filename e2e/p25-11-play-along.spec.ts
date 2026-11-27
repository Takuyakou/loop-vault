import { expect, test, type Page } from "@playwright/test";

/** P25-11 I7: Voicing Loop's 弾き合わせ with the synthetic MIDI input (`?p12=midi`). */
async function openLoop(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto("/?p527Status=p533-rules&p12=midi");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await page.evaluate(async () => { await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
}
const press = (page: Page, notes: readonly number[], on = true) =>
  page.evaluate(([values, down]) => (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean) => void } }).__p12Midi.emit([...values as number[]], down as boolean), [notes, on] as const);

test("I7: off by default; on shows the judgement, the legend's two marks and the count", async ({ page }) => {
  await openLoop(page);
  const toggle = page.getByRole("switch", { name: "弾き合わせ", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("voicing-loop-keyboard-legend")).toContainText("押鍵中");
  await toggle.click();
  await expect(page.getByRole("group", { name: "判定", exact: true }).getByRole("button", { name: "コード一致" })).toHaveAttribute("aria-pressed", "true");
  const legend = page.getByTestId("voicing-loop-keyboard-legend");
  // P25 V10: 「押鍵中」 keeps its place (so the legend after it stays) and is hidden while on.
  await expect(legend.getByText("押鍵中", { exact: true })).toBeHidden();
  await expect(legend).toContainText("合っている音");
  await expect(legend).toContainText("違う音");
  await expect(page.getByTestId("voicing-loop-play-along-count")).toContainText("0/");
  // Remembered on the next visit.
  await page.reload();
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByRole("switch", { name: "弾き合わせ", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("I7: a played chord paints its keys and marks the card ✓; a wrong key is red", async ({ page }) => {
  await openLoop(page);
  await page.getByRole("switch", { name: "弾き合わせ", exact: true }).click();
  await page.getByLabel("カウントイン").selectOption("0");
  await page.getByRole("button", { name: "開始", exact: true }).click();
  // The guide of the card being played is what the keyboard shows.
  const guide = await page.locator("[data-guide-hand='left'], [data-guide-hand='right']").evaluateAll((keys) =>
    keys.map((key) => Number((key as HTMLElement).dataset.midiNote)));
  expect(guide.length).toBeGreaterThan(0);
  await press(page, guide);
  await expect(page.locator(`[data-midi-note="${guide[0]}"] [data-play-along="ok"]`)).toBeVisible();
  await expect(page.getByTestId("voicing-loop-play-along-mark").first()).toHaveAttribute("data-result", "hit");
  await press(page, [guide[0]! + 1]);
  await expect(page.locator(`[data-midi-note="${guide[0]! + 1}"] [data-play-along="wrong"]`)).toBeVisible();
  await press(page, [...guide, guide[0]! + 1], false);
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByTestId("voicing-loop-play-along-mark")).toHaveCount(0);
});

/**
 * P25 I2 (案 D, rev15): with 弾き合わせ on, the band and the keyboard legend row do not overflow, the two judge
 * buttons sit whole inside the legend row, and the band's key and count-in fields are as wide as when off.
 */
for (const [width, height] of [[768, 640], [1024, 768], [1280, 720], [1440, 900]] as const) {
  test(`I2: on, the band and the legend row fit at ${width}x${height}`, async ({ page }) => {
    await openLoop(page, width, height);
    const toggle = page.getByRole("switch", { name: "弾き合わせ", exact: true });
    const fields = () => page.evaluate(() => ["#voicing-loop-key", "#voicing-loop-count-in"].map((id) =>
      Math.round(document.querySelector(id)?.parentElement?.getBoundingClientRect().width ?? -1)));
    if (await toggle.getAttribute("aria-checked") === "true") await toggle.click();
    const off = await fields();
    await toggle.click();
    await expect(page.getByTestId("voicing-loop-play-along-judge")).toBeVisible();
    const fit = await page.evaluate(() => {
      const band = document.querySelector("[data-testid='voicing-loop-transport-primary']") as HTMLElement;
      const row = document.querySelector(".lv-vl-legend-row") as HTMLElement;
      const box = row.getBoundingClientRect();
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-play-along-judge'] button")];
      return {
        band: band.scrollWidth - band.clientWidth,
        row: row.scrollWidth - row.clientWidth,
        inside: buttons.every((button) => { const r = button.getBoundingClientRect(); return r.left >= box.left - 0.5 && r.right <= box.right + 0.5; }),
        whole: buttons.every((button) => button.scrollWidth <= button.clientWidth),
        words: buttons.map((button) => button.textContent),
      };
    });
    expect(fit.band).toBeLessThanOrEqual(0);
    expect(fit.row).toBeLessThanOrEqual(0);
    expect(fit.inside).toBe(true);
    expect(fit.whole).toBe(true);
    expect(fit.words).toEqual(["コード一致", "押さえ方どおり"]);
    expect(await fields()).toEqual(off);
    await expect(page.getByTestId("voicing-loop-play-along-judge")).toHaveAttribute("title", "判定");
    // The judge is no longer in the band (案 D).
    await expect(page.getByTestId("voicing-loop-transport").getByRole("group", { name: "判定" })).toHaveCount(0);
  });
}

/**
 * P25 I2 (rev16): at 768x640 the progress row keeps one line with 弾き合わせ on (「元の拍子 4/4」 is hidden and stays as
 * its title). P25 V10: 「達成」 keeps its place while off too, so off is the same row (「元の拍子」 hidden there too).
 */
test("I2: the progress row keeps one line at 768x640", async ({ page }) => {
  await openLoop(page, 768, 640);
  const toggle = page.getByRole("switch", { name: "弾き合わせ", exact: true });
  const row = () => page.evaluate(() => {
    const head = document.querySelector(".lv-vl-timeline-head") as HTMLElement;
    const tops = [...head.children].map((el) => el.getBoundingClientRect().top);
    const meter = document.querySelector("[data-testid='voicing-loop-source-meter']") as HTMLElement;
    return { spread: Math.max(...tops) - Math.min(...tops), meter: meter.getBoundingClientRect().width, overflow: head.scrollWidth - head.clientWidth };
  });
  if (await toggle.getAttribute("aria-checked") === "true") await toggle.click();
  const off = await row();
  expect(off.spread).toBeLessThan(8);
  expect(off.meter).toBeLessThanOrEqual(1);
  await toggle.click();
  await expect(page.getByTestId("voicing-loop-play-along-count")).toBeVisible();
  const on = await row();
  expect(on).toEqual(off);
  expect(on.spread).toBeLessThan(8);
  expect(on.overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId("voicing-loop-source-meter")).toHaveAttribute("title", "元の拍子 4/4");
  await expect(page.getByTestId("voicing-loop-play-along-count")).toHaveAttribute("title", "この周で、そろったカードの数");
  await expect(page.getByTestId("voicing-loop-play-along-count")).toContainText("0/");
});
