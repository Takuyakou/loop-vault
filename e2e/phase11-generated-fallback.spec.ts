import { expect, test } from "@playwright/test";

test("P11 a K shape a chord cannot make plays a nearer shape with today's 「代わり」, and the panel still fits", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=p11-generated-fallback");
  await page.locator('[data-nav="voicing-loop"]').click();
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  // P25-08 K4 / L4: シェル+上の三和音 falls back on some of these cards; each such card shows 「代わり」 with what it plays.
  await page.getByTestId("voicing-loop-shape-button").click();
  await page.getByTestId("voicing-loop-shape-menu").locator('[data-shape="triad"]').click();
  const marks = page.getByTestId("voicing-loop-auto-fallback");
  expect(await marks.count()).toBeGreaterThan(0);
  for (const text of await marks.evaluateAll((items) => items.map((item) => item.textContent))) {
    expect(text === "代わり" || text === "代", `the card reads 代わり (or 代 when narrow): ${text}`).toBe(true);
  }
  for (const title of await marks.evaluateAll((items) => items.map((item) => item.getAttribute("title")))) {
    expect(title).toMatch(/^(この形では作れないため「.+」で鳴らしています|このコードは形で作れないので、今までの作り方の音で鳴らしています)$/);
  }
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeEnabled();
  for (const [width, height] of [[1920, 1080], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const panel = page.getByTestId("voicing-loop-current-panel");
    const size = await panel.evaluate(e => ({ client: e.clientHeight, scroll: e.scrollHeight }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    await expect(page.getByTestId("voicing-loop-next-move")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`p11-fallback-${width}.png`) });
  }
});

test("P11 rapid card, current and resume/restart actions retain playable state without exceptions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?p527Status=p11-source-settings");
  await page.locator('[data-nav="voicing-loop"]').click();
  const cards = page.getByTestId("voicing-loop-event");
  for (let i = 0; i < 10; i++) await cards.nth(i % 2).click();
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "現在のコードを試聴", exact: true }).click();
  await page.getByRole("combobox", { name: "カウントイン", exact: true }).selectOption("0");
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  for (let i = 0; i < 10; i++) await cards.nth(i % 2).click();
  await page.getByRole("button", { name: "再開", exact: true }).evaluate((e: HTMLButtonElement) => { for (let i = 0; i < 10; i++) e.click(); });
  await expect(page.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "最初から", exact: true }).evaluate((e: HTMLButtonElement) => { for (let i = 0; i < 10; i++) e.click(); });
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
