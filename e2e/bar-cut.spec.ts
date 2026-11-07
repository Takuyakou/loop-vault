import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture, openRecommendedRanges, openVault } from "./helpers/app";

/** P17-02: 「小節を消して詰める」 in the MIDI capture. */

async function importScenario(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
}

const workspace = (page: Page) => page.getByTestId("correction-workspace");
const cards = (page: Page) => workspace(page).getByTestId("correction-card");
const saveForm = (page: Page) => workspace(page).getByTestId("correction-save-form");
const barNumber = (page: Page, bar: number) => workspace(page).getByTestId("correction-ruler").locator(".lv-cw-bar-no").filter({ hasText: new RegExp(`^${bar}$`) });

async function cutBarFromRuler(page: Page, bar: number) {
  await barNumber(page, bar).click({ button: "right" });
  const item = page.getByTestId("correction-bar-cut");
  await expect(item).toBeVisible();
  await item.click();
}

async function saveNewIdea(page: Page, title: string) {
  await saveForm(page).getByRole("button", { name: /Vaultに保存|曲全体を保存/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form).toBeVisible();
  await form.locator('input[name="progression-title"]').fill(title);
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
}

test("P17-02 bar row: right-click removes the bar, closes the gap, and Ctrl+Z restores", async ({ page }) => {
  await importScenario(page, "plain-8");
  await expect(cards(page)).toHaveCount(8);
  await barNumber(page, 2).click({ button: "right" });
  const item = page.getByTestId("correction-bar-cut");
  await expect(item).toBeVisible();
  await expect(item).toContainText("2小節を消して詰める");
  await expect(item).toContainText("後ろを前に詰める");
  await item.click();

  await expect(cards(page)).toHaveCount(7);
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("1〜7小節");
  await expect(workspace(page).getByTestId("correction-edit-count")).toContainText("1");
  // The card that was on bar 3 now sits on bar 2.
  await expect(cards(page).nth(1)).toHaveAttribute("aria-label", /^2小節1拍/);
  await expect(workspace(page).getByTestId("correction-position")).toContainText("7小節");

  await page.keyboard.press("Control+z");
  await expect(cards(page)).toHaveCount(8);
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("1〜8小節");
  await expect(cards(page).nth(1)).toHaveAttribute("aria-label", /^2小節1拍/);
  await expect(cards(page).nth(2)).toHaveAttribute("aria-label", /^3小節1拍/);
});

test("P17-02 bar row: the last bar cannot be removed", async ({ page }) => {
  await importScenario(page, "plain-8");
  await barNumber(page, 8).click({ button: "right" });
  const item = page.getByTestId("correction-bar-cut");
  await expect(item).toBeVisible();
  await expect(item).toBeDisabled();
  await expect(item).toContainText("最後の1小節は消せません");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("correction-bar-cut")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(8);
});

test("P17-02 card menu: a two-bar card removes both of its bars and closes the gap", async ({ page }) => {
  await importScenario(page, "stabs-8");
  await expect(cards(page)).toHaveCount(4);
  await cards(page).nth(0).click({ button: "right" });
  const item = page.getByRole("menuitem", { name: /1〜2小節を消して詰める/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(cards(page)).toHaveCount(3);
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("1〜6小節");
  await expect(cards(page).nth(0)).toHaveAttribute("aria-label", /^1小節1拍/);
});

test("P17-02 saving: a range that crosses the cut says so; a range after it does not", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cutBarFromRuler(page, 2);
  // The whole song (bars 1–7) crosses the cut.
  await expect(saveForm(page).getByTestId("correction-save-source-note")).toBeVisible();
  await expect(saveForm(page).getByTestId("correction-save-source-note")).toContainText("元の MIDI の位置は残りません");

  // Bars 3–7 are all after the cut, so the original position is kept.
  await cards(page).nth(2).click();
  await cards(page).nth(6).click({ modifiers: ["Shift"] });
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("3〜7小節");
  await expect(saveForm(page).getByTestId("correction-save-source-note")).toHaveCount(0);
  const names = (await saveForm(page).locator(".lv-cw-save-names").textContent()) ?? "";

  await workspace(page).getByTestId("correction-range-chip-clear").click();
  await expect(saveForm(page).getByTestId("correction-save-source-note")).toBeVisible();
  await saveNewIdea(page, "P17-02 詰めた進行");
  await openVault(page);
  const row = page.locator(".lv-vault-row").filter({ hasText: "P17-02 詰めた進行" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail).toBeVisible();
  for (const name of names.split(/\s+/).filter(Boolean).slice(0, 4)) await expect(detail).toContainText(name);
});

test("P17-02 recommended ranges: they move with the cut, and the ones touching it are not offered", async ({ page }) => {
  await importScenario(page, "plain-8");
  await openRecommendedRanges(page);
  const list = workspace(page).getByTestId("correction-recommended");
  await expect(list).toContainText("1〜4小節");
  await cutBarFromRuler(page, 2);
  await expect(list).toContainText("2〜5小節");
  await expect(list).toContainText("5〜6小節");
  await expect(list).not.toContainText("1〜4小節");
  await expect(list).not.toContainText("6〜7小節");
});

 test("P17-02 after a cut: the song still plays from the start over the remaining bars", async ({ page }) => {
   await importScenario(page, "plain-8");
   await cutBarFromRuler(page, 2);
   await expect(workspace(page).getByTestId("correction-position")).toContainText("7小節");
   await workspace(page).getByTestId("correction-play-song").click();
   await expect(workspace(page).getByTestId("correction-play-song")).toHaveAttribute("aria-pressed", "true");
   await page.waitForTimeout(250);
   await workspace(page).getByTestId("correction-play-song").click();
   // Stopping the song takes a moment with the sound clock; wait until the pressed state is left instead of a
   // one-shot read (under load it read "true" once right after the second click).
   await expect.poll(async () => workspace(page).getByTestId("correction-play-song").getAttribute("aria-pressed"), { timeout: 15_000, message: "the playback leaves the pressed state after the stop click" }).toBe("false");
   await expect(workspace(page).getByTestId("correction-notice")).not.toContainText("失敗");
 });
