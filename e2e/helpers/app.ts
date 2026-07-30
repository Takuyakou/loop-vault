import { expect, type Page } from "@playwright/test";

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
}

export async function openCapture(page: Page): Promise<void> {
  await page.locator("nav").getByRole("button", { name: /コード採集|Capture/ }).click();
  await expect(page.locator("[data-capture-midi-drop-zone]")).toBeVisible();
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

export async function analyzeCurrentMidi(page: Page): Promise<void> {
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
  await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
}

export async function chooseFirstCandidate(page: Page): Promise<void> {
  const candidate = page.locator("[data-candidate-toggle]").first();
  if (await candidate.getAttribute("aria-expanded") !== "true") {
    await candidate.click();
  }
  await expect(candidate).toHaveAttribute("aria-expanded", "true");
}

export async function saveFirstCandidate(page: Page): Promise<void> {
  await chooseFirstCandidate(page);
  await page.getByRole("button", { name: /Vaultに保存|Save to Vault/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form).toBeVisible();
  const title = form.locator('input[name="progression-title"]');
  await title.fill("E2E 保存済み進行");
  await form.getByRole("button", { name: /保存|Save/, exact: true }).click();
  await expect(form).toBeHidden();
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
  const selectedCandidate = page.locator('[data-candidate-state="selected"]');
  await selectedCandidate
    .getByRole("button", { name: /Vaultに保存|Save to Vault/, exact: true })
    .click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await form.locator('input[name="progression-title"]').fill(title);
  await form.getByRole("button", { name: /保存|Save/, exact: true }).click();
  await expect(form).toBeHidden();
}

export async function openVault(page: Page): Promise<void> {
  await page.locator("nav").getByRole("button", { name: "Vault", exact: true }).click();
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
