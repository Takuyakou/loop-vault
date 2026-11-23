import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openTextCapture, chooseTextSetting } from "./helpers/app";

/**
 * P23-17: テキスト取り込み — the one-line band, the big preview cards, the chosen card's row and the save line.
 * P24-05: one grammar and one screen; the 「通常 / 拡張」 checks of C1-C12 stay, the switch between them does not.
 */
const captureOf = (page: Page) => page.getByTestId("text-progression-capture");

async function openReader(page: Page) {
  await openTextCapture(page);
  return captureOf(page);
}

async function fill(page: Page, text: string) {
  const capture = captureOf(page);
  await capture.getByTestId("text-progression-input").fill(text);
  return capture;
}

test("C1: the band, the help, the input's rules and the preview cards (V1-V4, V7, V8)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openReader(page);

  // V1: the band is two faces with their labels; the name and save are not in it.
  await expect(capture.locator(".lv-text-topgroup[aria-label='読み方の設定']")).toBeVisible();
  await expect(capture.locator(".lv-text-topgroup[aria-label='試聴']")).toBeVisible();
  await expect(capture.getByTestId("text-capture-toolbar")).toContainText("読み方の設定");
  await expect(capture.getByTestId("text-capture-toolbar")).toContainText("試聴");
  await expect(capture.getByTestId("text-capture-toolbar").getByTestId("text-progression-name")).toHaveCount(0);
  await expect(capture.getByTestId("text-capture-toolbar").getByTestId("text-progression-save")).toHaveCount(0);

  // V3: the 「?」 face: the write rules and the key note; Esc closes it.
  await fill(page, "| Cmaj7 Dm7 |");
  await expect(capture.getByTestId("text-help-face")).toHaveCount(0);
  await capture.getByTestId("text-help").click();
  // P24-05: the 6-line help of the one grammar (the old 4/4-only sentence is gone).
  await expect(capture.getByTestId("text-help-face")).toContainText("1 小節に書いたコードは、小節を等しく分けて鳴ります");
  await expect(capture.getByTestId("text-help-face")).toContainText("鳴らし直さずにのばす");
  await expect(capture.getByTestId("text-help-face")).toContainText("# で始まる行はメモになります");
  // P23-33: the key note describes the automatic mode.
  await expect(capture.getByTestId("text-help-face")).toContainText("キーは自動で決まり");
  await expect(capture.getByTestId("text-help-face")).toContainText("手で選んだキーが必要");
  await page.keyboard.press("Escape");
  await expect(capture.getByTestId("text-help-face")).toHaveCount(0);

  // V4: the rule line, the example and the empty screen's writing face.
  await fill(page, "");
  await expect(capture.getByText("書く、または貼り付ける", { exact: true })).toBeVisible();
  // P24-07 item 2: the empty preview is the four dotted bars only.
  await expect(capture.getByTestId("text-empty-bar")).toHaveCount(4);
  await expect(capture.getByTestId("standard-text-preview")).not.toContainText("書き方の早見");
  const placeholder = await capture.getByTestId("text-progression-input").getAttribute("placeholder");
  expect(placeholder).toBe("例: | Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |");
  await expect(capture.getByText("小節は | で区切る。貼ったコード譜もそのまま読めます")).toBeVisible();

  // V7/V8: a card per chord, the degree above, the chord name large. P23-33: this ii–V–I settles C major
  // automatically, so the degrees and roles are drawn before a manual pick; choosing the same key keeps them.
  await fill(page, "| Dm7 G7 | Cmaj7 |");
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(3);
  await expect(capture.getByTestId("text-preview-degree")).toHaveCount(3);
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await expect(capture.getByTestId("text-preview-degree").nth(0)).toHaveText("Ⅱm7");
  await expect(capture.getByTestId("text-preview-degree").nth(1)).toHaveText("Ⅴ7");
  await expect(capture.getByTestId("text-preview-degree").nth(2)).toHaveText("Ⅰmaj7");
  expect(await capture.getByTestId("text-preview-band").nth(0).getAttribute("data-role")).toBe("SD");
  expect(await capture.getByTestId("text-preview-band").nth(1).getAttribute("data-role")).toBe("D");
  expect(await capture.getByTestId("text-preview-band").nth(2).getAttribute("data-role")).toBe("T");
  // The chord name uses the symbol font's ♯/♭ (the written name is kept as it is).
  await fill(page, "| F#m7b5 Bbmaj7 |");
  await expect(capture.getByTestId("text-preview-band").first()).toContainText("F♯m7♭5");
});

test("C1/C6/C7/C8: the card list is gone, the chosen card's row, the save line and the reset (V9-V11, V14)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openReader(page);
  await fill(page, "| Cmaj7 Dm7 | G7 |");

  // V9: no card list; the preview card is the card.
  await expect(capture.getByTestId("standard-text-card-details")).toHaveCount(0);
  await expect(capture.getByTestId("text-preview-band")).toHaveCount(3);

  // V11: the chosen card's row under the preview, with the notes and 「音を細かく直す」.
  await expect(capture.getByTestId("text-progression-inspector-row")).toHaveCount(1);
  await capture.getByTestId("text-preview-band").nth(1).click();
  const row = capture.getByTestId("text-progression-inspector-row");
  await expect(row).toBeVisible();
  await expect(row).toContainText("選んだカード: Dm7");
  // fix-2 item 2: a text progression has no original MIDI, so the row says only the app's recommendation.
  await expect(row).toContainText(/鳴らす音 .+\(アプリのおすすめの音\)/);
  await expect(capture.getByTestId("text-progression-convert")).toHaveText("音を細かく直す");
  // Opening the row shows the old contents.
  await capture.getByTestId("text-progression-inspector").locator(":scope > summary").click();
  await expect(capture.getByTestId("text-progression-preview")).toHaveText("保存予定音を再生");
  await expect(capture.getByTestId("text-progression-auto-generated")).toContainText("生成スタイル:");

  // V10: the save line — the name blocks the save and gives the reason; a save says so.
  await expect(capture.getByTestId("text-progression-save")).toContainText("Vault に保存");
  await capture.getByTestId("text-progression-name").fill("");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  await expect(capture.getByTestId("text-save-blocked-hint")).toHaveAttribute("title", "名前を入れると保存できます");
  await capture.getByTestId("text-progression-name").fill("新しい進行");
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await capture.getByTestId("text-progression-bpm").fill("96"); await capture.getByTestId("text-progression-bpm").press("Enter");
  await expect(capture.getByTestId("text-progression-save")).toBeEnabled();
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText("保存しました")).toBeVisible();

  // V14: after the save, clearing the input returns the key, the BPM and the name to their first values.
  await fill(page, "");
  // P23-33: the key field's first value is 「自動」 now (it used to be the empty 未確定).
  await expect(capture.getByTestId("text-progression-key")).toHaveAttribute("data-value","auto");
  await expect(capture.getByTestId("text-progression-bpm")).toHaveValue("");
  await expect(capture.getByTestId("text-progression-name")).toHaveValue("テキスト進行");
});

test("C2/C3: the playback row and the try-out speed (V5, V6)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openReader(page);
  await fill(page, "| C G | Am F |");
  const primary = capture.getByTestId("text-transport-primary");
  await expect(primary).toContainText("▶ 再生");
  await primary.click();
  await expect(primary).toContainText("Ⅱ 一時停止");
  await primary.click();
  await expect(primary).toContainText("▶ 再開");
  await primary.click();
  await expect(primary).toContainText("Ⅱ 一時停止");
  await capture.getByTestId("text-transport-stop").click();
  await expect(primary).toContainText("▶ 再生");
  await capture.getByTestId("text-transport-beginning").click();
  // Space is ignored while a button has the focus (the same rule as before); put the focus back on the page.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Space");
  await expect(primary).toContainText("Ⅱ 一時停止");
  await page.keyboard.press("Space");
  await expect(primary).toContainText("▶ 再開");
  // The loop button is there and switches; with it on, the run continues from the start after the end.
  const loop = capture.getByTestId("text-transport-loop");
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await capture.getByTestId("text-transport-beginning").click();
  await primary.click();
  await page.waitForTimeout(5200);
  await expect(primary).toContainText("Ⅱ 一時停止");

  // V6: the field's BPM or the common BPM; the match button flips and the small text follows the common BPM.
  await capture.getByTestId("text-transport-stop").click();
  await capture.getByTestId("text-progression-bpm").fill("96"); await capture.getByTestId("text-progression-bpm").press("Enter");
  const match = capture.getByTestId("text-match-global-bpm");
  await expect(match).toHaveAttribute("aria-pressed", "false");
  await match.click();
  await expect(match).toHaveAttribute("aria-pressed", "true");
  await expect(match).toHaveText("曲の BPM に戻す");
  await match.click();
  await expect(match).toHaveText("共通の BPM に合わせる");
});

test("C11/C12: four widths, axe, the tab order and the bottom line inside the window (V13)", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    const capture = await openReader(page);
    await fill(page, "| Cmaj7 Dm7 | G7 Cmaj7 |");
    await assertNoHorizontalOverflow(page);
    // P24-fix-2: measure after the pane/sidebar entrance has settled (a mid-fade read can tip the contrast).
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const animations = typeof document.getAnimations === "function" ? document.getAnimations() : [];
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
    await page.waitForTimeout(80);
    const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), `${size.width}`).toEqual([]);
    // C12: the save button is inside the window at the two wide sizes; at all sizes nothing runs sideways.
    const save = await capture.getByTestId("text-progression-save").boundingBox();
    if (size.width >= 1280) expect(save!.y + save!.height).toBeLessThanOrEqual(size.height);
    // The narrow tabs are still there (P24-05 keeps the P23-17 pane tabs below 899px).
    if (size.width < 899) await expect(capture.getByRole("tablist", { name: "テキスト作業領域" })).toBeVisible();
  }

  // C11: the tab order follows the page: the band, the input, the preview, the chosen card's row, the save line.
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openReader(page);
  await fill(page, "| Cmaj7 Dm7 |");
  await capture.getByTestId("text-preview-band").first().click();
  const order = await capture.evaluate((root) =>
    [...root.querySelectorAll("button, input, select, textarea, [tabindex]")]
      .filter((node) => !(node as HTMLButtonElement).disabled && node.getBoundingClientRect().width > 0)
      .map((node) => node.getAttribute("data-testid") ?? node.getAttribute("aria-label") ?? node.tagName));
  const at = (id: string) => order.indexOf(id);
  expect(at("text-progression-input")).toBeGreaterThanOrEqual(0);
  expect(at("text-preview-band") === -1 || at("text-preview-band") > at("text-progression-input")).toBe(true);
  expect(at("text-progression-save")).toBeGreaterThan(at("text-progression-input"));
});

test("the photos: the one screen's states and the two smaller widths", async ({ page }) => {
  test.setTimeout(300_000);
  const shoot = async (name: string, size: { width: number; height: number }) => {
    await page.screenshot({ path: `p89-generated/p23-17/${name}-${size.width}x${size.height}.png` });
  };
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const capture = await openReader(page);
    await shoot("empty", size);
    await fill(page, "| Cmaj7 Dm7 | G7 Cmaj7 |");
    await shoot("filled-no-key", size);
    await chooseTextSetting(capture, "text-progression-key", "C major");
    await shoot("filled-key", size);
    await capture.getByTestId("text-preview-band").nth(1).click();
    await shoot("card-chosen", size);
    await fill(page, "| C D E |");
    await shoot("with-error", size);
    await capture.getByTestId("text-help").click();
    await shoot("help-open", size);
    await page.keyboard.press("Escape");
    // P24-05: the extended-only cells are read by the same screen, so there is no sixth 「拡張」 shot.
    await fill(page, "| Cmaj7 | Dm7 G7 | Cmaj7 % | Am7 _ |");
    await shoot("extended-cells", size);
  }
  for (const size of [{ width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    const capture = await openReader(page);
    await fill(page, "| Cmaj7 Dm7 | G7 Cmaj7 |");
    await chooseTextSetting(capture, "text-progression-key", "C major");
    await shoot("filled-key", size);
  }
});
