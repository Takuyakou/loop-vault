import { expect, test, type Page } from "@playwright/test";
import { buildScenarioMidi, p10Scenario } from "../src/testing/p10SyntheticSongs";
import { dropMidi, openApp, openCapture } from "./helpers/app";

/** P10.0-02..06: the correction workspace, the default screen after a MIDI analysis since P10.0-06. */

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
  await expect(workspace.getByTestId("correction-history")).toContainText("を外した");
  await page.keyboard.press("Control+z");
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "harmony");
  await expect(workspace.getByTestId("correction-edit-count")).toContainText("0");
  await page.keyboard.press("Control+y");
  await expect(rollNote(page, id)).toHaveAttribute("data-kind", "off");
});

test("P10.0-03 ② adds a note with one click, and a drag moves the pitch in one step", async ({ page }) => {
  await importScenario(page, "plain-8");
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
  await importScenario(page, "melody-track-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-select-melody").click();
  expect(await page.locator("[data-testid=correction-piano-roll] .lv-cw-note[data-selected]").count()).toBeGreaterThan(1);
  await page.keyboard.press("Delete");
  // The melody suggestion goes; neighbours that now sound the same bring the next one (spec 6.5).
  const melody = workspace.locator('[data-testid="correction-suggestion"][data-kind="melody-voice"]');
  await expect(melody).toHaveCount(0);
  await expect(workspace.getByTestId("correction-history")).toContainText("操作 1");
  await page.keyboard.press("Control+z");
  await expect(melody).toBeVisible();
});

test("P10.0-03 「＋ 音を足す」 and keyboard-only exclude and restore", async ({ page }) => {
  await importScenario(page, "plain-8");
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

// ---- P10.0-04 card editing -------------------------------------------------------------

const cards = (page: Page) => page.getByTestId("correction-workspace").getByTestId("correction-card");

test("P10.0-04 M merges with ×2 and Ctrl+Z undoes it; S splits; Shift+M asks first (Esc / Enter)", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  await expect(cards(page)).toHaveCount(8);
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("m");
  await expect(cards(page)).toHaveCount(7);
  await expect(cards(page).first().locator(".lv-cw-x")).toHaveText("×2");
  await expect(workspace.getByTestId("correction-history")).toContainText("と次をつないだ");
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
  await expect(workspace.getByTestId("correction-history")).toContainText("操作 2");
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
  await expect(page.getByTestId("correction-history")).toContainText("境目を 1.4 へ");

  const moved = (await page.getByTestId("correction-boundary").first().boundingBox())!;
  const from = { x: moved.x + moved.width / 2, y: moved.y + moved.height / 2 };
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) await page.mouse.move(from.x - (beatPx * 0.25 * step) / 4, from.y);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(first).toContainText("2.75拍");
  await expect(page.getByTestId("correction-history")).toContainText("操作 2");
});

test("P10.0-04 names: 1–4 picks a candidate, F2 types one, and a person's name stays", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const inspector = workspace.getByTestId("correction-inspector");
  const candidates = workspace.getByTestId("correction-name-candidates").getByRole("button");
  const second = (await candidates.nth(1).locator(".lv-cw-alt-name").textContent())!;
  await workspace.getByTestId("correction-review-count").focus();
  await page.keyboard.press("2");
  await expect(workspace.getByTestId("correction-inspector-name")).toHaveText(second);
  await expect(inspector).toContainText("あなたが決めた名前");
  // Bar 5 plays the same notes under the old name: offer the same fix, confirm, one step.
  await workspace.getByTestId("correction-same-fix").click();
  await page.getByRole("dialog", { name: "同じ直しを他にも反映" }).getByRole("button", { name: /反映する/ }).click();
  await expect(cards(page).nth(4).locator(".lv-cw-card-name")).toHaveAttribute("data-full-name", second);
  await expect(workspace.getByTestId("correction-history")).toContainText("操作 2");

  await page.keyboard.press("F2");
  const editor = page.locator("[data-quick-chord-editor]");
  await expect(editor).toBeVisible();
  await editor.press("ArrowRight");
  await editor.press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(workspace.getByTestId("correction-inspector-name")).not.toHaveText(second);
  await expect(workspace.getByTestId("correction-history")).toContainText("操作 3");
});

test("P10.0-04 Y moves to the next review card; the run suggestion merges after a confirm", async ({ page }) => {
  await importScenario(page, "melody-track-8");
  const workspace = page.getByTestId("correction-workspace");
  await workspace.getByTestId("correction-suggestion").getByRole("button", { name: "閉じる" }).click();
  const count = workspace.getByTestId("correction-review-count");
  const before = Number(await count.locator("b").textContent());
  const selected = () => workspace.locator('[data-testid="correction-card"][aria-pressed="true"]').getAttribute("data-card-id");
  const firstId = await selected();
  await count.focus();
  await page.keyboard.press("y");
  await expect(count.locator("b")).toHaveText(String(before - 1));
  expect(await selected()).not.toBe(firstId);

  // plain-8: split, then touch a note of the second half → 「同じ音が続く所が 1 か所」.
  await importScenario(page, "plain-8");
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
    const zoomButtons = [...document.querySelectorAll<HTMLButtonElement>(".lv-cw-tools .lv-cw-btn")].filter((button) => ["16小節", "4小節"].includes(button.textContent ?? ""));
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

test("P10.0-07 「押して鳴らす」: off by default, a plain click plays the card, Shift+click does not, and it is remembered", async ({ page }) => {
  await importScenario(page, "plain-8");
  const workspace = page.getByTestId("correction-workspace");
  const cards = workspace.getByTestId("correction-card");
  const playingB = workspace.getByTestId("correction-play-card");
  const toggle = workspace.getByTestId("correction-click-audition");
  await expect(toggle).not.toBeChecked();
  await cards.nth(1).click();
  await expect(playingB).toHaveAttribute("aria-pressed", "false");

  await toggle.check();
  await cards.nth(2).click();
  await expect(playingB).toHaveAttribute("aria-pressed", "true");
  await cards.nth(4).click({ modifiers: ["Shift"] });
  await expect(cards.nth(4)).toHaveAttribute("aria-pressed", "true");
  await expect(playingB).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await importScenario(page, "plain-8");
  await expect(page.getByTestId("correction-click-audition")).toBeChecked();
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
  const workspace = page.getByTestId("correction-workspace");
  const undoButton = workspace.getByTestId("correction-inspector-undo");
  await expect(undoButton).toBeDisabled();
  const list = workspace.getByTestId("correction-note-list");
  while (await list.getByRole("button", { name: "外す" }).count() > 1) await list.getByRole("button", { name: "外す" }).first().click();
  const inspector = workspace.getByTestId("correction-inspector");
  await expect(inspector).toContainText("2音以上にしてください");
  await expect(inspector).not.toContainText("このカードに要確認の印はありません");
  const before = await workspace.getByTestId("correction-history").textContent();
  await undoButton.click();
  await expect(workspace.getByTestId("correction-history")).not.toHaveText(before ?? "");
});
