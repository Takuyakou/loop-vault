import { expect, type Page } from "@playwright/test";

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
}

export async function openCapture(page: Page): Promise<void> {
  await page.locator('[data-nav="capture"]').click();
  await expect(page.locator("[data-capture-midi-drop-zone]")).toBeVisible();
}

export async function openTextCapture(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await expect(capture).toBeVisible();
  return capture;
}

export async function dropMidi(
  page: Page,
  bytes: Uint8Array,
  fileName = "loop-vault-e2e.mid",
): Promise<void> {
  const base64 = Buffer.from(bytes).toString("base64");
  await page.locator("[data-capture-midi-drop-zone]:visible").first().evaluate(
    (target, payload) => {
      const binary = atob(payload.base64);
      const array = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const file = new File([array], payload.fileName, { type: "audio/midi" });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      target.dispatchEvent(new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }));
      target.dispatchEvent(new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }));
      target.dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }));
    },
    { base64, fileName },
  );
}

export async function loadMidiForPreAnalysis(
  page: Page,
  bytes: Uint8Array,
  fileName = "loop-vault-e2e.mid",
): Promise<void> {
  await openCapture(page);
  await dropMidi(page, bytes, fileName);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
}

/** After analysis the correction workspace is the screen (P10.0-06; the old one went in P10.0-07). */
export async function analyzeCurrentMidi(page: Page): Promise<void> {
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
}

/** P10.2 addendum 1 §2: 「おすすめの範囲」 starts closed at the top of the panel; open it. */
export async function openRecommendedRanges(page: Page): Promise<void> {
  const toggle = page.getByTestId("correction-workspace").getByTestId("correction-recommended-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(page.getByTestId("correction-workspace").getByTestId("correction-recommended")).toBeVisible();
}

/** The first recommended range (おすすめの範囲) becomes the save range; a closed narrow panel is opened first. */
export async function chooseFirstCandidate(page: Page): Promise<void> {
  const workspace = page.getByTestId("correction-workspace");
  const toggle = workspace.getByTestId("correction-panel-toggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await openRecommendedRanges(page);
  await workspace.getByTestId("correction-recommended").getByRole("button").first().click();
  await expect(workspace.getByTestId("correction-save-form")).toBeVisible();
}

/** 「Vaultに保存」 in the save form, then the title, then 保存. */
export async function saveChosenRange(page: Page, title: string): Promise<void> {
  await page.getByTestId("correction-save-form").getByRole("button", { name: /Vaultに保存/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form).toBeVisible();
  await form.locator('input[name="progression-title"]').fill(title);
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
}

export async function saveFirstCandidate(page: Page): Promise<void> {
  await chooseFirstCandidate(page);
  await saveChosenRange(page, "E2E 保存済み進行");
}

export async function createSavedProgression(
  page: Page,
  title = "E2E 保存済み進行",
  options: { voiceCount?: number; fileName?: string } = {},
): Promise<void> {
  await loadMidiForPreAnalysis(
    page,
    (await import("./midiFixture")).createMidiFixture({
      voiceCount: options.voiceCount ?? 3,
    }),
    options.fileName ?? "e2e-saved-progression.mid",
  );
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);
  await saveChosenRange(page, title);
}

export async function openVault(page: Page): Promise<void> {
  await page.locator('[data-nav="vault"]').click();
  await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "Vault");
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.locator("body").evaluate((body) => ({
    clientWidth: body.clientWidth,
    scrollWidth: body.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function capturePageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/**
 * P8.9-09b: the sidebar width animates after a toggle or a resize across 1200px; measure only
 * once it has settled. Two frames first so a pending media change has started the animation.
 */
export async function waitForSidebarSettled(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await expect.poll(() => page.locator("[data-sidebar]").evaluate((aside) => {
    const target = aside.getAttribute("data-sidebar") === "collapsed" ? 64 : 232;
    return Math.round(aside.getBoundingClientRect().width) === target;
  })).toBe(true);
}
