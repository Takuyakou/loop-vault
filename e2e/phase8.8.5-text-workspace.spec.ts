import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, openTextCapture, waitForSidebarSettled, chooseTextSetting } from "./helpers/app";

/**
 * P8.8.5 — rewritten for P24-05's one text screen. The old spec compared 「標準」 and 「拡張」; with one screen
 * the same properties (source/selection, keys, toolbar wrapping, card focus, pane geometry) are checked once.
 */
test("the one input keeps its source and its UTF-16 selection", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const source = "# heading\n| C Dm |\n| BbM7 Db7(#9) |\n😀 end";
  const input = page.getByTestId("text-progression-input");
  await input.fill(source);
  const editorValue = await input.inputValue();
  await input.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(19, 25));
  await input.dispatchEvent("select");
  // The one result re-reads on every keystroke; a selection that is set must survive that re-render.
  await chooseTextSetting(page, "text-progression-key", "C major");
  await expect(input).toHaveValue(editorValue);
  expect(await input.evaluate((element: HTMLTextAreaElement) =>
    [element.selectionStart, element.selectionEnd])).toEqual([19, 25]);
});

test("key remains unconfirmed until one is chosen and all 24 keys are offered", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  // P23-33: with no chords the key is 「自動: 未確定」; the field itself starts on 「自動」.
  await expect(capture.getByTestId("text-progression-key-state")).toContainText(/キーは未確定/);
  await capture.getByTestId("text-progression-key").click();
  await expect(capture.getByTestId("text-progression-key-list").getByRole("option")).toHaveCount(26);
  await capture.page().keyboard.press("Escape");
  await expect(capture.getByTestId("text-progression-bpm")).toHaveValue("");
  await chooseTextSetting(capture, "text-progression-key", "F# minor");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("F♯ マイナー");
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
        // The save row is centre-aligned and its two controls differ in height (the design's mock draws the
        // name field at 34px and the save button at 36px), so one row means one centre line, not one top edge.
        const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
        expect(Math.abs(centre(before.name!) - centre(before.save!))).toBeLessThanOrEqual(1);
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

test("interactive cards show hover/focus and a blocked save explains itself", async ({ page }) => {
  await openTextCapture(page);
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| C Dm F G |");
  const band = capture.getByTestId("standard-text-preview").getByTestId("text-preview-band").first();
  await expect(band).toHaveCSS("cursor", "pointer");
  // P25 V31: hover lifts the card like Voicing Loop's cards.
  const before = await band.evaluate((element) => getComputedStyle(element).borderTopColor);
  await band.hover();
  await page.waitForTimeout(250);
  const hovered = await band.evaluate((element) => ({
    transform: getComputedStyle(element).transform,
    shadow: getComputedStyle(element).boxShadow,
    borderLeft: getComputedStyle(element).borderLeftColor,
    borderTop: getComputedStyle(element).borderTopColor,
  }));
  expect(hovered.transform).toBe("matrix(1, 0, 0, 1, 0, -2)");
  expect(hovered.shadow).toContain("rgba(0, 0, 0, 0.35)");
  expect(hovered.borderLeft).toBe("rgba(66, 216, 198, 0.55)");
  expect(hovered.borderTop).toBe(before);
  await capture.getByTestId("standard-text-preview").getByTestId("text-preview-bar-select").first().focus();
  await page.keyboard.press("Tab");
  await expect(band).toBeFocused();
  await expect(band).toHaveCSS("outline-style", "solid");
  await capture.getByTestId("text-progression-input").fill("| C ??? |");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  // fix-1 item 3: the error case has no reason sentence; the hint's title explains it and points at nothing.
  await expect(capture.getByTestId("text-save-blocked-hint")).toHaveAttribute("title", /エラー/);
  expect(await capture.getByTestId("text-save-blocked-hint").getAttribute("aria-describedby")).toBeNull();
  await expect(capture.locator("#text-progression-save-reason")).toHaveCount(0);
});

test("meter/key controls and the Save cluster stay inside the window at every width", async ({ page }) => {
  for (const width of [1920, 1600, 1440, 1366, 1280, 1024, 899, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    const intake = page.getByTestId("text-progression-capture");
    await intake.getByTestId("text-progression-input").fill("| C % = _ | Dm |");
    await expect(intake.getByTestId("text-progression-save")).toBeEnabled();
    await intake.getByTestId("text-progression-key").click();
  await expect(intake.getByTestId("text-progression-key-list").getByRole("option")).toHaveCount(26);
  await intake.page().keyboard.press("Escape");
    const name = (await intake.getByTestId("text-progression-name").boundingBox())!;
    const save = (await intake.getByTestId("text-progression-save").boundingBox())!;
    if (width >= 1440) expect(Math.abs(name.y - save.y)).toBeLessThanOrEqual(4);
    await chooseTextSetting(intake, "text-progression-meter", "3/4");
    await expect(intake.getByTestId("text-progression-meter")).toHaveAttribute("data-value","3/4");
    await assertNoHorizontalOverflow(page);
  }
});

test("the one screen keeps its fields, footer and pane geometry at four sizes", async ({ page }) => {
  await openTextCapture(page);
  const capture = page.getByTestId("text-progression-capture");
  for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    // Crossing 1200px animates the sidebar; measure after it has settled.
    await waitForSidebarSettled(page);
    await expect(capture.getByTestId("text-progression-name")).toHaveValue("テキスト進行");
    await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
    await expect(capture.getByTestId("text-progression-save")).toHaveAttribute("title", "コード進行を入れると保存できます");
    await capture.getByTestId("text-progression-key").click();
  await expect(capture.getByTestId("text-progression-key-list").getByRole("option")).toHaveCount(26);
  await capture.page().keyboard.press("Escape");
    await expect(capture.getByTestId("text-progression-key-value")).toHaveText("自動: 未確定");
    const footer = capture.locator("footer.lv-text-status-bar");
    const toolbar = (await capture.locator("[data-testid='text-capture-toolbar']").boundingBox())!;
    const footerBox = (await footer.boundingBox())!;
    for (const side of ["x", "width"] as const) {
      expect(Math.abs(footerBox[side] - toolbar[side]), `${width} footer ${side}`).toBeLessThanOrEqual(1);
    }
    const panes = capture.locator(".lv-text-intake-pane");
    const visible = [];
    for (const pane of await panes.all()) if (await pane.isVisible()) visible.push((await pane.boundingBox())!);
    // Both panes sit side by side above 899px; below that the tabs show one of them.
    expect(visible.length).toBe(width >= 900 ? 2 : 1);
    if (width >= 900) {
      expect(Math.abs(visible[0]!.y - visible[1]!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(visible[0]!.height - visible[1]!.height)).toBeLessThanOrEqual(1);
      expect(visible[0]!.x + visible[0]!.width).toBeLessThanOrEqual(visible[1]!.x + 1);
    }
  }
});
