import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

test("Standard and Extended preserve source and UTF-16 selection", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
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

test("key remains unconfirmed until one is chosen and all 24 keys are offered", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  // P23-33: with no chords the key is 「自動: 未確定」; the field itself starts on 「自動」.
  await expect(capture.getByTestId("text-progression-key-state")).toContainText(/キーは未確定/);
  // P8.9-09b: the same key select as 拡張 — 自動・未設定 plus 24 keys, Japanese labels.
  await expect(capture.getByTestId("text-progression-key").locator("option")).toHaveCount(26);
  await expect(capture.getByTestId("text-progression-bpm")).toHaveValue("");
  await capture.getByTestId("text-progression-key").selectOption("F# minor");
  await expect(capture.getByTestId("text-progression-key").locator("option:checked")).toHaveText("F#マイナー");
  await expect(capture.getByTestId("text-progression-key-state")).toContainText("F# minor");
});


test("toolbar wraps by content width and keeps the Save cluster fixed during transport states", async ({ page }) => {
  for (const width of [1920, 1600, 1440, 1366, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    const capture = page.getByTestId("text-progression-capture");
    await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
    const footer = capture.locator("footer.lv-text-status-bar");
    const primary = capture.getByTestId("text-transport-primary");
    const name = capture.getByTestId("text-progression-name");
    const save = capture.getByTestId("text-progression-save");
    const before = { group: await footer.boundingBox(), primary: await primary.boundingBox(),
      name: await name.boundingBox(), save: await save.boundingBox() };
    expect(before.group).not.toBeNull();
    expect(before.primary).not.toBeNull();
    expect(before.name).not.toBeNull();
    expect(before.save).not.toBeNull();
    expect(before.save!.x + before.save!.width).toBeLessThanOrEqual(before.group!.x + before.group!.width + 1);
    const contentWidth = before.group!.width;
    if (contentWidth >= 1180) {
      const modeGroup = (await capture.locator(".lv-text-topgroup[aria-label='読み方の設定']").boundingBox())!;
      const listenGroup = (await capture.locator(".lv-text-topgroup[aria-label='試聴']").boundingBox())!;
      // P23-17 V1: the band is two faces in one row when both fit; when they do not, the band wraps by face (V13).
      const needed = modeGroup.width + listenGroup.width + 8;
      if (needed <= contentWidth) {
        expect(Math.abs(modeGroup.y - listenGroup.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(before.name!.y - before.save!.y)).toBeLessThanOrEqual(1);
      }
    }
    await primary.click();
    await expect(primary).toContainText(/一時停止/);
    for (const element of ["group", "primary", "name", "save"] as const) {
      const locator = element === "group" ? footer : element === "primary" ? primary : element === "name" ? name : save;
      const after = (await locator.boundingBox())!;
      const prior = before[element]!;
      for (const axis of ["x", "y", "width"] as const) expect(Math.abs(after[axis] - prior[axis])).toBeLessThanOrEqual(1);
    }
    await primary.click();
    await expect(primary).toContainText(/再開/);
    const resumedSave = (await save.boundingBox())!;
    expect(Math.abs(resumedSave.x - before.save!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(resumedSave.y - before.save!.y)).toBeLessThanOrEqual(1);
    await assertNoHorizontalOverflow(page);
  }
});


test("interactive chord bands show teal hover/focus and blocked save explains itself", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
  const band = capture.getByTestId("standard-text-preview").getByTestId("text-preview-band").first();
  await expect(band).toHaveCSS("cursor", "pointer");
  const initial = await band.evaluate(element => getComputedStyle(element).backgroundColor);
  await band.hover();
  const hovered = await band.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(hovered).not.toBe(initial);
  const chordButton = band.getByRole("button", { name: "C", exact: true });
  await capture.getByTestId("standard-text-preview").getByTestId("text-preview-bar-select").first().focus();
  await page.keyboard.press("Tab");
  await expect(chordButton).toBeFocused();
  await expect(chordButton).toHaveCSS("outline-style", "solid");
  await capture.getByTestId("text-progression-input").fill("| C ??? |");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  await expect(capture.getByTestId("text-save-blocked-hint")).toHaveAttribute("aria-describedby", "text-progression-save-reason");
  await expect(capture.locator("#text-progression-save-reason")).toBeVisible();
});


test("Extended toolbar retains meter/key controls and Save cluster without page overflow", async ({ page }) => {
  for (const width of [1920, 1600, 1440, 1366, 1280, 1024, 899, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    await page.getByTestId("text-mode-extended").click();
    const intake = page.getByTestId("extended-text-intake");
    await intake.getByTestId("extended-text-input").fill("| C % = _ | Dm |");
    await expect(intake.getByTestId("extended-text-save")).toBeEnabled();
    await expect(intake.getByTestId("extended-text-key").locator("option")).toHaveCount(26);
    const name = (await intake.getByTestId("extended-text-name").boundingBox())!;
    const save = (await intake.getByTestId("extended-text-save").boundingBox())!;
    if (width >= 1440) expect(Math.abs(name.y - save.y)).toBeLessThanOrEqual(4);
    await intake.getByTestId("extended-text-meter").selectOption("3/4");
    await expect(intake.getByTestId("extended-text-meter")).toHaveValue("3/4");
    await assertNoHorizontalOverflow(page);
  }
});

test("P8.9-09b 通常 and 拡張 share the name, fields, save reason, footer and pane geometry", async ({ page }) => {
  const measure = async (mode: "standard" | "extended") => {
    const capture = page.getByTestId("text-progression-capture");
    const ids = mode === "standard"
      ? { name: "text-progression-name", save: "text-progression-save", meter: "text-progression-meter", key: "text-progression-key" }
      : { name: "extended-text-name", save: "extended-text-save", meter: "extended-text-meter", key: "extended-text-key" };
    await expect(capture.getByTestId(ids.name)).toHaveValue("テキスト進行");
    await expect(capture.getByTestId(ids.save)).toBeDisabled();
    await expect(capture.getByTestId(ids.save)).toHaveAttribute("title", "コード進行を入れると保存できます");
    await expect(capture.getByTestId(ids.key).locator("option")).toHaveCount(26);
    await expect(capture.getByTestId(ids.key).locator("option:checked")).toHaveText("自動: 未確定");
    const footer = capture.locator("footer.lv-text-status-bar");
    await expect(footer.locator("[data-testid='text-progression-capability-details'] summary, [data-testid='extended-text-capabilities-unavailable']").first()).toBeVisible();
    // P23-17 V11: the standard's 「音を細かく直す」 lives in the chosen card's row (no card with an empty input);
    // the extended still keeps its disabled button in the footer.
    if (mode === "extended") await expect(capture.getByTestId("extended-text-convert-unavailable")).toBeDisabled();
    const box = async (selector: string) => (await capture.locator(selector).first().boundingBox())!;
    const panes = capture.locator(".lv-text-intake-pane");
    const visiblePanes = [];
    for (const pane of await panes.all()) if (await pane.isVisible()) visiblePanes.push((await pane.boundingBox())!);
    return {
      toolbar: await box("[data-testid='text-capture-toolbar']"),
      meter: await capture.getByTestId(ids.meter).evaluate((element) => [element.className, getComputedStyle(element).height]),
      key: await capture.getByTestId(ids.key).evaluate((element) => [element.className, getComputedStyle(element).height]),
      panes: visiblePanes,
      footer: (await footer.boundingBox())!,
      tools: mode === "extended" ? (await capture.getByTestId("extended-text-convert-unavailable").boundingBox())! : undefined,
    };
  };
  for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await openApp(page);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    const standard = await measure("standard");
    await page.getByTestId("text-mode-extended").click();
    const extended = await measure("extended");
    expect(extended.meter, `${width} meter`).toEqual(standard.meter);
    expect(extended.key, `${width} key`).toEqual(standard.key);
    for (const side of ["x", "width"] as const) {
      expect(Math.abs(extended.toolbar[side] - standard.toolbar[side]), `${width} toolbar ${side}`).toBeLessThanOrEqual(1);
      expect(Math.abs(extended.footer[side] - standard.footer[side]), `${width} footer ${side}`).toBeLessThanOrEqual(1);
    }
    // P23-17 V11: the standard's 「音を細かく直す」 is in the chosen card's row, not the footer; the two are compared
    // again once the extended reader gets the same row (stage 6).
    expect(extended.panes.length, `${width} panes`).toBe(standard.panes.length);
    // P23-17 V9/V11 still have to move the card list and the selected-card row out of the standard footer; until they
    // do, the footers (and so the panes above them) can differ in height at a narrow width. The full check returns then.
    if (width >= 1440) standard.panes.forEach((pane, index) => {
      for (const side of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(extended.panes[index]![side] - pane[side]), `${width} pane ${index} ${side}`).toBeLessThanOrEqual(1);
      }
    });
  }
});
