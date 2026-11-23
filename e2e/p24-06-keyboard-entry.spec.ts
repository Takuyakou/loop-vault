import { expect, test, type Page } from "@playwright/test";
import { chooseTextSetting } from "./helpers/app";

/**
 * P24-06 鍵盤で入れる — end to end with the synthetic MIDI input of `?p12=midi` (the project's usual
 * stand-in for a real keyboard). The pure latch and the writer are covered by their own unit tests.
 */
const captureOf = (page: Page) => page.getByTestId("text-progression-capture");
const inputOf = (page: Page) => captureOf(page).getByTestId("text-progression-input");

async function openKeyboard(page: Page, connected = true): Promise<void> {
  await page.goto(connected ? "/?p12=midi" : "/");
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  await captureOf(page).getByTestId("text-keyboard-toggle").click();
  if (connected) {
    await page.evaluate(async () => {
      await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect();
    });
    await expect(captureOf(page).getByTestId("keyboard-device")).toBeVisible();
  }
}

async function press(page: Page, notes: readonly number[]): Promise<void> {
  await page.evaluate((values) => (window as typeof window & { __p12Midi: { emit: (notes: number[]) => void } }).__p12Midi.emit([...values]), notes);
}

async function release(page: Page, notes: readonly number[]): Promise<void> {
  await page.evaluate((values) => (window as typeof window & { __p12Midi: { emit: (notes: number[], on?: boolean) => void } }).__p12Midi.emit([...values], false), notes);
}

async function play(page: Page, notes: readonly number[]): Promise<void> {
  await press(page, notes);
  await release(page, notes);
}

const Cmaj7 = [48, 52, 55, 59];
const Am7 = [45, 48, 52, 55];
const Dm7 = [50, 53, 57, 60];
const G7 = [43, 50, 53, 59];

test("1: the button shows the band, the connection state and opens the shared MIDI panel", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = captureOf(page);
  const toggle = capture.getByTestId("text-keyboard-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const band = capture.getByTestId("keyboard-entry-band");
  await expect(band).toContainText("つながっていません");
  // fix-2 item 5: the band no longer prints 「押さえている」 (the keyboard's aria-label still says it).
  await expect(band).not.toContainText("押さえている");
  await expect(band.getByTestId("keyboard-length-bar")).toHaveAttribute("aria-pressed", "true");
  await band.getByTestId("keyboard-connect").click();
  await expect(page.getByTestId("midi-panel")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("2: the keys make one bar, the open bar waits in the preview, and closing fills = ", async ({ page }) => {
  await openKeyboard(page);
  await play(page, Cmaj7);
  await expect(inputOf(page)).toHaveValue("| Cmaj7 |");
  expect(await inputOf(page).evaluate((element: HTMLTextAreaElement) => element.value)).toBe("| Cmaj7 |");
  await expect(captureOf(page).getByTestId("text-preview-band")).toHaveCount(1);
  // The chosen card's row says the sound came from the keys.
  await expect(captureOf(page).getByTestId("text-progression-inspector-row")).toContainText("鍵盤で弾いた音");
  // fix-2 item 1: every card was played on the keys, so the card's small mark stays hidden.
  await expect(captureOf(page).getByTestId("text-preview-band").getByTestId("text-progression-voicing-state")).toHaveCount(0);
  // A 2-beat chord stays in the open bar: faint after the text, a normal card in the preview.
  await captureOf(page).getByTestId("keyboard-length-2").click();
  await play(page, Am7);
  await expect(inputOf(page)).toHaveValue("| Cmaj7 |");
  await expect(captureOf(page).getByTestId("text-pending-bar")).toContainText("Am7");
  await expect(captureOf(page).locator('[data-testid="text-preview-band"][data-pending="true"]')).toHaveCount(1);
  // Turning the entry off fills the rest of the bar with holds.
  await captureOf(page).getByTestId("text-keyboard-toggle").click();
  await expect(inputOf(page)).toHaveValue("| Cmaj7 | Am7 = = = |");
  await expect(captureOf(page).getByTestId("text-pending-bar")).toHaveCount(0);
  await expect(captureOf(page).getByTestId("text-preview-band")).toHaveCount(2);
});

test("3: the lengths are limited by the open bar and 2 拍 is only offered for an even numerator", async ({ page }) => {
  await openKeyboard(page);
  await captureOf(page).getByTestId("keyboard-length-1").click();
  await play(page, Cmaj7);
  await expect(captureOf(page).getByTestId("keyboard-length-bar")).toBeDisabled();
  await expect(captureOf(page).getByTestId("keyboard-length-2")).toBeEnabled();
  await expect(captureOf(page).getByTestId("keyboard-length-1")).toBeEnabled();
  await captureOf(page).getByTestId("keyboard-length-2").click();
  await play(page, Am7);
  await expect(captureOf(page).getByTestId("keyboard-length-2")).toBeDisabled();
  await expect(captureOf(page).getByTestId("keyboard-length-1")).toBeEnabled();
  // A meter change starts the open bar again (its beats were counted in the old meter).
  await chooseTextSetting(captureOf(page), "text-progression-meter", "3/4");
  await expect(captureOf(page).getByTestId("keyboard-length-2")).toHaveCount(0);
  await expect(inputOf(page)).toHaveValue("");
});

test("4: 1 つ戻す takes the last chord back to the open bar, and a manual edit closes it", async ({ page }) => {
  await openKeyboard(page);
  await captureOf(page).getByTestId("keyboard-length-2").click();
  await play(page, Cmaj7);
  await play(page, Am7);
  await expect(inputOf(page)).toHaveValue("| Cmaj7 Am7 |");
  await captureOf(page).getByTestId("keyboard-undo").click();
  await expect(inputOf(page)).toHaveValue("");
  await expect(captureOf(page).getByTestId("text-pending-bar")).toContainText("Cmaj7");
  await captureOf(page).getByTestId("keyboard-undo").click();
  await expect(captureOf(page).getByTestId("keyboard-undo")).toBeDisabled();
  await play(page, Cmaj7);
  await play(page, Am7);
  await expect(inputOf(page)).toHaveValue("| Cmaj7 Am7 |");
  // Ctrl+Z with the editor focused is the textarea's own undo, so the button is what is checked here.
  await inputOf(page).fill("| Cmaj7 Am7 | G7 |");
  await expect(captureOf(page).getByTestId("keyboard-undo")).toBeDisabled();
});

test("5: a long keyboard chart follows the latest, and 最新へ comes back after scrolling away", async ({ page }) => {
  test.setTimeout(120_000);
  await openKeyboard(page);
  const chords = [Cmaj7, Am7, Dm7, G7];
  // 40 bars are enough to overflow both panes at 1440x900 (the text is written 4 bars per line).
  for (let index = 0; index < 40; index += 1) await play(page, chords[index % 4]!);
  const editor = inputOf(page);
  const preview = captureOf(page).getByTestId("standard-text-preview-scroll");
  await expect(editor).toHaveValue(/\| Cmaj7 \|/);
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)).toBeGreaterThan(0);
  expect(await preview.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  // Scrolling up stops the following; the next chord leaves both panes alone and shows 「最新へ」.
  await editor.evaluate((element: HTMLTextAreaElement) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await preview.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await play(page, Cmaj7);
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)).toBe(0);
  await expect(captureOf(page).getByTestId("text-follow-latest-editor")).toBeVisible();
  await expect(captureOf(page).getByTestId("text-follow-latest-preview")).toBeVisible();
  await captureOf(page).getByTestId("text-follow-latest-editor").click();
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)).toBeGreaterThan(0);
  await expect(captureOf(page).getByTestId("text-follow-latest-editor")).toHaveCount(0);
});

test("the photos: the Keys screen at 1440x900 and 1280x800", async ({ page }) => {
  test.setTimeout(300_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await openKeyboard(page);
    await page.screenshot({ path: `p89-generated/P24-06/E-on-${size.width}.png` });
    await press(page, Cmaj7);
    await page.screenshot({ path: `p89-generated/P24-06/E-holding-${size.width}.png` });
    await release(page, Cmaj7);
    // Seventeen bars, with both panes at their end.
    const chords = [Cmaj7, Am7, Dm7, G7];
    for (let index = 1; index < 17; index += 1) await play(page, chords[index % 4]!);
    await page.screenshot({ path: `p89-generated/P24-06/E-long-${size.width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeyboard(page, false);
  await page.screenshot({ path: "p89-generated/P24-06/E-disconnected-1440.png" });
});
