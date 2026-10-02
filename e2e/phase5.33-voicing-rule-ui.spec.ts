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
  await page.getByTestId("voicing-loop-generated-details").locator("summary").click();
  return page.getByTestId("voicing-loop-workspace");
}

async function openExtendedReductionFixture(page: Page): Promise<Locator> {
  await page.goto("/?p527Status=p533-extended-reductions");
  await page.evaluate(() => document.fonts.ready);
  await chooseVoicingLoop(page);
  await page.getByTestId("voicing-loop-generated-details").locator("summary").click();
  return page.getByTestId("voicing-loop-workspace");
}

// Source/type changes and outside operations dismiss details. Reopen through the real UI.
async function openDetails(workspace: Locator) {
  const details = workspace.getByTestId("voicing-loop-generated-details");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
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
  expect(Math.abs(actual.regionHeight - expected.regionHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.svgWidth - expected.svgWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.svgHeight - expected.svgHeight)).toBeLessThanOrEqual(1);
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

  await expect(controls.locator("legend")).toHaveText(["ソース", "生成タイプ", "表示"]);
  await expect(controls.getByRole("button", { name: "自動生成", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls.getByRole("combobox", { name: "生成タイプ", exact: true })).toHaveAttribute("value", "teacher");
  await expect(controls.getByRole("checkbox", { name: "Colorを加える", exact: true })).not.toBeChecked();
  await expect(controls.getByRole("checkbox", { name: "Open配置", exact: true })).not.toBeChecked();
  await expect(controls.getByRole("checkbox", { name: "進行に合わせて最適化", exact: true })).toBeChecked();

  const explanation = workspace.getByTestId("voicing-loop-current-explanation");
  await expect(explanation).toContainText("Teacher Style");
  await expect(explanation).toContainText("候補");
  await expect(explanation).not.toContainText("ルールP5.31-MIN11");
  await expect(explanation).toContainText("ルールP5.33-GEN-TEACHER-MAJ7");
  await expect(explanation).toContainText("トップトップ候補");

  await controls.getByRole("combobox", { name: "生成タイプ", exact: true }).click();
    await page.getByRole("option", { name: "骨組み", exact: true }).click();
  await expect(explanation).toContainText("Family Core");
  await expect(explanation).toContainText("ルールP5.33-GEN-CORE-MAJ7");

  await controls.getByRole("button", { name: "元MIDI", exact: true }).click();
  await expect(explanation).toHaveCount(0);
  await expect(controls.getByRole("combobox", { name: "生成タイプ", exact: true })).toBeDisabled();
  const details = workspace.getByTestId("voicing-loop-generated-details");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(details.locator("summary")).toHaveAttribute("aria-disabled", "true");
  // Disabled legacy inputs stay in the closed details DOM; fixed sources cannot open it.
  await expect(details.getByLabel("Colorを加える", { exact: true })).toBeDisabled();
  await expect(details.getByLabel("Open配置", { exact: true })).toBeDisabled();
  await expect(controls.getByLabel("進行に合わせて最適化", { exact: true })).toBeDisabled();
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

test("P5.33 compares Literal, OMIT 5, and OMIT 5/9 extended-chord candidates", async ({ page }) => {
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

  expect([...states].some((value) => value.includes("Literal") && value.includes("省略なし"))).toBe(true);
  expect([...states].some((value) => value.includes("演奏用省略") && value.includes("省略5"))).toBe(true);
  expect([...states].some((value) => value.includes("演奏用省略") && value.includes("省略5 · 9"))).toBe(true);
  await expect(label).toHaveText(initial ?? "");
});

test("P5.33 supports all eight acceptance chords in every base/modifier combination", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const controls = workspace.getByTestId("voicing-loop-controls");

  await expect(workspace.getByTestId("voicing-loop-event")).toHaveCount(8);
  for (const [study, color, open] of [
    ["Teacher", false, false], ["Teacher", true, false], ["Teacher", false, true], ["Teacher", true, true],
    ["Core", false, false], ["Core", true, false], ["Core", false, true], ["Core", true, true],
  ] as const) {
    await controls.getByRole("combobox", { name: "生成タイプ", exact: true }).click();
    await page.getByRole("option", { name: (study === "Teacher" ? "基本" : "骨組み"), exact: true }).click();
    await expect(workspace.getByTestId("voicing-loop-generated-details")).not.toHaveAttribute("open", "");
    await openDetails(workspace);
    await controls.getByRole("checkbox", { name: "Colorを加える", exact: true }).setChecked(color);
    await controls.getByRole("checkbox", { name: "Open配置", exact: true }).setChecked(open);
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
  for (const study of ["Teacher", "Core"]) {
    await controls.getByRole("combobox", { name: "生成タイプ", exact: true }).click();
    await page.getByRole("option", { name: (study === "Teacher" ? "基本" : "骨組み"), exact: true }).click();
    expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  }
  await openDetails(workspace);
  await controls.getByRole("checkbox", { name: "Colorを加える", exact: true }).check();
  expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  await controls.getByRole("checkbox", { name: "Open配置", exact: true }).check();
  expectStableKeyboard(await keyboardGeometry(workspace), baseline);

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
  const controls = workspace.getByTestId("voicing-loop-controls");
  const transport = workspace.getByTestId("voicing-loop-transport");

  await transport.getByRole("button", { name: "開始", exact: true }).click();
  const pause = transport.getByRole("button", { name: "一時停止", exact: true });
  await expect(pause).toBeVisible();

  await openDetails(workspace);
  for (const label of ["Colorを加える", "Open配置", "進行に合わせて最適化"]) {
    await controls.getByRole("checkbox", { name: label, exact: true }).check();
    await expect(pause).toBeVisible();
  }

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
  await workspace.getByRole("combobox", { name: "生成タイプ", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(workspace.getByRole("combobox", { name: "生成タイプ", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(workspace.getByRole("combobox", { name: "生成タイプ", exact: true })).toHaveAttribute("value", "core");
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

test("P5.33 paused card seek persists through resume and keeps MIDI on the second transport row", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const transport = workspace.getByTestId("voicing-loop-transport");
  const lastCard = workspace.getByTestId("voicing-loop-event").last();

  await transport.getByRole("button", { name: "開始", exact: true }).click();
  await transport.getByRole("button", { name: "一時停止", exact: true }).click();
  await lastCard.click();
  await expect(workspace.getByTestId("voicing-loop-current-next").locator("h2")).toHaveText("Gmaj9/A");
  await expect(workspace.getByTestId("voicing-loop-current-next")).toContainText("Dmaj7");
  await expect(lastCard).toHaveAttribute("aria-current", "step");
  await transport.getByRole("button", { name: "再開", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-current-next").locator("h2")).toHaveText("Gmaj9/A");

  await transport.getByRole("button", { name: "停止", exact: true }).click();
  await transport.getByRole("button", { name: "1オクターブ上げる", exact: true }).click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("オクターブ+1");
  const primaryBox = await transport.getByTestId("voicing-loop-transport-primary").boundingBox();
  const midiBox = await transport.getByTestId("voicing-loop-transport-midi-row").boundingBox();
  expect(primaryBox && midiBox).toBeTruthy();
  expect(midiBox!.y).toBeGreaterThanOrEqual(primaryBox!.y + primaryBox!.height);
  expect(midiBox!.y + midiBox!.height).toBeLessThanOrEqual((await transport.boundingBox())!.y + (await transport.boundingBox())!.height + 2);
});
