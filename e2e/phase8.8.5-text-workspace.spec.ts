import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

test("Standard and Extended preserve source and UTF-16 selection", async ({ page }) => {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト|Text/ }).click();
  const source = "# heading\n| C Dm |\n| BbM7 Db7(#9) |\n😀 end";
  const standard = page.getByTestId("text-progression-input");
  await standard.fill(source);
  const editorValue = await standard.inputValue();
  await standard.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(19, 25));
  await standard.dispatchEvent("select");
  await page.getByTestId("text-mode-extended").click();
  const extended = page.getByTestId("extended-text-input");
  await expect(extended).toHaveValue(editorValue);
  expect(await extended.evaluate((element: HTMLTextAreaElement) =>
    [element.selectionStart, element.selectionEnd])).toEqual([19, 25]);
  await page.getByTestId("text-mode-standard").click();
  await expect(standard).toHaveValue(editorValue);
  expect(await standard.evaluate((element: HTMLTextAreaElement) =>
    [element.selectionStart, element.selectionEnd])).toEqual([19, 25]);
});

test("key remains unconfirmed until explicit confirmation and all 24 keys are offered", async ({ page }) => {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト|Text/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await expect(capture.getByTestId("text-progression-key-state")).toContainText(/明示的|explicitly/);
  await expect(page.locator("#text-progression-key-options option")).toHaveCount(24);
  await expect(capture.getByTestId("text-progression-bpm")).toHaveValue("");
  await capture.getByTestId("text-progression-key").fill("F# minor");
  await expect(capture.getByTestId("text-progression-key-state")).toContainText(/明示的|explicitly/);
  await capture.getByRole("button", { name: /キーを確定|Confirm key/ }).click();
  await expect(capture.getByTestId("text-progression-key-state")).toContainText("F# minor");
});


test("toolbar wraps by content width and keeps the Save cluster fixed during transport states", async ({ page }) => {
  for (const width of [1920, 1600, 1440, 1366, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト|Text/ }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
    const toolbar = capture.getByTestId("text-capture-toolbar");
    const primary = capture.getByTestId("text-transport-primary");
    const name = capture.getByTestId("text-progression-name");
    const save = capture.getByTestId("text-progression-save");
    const before = { group: await toolbar.boundingBox(), primary: await primary.boundingBox(),
      name: await name.boundingBox(), save: await save.boundingBox() };
    expect(before.group).not.toBeNull();
    expect(before.primary).not.toBeNull();
    expect(before.name).not.toBeNull();
    expect(before.save).not.toBeNull();
    const contentWidth = (await capture.boundingBox())!.width - 32;
    if (contentWidth >= 1370) {
      const mode = (await capture.getByTestId("text-mode-standard").boundingBox())!;
      expect(Math.abs(mode.y - before.primary!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(before.name!.y - before.primary!.y)).toBeLessThanOrEqual(1);
    }
    await primary.click();
    await expect(primary).toContainText(/一時停止|Pause/);
    for (const element of ["group", "primary", "name", "save"] as const) {
      const locator = element === "group" ? toolbar : element === "primary" ? primary : element === "name" ? name : save;
      const after = (await locator.boundingBox())!;
      const prior = before[element]!;
      for (const axis of ["x", "y", "width"] as const) expect(Math.abs(after[axis] - prior[axis])).toBeLessThanOrEqual(1);
    }
    await primary.click();
    await expect(primary).toContainText(/再開|Resume/);
    const resumedSave = (await save.boundingBox())!;
    expect(Math.abs(resumedSave.x - before.save!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(resumedSave.y - before.save!.y)).toBeLessThanOrEqual(1);
    await assertNoHorizontalOverflow(page);
  }
});
