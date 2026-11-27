import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

interface KeyboardGeometry {
  readonly regionWidth: number;
  readonly regionHeight: number;
  readonly svgWidth: number;
  readonly svgHeight: number;
  readonly c4X: number;
}

async function openRuleFixture(page: Page): Promise<Locator> {
  await page.goto("/?p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  await chooseVoicingLoop(page);
  return page.getByTestId("voicing-loop-workspace");
}

async function openExtendedReductionFixture(page: Page): Promise<Locator> {
  await page.goto("/?p527Status=p533-extended-reductions");
  await page.evaluate(() => document.fonts.ready);
  await chooseVoicingLoop(page);
  return page.getByTestId("voicing-loop-workspace");
}

// P25-08 L1: 「形 ▼」 took 「基本 ▼」 and 「詳しい設定」; a shape choice closes the menu, so reopen through the real UI.
// P25-16 N3: the menu stays mounted while it fades out, so wait for the shown state instead of counting the element.
// P25 V30: the menu passes enter for two frames; a click while entering closes it again, so click only while it is closed or closing.
async function openShapeMenu(workspace: Locator): Promise<Locator> {
  const menu = workspace.getByTestId("voicing-loop-shape-menu");
  const trigger = workspace.getByTestId("voicing-loop-shape-button");
  await expect(async () => {
    const state = await menu.count() === 0 ? undefined : await menu.first().getAttribute("data-presence", { timeout: 1_000 });
    // P25 V30: a click while the menu is entering would close it again, so click only while it is closed or closing.
    if (state === null || state === undefined || state === "exit") await trigger.click();
    await expect(menu).toHaveAttribute("data-presence", "shown", { timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  return menu;
}

async function chooseShape(workspace: Locator, shape: string) {
  await (await openShapeMenu(workspace)).locator(`[data-shape="${shape}"]`).click();
}

async function keyboardGeometry(workspace: Locator): Promise<KeyboardGeometry> {
  const region = workspace.getByRole("region", { name: "ピアノ鍵盤" });
  const svg = region.locator("svg");
  const c4 = region.locator('[data-midi-note="48"]');
  const [regionBox, svgBox, c4Box] = await Promise.all([
    region.boundingBox(),
    svg.boundingBox(),
    c4.boundingBox(),
  ]);
  if (!regionBox || !svgBox || !c4Box) throw new Error("Keyboard geometry is unavailable");
  return {
    regionWidth: regionBox.width,
    regionHeight: regionBox.height,
    svgWidth: svgBox.width,
    svgHeight: svgBox.height,
    c4X: c4Box.x,
  };
}

function expectStableKeyboard(actual: KeyboardGeometry, expected: KeyboardGeometry): void {
  expect(Math.abs(actual.regionWidth - expected.regionWidth)).toBeLessThanOrEqual(1);
  // P23-32 K2: the keys fill the panel's rest, so their height follows the content instead of a fixed clamp.
  expect(actual.regionHeight).toBeGreaterThan(0);
  expect(actual.svgHeight).toBeGreaterThan(0);
  expect(Math.abs(actual.svgWidth - expected.svgWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.c4X - expected.c4X)).toBeLessThanOrEqual(1);
}

async function chooseVoicingLoop(page: Page) {
  const sidebar = page.locator('[data-nav="voicing-loop"]');
  if (await sidebar.isVisible()) { await sidebar.click(); return; }
  await page.locator('[data-nav="chord-dojo"]').click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
}

test("P5.33 exposes independent source/study axes and explains the active rule", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const controls = workspace.getByTestId("voicing-loop-controls");

  await expect(controls.locator("legend")).toHaveText(["音の出どころ", "表示"]);
  await expect(controls.getByRole("button", { name: "自動生成", exact: true })).toHaveAttribute("aria-pressed", "true");
  // P25-08 L1: the shape (基本 by default) and its two parts live in 「形 ▼」.
  await expect(controls.getByTestId("voicing-loop-shape-label")).toHaveText("基本");
  const menu = await openShapeMenu(workspace);
  await expect(menu.getByTestId("voicing-loop-shape-tension")).not.toBeChecked();
  await expect(menu.getByTestId("voicing-loop-shape-spread")).not.toBeChecked();
  // P25-16 N7: 「なめらかにつなぐ」 sits at the bottom of 「形 ▼」.
  await expect(menu.getByRole("switch", { name: "進行に合わせてなめらかにつなぐ", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  const explanation = workspace.getByTestId("voicing-loop-current-explanation");
  // P25-16 N5: no internal names on the row; more than one candidate reads 「ほかの押さえ方」.
  await expect(explanation).not.toContainText("Teacher Style");
  await expect(explanation).toContainText("ほかの押さえ方");
  // P23-32 P4: the rule's names are not visible words any more; the i carries them as its accessible name.
  await expect(explanation).not.toContainText("ルールP5.31-MIN11");
  await expect(explanation).not.toContainText("P5.33-GEN");
  await expect(explanation.locator(".lv-vl-rule-info")).toHaveAttribute("aria-label", /ルール P5\.33-GEN-TEACHER-MAJ7/);
  // P25-16 N5: the top note is read from the i.
  await expect(explanation).not.toContainText("トップ");
  await expect(explanation.locator(".lv-vl-rule-info")).toHaveAttribute("title", /いちばん上の音:上の音の候補/);

  // A K shape plays K's notes without a lesson-rule explanation.
  await chooseShape(workspace, "shell");
  await expect(explanation).toHaveCount(0);
  await chooseShape(workspace, "basic");
  await expect(explanation).toContainText("ほかの押さえ方");

  await controls.getByRole("button", { name: "元MIDI", exact: true }).click();
  await expect(explanation).toHaveCount(0);
  await expect(controls.getByTestId("voicing-loop-shape-button")).toBeDisabled();
  await expect(workspace.getByTestId("voicing-loop-shape-menu")).toHaveCount(0);
  // P25-16 N7: the switch is inside 「形 ▼」, which cannot open here.
  await expect(controls.getByRole("switch", { name: "進行に合わせてなめらかにつなぐ", exact: true })).toHaveCount(0);
  await controls.getByRole("button", { name: "カスタム", exact: true }).click();
  await expect(explanation).toHaveCount(0);
});

test("P5.33 switches the current voicing candidate without moving the practice position", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const navigation = workspace.getByTestId("voicing-loop-candidate-navigation");
  const candidateLabel = navigation.locator("span[aria-label]");
  const currentVoicing = workspace.getByTestId("voicing-loop-current-voicing");
  const beforeCandidate = await candidateLabel.textContent();
  const beforeVoicing = await currentVoicing.textContent();
  const beforeGuides = await workspace.getByRole("region", { name: "ピアノ鍵盤" }).locator("[data-midi-note]").evaluateAll((keys) => (
    keys.filter((key) => key.getAttribute("data-visual-state") !== "idle")
      .map((key) => key.getAttribute("data-midi-note"))
  ));
  const beforeCurrent = await workspace.locator("[aria-current='step']").getAttribute("aria-label");

  await navigation.getByRole("button", { name: "次のVoicing候補", exact: true }).click();

  await expect(candidateLabel).not.toHaveText(beforeCandidate ?? "");
  await expect(currentVoicing).not.toHaveText(beforeVoicing ?? "");
  await expect(workspace.locator("[aria-current='step']")).toHaveAttribute("aria-label", beforeCurrent ?? "");
  const afterGuides = await workspace.getByRole("region", { name: "ピアノ鍵盤" }).locator("[data-midi-note]").evaluateAll((keys) => (
    keys.filter((key) => key.getAttribute("data-visual-state") !== "idle")
      .map((key) => key.getAttribute("data-midi-note"))
  ));
  expect(afterGuides).not.toEqual(beforeGuides);
});

test("P5.33 compares literal, OMIT 5, and OMIT 5/9 extended-chord candidates", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openExtendedReductionFixture(page);
  const explanation = workspace.getByTestId("voicing-loop-current-explanation");
  const navigation = workspace.getByTestId("voicing-loop-candidate-navigation");
  const label = navigation.locator("span[aria-label]");
  const initial = await label.textContent();
  const count = Number(initial?.match(/\/(\d+)/)?.[1] ?? 0);
  expect(count).toBeGreaterThan(2);

  const states = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    states.add((await explanation.textContent()) ?? "");
    await navigation.getByRole("button", { name: "次のVoicing候補", exact: true }).click();
  }

  // P25-16 N5: the coverage reads 「弾きやすく省いた」 and the omitted notes 「省いた音5」/「省いた音5 · 9」;
  // a literal candidate carries neither word.
  expect([...states].some((value) => !value.includes("省いた音") && !value.includes("音を足した"))).toBe(true);
  expect([...states].some((value) => value.includes("弾きやすく省いた") && value.includes("省いた音5"))).toBe(true);
  expect([...states].some((value) => value.includes("弾きやすく省いた") && value.includes("省いた音5 · 9"))).toBe(true);
  await expect(label).toHaveText(initial ?? "");
});

test("P5.33 supports all eight acceptance chords in every base/modifier combination", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);

  await expect(workspace.getByTestId("voicing-loop-event")).toHaveCount(8);
  // P25-08 L4: every shape with every part it takes plays all eight chords (a fallback card still sounds).
  for (const [shape, tension, spread] of [
    ["basic", false, false], ["basic", true, false], ["basic", false, true], ["basic", true, true],
    ["shell", false, false], ["shell", true, false], ["shell", false, true], ["shell", true, true],
    ["rootless", false, false], ["rootless", false, true], ["triad", false, false], ["quartal", false, false],
  ] as const) {
    await chooseShape(workspace, shape);
    await expect(workspace.getByTestId("voicing-loop-shape-menu")).toHaveCount(0);
    const menu = await openShapeMenu(workspace);
    const tensionBox = menu.getByTestId("voicing-loop-shape-tension");
    if (await tensionBox.isEnabled()) await tensionBox.setChecked(tension);
    await menu.getByTestId("voicing-loop-shape-spread").setChecked(spread);
    await page.keyboard.press("Escape");
    await expect(workspace.getByText(/個のコードを再生できません/)).toHaveCount(0);
    await expect(workspace.getByTestId("voicing-loop-transport").getByRole("button", {
      name: "開始",
      exact: true,
    })).toBeEnabled();
  }
});
test("P5.33 keeps one 88-key A0-C8 geometry across source and study changes", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const controls = workspace.getByTestId("voicing-loop-controls");
  const keyboard = workspace.getByRole("region", { name: "ピアノ鍵盤" });

  await expect(keyboard.locator("[data-midi-note]")).toHaveCount(88);
  await expect(keyboard.locator('[data-midi-note="9"]')).toBeAttached();
  await expect(keyboard.locator('[data-midi-note="96"]')).toBeAttached();
  const baseline = await keyboardGeometry(workspace);

  for (const source of ["元MIDI", "カスタム", "自動生成"]) {
    await controls.getByRole("button", { name: source, exact: true }).click();
    expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  }
  for (const shape of ["shell", "basic"]) {
    await chooseShape(workspace, shape);
    expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  }
  const menu = await openShapeMenu(workspace);
  await menu.getByTestId("voicing-loop-shape-tension").check();
  expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  await menu.getByTestId("voicing-loop-shape-spread").check();
  expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  await page.keyboard.press("Escape");

  const keyboardOverflow = await keyboard.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(keyboardOverflow.scrollHeight).toBeLessThanOrEqual(keyboardOverflow.clientHeight + 1);
});

test("P5.33 fits desktop without page scroll and keeps Transport keyboard-operable", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const transport = workspace.getByTestId("voicing-loop-transport");
  const start = transport.getByRole("button", { name: "開始", exact: true });

  await expect(transport).toBeInViewport();
  await expect(page.locator("header").getByRole("tab")).toHaveCount(0);
  await expect(page.locator('[data-nav="voicing-loop"]')).toBeVisible();
  await expect(start).toBeEnabled();
  const startBox = await start.boundingBox();
  // Shared TransportButton CSS specifies a 2.25rem (36px) minimum.
  expect(startBox?.height).toBeGreaterThanOrEqual(36);
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(transport.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
  await transport.getByRole("button", { name: "停止", exact: true }).click();

  const mainOverflow = await page.locator("#main-content").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(mainOverflow.scrollHeight).toBeLessThanOrEqual(mainOverflow.clientHeight + 1);
  expect(mainOverflow.scrollWidth).toBeLessThanOrEqual(mainOverflow.clientWidth + 1);
  await assertNoHorizontalOverflow(page);
});

test("P5.33 applies lesson modifiers and OCT live without pausing playback", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const transport = workspace.getByTestId("voicing-loop-transport");

  await transport.getByRole("button", { name: "開始", exact: true }).click();
  const pause = transport.getByRole("button", { name: "一時停止", exact: true });
  await expect(pause).toBeVisible();

  const menu = await openShapeMenu(workspace);
  for (const testId of ["voicing-loop-shape-tension", "voicing-loop-shape-spread"]) {
    await menu.getByTestId(testId).check();
    await expect(pause).toBeVisible();
  }
  // P23-32 T4 / P25-08 L3: なめらかにつなぐ is a switch (checked when clicked, not checked by `check()`), in 「形 ▼」 (N7).
  const optimize = menu.getByRole("switch", { name: "進行に合わせてなめらかにつなぐ", exact: true });
  const wasOptimized = await optimize.getAttribute("aria-checked");
  await optimize.click();
  await expect(optimize).toHaveAttribute("aria-checked", wasOptimized === "true" ? "false" : "true");
  await expect(pause).toBeVisible();
  await page.keyboard.press("Escape");

  const octaveUp = transport.getByRole("button", { name: "1オクターブ上げる", exact: true });
  await expect(octaveUp).toBeEnabled();
  await octaveUp.click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("オクターブ+1");
  await expect(pause).toBeVisible();
  const key = transport.locator("#voicing-loop-key");
  await expect(key).toBeEnabled();
  await key.selectOption("2");
  await expect(pause).toBeVisible();
  await expect(workspace.getByRole("progressbar", { name: "位置" })).toHaveCount(0);

  await pause.click();
  await expect(transport.getByRole("button", { name: "再開", exact: true })).toBeVisible();
  const octaveDown = transport.getByRole("button", { name: "1オクターブ下げる", exact: true });
  await expect(octaveDown).toBeEnabled();
  await octaveDown.click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("オクターブ元");
  await expect(transport.getByRole("button", { name: "再開", exact: true })).toBeVisible();
});

test("P5.33 remains usable at 320px/effective 200%, reduced motion, and axe clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await openRuleFixture(page);
  const trigger = workspace.getByTestId("voicing-loop-shape-button");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await workspace.getByTestId("voicing-loop-shape-menu").locator('[data-shape="shell"]').focus();
  await page.keyboard.press("Enter");
  await expect(workspace.getByTestId("voicing-loop-shape-label")).toHaveText("シェル");
  await assertNoHorizontalOverflow(page);

  const axe = await new AxeBuilder({ page: page as never })
    .include("[data-testid='voicing-loop-workspace']")
    .analyze();
  expect(axe.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical")).toEqual([]);

  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
});

test("P5.33 paused card seek persists through resume", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const transport = workspace.getByTestId("voicing-loop-transport");
  const lastCard = workspace.getByTestId("voicing-loop-event").last();

  await transport.getByRole("button", { name: "開始", exact: true }).click();
  // A: the pause must land on a started runtime. Waiting only for 再開 could pause a start that was still
  // pending — the transport then cancels it and keeps no session, and the later card click auditions instead of
  // seeking (the heading moves, aria-current never does). The playhead leaving 0 is the state that proves a beat
  // has come from the running transport.
  await expect.poll(async () => workspace.getByTestId("voicing-loop-playhead")
    .evaluate((element) => (element as HTMLElement).style.transform), { timeout: 10_000 }).not.toBe("translateX(0px)");
  await transport.getByRole("button", { name: "一時停止", exact: true }).click();
  // R-01 §2: the state that accepts the seek is the committed pause — the transport button has become 再開 — because a
  // card click racing the (async) start/count-in commit can land on a runtime whose options are not set up yet, and
  // that click is then silently ignored (one FULL run read no aria-current for its whole 10 s poll window).
  await expect(transport.getByRole("button", { name: "再開", exact: true })).toBeVisible();
  await lastCard.click();
  await expect(workspace.getByTestId("voicing-loop-current-next").locator("h2")).toHaveText("Gmaj9/A");
  await expect(workspace.getByTestId("voicing-loop-current-next")).toContainText("Dmaj7");
  await expect(lastCard).toHaveAttribute("aria-current", "step", { timeout: 10_000 });
  await transport.getByRole("button", { name: "再開", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-current-next").locator("h2")).toHaveText("Gmaj9/A");

  await transport.getByRole("button", { name: "停止", exact: true }).click();
  await transport.getByRole("button", { name: "1オクターブ上げる", exact: true }).click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("オクターブ+1");
  // P23-32 K3/K4: the bar is one row — there is no second MIDI row any more.
  await expect(workspace.getByTestId("voicing-loop-transport-midi-row")).toHaveCount(0);
});
