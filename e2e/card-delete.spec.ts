import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P17-01: deleting a card in the MIDI capture, the card menu and the save range. */
async function importScenario(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
}
const workspace = (page: Page) => page.getByTestId("correction-workspace");
const cards = (page: Page) => workspace(page).getByTestId("correction-card");
const menu = (page: Page) => page.getByRole("menu", { name: "カードの操作" });

test("P17-01 capture: Delete with no note selected deletes the card (previous grows), Ctrl+Z restores", async ({ page }) => {
  await importScenario(page, "plain-8");
  await expect(cards(page)).toHaveCount(8);
  await cards(page).nth(1).click();
  await page.keyboard.press("Delete");
  await expect(cards(page)).toHaveCount(7);
  await expect(cards(page).nth(0)).toContainText("8拍");
  await expect(cards(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(workspace(page).locator('.lv-cw-note[data-kind="off"]')).not.toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(cards(page)).toHaveCount(8);
  await expect(workspace(page).locator('.lv-cw-note[data-kind="off"]')).toHaveCount(0);
});

test("P17-01 capture: Delete with notes selected only excludes the notes", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cards(page).nth(2).click();
  await page.keyboard.press("Control+a");
  await expect(workspace(page).getByTestId("correction-selection-clear")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(cards(page)).toHaveCount(8);
  await expect(workspace(page).locator('.lv-cw-note[data-kind="off"]')).not.toHaveCount(0);
});

test("P17-01 capture: the card menu opens with right-click and Shift+F10 and closes with Esc", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cards(page).nth(1).click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /前とつなぐ/ })).toBeEnabled();
  await expect(menu(page).getByRole("menuitem", { name: /消して前を伸ばす/ })).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /^消して詰める/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await cards(page).nth(1).focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
});

test("P17-01 capture: merge and split work from the menu", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cards(page).nth(1).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: /次とつなぐ/ }).click();
  await expect(cards(page)).toHaveCount(7);
  await page.keyboard.press("Control+z");
  await expect(cards(page)).toHaveCount(8);
  await cards(page).nth(1).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: /分ける/ }).click();
  await expect(cards(page)).toHaveCount(9);
});

test("P17-01 save range: the menu starts it; the start card keeps the mark; Esc only closes the menu", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cards(page).nth(1).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "ここから保存する範囲を選ぶ" }).click();
  await expect(cards(page).nth(1)).toHaveAttribute("data-range-from", "true");
  await cards(page).nth(1).click({ button: "right" });
  await expect(menu(page).getByRole("menuitem", { name: "範囲の選択をやめる" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(cards(page).nth(1)).toHaveAttribute("data-range-from", "true");
  await cards(page).nth(1).focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu(page)).toBeVisible();
  await expect(cards(page).nth(1)).toHaveAttribute("data-range-from", "true");
  await page.keyboard.press("Escape");
  await cards(page).nth(3).click({ button: "right" });
  await expect(workspace(page).getByTestId("correction-save-range")).toContainText("2〜4小節");
  await cards(page).nth(5).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "この小節を保存する範囲にする" }).click();
  await expect(workspace(page).getByTestId("correction-save-range")).toContainText("6小節");
  await cards(page).nth(1).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "ここから保存する範囲を選ぶ" }).click();
  await cards(page).nth(1).click();
  await page.keyboard.press("Delete");
  await expect(workspace(page).locator("[data-range-from]")).toHaveCount(0);
});

test("P17-01 notes and cards: clicking another card drops the note selection, then Delete deletes the card", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cards(page).nth(0).click();
  await page.keyboard.press("Control+a");
  await expect(workspace(page).getByTestId("correction-selection-clear")).toBeVisible();
  await cards(page).nth(1).click();
  await expect(workspace(page).getByTestId("correction-selection-clear")).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(cards(page)).toHaveCount(7);
});

test("P17-01 right panel: the delete stays in view with a review row at 1280x720 and 1440x900", async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await importScenario(page, "melody-track-8");
    await workspace(page).locator('[data-testid="correction-card"][data-review]').first().click();
    await expect(workspace(page).getByTestId("correction-review-reason").first()).toBeVisible();
    const summary = workspace(page).locator(".lv-cw-danger-menu > summary");
    await expect(summary).toBeVisible();
    await expect(summary).toBeInViewport({ ratio: 1 });
  }
});

test("P17-01 progression page: the menu offers the four delete modes and deletes as before", async ({ page }) => {
  await openProgression(page);
  const cards = page.getByTestId("correction-card");
  await expect(cards).toHaveCount(8);
  await cards.nth(1).click({ button: "right" });
  await expect(menu(page).getByRole("menuitem", { name: /消して詰める/ })).toBeVisible();
  await expect(menu(page).getByRole("menuitem", { name: /無音（N.C.）にする/ })).toBeVisible();
  await menu(page).getByRole("menuitem", { name: /消して前を伸ばす/ }).click();
  await expect(cards).toHaveCount(7);
});

test("P17-01 notes and cards: the menu delete removes card B without touching the notes that were selected on card A", async ({ page }) => {
  await importScenario(page, "plain-8");
  await cards(page).nth(0).click();
  await page.keyboard.press("Control+a");
  await expect(workspace(page).getByTestId("correction-selection-clear")).toBeVisible();
  const rows = workspace(page).getByTestId("correction-note-list").locator(".lv-cw-nrow[data-used]");
  const before = await rows.count();
  await cards(page).nth(1).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: /消して前を伸ばす/ }).click();
  await expect(cards(page)).toHaveCount(7);
  await expect(cards(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  expect(await rows.count()).toBe(before);
});

test("P17-01 progression page: each menu delete mode matches the right panel's result", async ({ page }) => {
  const labels = () => page.getByTestId("correction-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  for (const name of ["消して前を伸ばす", "消して次を伸ばす", "消して詰める", "無音（N.C.）にする"]) {
    await openProgression(page);
    await page.getByTestId("correction-card").nth(1).click();
    await page.locator(".lv-cw-danger-menu > summary").click();
    await page.locator(".lv-cw-delete-menu").getByRole("button", { name: new RegExp(name) }).click();
    const viaPanel = await labels();

    await openProgression(page);
    await page.getByTestId("correction-card").nth(1).click({ button: "right" });
    await menu(page).getByRole("menuitem", { name: new RegExp(name) }).click();
    const viaMenu = await labels();

    expect(viaMenu, name).toEqual(viaPanel);
  }
});

async function openProgression(page: Page) {
  await page.goto("/?p104=normal");
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").filter({ hasText: "P10.4 合成曲" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("correction-piano-roll")).toBeVisible();
}
