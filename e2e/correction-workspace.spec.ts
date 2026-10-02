import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P10.0-02..06: the correction workspace, the default screen after a MIDI analysis since P10.0-06. */

/** P10.2 §1: 「押して鳴らす」 and 「凡例を出す」 live in the ⚙ menu. */
async function openSettings(page: Page) {
  const menu = page.getByTestId("correction-settings-menu");
  if (!(await menu.isVisible())) await page.getByTestId("correction-settings").click();
  await expect(menu).toBeVisible();
}

/** P10.2 §1: 「操作 n」 is gone; the count is 「直した回数」, the last operation is in ↶'s name. */
const editCount = (page: Page, n: number) => expect(page.getByTestId("correction-edit-count")).toHaveText(`直した回数 ${n}`);
const lastEdit = (page: Page, text: string | RegExp) => expect(page.getByTestId("correction-undo")).toHaveAttribute("aria-label", typeof text === "string" ? new RegExp(`^元に戻す：.*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : text);

/** P10.1 §2: the workspace opens with no card selected. */
async function selectCard(page: Page, index: number) {
  await page.getByTestId("correction-workspace").getByTestId("correction-card").nth(index).click();
}

async function importScenario(page: Page, id: string) {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, buildScenarioMidi(p10Scenario(id)), `${id}.mid`);
  await expect(page.locator('[data-capture-stage="pre-analysis"]')).toBeVisible();
  await page.getByTestId("pre-analysis-analyze").click();
  await expect(page.locator('[data-capture-stage="result"]')).toBeVisible();
}

test("P10.0-02 shows the analysis cards and moves between them", async ({ page }) => {
  await importScenario(page, "melody-track-8");
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
  const selectedName = () => workspace.locator('[data-testid="correction-card"][aria-pressed="true"] .lv-cw-card-name').getAttribute("data-full-name");
  await selectCard(page, 0);
  await workspace.getByTestId("correction-review-count").focus();
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
    await workspace.getByTestId("correction-review-count").click(); // start on the first review card
    const before = await position.textContent();
    await page.locator("body").press("]");
    await expect(position).not.toHaveText(before ?? "");
    await page.locator("body").press("[");
    await expect(position).toHaveText(before ?? "");
  }

  // The cards are the analysis's chords in order (the old screen to compare with went in P10.0-07).
  expect(workspaceNames.length).toBeGreaterThan(0);
  expect(workspaceNames.every((name) => name.length > 0)).toBe(true);
});

test("P10.0-02 a long song opens at 16 bars and the page never scrolls sideways at 768x640", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await importScenario(page, "long-64");
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
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const id = await firstNoteId(page, "harmony");
  const point = await center(rollNote(page, id));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "off");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("1");
  await lastEdit(page, "を外した");
  await page.keyboard.press("Control+z");
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "harmony");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("0");
  await page.keyboard.press("Control+y");
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "off");
});

test("P10.0-03 ② adds a note with one click, and a drag moves the pitch in one step", async ({ page }) => {
  await importScenario(page, "plain-8");
  // P10.1: nothing is selected when the workspace opens; pick the first card.
  await selectCard(page, 0);
  const workspace = page.getByTestId("correction-workspace");

  // Pitch drag in ①: two rows up, one history entry, the original stays as a ghost.
  const id = await firstNoteId(page, "harmony");
  const start = await center(rollNote(page, id));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) await page.mouse.move(start.x, start.y - step * 3);
  await page.mouse.up();
  await expect(rollNote(page, id)).toHaveAttribute("data-moved", "true");
  await editCount(page, 1);
  await lastEdit(page, "→");
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
  await editCount(page, 2);
  await lastEdit(page, "を足した");
  await expect(workspace.getByTestId("correction-note-list")).toContainText("手動で足した音");
  await page.keyboard.press("Enter");
  await expect(workspace).toHaveAttribute("data-mode", "check");
});

test("P10.0-03 the melody suggestion selects every melody-voice note and Delete excludes them at once", async ({ page }) => {
  await importScenario(page, "melody-track-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-select-melody").click();
  expect(await page.locator("[data-testid=correction-piano-roll] .lv-cw-note[data-selected]").count()).toBeGreaterThan(1);
  await page.keyboard.press("Delete");
  // The melody suggestion goes; neighbours that now sound the same bring the next one (spec 6.5).
  const melody = workspace.locator('[data-testid="correction-suggestion"][data-kind="melody-voice"]');
  await expect(melody).toHaveCount(0);
  await editCount(page, 1);
  await page.keyboard.press("Control+z");
  await expect(melody).toBeVisible();
});

test("P10.0-03 「＋ 音を足す」 and keyboard-only exclude and restore", async ({ page }) => {
  await importScenario(page, "plain-8");
  // P10.1: nothing is selected when the workspace opens; pick the first card.
  await selectCard(page, 0);
  const workspace = page.getByTestId("correction-workspace");
  const list = workspace.getByTestId("correction-note-list");
  const rows = await list.locator("li").count();
  await workspace.getByTestId("correction-add-note").click();
  await workspace.getByRole("group", { name: "足す音を選ぶ" }).getByRole("button").nth(1).click();
  await expect(list.locator("li")).toHaveCount(rows + 1);
  await expect(list).toContainText("手動で足した音");
  await editCount(page, 1);

  // Keyboard only: → next card, Ctrl+A, Delete, R, Ctrl+Z.
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(list.getByRole("button", { name: "外す" })).toHaveCount(0);
  await expect(workspace.getByTestId("correction-inspector")).toContainText("2音以上にしてください");
  await editCount(page, 2);
  await page.keyboard.press("r");
  await expect(list.getByRole("button", { name: "戻す" })).toHaveCount(0);
  await editCount(page, 3);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(list.getByRole("button", { name: "戻す" })).toHaveCount(0);
  await editCount(page, 1);
});

// ---- P10.0-04 card editing -------------------------------------------------------------

const cards = (page: Page) => page.getByTestId("correction-workspace").getByTestId("correction-card");

test("P10.0-04 M merges with ×2 and Ctrl+Z undoes it; S splits; Shift+M asks first (Esc / Enter)", async ({ page }) => {
  await importScenario(page, "plain-8");
  // P10.1: nothing is selected when the workspace opens; pick the first card.
  await selectCard(page, 0);
  const workspace = page.getByTestId("correction-workspace");
  await expect(cards(page)).toHaveCount(8);
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("m");
  await expect(cards(page)).toHaveCount(7);
  await expect(cards(page).first().locator(".lv-cw-x")).toHaveText("×2");
  await lastEdit(page, "と次をつないだ");
  await page.keyboard.press("Control+z");
  await expect(cards(page)).toHaveCount(8);

  await page.keyboard.press("s");
  await expect(cards(page)).toHaveCount(9);
  await expect(cards(page).first()).toContainText("2拍");
  // The two halves play the same notes: Shift+M lists 1 place; Esc cancels, Enter merges.
  await page.keyboard.press("Shift+M");
  const dialog = page.getByRole("dialog", { name: "同じ音が続く所をつなぐ" });
  await expect(dialog).toContainText("1 か所つなぎます");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(cards(page)).toHaveCount(9);
  await page.keyboard.press("Shift+M");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(cards(page)).toHaveCount(8);
  await editCount(page, 2);
});

test("P10.0-04 boundary handle moves by a beat, and by ¼ beat with Alt", async ({ page }) => {
  await importScenario(page, "plain-8");
  const first = cards(page).first();
  const box = (await first.boundingBox())!;
  const beatPx = (box.width + 2) / 4;
  const handle = page.getByTestId("correction-boundary").first();
  const start = await (async () => { await handle.scrollIntoViewIfNeeded(); const h = (await handle.boundingBox())!; return { x: h.x + h.width / 2, y: h.y + h.height / 2 }; })();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 5; step += 1) await page.mouse.move(start.x - (beatPx * step) / 5, start.y);
  await page.mouse.up();
  await expect(first).toContainText("3拍");
  await lastEdit(page, "境目を 1.4 へ");

  const moved = (await page.getByTestId("correction-boundary").first().boundingBox())!;
  const from = { x: moved.x + moved.width / 2, y: moved.y + moved.height / 2 };
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) await page.mouse.move(from.x - (beatPx * 0.25 * step) / 4, from.y);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(first).toContainText("2.75拍");
  await editCount(page, 2);
});

test("P10.0-04 names: 1–4 picks a candidate, F2 types one", async ({ page }) => {
  await importScenario(page, "plain-8");
  // P10.1: nothing is selected when the workspace opens; pick the first card.
  await selectCard(page, 0);
  const workspace = page.getByTestId("correction-workspace");
  const inspector = workspace.getByTestId("correction-inspector");
  const candidates = workspace.getByTestId("correction-name-candidates").getByRole("button");
  const second = (await candidates.nth(1).locator(".lv-cw-alt-name").textContent())!;
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("2");
  await expect(workspace.getByTestId("correction-inspector-name")).toHaveText(second);
  await expect(inspector).toContainText("候補から選んだ名前（音を直すと自動に戻る）"); // P10.1 §11: chosen
  // Bar 5 plays the same notes under the old name: offer the same fix, confirm, one step.
  await workspace.getByTestId("correction-same-fix").click();
  await page.getByRole("dialog", { name: "同じ直しを他にも反映" }).getByRole("button", { name: /反映する/ }).click();
  await expect(cards(page).nth(4).locator(".lv-cw-card-name")).toHaveAttribute("data-full-name", second);
  await editCount(page, 2);

  await page.keyboard.press("F2");
  const editor = page.locator("[data-quick-chord-editor]");
  await expect(editor).toBeVisible();
  await editor.press("ArrowRight");
  await editor.press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(workspace.getByTestId("correction-inspector-name")).not.toHaveText(second);
  await editCount(page, 3);
});

test("P10.0-04 Y moves to the next review card; the run suggestion merges after a confirm", async ({ page }) => {
  await importScenario(page, "melody-track-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-suggestion").getByRole("button", { name: "閉じる" }).click();
  const count = workspace.getByTestId("correction-review-count");
  const before = Number(await count.locator("b").textContent());
  const selected = () => workspace.locator('[data-testid="correction-card"][aria-pressed="true"]').getAttribute("data-card-id");
  await count.click(); // P10.1: nothing is selected on open; the count walks to the first review card
  const firstId = await selected();
  await page.keyboard.press("y");
  await expect(count.locator("b")).toHaveText(String(before - 1));
  expect(await selected()).not.toBe(firstId);

  // plain-8: split, then touch a note of the second half → 「同じ音が続く所が 1 か所」.
  await importScenario(page, "plain-8");
  await selectCard(page, 0);
  await page.getByTestId("correction-review-count").focus();
  await page.keyboard.press("s");
  await page.keyboard.press("ArrowRight");
  const list = page.getByTestId("correction-note-list");
  await list.getByRole("button", { name: "外す" }).first().click();
  await list.getByRole("button", { name: "戻す" }).first().click();
  const suggestion = page.getByTestId("correction-suggestion");
  await expect(suggestion).toContainText("同じ音が続く所が 1 か所");
  await suggestion.getByTestId("correction-confirm-runs").click();
  await page.getByRole("dialog", { name: "同じ音が続く所をつなぐ" }).getByRole("button", { name: /つなぐ/ }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(suggestion).toHaveCount(0);
});

// ---- P10.0-05 long songs and narrow screens --------------------------------------------

/** Median ms from an action to two painted frames, over five runs. */
async function timeIt(page: Page, action: "scroll" | "right" | "zoom" | "end"): Promise<number> {
  return page.evaluate(async (kind) => {
    const scroller = document.querySelector<HTMLElement>('[data-testid="correction-timeline-scroll"]')!;
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const zoomButtons = [...document.querySelectorAll<HTMLButtonElement>(".lv-cw-bar button")].filter((button) => ["16小節", "4小節"].includes(button.getAttribute("aria-label") ?? ""));
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const t0 = performance.now();
      if (kind === "scroll") scroller.scrollLeft += scroller.clientWidth;
      else if (kind === "right") window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      else if (kind === "end") window.dispatchEvent(new KeyboardEvent("keydown", { key: run % 2 ? "Home" : "End", bubbles: true }));
      else zoomButtons[run % 2 === 0 ? 1 : 0]!.click();
      await frames();
      runs.push(performance.now() - t0);
    }
    return runs.sort((a, b) => a - b)[2]!;
  }, action);
}

for (const id of ["long-300", "long-300-5k"]) {
  test(`P10.0-05 ${id}: scrolling, → , zoom and End stay quick and draw only the visible part`, async ({ page }) => {
    test.setTimeout(120_000);
    const started = Date.now();
    await importScenario(page, id);
    const workspace = page.getByTestId("correction-workspace");
    await expect(workspace).toBeVisible();
    const openMs = Date.now() - started;
    await workspace.getByTestId("correction-review-count").focus();
    const dom = await workspace.evaluate((element) => element.querySelectorAll("*").length);
    const notes = await workspace.locator(".lv-cw-note").count();
    const scroll = await timeIt(page, "scroll");
    const right = await timeIt(page, "right");
    const zoom = await timeIt(page, "zoom");
    const end = await timeIt(page, "end");
    console.log(`P10.0-05 perf ${id}: open ${openMs}ms, DOM ${dom}, drawn notes ${notes}, scroll ${scroll.toFixed(1)}ms, → ${right.toFixed(1)}ms, zoom ${zoom.toFixed(1)}ms, Home/End ${end.toFixed(1)}ms`);
    test.info().annotations.push({ type: "perf", description: `${id} DOM=${dom} notes=${notes} scroll=${scroll.toFixed(1)} right=${right.toFixed(1)} zoom=${zoom.toFixed(1)} end=${end.toFixed(1)}` });
    expect(dom).toBeLessThan(3000);
    for (const ms of [scroll, right, zoom, end]) expect(ms).toBeLessThan(500);
    // End reaches the last card and shows it.
    await page.keyboard.press("End");
    const last = workspace.locator('[data-testid="correction-card"][aria-pressed="true"]');
    await expect(last).toBeVisible();
    await expect(last).toBeInViewport();
  });
}

test("P10.0-05 Ctrl+wheel keeps the beat under the pointer; the wheel scrolls sideways and stops following", async ({ page }) => {
  await importScenario(page, "long-64");
  const workspace = page.getByTestId("correction-workspace");
  const scroller = workspace.getByTestId("correction-timeline-scroll");
  await scroller.scrollIntoViewIfNeeded();
  const box = (await scroller.boundingBox())!;
  const pointer = { x: box.x + box.width * 0.6, y: box.y + 60 };
  const beatAt = () => scroller.evaluate((element, x) => {
    const px = Number.parseFloat(getComputedStyle(element.firstElementChild!).getPropertyValue("--lv-cw-beat"));
    return (element.scrollLeft + x - element.getBoundingClientRect().left) / px;
  }, pointer.x);
  await scroller.evaluate((element) => { element.scrollLeft = 400; });
  const before = await beatAt();
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(workspace.getByRole("button", { name: "16小節", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(beatAt).toBeGreaterThan(before - 0.5);
  expect(Math.abs((await beatAt()) - before)).toBeLessThan(0.5);

  // Plain wheel: sideways.
  const left = await scroller.evaluate((element) => element.scrollLeft);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(left);

  // While the song plays, a wheel turns following off.
  const followButton = workspace.getByRole("button", { name: "追従", exact: true });
  await expect(followButton).toHaveAttribute("aria-pressed", "true");
  await workspace.getByTestId("correction-play-song").click();
  await expect(workspace.getByTestId("correction-play-song")).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, 200);
  await expect(followButton).toHaveAttribute("aria-pressed", "false");
  await workspace.getByTestId("correction-play-song").click();
});

test("P10.0-05 at 768x640 the roll shows 160px or more and the closed panel is one line below it", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await importScenario(page, "long-64");
  const workspace = page.getByTestId("correction-workspace");
  const roll = workspace.getByTestId("correction-piano-roll");
  await roll.scrollIntoViewIfNeeded();
  const visible = await roll.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
  });
  expect(visible).toBeGreaterThanOrEqual(160);
  // A name that does not fit shows only its root: no drawn name is clipped (spec 6.2).
  const clipped = await workspace.locator(".lv-cw-card-name").evaluateAll((items) => items
    .filter((item) => item.textContent && item.scrollWidth > item.clientWidth + 1)
    .map((item) => `${item.textContent}/${item.getAttribute("data-full-name")}`));
  expect(clipped).toEqual([]);
  const toggle = workspace.getByTestId("correction-panel-toggle");
  const rollBox = (await roll.boundingBox())!;
  const toggleBox = (await toggle.boundingBox())!;
  expect(toggleBox.y).toBeGreaterThanOrEqual(rollBox.y + rollBox.height);
  expect(toggleBox.height).toBeLessThan(60);
  // Opened: a sheet from the bottom, at most 60% of the window.
  await selectCard(page, 0);
  await toggle.click();
  const panel = workspace.locator(".lv-cw-insp");
  await expect(workspace.getByTestId("correction-inspector")).toBeVisible();
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.height).toBeLessThanOrEqual(640 * 0.6 + 1);
  expect(Math.round(panelBox.y + panelBox.height)).toBe(640);
  const overflow = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    return Math.max(document.documentElement.scrollWidth - innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

// ---- P10.0-06 small layout fixes ------------------------------------------------------

test("P10.0-06 root letters from 14px, segment names stay in view, one row per pitch, file bar on one line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importScenario(page, "long-64");
  const workspace = page.getByTestId("correction-workspace");
  const fileBar = workspace.locator(".lv-cw-file");
  expect((await fileBar.boundingBox())!.height).toBeLessThan(56);

  // One row per pitch in 「鳴らす音」.
  const pitches = await workspace.getByTestId("correction-note-list").locator(".lv-cw-nrow-pitch").allTextContents();
  expect(new Set(pitches).size).toBe(pitches.length);

  // Zoomed in and scrolled into the first segment: its name is still on screen.
  await workspace.getByRole("button", { name: "4小節", exact: true }).click();
  const scroller = workspace.getByTestId("correction-timeline-scroll");
  await scroller.evaluate((element) => { element.scrollLeft = element.clientWidth * 1.2; });
  const name = workspace.getByTestId("correction-segment").first().locator(".lv-cw-segment-name");
  await expect.poll(async () => (await name.boundingBox())!.x).toBeGreaterThanOrEqual((await scroller.boundingBox())!.x - 1);

  // 768: cards at least 22px wide always show something (a root letter at the least).
  await page.setViewportSize({ width: 768, height: 640 });
  await workspace.getByRole("button", { name: "16小節", exact: true }).click();
  const empty = await workspace.getByTestId("correction-card").evaluateAll((cards) => cards
    .filter((card) => card.getBoundingClientRect().width >= 22 && !card.querySelector(".lv-cw-card-name")?.textContent)
    .length);
  expect(empty).toBe(0);
});

// ---- P10.0-07 fixes from the EXE check -------------------------------------------------

test("P10.1 「押して鳴らす」: on by default, a plain click plays the card, Shift+click does not, and off is remembered", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const cards = workspace.getByTestId("correction-card");
  const playingB = workspace.getByTestId("correction-play-card");
  const toggle = workspace.getByTestId("correction-click-audition");
  await openSettings(page);
  await expect(toggle).toBeChecked();
  await cards.nth(2).click();
  await expect(playingB).toHaveAttribute("aria-pressed", "true");
  await cards.nth(4).click({ modifiers: ["Shift"] });
  await expect(cards.nth(4)).toHaveAttribute("aria-pressed", "true");
  await expect(playingB).toHaveAttribute("aria-pressed", "false");

  // Off is remembered, and then a click only selects.
  await openSettings(page);
  await toggle.uncheck();
  await page.reload();
  await importScenario(page, "plain-8");
  await openSettings(page);
  await expect(page.getByTestId("correction-click-audition")).not.toBeChecked();
  await page.getByTestId("correction-card").nth(1).click();
  await expect(page.getByTestId("correction-play-card")).toHaveAttribute("aria-pressed", "false");
});

test("P10.0-07 the playhead moves every frame while the song plays", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-play-song").click();
  const playhead = workspace.getByTestId("correction-playhead");
  await expect(playhead).toBeAttached({ timeout: 10_000 });
  const distinct = await playhead.evaluate((element) => new Promise<number>((resolve) => {
    const seen = new Set<string>();
    const until = performance.now() + 500;
    const sample = () => {
      seen.add((element as HTMLElement).style.transform);
      if (performance.now() < until) requestAnimationFrame(sample);
      else resolve(seen.size);
    };
    requestAnimationFrame(sample);
  }));
  expect(distinct).toBeGreaterThanOrEqual(20);
  await workspace.getByTestId("correction-play-song").click();
});

test("P10.0-07 元に戻す in the right panel, and no 「印はありません」 while a card has a warning", async ({ page }) => {
  await importScenario(page, "plain-8");
  // P10.1: nothing is selected when the workspace opens; pick the first card.
  await selectCard(page, 0);
  const workspace = page.getByTestId("correction-workspace");
  const undoButton = workspace.getByTestId("correction-inspector-undo");
  await expect(undoButton).toBeDisabled();
  const list = workspace.getByTestId("correction-note-list");
  while (await list.getByRole("button", { name: "外す" }).count() > 1) await list.getByRole("button", { name: "外す" }).first().click();
  const inspector = workspace.getByTestId("correction-inspector");
  await expect(inspector).toContainText("2音以上にしてください");
  await expect(inspector).not.toContainText("このカードに要確認の印はありません");
  const before = await workspace.getByTestId("correction-undo").getAttribute("aria-label");
  await undoButton.click();
  await expect(workspace.getByTestId("correction-undo")).not.toHaveAttribute("aria-label", before ?? "");
});

// ---- P10.1 layout and playback --------------------------------------------------------

test("P10.1 the control bar is on top, then 曲全体・小節・区切り・コード・ピアノロール; no bottom play row", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const top = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!.y;
  const order = [
    await top(workspace.getByTestId("correction-control-bar")),
    await top(workspace.getByTestId("correction-overview")),
    await top(workspace.locator(".lv-cw-ruler")),
    await top(workspace.locator(".lv-cw-segments")),
    await top(workspace.locator(".lv-cw-cards")),
    await top(workspace.getByTestId("correction-piano-roll")),
  ];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(workspace.locator(".lv-cw-transport, .lv-cw-tools")).toHaveCount(0);
  // 再生 and 表示 always share the first line of the bar.
  const playY = (await workspace.getByRole("group", { name: "再生" }).boundingBox())!.y;
  const viewY = (await workspace.getByRole("group", { name: "表示" }).boundingBox())!.y;
  expect(Math.abs(playY - viewY)).toBeLessThan(4);
  // 8 bars sits between 16 and 4.
  const zooms = await workspace.getByRole("group", { name: "表示" }).getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(zooms).toEqual(["全体", "16小節", "8小節", "4小節"]);
  await workspace.getByRole("button", { name: "8小節", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "8小節", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("P10.1 plays from the selected card or from the start; following turns on with every play", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const play = workspace.getByTestId("correction-play-song");
  const position = workspace.getByTestId("correction-position");
  const follow = workspace.getByTestId("correction-follow");

  // Nothing selected on open: from the start.
  await expect(workspace.getByTestId("correction-inspector-empty")).toContainText("カードを押すと、ここに音と名前が出ます。");
  await expect(position).toHaveText("1.1 から ／ 8小節");
  await expect(play).toHaveAttribute("aria-label", "1.1 から再生（Space）"); // P10.2 §3: the first card in view
  await play.click();
  const tag = workspace.locator(".lv-cw-playline-tag");
  await expect(tag).toHaveText(/^1\.\d/);
  await expect(position).toHaveText(/^1\.\d ／ 8小節$/);
  await play.click();

  // A card selected: from that card; following was turned off by hand and comes back on.
  await workspace.getByTestId("correction-card").nth(3).click();
  await expect(position).toHaveText("4.1 から ／ 8小節");
  await expect(play).toHaveAttribute("aria-label", "4.1 から再生（Space）");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await play.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(tag).toHaveText(/^4\.\d/);
  await play.click();

  // ① an empty click (no notes selected) clears the card: back to the start.
  const roll = workspace.getByTestId("correction-piano-roll");
  const box = (await roll.boundingBox())!;
  const empty = await page.evaluate(({ x, top, bottom }) => {
    for (let y = top + 3; y < bottom - 3; y += 6) {
      if (!document.elementsFromPoint(x, y).some((element) => element.closest("[data-note-id]"))) return y;
    }
    return undefined;
  }, { x: box.x + box.width - 8, top: box.y, bottom: Math.min(box.y + box.height, 900) });
  await page.mouse.click(box.x + box.width - 8, empty!);
  await expect(workspace.locator('[data-testid="correction-card"][aria-pressed="true"]')).toHaveCount(0);
  await expect(position).toHaveText("1.1 から ／ 8小節");
});

// ---- P10.1 keys and selection ----------------------------------------------------------

test("P10.1 Space plays and stops after any button or checkbox, without pressing it; text keeps its spaces", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const play = workspace.getByTestId("correction-play-song");
  const zoom16 = workspace.getByRole("button", { name: "16小節", exact: true });
  await workspace.getByRole("button", { name: "全体", exact: true }).click();
  await zoom16.click();
  await workspace.getByRole("button", { name: "全体", exact: true }).click(); // focus stays on 全体
  await page.keyboard.press("Space");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(zoom16).toHaveAttribute("aria-pressed", "false"); // the focused button was not pressed again
  await page.keyboard.press("Space");
  await expect(play).toHaveAttribute("aria-pressed", "false");

  await openSettings(page);
  const box = workspace.getByTestId("correction-click-audition");
  await box.click(); // off
  await expect(box).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(box).not.toBeChecked(); // not ticked by the Space
  await page.keyboard.press("Space");
  await expect(play).toHaveAttribute("aria-pressed", "false");

  // In a text field Space is a space.
  await workspace.getByTestId("correction-recommended").getByRole("button").first().click();
  await workspace.getByTestId("correction-save-form").getByRole("button", { name: /Vaultに保存/, exact: true }).click();
  const title = page.locator('form[role="dialog"] input[name="progression-title"]');
  await title.fill("a");
  await title.press("Space");
  await expect(title).toHaveValue("a ");
  await expect(play).toHaveAttribute("aria-pressed", "false");
});

test("P10.1 no focus ring after a mouse press and Esc; Tab still shows it", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  // A ring is a focus-visible element that draws an outline (the workspace itself takes focus without one).
  const ring = () => page.evaluate(() => {
    const active = document.activeElement;
    if (!active || !active.matches(":focus-visible")) return false;
    const style = getComputedStyle(active);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });
  await workspace.getByTestId("correction-card").first().click();
  await page.keyboard.press("n");
  await workspace.getByTestId("correction-select-above-line").click();
  await page.keyboard.press("Escape");
  expect(await ring()).toBe(false);
  await workspace.getByRole("button", { name: "16小節", exact: true }).click();
  await page.keyboard.press("Escape");
  expect(await ring()).toBe(false);
  await page.keyboard.press("Tab");
  expect(await ring()).toBe(true);
});

test("P10.1 selected notes have a bar to act on or stop; the line button turns into 選択をやめる", async ({ page }) => {
  await importScenario(page, "melody-track-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-card").first().click();
  await page.keyboard.press("n");
  const lineButton = workspace.getByTestId("correction-select-above-line");
  await expect(lineButton).toContainText("線より上の音を選ぶ");
  await lineButton.click();
  const bar = workspace.getByTestId("correction-selection-bar");
  await expect(bar).toContainText(/\d+音を選択中/);
  await expect(bar.getByRole("button", { name: /外す/ })).toBeVisible();
  await expect(lineButton).toHaveText("選択をやめる（Esc）");
  await bar.getByTestId("correction-selection-clear").click();
  await expect(bar).toHaveCount(0);
  await expect(lineButton).toContainText("線より上の音を選ぶ");
  // The line button stops its own selection too.
  await lineButton.click();
  await lineButton.click();
  await expect(bar).toHaveCount(0);
});

test("P10.1 the save range panel is always there; 範囲を外す is off without a range; recommended ranges fold and stay folded", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const form = workspace.getByTestId("correction-save-form");
  const clear = form.getByRole("button", { name: "範囲を外す" });
  await expect(form).toContainText("まだ選んでいません");
  await expect(clear).toBeDisabled();
  await expect(clear).toHaveAttribute("title", "範囲を選んでいません");
  await workspace.getByTestId("correction-recommended").getByRole("button").first().click();
  await expect(clear).toBeEnabled();
  await expect(workspace.getByTestId("correction-recommended")).toBeVisible(); // still offered with a range
  await clear.click();
  await expect(clear).toBeDisabled();

  const toggle = workspace.getByTestId("correction-recommended-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(workspace.getByTestId("correction-recommended")).toHaveCount(0);
  await page.reload();
  await importScenario(page, "plain-8");
  await expect(page.getByTestId("correction-recommended-toggle")).toHaveAttribute("aria-expanded", "false");
});

// ---- P10.1 names and tempo ---------------------------------------------------------------

test("P10.1 names follow the notes: automatic changes with a notice, a typed name stays with a suggestion", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  await selectCard(page, 0); // C
  const name = workspace.getByTestId("correction-inspector-name");
  await expect(workspace.getByTestId("correction-name-tag")).toHaveText("自動の名前（音を直すと変わる）");
  await workspace.getByTestId("correction-add-note").click();
  await workspace.getByRole("group", { name: "足す音を選ぶ" }).getByRole("button").nth(10).click(); // B♭
  await expect(name).toHaveText(/^C7/);
  await expect(workspace.getByTestId("correction-notice")).toContainText(/名前を C7.* にしました（音から）/);
  await expect(workspace.locator('[data-testid="correction-card"][aria-pressed="true"] .lv-cw-card-name')).toHaveAttribute("data-full-name", /^C7/);

  // Typed with F2: stays after a note edit; the notes' reading is offered.
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("F2");
  const editor = page.locator("[data-quick-chord-editor]");
  await editor.press("ArrowRight");
  await editor.press("Enter");
  const typed = (await name.textContent())!;
  await expect(workspace.getByTestId("correction-name-tag")).toHaveText("手で打った名前");
  await workspace.getByTestId("correction-note-list").getByRole("button", { name: "外す" }).first().click();
  await expect(name).toHaveText(typed);
  const suggestion = workspace.getByTestId("correction-name-suggestion");
  await expect(suggestion).toContainText("音からの判別：");
  await suggestion.getByRole("button", { name: "この名前にする" }).click();
  await expect(workspace.getByTestId("correction-name-tag")).toHaveText("自動の名前（音を直すと変わる）");
});

test("P10.1 BPM sets the speed of the sound and the playhead together, can be undone, and is saved", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const tempo = workspace.getByTestId("correction-tempo");
  await expect(tempo).toHaveValue("120");
  await workspace.getByRole("button", { name: "4小節", exact: true }).click();

  /** Beats the playhead moves in about 600 ms. */
  const beatsPerSlice = async () => {
    await workspace.getByTestId("correction-play-song").click();
    const line = workspace.getByTestId("correction-playhead");
    await expect(line).toBeAttached();
    const moved = await line.evaluate((element) => new Promise<number>((resolve) => {
      const x = () => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
      const px = Number.parseFloat(getComputedStyle(element.parentElement!).getPropertyValue("--lv-cw-beat"));
      requestAnimationFrame(() => {
        const start = x();
        const t0 = performance.now();
        setTimeout(() => resolve(((x() - start) / px) / ((performance.now() - t0) / 600)), 600);
      });
    }));
    await workspace.getByTestId("correction-play-song").click();
    return moved;
  };
  const at120 = await beatsPerSlice();
  await tempo.fill("60");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("60");
  await expect(workspace.getByTestId("correction-tempo-midi")).toHaveAttribute("title", "MIDI の値（120）に戻す");
  await expect(workspace.getByTestId("capture-analysis-preset-summary")).not.toContainText("BPM");
  await lastEdit(page, "テンポを 120 → 60");
  const at60 = await beatsPerSlice();
  expect(at120 / at60).toBeGreaterThan(1.6);
  expect(at120 / at60).toBeLessThan(2.5);

  // Out of range goes back; ↑ adds one; Ctrl+Z undoes.
  await tempo.fill("999");
  await tempo.press("Enter");
  await expect(tempo).toHaveValue("60");
  await tempo.focus();
  await tempo.press("ArrowUp");
  await expect(tempo).toHaveValue("61");
  await editCount(page, 2);
  await lastEdit(page, "テンポを 60 → 61");
  await tempo.blur(); // in the field Ctrl+Z is the field's own text undo
  await page.keyboard.press("Control+z");
  await expect(tempo).toHaveValue("60");
  await editCount(page, 1);
  await lastEdit(page, "テンポを 120 → 60");

  // Saved with the progression.
  await workspace.getByTestId("correction-recommended").getByRole("button").first().click();
  await workspace.getByTestId("correction-save-form").getByRole("button", { name: /Vaultに保存/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await form.locator('input[name="progression-title"]').fill("テンポ 60");
  await form.getByRole("button", { name: /保存/, exact: true }).click();
  await expect(form).toBeHidden();
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.locator("[data-progression-detail-view]")).toContainText(/BPM\s*60/);
});

// ---- P10.2 playback ----------------------------------------------------------------------

interface SongRequest { type: string; fromBeat: number; bpm: number; notes: { pitch: number; startBeat: number; velocity: number }[] }
/** The last song request (the E2E build keeps it on window; P10.2 §2). */
const songRequest = (page: Page) => page.evaluate(() => (window as unknown as { __lvWorkspaceSong?: SongRequest }).__lvWorkspaceSong!);
const chordAt = (request: SongRequest, beat: number) => request.notes.filter((note) => note.velocity !== 46 && note.startBeat === beat).map((note) => note.pitch).sort((a, b) => a - b);
const clicksOf = (request: SongRequest) => request.notes.filter((note) => note.velocity === 46);

test("P10.2 the song plays the corrected notes: a removed note is not in the song", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const play = workspace.getByTestId("correction-play-song");
  await selectCard(page, 0);
  await play.click();
  const before = await songRequest(page);
  expect(before.type).toBe("notes");
  const chord = chordAt(before, 0);
  expect(chord.length).toBeGreaterThan(2);
  await play.click();

  await workspace.getByTestId("correction-note-list").getByRole("button", { name: "外す" }).first().click();
  await play.click();
  const after = await songRequest(page);
  expect(chordAt(after, 0)).toHaveLength(chord.length - 1);
  // The other cards play as before.
  expect(chordAt(after, 4)).toEqual(chordAt(before, 4));
  await play.click();
});

test("P10.2 the header's metronome clicks in song playback; the workspace has no switch of its own", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const play = workspace.getByTestId("correction-play-song");
  const metronome = page.getByTestId("global-metronome");
  await expect(workspace.getByRole("button", { name: /メトロノーム/ })).toHaveCount(0);
  if (await metronome.getAttribute("aria-pressed") === "true") await metronome.click();

  await play.click();
  expect(clicksOf(await songRequest(page))).toHaveLength(0);
  // Switched on while playing: carries on from the sounding card, now with clicks on the song's beats.
  await metronome.click();
  await expect.poll(async () => clicksOf(await songRequest(page)).length).toBeGreaterThan(0);
  const on = await songRequest(page);
  expect(on.fromBeat % 4).toBe(0); // plain-8: every card starts a bar
  expect(clicksOf(on).filter((click) => click.pitch === 96).every((click) => (click.startBeat + on.fromBeat) % 4 === 0)).toBe(true);
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await play.click();

  // From the middle: the accents stay on the song's bar heads.
  await selectCard(page, 5);
  await play.click();
  const middle = await songRequest(page);
  expect(middle.fromBeat).toBe(20);
  expect(clicksOf(middle)[0]).toMatchObject({ startBeat: 0, pitch: 96 });
  await play.click();
  await metronome.click();
});

test("P10.2 with no card selected the song starts at the first card in view, marked 「▶ ここから」", async ({ page }) => {
  await importScenario(page, "long-64");
  const workspace = page.getByTestId("correction-workspace");
  const scroll = workspace.getByTestId("correction-timeline-scroll");
  const position = workspace.getByTestId("correction-position");
  const cue = workspace.locator("[data-start-cue]");
  await expect(cue).toHaveCount(1);
  await expect(cue).toHaveAttribute("aria-label", /^1小節1拍/);

  // Scroll so a card's head is just left of the view: the next card is where it starts.
  const passed = await scroll.evaluate((element) => {
    const card = [...element.querySelectorAll<HTMLElement>('[data-testid="correction-card"]')][6]!;
    element.scrollLeft = parseFloat(card.style.left) + 3;
    return card.getAttribute("data-card-id");
  });
  await expect(cue).not.toHaveAttribute("data-card-id", passed!);
  const label = (await cue.getAttribute("aria-label"))!;
  const [, bar, beat] = /^(\d+)小節(\d+)拍/.exec(label)!;
  await expect(position).toHaveText(new RegExp(`^${bar}\\.${beat} から ／ \\d+小節$`));
  await expect(workspace.getByTestId("correction-play-song")).toHaveAttribute("aria-label", `${bar}.${beat} から再生（Space）`);
  await page.locator("body").press("Space");
  await expect(workspace.locator(".lv-cw-playline-tag")).toHaveText(new RegExp(`^${bar}\\.`));
  await expect(cue).toHaveCount(0);
  await page.locator("body").press("Space");
});

test("P10.2 ⏮ and Home go to the start; playing, the song starts over", async ({ page }) => {
  await importScenario(page, "long-64");
  const workspace = page.getByTestId("correction-workspace");
  const scroll = workspace.getByTestId("correction-timeline-scroll");
  const play = workspace.getByTestId("correction-play-song");
  await workspace.getByTestId("correction-go-start").evaluate((element) => element.getAttribute("title")).then((title) => expect(title).toBe("曲の先頭へ（Home）"));

  await scroll.evaluate((element) => { element.scrollLeft = 900; });
  await selectCard(page, 4);
  await workspace.getByTestId("correction-go-start").click();
  await expect(workspace.locator('[data-testid="correction-card"][aria-pressed="true"]')).toHaveCount(0);
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBe(0);
  await expect(workspace.getByTestId("correction-position")).toHaveText(/^1\.1 から ／ \d+小節$/);

  await selectCard(page, 4);
  await play.click();
  expect((await songRequest(page)).fromBeat).toBeGreaterThan(0);
  await page.locator("body").press("Home");
  await expect.poll(async () => (await songRequest(page)).fromBeat).toBe(0);
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(workspace.locator(".lv-cw-playline-tag")).toHaveText(/^1\./);
  await play.click();
});

test("P10.2 the sounding card looks like Voicing Loop's current card, apart from the selected one; its notes light up", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const cards = workspace.getByTestId("correction-card");
  await selectCard(page, 1);
  const selectedLook = await cards.nth(1).evaluate((element) => getComputedStyle(element).backgroundColor);
  await workspace.getByTestId("correction-play-song").click();
  await expect(cards.nth(1)).toHaveAttribute("data-playing", "");
  await expect(workspace.locator('.lv-cw-note[data-playing]').first()).toBeVisible();
  // Selecting another card while playing does not jump; the two look different.
  await cards.nth(6).click();
  await expect(cards.nth(1)).toHaveAttribute("data-playing", "");
  await expect(cards.nth(6)).not.toHaveAttribute("data-playing", "");
  const playingLook = "rgb(18, 59, 58)"; // --lv-accent-soft
  await expect(cards.nth(1)).toHaveCSS("background-color", playingLook);
  await expect(cards.nth(1).locator(".lv-cw-card-name")).toHaveCSS("color", "rgb(66, 216, 198)"); // --lv-accent
  expect(await cards.nth(6).evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(playingLook);
  expect(selectedLook).not.toBe(playingLook);
  // The mark moves on with the song, and goes when it stops.
  await expect(cards.nth(2)).toHaveAttribute("data-playing", "", { timeout: 4000 });
  await expect(workspace.locator('[data-testid="correction-card"][data-playing]')).toHaveCount(1);
  await workspace.getByTestId("correction-play-song").click();
  await expect(workspace.locator("[data-playing]")).toHaveCount(0);
});

// ---- P10.2 choosing, ranges and segments -------------------------------------------------

test("P10.2 a click anywhere on the bar row selects the card on that bar's first beat; Shift makes a range", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const ruler = workspace.getByTestId("correction-ruler");
  const box = (await ruler.boundingBox())!;
  const barWidth = box.width / 8;
  // Not on the number: the right part of bar 3.
  await page.mouse.move(box.x + barWidth * 2.8, box.y + box.height / 2);
  await expect(ruler).toHaveAttribute("title", "3小節の頭のカードを選ぶ");
  await page.mouse.click(box.x + barWidth * 2.8, box.y + box.height / 2);
  await expect(workspace.locator('[data-testid="correction-card"][aria-pressed="true"]')).toHaveAttribute("aria-label", /^3小節1拍/);
  await expect(workspace.getByTestId("correction-play-song")).toHaveAttribute("aria-pressed", "false"); // 押して鳴らす does not play from the bar row
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + barWidth * 5.5, box.y + box.height / 2);
  await page.keyboard.up("Shift");
  await expect(workspace.getByTestId("correction-save-range")).toContainText("3〜6小節");
});

test("P10.2 right-click a card, then another: the save range, with a pending frame; Esc drops only 「ここから」", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const cards = workspace.getByTestId("correction-card");
  await cards.nth(1).click({ button: "right" });
  await expect(cards.nth(1)).toHaveAttribute("data-range-from", "true");
  await cards.nth(4).hover();
  await expect(workspace.getByTestId("correction-range-pending")).toHaveText("2〜5小節・4コード（右クリックで決める）");
  await cards.nth(4).click({ button: "right" });
  await expect(workspace.getByTestId("correction-save-range")).toContainText("2〜5小節・4枚");
  await expect(workspace.getByTestId("correction-notice")).toHaveText("保存する範囲を 2〜5小節（4コード）にしました");
  await expect(workspace.getByTestId("correction-range-pending")).toHaveCount(0);

  // Backwards, then Esc: only 「ここから」 goes; the range stays.
  await cards.nth(6).click({ button: "right" });
  await cards.nth(5).hover();
  await expect(workspace.getByTestId("correction-range-pending")).toHaveText("6〜7小節・2コード（右クリックで決める）");
  await page.keyboard.press("Escape");
  await expect(workspace.locator("[data-range-from]")).toHaveCount(0);
  await expect(workspace.getByTestId("correction-save-range")).toContainText("2〜5小節");
  // Shift+right-click: that card's bars at once; the keyboard's Shift+F10 marks 「ここから」.
  await cards.nth(7).click({ button: "right", modifiers: ["Shift"] });
  await expect(workspace.getByTestId("correction-save-range")).toContainText("8小節・1枚");
  await cards.nth(0).focus();
  await page.keyboard.press("Shift+F10");
  await expect(cards.nth(0)).toHaveAttribute("data-range-from", "true");
  await page.keyboard.press("Escape");

  // The piano roll's right-click still removes a note.
  const id = await firstNoteId(page, "harmony");
  const point = await center(rollNote(page, id));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "off");
});

test("P10.2 dragging a segment edge moves the segment border by bars; a press alone makes it the range; undo, not an unsaved change", async ({ page }) => {
  await importScenario(page, "long-64"); // segments of 8 bars, touching: 1–8, 9–16, …
  const workspace = page.getByTestId("correction-workspace");
  const segments = workspace.getByTestId("correction-segment");
  const range = workspace.getByTestId("correction-save-range");
  const edge = workspace.locator('[data-testid="correction-segment-edge"][data-segment-id="segment-0"]');
  await expect(edge).toHaveAttribute("data-edge", "end");
  const barWidth = (await segments.nth(0).boundingBox())!.width / 8;
  const overview = workspace.locator(".lv-cw-ov-seg").first();
  const overviewBefore = (await overview.boundingBox())!.width;

  // A press without moving: the segment becomes the save range.
  await edge.click();
  await expect(range).toContainText("1〜8小節");

  const from = await center(edge);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - barWidth * 0.7, from.y, { steps: 4 });
  await expect(workspace.getByTestId("correction-segment-tip")).toHaveText("7小節まで");
  await page.mouse.move(from.x - barWidth * 1.1, from.y, { steps: 4 });
  await page.mouse.up();
  // The first segment is 1–7 now, the second 8–16; the range that was the first followed it; the overview too.
  await expect(range).toContainText("1〜7小節");
  await expect.poll(async () => (await overview.boundingBox())!.width).toBeLessThan(overviewBefore - 1);
  await segments.nth(1).click();
  await expect(range).toContainText("8〜16小節");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("0");

  // Alt+→ on the first segment moves its right edge back; Ctrl+Z undoes it.
  await segments.nth(0).focus();
  await page.keyboard.press("Alt+ArrowRight");
  await segments.nth(1).click();
  await expect(range).toContainText("9〜16小節");
  await page.keyboard.press("Control+z");
  await segments.nth(1).click();
  await expect(range).toContainText("8〜16小節");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("0");
});

// ---- P10.2 the whole screen, the control bar, the tempo ------------------------------------

test("P10.2 at 1280 the control bar is one line; no review buttons with nothing to review; 「要確認 n / m」 otherwise", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const bar = workspace.getByTestId("correction-control-bar");
  await expect(workspace.getByTestId("correction-review-count")).toContainText("0");
  await expect(bar.getByRole("group", { name: "要確認" })).toHaveCount(0);
  await expect(bar).not.toContainText("操作");
  // Every control's middle on one line.
  const middles = await bar.locator("button, input, .lv-cw-time").evaluateAll((items) => items.filter((item) => item.getBoundingClientRect().height > 0).map((item) => item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2));
  expect(Math.max(...middles) - Math.min(...middles)).toBeLessThan(6);
  expect((await bar.boundingBox())!.height).toBeLessThan(52);
  await expect(workspace.locator('.lv-cw-card-sub:has-text("4拍")')).toHaveCount(0); // a one-bar card says no 「4拍」

  await importScenario(page, "melody-track-8");
  const review = page.getByTestId("correction-control-bar").getByRole("group", { name: "要確認" });
  await expect(review).toContainText(/要確認 – \/ \d+/);
  await review.getByRole("button", { name: "次の要確認" }).click();
  await expect(review).toContainText(/要確認 1 \/ \d+/);
});

test("P10.2 the ⚙ menu holds 押して鳴らす and 凡例を出す, remembered on the device", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  await expect(workspace.getByTestId("correction-legend")).toBeVisible();
  await expect(workspace.getByTestId("correction-click-audition")).toHaveCount(0);
  await openSettings(page);
  await workspace.getByTestId("correction-legend-toggle").uncheck();
  await expect(workspace.getByTestId("correction-legend")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(workspace.getByTestId("correction-settings-menu")).toHaveCount(0);
  await page.reload();
  await importScenario(page, "plain-8");
  await expect(page.getByTestId("correction-legend")).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByTestId("correction-restart")).toBeDisabled(); // nothing changed yet
  await page.getByTestId("correction-legend-toggle").check();
  await expect(page.getByTestId("correction-legend")).toBeVisible();
});

test("P10.2 the tempo changes by dragging up and down and by the wheel, one history entry each; ↺ MIDI goes back", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const tempo = workspace.getByTestId("correction-tempo");
  const point = await center(tempo);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y - 20, { steps: 5 }); // 4px a step
  await expect(tempo).toHaveValue("125");
  await editCount(page, 0); // nothing in the history while dragging
  await page.mouse.move(point.x, point.y - 40, { steps: 5 });
  await page.mouse.up();
  await expect(tempo).toHaveValue("130");
  await editCount(page, 1);
  await lastEdit(page, "テンポを 120 → 130");
  await expect(tempo).not.toBeFocused(); // a press is for dragging, not typing

  await page.mouse.move(point.x, point.y);
  for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, 100);
  await expect(tempo).toHaveValue("127");
  await editCount(page, 2);
  await lastEdit(page, "テンポを 130 → 127");

  await page.keyboard.press("Control+z");
  await expect(tempo).toHaveValue("130");
  const midi = workspace.getByTestId("correction-tempo-midi");
  await expect(midi).toHaveAttribute("title", "MIDI の値（120）に戻す");
  await midi.click();
  await expect(tempo).toHaveValue("120");
  await expect(midi).toHaveCount(0);

  // A double-click types.
  await tempo.dblclick();
  await expect(tempo).toBeFocused();
  await page.keyboard.type("90");
  await page.keyboard.press("Enter");
  await expect(tempo).toHaveValue("90");
});

test("P10.2 「最初からやり直す」 asks first; 戻る keeps everything, confirming goes back to the import, with no leave question", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  await selectCard(page, 0);
  await workspace.getByTestId("correction-note-list").getByRole("button", { name: "外す" }).first().click();
  await workspace.getByTestId("correction-tempo").fill("100");
  await workspace.getByTestId("correction-tempo").press("Enter");
  await workspace.getByTestId("correction-segment").first().click();
  await editCount(page, 2);

  await openSettings(page);
  await workspace.getByTestId("correction-restart").click();
  const dialog = page.getByRole("dialog", { name: "最初からやり直しますか？" });
  await expect(dialog).toContainText("Vault に保存した進行は消えません。");
  await expect(dialog.getByRole("button", { name: "戻る" })).toBeFocused();
  await dialog.getByRole("button", { name: "戻る" }).click();
  await editCount(page, 2);

  await openSettings(page);
  await workspace.getByTestId("correction-restart").click();
  await page.getByRole("dialog", { name: "最初からやり直しますか？" }).getByRole("button", { name: "最初からやり直す" }).click();
  await editCount(page, 0);
  await expect(workspace.getByTestId("correction-tempo")).toHaveValue("120");
  await expect(workspace.getByTestId("correction-save-form")).toHaveAttribute("data-empty");
  await expect(workspace.getByTestId("correction-inspector-empty")).toBeVisible();
  await expect(workspace.getByTestId("correction-undo")).toBeDisabled(); // the history is empty too
  // Nothing to lose: leaving asks nothing.
  await page.locator('[data-nav="vault"]').click();
  await expect(page.getByRole("dialog", { name: "保存していない変更があります" })).toHaveCount(0);
});

test("P10.2 at 1440x900 the piano roll reaches the bottom; the panel scrolls inside with the save range always in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importScenario(page, "melody-track-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-suggestion").getByRole("button", { name: "閉じる" }).click();
  await selectCard(page, 1);
  const roll = (await workspace.getByTestId("correction-piano-roll").boundingBox())!;
  const legend = (await workspace.getByTestId("correction-legend").boundingBox())!;
  const work = (await workspace.locator(".lv-cw-work").boundingBox())!;
  expect(legend.y - (roll.y + roll.height)).toBeLessThan(24); // the legend right under the roll
  expect(work.y + work.height - (legend.y + legend.height)).toBeLessThan(40); // no big gap under it
  // The page does not scroll; the panel does, and the save range stays in view.
  expect(await page.evaluate(() => document.getElementById("main-content")!.scrollHeight - document.getElementById("main-content")!.clientHeight)).toBeLessThanOrEqual(1);
  const scroller = workspace.locator(".lv-cw-insp-scroll");
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(workspace.getByTestId("correction-save-form")).toBeInViewport({ ratio: 1 });
  await expect(workspace.getByTestId("correction-inspector")).not.toContainText("要確認の印はありません");
  await expect(workspace.getByTestId("capture-analysis-preset-summary")).not.toContainText(/BPM|小節/);
});
