import { expect, test } from "@playwright/test";

test("P11 unsupported detailed shapes visibly substitute the selected Basic/Core and preserve desktop panel fit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=p11-generated-fallback");
  await page.locator('[data-nav="voicing-loop"]').click();
  const details = page.getByTestId("voicing-loop-generated-details");
  for (const study of ["基本", "骨組み"]) {
    await page.getByLabel("生成タイプ", { exact: true }).click();
    await page.getByRole("option", { name: study, exact: true }).click();
    for (const shape of ["basic-shell", "rootless-shell", "full-shell", "left-hand"]) {
      await details.locator("summary").click();
      await details.getByLabel("既存の形", { exact: true }).selectOption(shape);
      await expect(page.getByTestId("voicing-loop-auto-fallback")).toHaveCount(2);
      await expect(page.getByTestId("voicing-loop-auto-fallback").first()).toHaveAttribute("title", `この形では作れないため「${study}」で鳴らしています`);
      await expect(page.getByTestId("voicing-loop-shape-fallback-summary")).toHaveText(`2コードは${study}で代替`);
      await expect(page.getByRole("button", { name: "開始", exact: true })).toBeEnabled();
      await page.getByTestId("voicing-loop-event").nth(2).click();
      await expect(page.getByTestId("voicing-loop-left-hand")).toContainText("L5");
      await expect(page.getByTestId("voicing-loop-right-hand")).toContainText(/R1.*R3.*R5/);
    }
  }
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
