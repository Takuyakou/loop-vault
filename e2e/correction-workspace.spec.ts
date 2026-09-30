import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P10.0-02..05: the correction workspace behind the developer switch. */

async function importScenario(page: Page, id: string, workspace: boolean) {
  if (workspace) await page.addInitScript(() => localStorage.setItem("loop-vault:p10-workspace:v1", "on"));
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
}

async function currentScreenChordNames(page: Page): Promise<string[]> {
  const details = page.locator("details").filter({ has: page.locator('[aria-label="コード進行"]') }).first();
  if (!(await details.getAttribute("open"))) await details.locator("summary").click();
  return details.locator('[aria-label="コード進行"] button strong').allTextContents();
}

test("P10.0-02 the workspace is off by default and the current screen is unchanged", async ({ page }) => {
  await importScenario(page, "melody-track-8", false);
  await expect(page.getByTestId("correction-workspace")).toHaveCount(0);
  await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
});

test("P10.0-02 shows the same cards as the current screen, moves between them and keeps saving on the current screen", async ({ page }) => {
  await importScenario(page, "melody-track-8", true);
  const workspace = page.getByTestId("correction-workspace");
  await expect(workspace).toBeVisible();
  const workspaceNames = await workspace.getByTestId("correction-card").locator(".lv-cw-card-name").evaluateAll((items) => items.map((item) => item.getAttribute("data-full-name") ?? ""));

  // Song-wide suggestion for the melody voice; 閉じる hides it.
  const suggestion = workspace.getByTestId("correction-suggestion");
  await expect(suggestion).toContainText("メロディの Voice（Lead）");
  await suggestion.getByRole("button", { name: "閉じる" }).click();
  await expect(suggestion).toHaveCount(0);

  // ] / [ walk the review cards; ← / → walk all cards; the inspector follows.
  const name = workspace.getByTestId("correction-inspector-name");
  const selectedName = () => workspace.locator('[data-testid="correction-card"][aria-pressed="true"] .lv-cw-card-name').textContent();
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("Escape");
  const first = await name.textContent();
  expect(await selectedName()).toBe(first);
  await page.locator("body").press("ArrowRight");
  await expect(name).not.toHaveText(first ?? "");
  expect(await name.textContent()).toBe(await selectedName());
  await page.locator("body").press("ArrowLeft");
  await expect(name).toHaveText(first ?? "");
  const position = workspace.getByTestId("correction-review-position");
  const total = Number((await position.textContent())!.split("/")[1]!.trim());
  if (total > 1) {
    const before = await position.textContent();
    await page.locator("body").press("]");
    await expect(position).not.toHaveText(before ?? "");
    await page.locator("body").press("[");
    await expect(position).toHaveText(before ?? "");
  }

  // Back to the current screen for this import: same chords, and the save flow is there.
  await workspace.getByTestId("correction-use-current-screen").click();
  await expect(page.getByTestId("correction-workspace")).toHaveCount(0);
  expect(await currentScreenChordNames(page)).toEqual(workspaceNames);
  await expect(page.locator("[data-candidate-toggle]").first()).toBeVisible();
  await page.locator("[data-candidate-toggle]").first().click();
  await expect(page.getByRole("button", { name: /Vaultに保存/, exact: true }).first()).toBeVisible();
});

test("P10.0-02 a long song opens at 16 bars and the page never scrolls sideways at 768x640", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await importScenario(page, "long-64", true);
  const workspace = page.getByTestId("correction-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("button", { name: "16小節", exact: true })).toHaveAttribute("aria-pressed", "true");
  const overflow = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    return Math.max(document.documentElement.scrollWidth - innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
  });
  expect(overflow).toBeLessThanOrEqual(0);
  const scroller = workspace.getByTestId("correction-timeline-scroll");
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  // P10.0-05 draws only the visible beats (plus one view each side), not all 97 cards.
  const drawn = await workspace.getByTestId("correction-card").count();
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(97);
});

// ---- P10.0-03 note editing -------------------------------------------------------------

async function center(locator: ReturnType<Page["locator"]>) {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function rollNote(page: Page, id: string) {
  return page.locator(`[data-testid="correction-piano-roll"] [data-note-id="${id}"]`);
}

async function firstNoteId(page: Page, kind: string): Promise<string> {
  return (await page.locator(`[data-testid="correction-piano-roll"] .lv-cw-note[data-kind="${kind}"]`).first().getAttribute("data-note-id"))!;
}

test("P10.0-03 right-click excludes a note and Ctrl+Z brings it back", async ({ page }) => {
  await importScenario(page, "plain-8", true);
  const workspace = page.getByTestId("correction-workspace");
  const id = await firstNoteId(page, "harmony");
  const point = await center(rollNote(page, id));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "off");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("1");
  await expect(workspace.getByTestId("correction-history")).toContainText("を外した");
  await page.keyboard.press("Control+z");
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "harmony");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("0");
  await page.keyboard.press("Control+y");
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "off");
});

test("P10.0-03 ② adds a note with one click, and a drag moves the pitch in one step", async ({ page }) => {
  await importScenario(page, "plain-8", true);
  const workspace = page.getByTestId("correction-workspace");
  const history = workspace.getByTestId("correction-history");

  // Pitch drag in ①: two rows up, one history entry, the original stays as a ghost.
  const id = await firstNoteId(page, "harmony");
  const start = await center(rollNote(page, id));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) await page.mouse.move(start.x, start.y - step * 3);
  await page.mouse.up();
  await expect(rollNote(page, id)).toHaveAttribute("data-moved", "true");
  await expect(history).toContainText("操作 1");
  await expect(history).toContainText("→");
  await expect(page.locator(".lv-cw-ghost")).toHaveCount(1);

  // ② (N): one click on an empty row inside the selected card adds a MANUAL_ADDED note.
  await page.keyboard.press("n");
  await expect(workspace).toHaveAttribute("data-mode", "edit");
  const cardBox = await center(page.locator(".lv-cw-window"));
  const target = await page.evaluate(({ x, y }) => {
    const roll = document.querySelector('[data-testid="correction-piano-roll"]')!.getBoundingClientRect();
    for (let row = roll.top + 3; row < Math.min(roll.bottom, innerHeight) - 3; row += 6) {
      const blocked = document.elementsFromPoint(x, row).some((element) => element.closest("[data-note-id],[data-melody-line]"));
      if (!blocked && Math.abs(row - y) < 400) return row;
    }
    return undefined;
  }, cardBox);
  expect(target).toBeDefined();
  await page.mouse.click(cardBox.x, target!);
  await expect(page.locator('[data-testid="correction-piano-roll"] .lv-cw-note[data-kind="manual"]')).toHaveCount(1);
  await expect(history).toContainText("操作 2");
  await expect(history).toContainText("を足した");
  await expect(workspace.getByTestId("correction-note-list")).toContainText("手動で足した音");
  await page.keyboard.press("Enter");
  await expect(workspace).toHaveAttribute("data-mode", "check");
});

test("P10.0-03 the melody suggestion selects every melody-voice note and Delete excludes them at once", async ({ page }) => {
  await importScenario(page, "melody-track-8", true);
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-select-melody").click();
  expect(await page.locator("[data-testid=correction-piano-roll] .lv-cw-note[data-selected]").count()).toBeGreaterThan(1);
  await page.keyboard.press("Delete");
  await expect(workspace.getByTestId("correction-suggestion")).toHaveCount(0);
  await expect(workspace.getByTestId("correction-history")).toContainText("操作 1");
  await page.keyboard.press("Control+z");
  await expect(workspace.getByTestId("correction-suggestion")).toBeVisible();
});

test("P10.0-03 「＋ 音を足す」 and keyboard-only exclude and restore", async ({ page }) => {
  await importScenario(page, "plain-8", true);
  const workspace = page.getByTestId("correction-workspace");
  const list = workspace.getByTestId("correction-note-list");
  const history = workspace.getByTestId("correction-history");
  const rows = await list.locator("li").count();
  await workspace.getByTestId("correction-add-note").click();
  await workspace.getByRole("group", { name: "足す音を選ぶ" }).getByRole("button").nth(1).click();
  await expect(list.locator("li")).toHaveCount(rows + 1);
  await expect(list).toContainText("手動で足した音");
  await expect(history).toContainText("操作 1");

  // Keyboard only: → next card, Ctrl+A, Delete, R, Ctrl+Z.
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(list.getByRole("button", { name: "外す" })).toHaveCount(0);
  await expect(workspace.getByTestId("correction-inspector")).toContainText("2音以上にしてください");
  await expect(history).toContainText("操作 2");
  await page.keyboard.press("r");
  await expect(list.getByRole("button", { name: "戻す" })).toHaveCount(0);
  await expect(history).toContainText("操作 3");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(list.getByRole("button", { name: "戻す" })).toHaveCount(0);
  await expect(history).toContainText("操作 1");
});
