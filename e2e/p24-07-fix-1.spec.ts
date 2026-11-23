import { expect, test, type Page } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P24-07-fix-1: the review's four fixes.
 * 1. Bass Practice keeps its purple band (only the shape is shared).
 * 2. 「Vault に保存」 sits at the row's right edge (16px padding).
 * 3. Key names use ♭/♯ and one half-width space.
 * 4. The app's text is not selectable; fields and [data-selectable] are.
 */
const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const animations = typeof document.getAnimations === "function" ? document.getAnimations() : [];
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  await page.waitForTimeout(60);
}

async function bpHomeWithBand(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="bass-practice"]').click();
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await view.getByTestId("degree-show-answer").click();
  await view.locator("[data-review-rating='good']").click();
  await view.getByTestId("degree-next").click();
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();
}

test("1: Bass Practice keeps its purple band (the shape is shared)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await bpHomeWithBand(page);
  await page.mouse.move(5, 700);
  await settle(page);
  const band = page.getByTestId("bass-home-resume");
  const style = await band.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundImage: computed.backgroundImage,
      backgroundColor: computed.backgroundColor,
      borderTop: computed.borderTopColor,
      color: getComputedStyle(element.querySelector(".lv-resume-band-label")!).color,
      markBackground: getComputedStyle(element.querySelector(".lv-resume-band-mark")!).backgroundColor,
    };
  });
  expect(style.backgroundImage).toContain("linear-gradient");
  expect(style.borderTop).toBe("rgba(0, 0, 0, 0)");
  expect(style.color).toBe("rgb(167, 156, 255)");
  expect(style.markBackground).toBe("rgb(167, 156, 255)");
  await band.hover();
  await page.waitForTimeout(260);
  await expect(band).toHaveCSS("border-top-color", "rgb(167, 156, 255)");
  // The ground stays the gradient on hover (no teal tint).
  const hovered = await band.evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(hovered).toContain("linear-gradient");
  await settle(page);
  await page.screenshot({ path: "p89-generated/P24-07-fix-1/R-bp-1440.png" });
});

test("2: the save button sits at the row's right edge", async ({ page }) => {
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await openTextCapture(page);
    const capture = captureOf(page);
    await inputOf(page).fill("| Cmaj7 Dm7 | G7 |");
    const measured = await capture.evaluate((root) => {
      const bar = root.querySelector<HTMLElement>("footer.lv-text-status-bar")!;
      const button = root.querySelector<HTMLElement>('[data-testid="text-progression-save"]')!;
      const computed = getComputedStyle(bar);
      return {
        paddingRight: parseFloat(computed.paddingRight),
        rowRight: bar.getBoundingClientRect().right,
        buttonRight: button.getBoundingClientRect().right,
      };
    });
    expect(measured.paddingRight, `${width} padding`).toBe(16);
    expect(Math.abs((measured.rowRight - measured.paddingRight) - measured.buttonRight), `${width} right edge`).toBeLessThanOrEqual(1);
    if (width === 1440) {
      await page.screenshot({ path: "p89-generated/P24-07-fix-1/T-save-row-1440.png" });
    }
  }
});

test("3: key names use ♭/♯ and a space (button, window and summary)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTextCapture(page);
  const capture = captureOf(page);
  const key = capture.getByTestId("text-progression-key");
  await key.click();
  const list = capture.getByTestId("text-progression-key-list");
  await expect(list.locator('[data-value="Eb major"]')).toHaveText("E♭ メジャー");
  await expect(list.locator('[data-value="C# major"]')).toHaveText("C♯ メジャー");
  await settle(page);
  await page.screenshot({ path: "p89-generated/P24-07-fix-1/T-key-open-1440.png" });
  await list.locator('[data-value="Eb major"]').click();
  await expect(key).toHaveAttribute("data-value", "Eb major");
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("E♭ メジャー");
  await expect(capture.getByTestId("text-progression-capability-summary")).toContainText("キー E♭ メジャー");
  await key.click();
  await capture.getByTestId("text-progression-key-list").locator('[data-value="C# major"]').click();
  await expect(capture.getByTestId("text-progression-key-value")).toHaveText("C♯ メジャー");
  // The saved value is still the internal string.
  await expect(key).toHaveAttribute("data-value", "C# major");
});

test("4: the app's text is not selectable; the fields and marked passages are", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p104=normal");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
  const select = (locator: ReturnType<Page["locator"]>) => locator.evaluate((element) => getComputedStyle(element).userSelect);
  expect(await select(page.locator("header").first())).toBe("none");
  expect(await select(page.locator("aside").first())).toBe("none");
  expect(await select(page.getByTestId("correction-card").first())).toBe("none");
  expect(await select(page.getByTestId("progression-title"))).toBe("text");
  // Dragging over the header selects nothing.
  const title = await page.locator("header").first().boundingBox();
  if (title) {
    await page.mouse.move(title.x + 20, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(title.x + 400, title.y + title.height / 2, { steps: 6 });
    await page.mouse.up();
  }
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  await settle(page);
  await page.screenshot({ path: "p89-generated/P24-07-fix-1/S-header-drag-1440.png" });
  // The input field stays selectable (and copyable).
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await expect(inputOf(page)).toBeVisible();
  expect(await select(inputOf(page))).toBe("text");
  await inputOf(page).fill("| Cmaj7 Dm7 |");
  await inputOf(page).focus();
  await page.keyboard.press("Control+a");
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Cmaj7");
});
