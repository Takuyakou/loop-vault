import { expect, test } from "@playwright/test";
import { openTextCapture } from "./helpers/app";

/**
 * P25 V37: a chord's notes written in `{ }` become that card's sound — on the screen, in the Vault, and in
 * Voicing Loop — while an unreadable brace is named and stops the save.
 */
const SHEET = "| Cmaj7{C3 G3 E4 B4 D5} | Dm7 | G7{F3 B3 E4 A4} | Cmaj7 |";

test("V37 the braces set the card's notes, travel to the Vault, and a bad brace stops the save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const capture = await openTextCapture(page);
  const editor = capture.getByTestId("text-progression-input");
  await editor.fill(SHEET);

  // The first card sounds the five notes its braces name (the band's keyboard shows them).
  await capture.getByTestId("text-preview-band").first().click();
  const litNotes = async () => await capture.getByTestId("text-dock-key").evaluateAll((keys) => keys
    .filter((key) => key.getAttribute("aria-pressed") === "true")
    .map((key) => Number((key as HTMLElement).dataset.note))
    .sort((left, right) => left - right));
  await expect.poll(litNotes).toEqual([48, 55, 64, 71, 74]);

  // A note that does not read is named once, the chord is still read, and the save waits.
  await editor.fill("| Cmaj7{C3 G3 E4 H4} | Dm7 |");
  await expect(capture.getByTestId("text-save-error-count")).toContainText("直す所が 1 か所あります");
  await expect(capture.getByTestId("text-progression-save")).toBeDisabled();
  await expect(capture.getByTestId("text-preview-band").first()).toContainText("Cmaj7");

  // The notes go with the save, and Voicing Loop's keyboard shows the same five.
  await editor.fill(SHEET);
  await capture.getByTestId("text-progression-name").fill("P25 V37 braces");
  await capture.getByTestId("text-progression-save").click();
  await page.getByRole("button", { name: "Voicing Loopで練習", exact: true }).click();
  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  const guide = await workspace.locator('[data-midi-note][data-visual-state="guide"]').evaluateAll((keys) => keys
    .map((key) => Number((key as HTMLElement).dataset.midiNote))
    .sort((left, right) => left - right));
  expect(guide).toEqual([48, 55, 64, 71, 74]);
});
