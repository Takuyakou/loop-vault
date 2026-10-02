import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture, openVault, openRecommendedRanges } from "./helpers/app";

/** P10.0-06: saving from the correction workspace (spec v2.4 §10.1). */

async function importScenario(page: Page, id: string) {
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
  await expect(form.getByTestId("save-progression-note")).toHaveText("保存すると、外した音は戻せなくなります");
  await form.locator('input[name="progression-title"]').fill(title);
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
}

test("P10.0-06 a segment band picks the range, saves to the Vault and stays on the workspace", async ({ page }) => {
  await importScenario(page, "plain-8");
  // Correct one card first: add a note to the first card (nothing is selected on open, P10.1).
  await workspace(page).getByTestId("correction-card").first().click();
  await workspace(page).getByTestId("correction-add-note").click();
  await workspace(page).getByRole("group", { name: "足す音を選ぶ" }).getByRole("button").nth(1).click();

  await workspace(page).getByTestId("correction-segment").first().click();
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("1〜8小節・8枚");
  // P10.2 §10.3: on the save button's title, and in the save dialog.
  await expect(saveForm(page).locator('[title="保存すると、外した音は戻せなくなります"]')).toHaveCount(1);
  const names = await saveForm(page).locator(".lv-cw-save-names").textContent();
  await saveNewIdea(page, "P10 作業場から保存");
  await expect(workspace(page)).toBeVisible();
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText("保存済み");
  await expect(workspace(page).getByTestId("correction-segment").first()).toContainText("保存済み");
  // P10.2 §12: 「最初からやり直す」 keeps the 保存済み marks (they are in the Vault).
  await workspace(page).getByTestId("correction-settings").click();
  await workspace(page).getByTestId("correction-restart").click();
  await page.getByRole("dialog", { name: "最初からやり直しますか？" }).getByRole("button", { name: "最初からやり直す" }).click();
  await expect(workspace(page).getByTestId("correction-edit-count")).toHaveText("直した回数 0");
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
  await openRecommendedRanges(page); // P10.2 addendum 1: closed at first, at the top of the panel
  const recommended = workspace(page).getByTestId("correction-recommended").getByRole("button");
  await expect(recommended.first()).toBeVisible();
  const label = (await recommended.first().locator("b").textContent())!;
  await recommended.first().click();
  await expect(saveForm(page).getByTestId("correction-save-range")).toContainText(label);
  await saveNewIdea(page, "おすすめの範囲から");

  // Shift+click: from the selected card to the third one, in whole bars.
  await workspace(page).getByTestId("correction-range-chip-clear").click(); // P10.3 §3: 範囲を外す is the chip's ×
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

  // Unsaved changes (P10.0-07 text): another MIDI asks first, and 戻る keeps the workspace.
  const edits = Number((await workspace(page).getByTestId("correction-edit-count").locator("b").textContent()) ?? "0");
  await workspace(page).getByTestId("correction-another-midi").click();
  const confirm = page.getByRole("dialog", { name: "保存していない変更があります" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(`この曲で直した内容のうち、${edits} 件をまだ Vault に保存していません。このまま開くと、その変更は消えます。`);
  await expect(confirm.getByRole("button", { name: "保存せずに開く" })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "戻る" })).toBeFocused();
  await confirm.getByRole("button", { name: "戻る" }).click();
  await expect(workspace(page)).toBeVisible();
  // Leaving the page asks too, with 「移る」.
  await page.locator('[data-nav="vault"]').click();
  const leave = page.getByRole("dialog", { name: "保存していない変更があります" });
  await expect(leave).toContainText("このまま移ると、その変更は消えます。");
  await expect(leave).not.toContainText(/破棄|直しがあります/);
  await leave.getByRole("button", { name: "保存せずに移る" }).click();
  await expect(page.locator("#main-content")).toHaveAttribute("aria-label", "Vault");
});

// ---- P10.2 addendum 2: save right after reading the MIDI -------------------------------------

test("P10.2 addendum 2: with no range chosen 「曲全体を保存」 saves the whole song; a range brings the range save back", async ({ page }) => {
  await importScenario(page, "plain-8");
  const range = saveForm(page).getByTestId("correction-save-range");
  await expect(range).toHaveText("曲全体（1〜8小節）");
  await expect(saveForm(page)).not.toContainText("まだ選んでいません");
  await expect(saveForm(page).getByRole("button", { name: "範囲を外す" })).toHaveCount(0); // P10.3 §3: on the chip, only with a range
  await expect(workspace(page).getByTestId("correction-range-chip")).toHaveCount(0);
  const whole = saveForm(page).getByRole("button", { name: /曲全体を保存/ });

  // A range: the range save; the chip's ×: the whole song again.
  await workspace(page).getByTestId("correction-card").nth(1).click({ button: "right" });
  await workspace(page).getByTestId("correction-card").nth(2).click({ button: "right" });
  await expect(range).toContainText("2〜3小節・2枚");
  await expect(saveForm(page).getByRole("button", { name: /Vaultに保存/, exact: true })).toBeVisible();
  await workspace(page).getByTestId("correction-range-chip-clear").click();
  await expect(whole).toBeVisible();

  await whole.click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form.getByTestId("save-progression-note")).toBeVisible();
  await form.locator('input[name="progression-title"]').fill("曲全体の保存");
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
  await expect(range).toContainText("保存済み");
  await openVault(page);
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.locator("[data-progression-card-stage] [data-chord-card]")).toHaveCount(8);
});

test("P10.2 addendum 2: ▾ 「区切りごとに保存…」 lists each set of chords once and saves them into one idea", async ({ page }) => {
  await importScenario(page, "long-64"); // 9 segments, 4 different
  await saveForm(page).getByRole("button", { name: "保存先を選ぶ" }).click();
  const item = page.getByTestId("correction-save-by-section");
  await expect(item).toContainText("区切りごとに保存… 9個・同じものは1つに");
  await item.click();
  const dialog = page.getByRole("dialog", { name: "区切りごとに保存" });
  const rows = dialog.getByTestId("correction-section-row");
  await expect(rows).toHaveCount(4);
  await expect(dialog).toContainText("と同じ");
  await expect(dialog.getByRole("button", { name: "戻る" })).toBeFocused();
  await expect(dialog.getByRole("radio", { name: /新しいアイデア（題名：long-64）/ })).toBeChecked();
  await dialog.getByRole("button", { name: "4個を保存" }).click();
  await expect(dialog).toBeHidden();
  await expect(workspace(page).getByTestId("correction-notice")).toHaveText("4個の進行を保存しました");
  await expect(workspace(page).getByTestId("correction-segment").first()).toContainText("保存済み");

  // Again: all saved, nothing ticked, nothing to save.
  await saveForm(page).getByRole("button", { name: "保存先を選ぶ" }).click();
  await page.getByTestId("correction-save-by-section").click();
  await expect(dialog.getByText("保存済み")).toHaveCount(4);
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "0個を保存" })).toBeDisabled();
  await dialog.getByRole("button", { name: "戻る" }).click();

  await openVault(page);
  await expect(page.locator(".lv-vault-row")).toHaveCount(4);
  await expect(page.locator(".lv-vault-row").filter({ hasText: "long-64" })).toHaveCount(4); // one idea, four progressions
});

test("P10.2 addendum 2: a long song saved whole opens on the progression page and in Voicing Loop, and plays", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await importScenario(page, "long-64"); // 65 bars, 97 chords
  const cards = await workspace(page).locator(".lv-cw-ov-card").count();
  await saveForm(page).getByRole("button", { name: /曲全体を保存/ }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await form.locator('input[name="progression-title"]').fill("長い進行");
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();

  await openVault(page);
  let t0 = Date.now();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  const chordCards = page.locator("[data-progression-card-stage] [data-chord-card]");
  await expect(chordCards).toHaveCount(cards);
  const detailMs = Date.now() - t0;
  await chordCards.last().click(); // plays that chord
  await expect(page.locator("[data-progression-detail-view]")).toBeVisible();

  t0 = Date.now();
  await page.getByTestId("voicing-loop-handoff").click();
  const loop = page.getByTestId("voicing-loop-workspace");
  await expect(loop.getByTestId("voicing-loop-event").first()).toBeVisible();
  const loopMs = Date.now() - t0;
  const events = await loop.getByTestId("voicing-loop-event").count();
  const transport = loop.getByTestId("voicing-loop-transport");
  await transport.getByRole("button", { name: "開始" }).click();
  await expect(transport.getByRole("button", { name: "一時停止" })).toBeVisible();
  await transport.getByRole("button", { name: "一時停止" }).click();
  testInfo.annotations.push({ type: "long-song", description: `cards=${cards} detailMs=${detailMs} voicingLoopMs=${loopMs} voicingLoopEvents=${events}` });
  console.log(`P10.2 addendum 2 long song: cards=${cards} detailMs=${detailMs} voicingLoopMs=${loopMs} voicingLoopEvents=${events}`);
});
