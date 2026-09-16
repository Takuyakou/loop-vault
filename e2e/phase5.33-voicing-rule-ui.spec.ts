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
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  return page.getByTestId("voicing-loop-workspace");
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

test("P5.33 exposes independent source/study axes and explains the active rule", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const controls = workspace.getByTestId("voicing-loop-controls");

  await expect(controls.locator("legend")).toHaveText(["SOURCE", "STUDY", "DISPLAY"]);
  await expect(controls.getByRole("button", { name: "Lesson Rules", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls.getByRole("button", { name: "Teacher", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(controls.getByRole("checkbox", { name: "Colorを加える", exact: true })).not.toBeChecked();
  await expect(controls.getByRole("checkbox", { name: "Open配置", exact: true })).not.toBeChecked();
  await expect(controls.getByRole("checkbox", { name: "進行に合わせて最適化", exact: true })).not.toBeChecked();

  const explanation = workspace.getByTestId("voicing-loop-current-explanation");
  await expect(explanation).toContainText("Teacher Style");
  await expect(explanation).toContainText("Candidate");
  await expect(explanation).not.toContainText("RULEP5.31-MIN11");
  await expect(explanation).toContainText("RULEP5.33-GEN-TEACHER-MAJ7");
  await expect(explanation).toContainText("TOPTop Candidate");

  await controls.getByRole("button", { name: "Core", exact: true }).click();
  await expect(explanation).toContainText("Family Core");
  await expect(explanation).toContainText("RULEP5.33-GEN-CORE-MAJ7");

  await controls.getByRole("button", { name: "Source MIDI", exact: true }).click();
  await expect(explanation).toHaveText("Source MIDI");
  for (const label of ["Teacher", "Core"]) {
    await expect(controls.getByRole("button", { name: label, exact: true })).toBeDisabled();
  }
  for (const label of ["Colorを加える", "Open配置", "進行に合わせて最適化"]) {
    await expect(controls.getByRole("checkbox", { name: label, exact: true })).toBeDisabled();
  }
  await controls.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(explanation).toHaveText("Custom");
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
    await controls.getByRole("button", { name: study, exact: true }).click();
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

  for (const source of ["Source MIDI", "Custom", "Lesson Rules"]) {
    await controls.getByRole("button", { name: source, exact: true }).click();
    expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  }
  for (const study of ["Teacher", "Core"]) {
    await controls.getByRole("button", { name: study, exact: true }).click();
    expectStableKeyboard(await keyboardGeometry(workspace), baseline);
  }
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
  await expect(start).toBeEnabled();
  const startBox = await start.boundingBox();
  expect(startBox?.height).toBeGreaterThanOrEqual(38);
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

  for (const label of ["Colorを加える", "Open配置", "進行に合わせて最適化"]) {
    await controls.getByRole("checkbox", { name: label, exact: true }).check();
    await expect(pause).toBeVisible();
  }

  const octaveUp = transport.getByRole("button", { name: "1オクターブ上げる", exact: true });
  await expect(octaveUp).toBeEnabled();
  await octaveUp.click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("OCT+1");
  await expect(pause).toBeVisible();

  await pause.click();
  await expect(transport.getByRole("button", { name: "再開", exact: true })).toBeVisible();
  const octaveDown = transport.getByRole("button", { name: "1オクターブ下げる", exact: true });
  await expect(octaveDown).toBeEnabled();
  await octaveDown.click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("OCT元");
  await expect(transport.getByRole("button", { name: "再開", exact: true })).toBeVisible();
});

test("P5.33 remains usable at 320px/effective 200%, reduced motion, and axe clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await openRuleFixture(page);
  await workspace.getByRole("button", { name: "Core", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(workspace.getByRole("button", { name: "Core", exact: true })).toHaveAttribute("aria-pressed", "true");
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

test("P5.33 card audition updates Current/Next without seeking resume and keeps MIDI on row two", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const workspace = await openRuleFixture(page);
  const transport = workspace.getByTestId("voicing-loop-transport");
  const firstCard = workspace.getByTestId("voicing-loop-event").first();
  const lastCard = workspace.getByTestId("voicing-loop-event").last();

  await transport.getByRole("button", { name: "開始", exact: true }).click();
  await transport.getByRole("button", { name: "一時停止", exact: true }).click();
  await lastCard.click();
  await expect(workspace.getByTestId("voicing-loop-current-next").locator("h2")).toHaveText("Gmaj9/A");
  await expect(workspace.getByTestId("voicing-loop-current-next")).toContainText("次Dmaj7");
  await expect(firstCard).toHaveAttribute("aria-current", "step");
  await transport.getByRole("button", { name: "再開", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-current-next").locator("h2")).toHaveText("Dmaj7");

  await transport.getByRole("button", { name: "停止", exact: true }).click();
  await transport.getByRole("button", { name: "1オクターブ上げる", exact: true }).click();
  await expect(transport.getByTestId("voicing-loop-transport-primary")).toContainText("OCT+1");
  const primaryBox = await transport.getByTestId("voicing-loop-transport-primary").boundingBox();
  const midiBox = await transport.getByTestId("voicing-loop-transport-midi-row").boundingBox();
  expect(primaryBox && midiBox && midiBox.y).toBeGreaterThan(primaryBox?.y ?? 0);
});
