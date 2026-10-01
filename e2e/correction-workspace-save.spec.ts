import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture, openVault } from "./helpers/app";

/** P10.0-06: saving from the correction workspace (spec v2.4 §10.1). */

async function importScenario(page: Page, id: string) {
  await page.addInitScript(() => localStorage.setItem("loop-vault:p10-workspace:v1", "on"));
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.getByTestId("correction-workspace")).toBeVisible();
}

const workspace = (page: Page) => page.getByTestId("correction-workspace");
const saveForm = (page: Page) => workspace(page).getByTestId("correction-save-form");

async function saveNewIdea(page: Page, title: string) {
  await saveForm(page).getByRole("button", { name: /Vaultに保存/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form).toBeVisible();
  await form.locator('input[name="progression-title"]').fill(title);
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
}

test("P10.0-06 a segment band picks the range, saves to the Vault and stays on the workspace", async ({ page }) => {
  await importScenario(page, "plain-8");
  // Correct one card first: add a note to the first card.
  await workspace(page).getByTestId("correction-add-note").click();
  await workspace(page).getByRole("group", { name: "足す音を選ぶ" }).getByRole("button").nth(1).click();

  await workspace(page).getByTestId("correction-segment").first().click();
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("1〜8小節・8枚");
  await expect(saveForm(page)).toContainText("保存すると、外した音は戻せなくなります");
  const names = await saveForm(page).locator(".lv-cw-save-names").textContent();
  await saveNewIdea(page, "P10 作業場から保存");
  await expect(workspace(page)).toBeVisible();
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("保存済み");
  await expect(workspace(page).getByTestId("correction-segment").first()).toContainText("保存済み");

  await openVault(page);
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  await expect(page.getByText("P10 作業場から保存")).toBeVisible();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  const detail = page.locator("[data-progression-detail-view]");
  await expect(detail).toBeVisible();
  // The saved chords are the workspace's names, in order.
  for (const name of (names ?? "").split(/\s+/).filter(Boolean).slice(0, 4)) await expect(detail).toContainText(name);
});

test("P10.0-06 recommended ranges, Shift+click and adding to an existing idea", async ({ page }) => {
  await importScenario(page, "plain-8");
  const recommended = workspace(page).getByTestId("correction-recommended").getByRole("button");
  await expect(recommended.first()).toBeVisible();
  const label = (await recommended.first().locator("b").textContent())!;
  await recommended.first().click();
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText(label);
  await saveNewIdea(page, "おすすめの範囲から");

  // Shift+click: from the selected card to the third one, in whole bars.
  await saveForm(page).getByRole("button", { name: "範囲を外す" }).click();
  const cards = workspace(page).getByTestId("correction-card");
  await cards.nth(0).click();
  await cards.nth(2).click({ modifiers: ["Shift"] });
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("1〜3小節・3枚");
  await expect(cards.nth(4)).toHaveAttribute("data-out-of-range", "true");

  await saveForm(page).getByRole("button", { name: "保存先を選ぶ" }).first().click();
  await page.getByRole("menuitem", { name: /既存Ideaへ追加/ }).click();
  const form = page.locator('form[role="dialog"]');
  await form.locator("select").selectOption({ label: "おすすめの範囲から" });
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
  await openVault(page);
  // One row per progression: both ranges are in the one idea.
  await expect(page.locator(".lv-vault-row")).toHaveCount(2);
  await expect(page.locator(".lv-vault-row").filter({ hasText: "おすすめの範囲から" })).toHaveCount(2);
});

test("P10.0-06 saving with a one-note card shows why and where; leaving with edits asks first", async ({ page }) => {
  await importScenario(page, "plain-8");
  const cards = workspace(page).getByTestId("correction-card");
  await cards.nth(2).click();
  const list = workspace(page).getByTestId("correction-note-list");
  const used = list.getByRole("button", { name: "外す" });
  while (await used.count() > 1) await used.first().click();

  await workspace(page).getByTestId("correction-segment").first().click();
  await saveForm(page).getByRole("button", { name: /Vaultに保存/, exact: true }).click();
  const problems = saveForm(page).getByTestId("correction-save-problems");
  await expect(problems).toContainText("2音以上にしてください：3小節の");
  await expect(page.locator('form[role="dialog"]')).toHaveCount(0);
  await cards.nth(0).click();
  await problems.getByRole("button", { name: "このカードへ" }).click();
  await expect(cards.nth(2)).toHaveAttribute("aria-pressed", "true");

  // Unsaved edits: another MIDI asks first, and Cancel keeps the workspace.
  await workspace(page).getByTestId("correction-another-midi").click();
  const confirm = page.getByRole("dialog", { name: "未保存の変更を破棄しますか？" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(workspace(page)).toBeVisible();
  // Leaving the page asks too.
  await page.locator('[data-nav="vault"]').click();
  await expect(page.getByRole("dialog", { name: "未保存の変更を破棄しますか？" })).toBeVisible();
});
