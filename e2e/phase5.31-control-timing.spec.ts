import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

const suppliedFixture = (name: string) => readFileSync(`docs/phase5.31/fixtures/${name}`, "utf8");

async function saveTextToLoop(page: Page, input: string) {
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  const sidebar = page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true });
  if (await sidebar.isVisible()) await sidebar.click();
  else {
    await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  await page.getByRole("button", { name: /Textで新しい進行を入力/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(input);
  await expect(capture.getByTestId("text-progression-invalid-card")).toHaveCount(0);
  await capture.getByTestId("text-key-picker").click();
  await capture.getByTestId("text-progression-key").fill("C major");
  await capture.getByRole("button", { name: /キーを確定|Confirm key/ }).click();
  await capture.getByTestId("text-progression-bpm").fill("120");
  await capture.getByTestId("text-progression-convert").focus();
  await page.keyboard.press("Enter");
  const editor = page.getByTestId("manual-candidate-editor");
  await editor.locator("button[aria-haspopup='dialog']").click();
  const saveForm = page.locator("form[role='dialog']");
  await saveForm.locator("input[name='progression-title']").fill("P5.31 control timing fixture");
  await saveForm.locator("button[type='submit']").click();
  const savedNotice = page.getByText("保存した進行を練習できます").locator("..");
  await savedNotice.getByRole("button", { name: "Voicing Loop", exact: true }).click();
  return page.getByTestId("voicing-loop-workspace");
}

test("P5.31 exact compact and expanded full scores keep timing with generalized family coverage", async ({ page }) => {
  test.setTimeout(60_000);
  const observed: string[][] = [];
  for (const name of ["rechord-user-example.txt", "rechord-user-example-expanded.txt"]) {
    const workspace = await saveTextToLoop(page, suppliedFixture(name));
    await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
    await page.getByRole("searchbox", { name: "進行を検索" }).fill("P5.31 control timing fixture");
    const choice = page.getByTestId("voicing-loop-progression-choice").filter({ hasText: "P5.31 control timing fixture" });
    await expect(choice).toHaveCount(1);
    await choice.focus();
    await page.keyboard.press("Enter");
    const cards = workspace.getByTestId("voicing-loop-event");
    await expect(cards).toHaveCount(34);
    const expectedDurations = Array.from({ length: 16 }, (_, bar) => bar === 3 ? ["1", "1", "1", "1"] : ["2", "2"]).flat();
    expect(await cards.evaluateAll(items => items.map(item => item.getAttribute("data-duration-beats")))).toEqual(expectedDurations);
    observed.push(await cards.evaluateAll(items => items.map(item => item.getAttribute("aria-label") ?? "")));
    await expect(workspace.locator("#voicing-loop-bpm")).toHaveValue("120");
    await expect(workspace.getByRole("button", { name: "Lesson Rules", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await workspace.getByRole("button", { name: "Core", exact: true }).click();
    await expect(workspace.getByRole("button", { name: "Core", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    const current = workspace.getByTestId("voicing-loop-current-next").getByRole("heading", { level: 2 });
    await expect(current).toHaveText("C9");
    await expect(workspace.getByRole("button", { name: /開始/ })).toBeEnabled();
    await expect(workspace.getByText(/個のコードを再生できません/)).toHaveCount(0);
    const playableCards = workspace.locator("[data-testid='voicing-loop-event']:not(:disabled)");
    await expect(playableCards.first()).toBeEnabled();
    await playableCards.first().focus();
    await page.keyboard.press("Enter");
    await expect(playableCards.first()).toHaveAttribute("aria-pressed", "true");
    await expect(current).toHaveText("C9");
  }
  expect(observed[0]).toEqual(observed[1]);
});

test("P5.31 exact official control score saves timing with generalized G triad support", async ({ page }) => {
  const workspace = await saveTextToLoop(page, suppliedFixture("rechord-control-example.txt"));
  const cards = workspace.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(5);
  expect(await cards.evaluateAll(items => items.map(item => item.getAttribute("data-duration-beats"))))
    .toEqual(["1", "1", "1", "3", "2"]);
  expect(await cards.evaluateAll(items => items.map(item => item.getAttribute("data-span-kind"))))
    .toEqual(["chord", "chord", "rest", "chord", "chord"]);
  await expect(cards.nth(4)).toContainText("G");
  await expect(workspace.getByText(/個のコードを再生できません/)).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: /開始/ })).toBeEnabled();
  await cards.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "step");
});

test("P5.31 Text rest/repeat/hold reaches the real single-clock practice transport", async ({ page }) => {
  test.setTimeout(60_000);
  const workspace = await saveTextToLoop(page, "| Cmaj7 _ | % = |");
  const cards = workspace.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(3);
  expect(await cards.evaluateAll((items) => items.map((item) => item.getAttribute("data-duration-beats"))))
    .toEqual(["2", "2", "4"]);
  await expect(cards.nth(1)).toBeEnabled();
  await expect(workspace.getByTestId("voicing-loop-current-next")).toContainText("休符");
  await page.getByLabel("カウントイン").selectOption("0");
  await workspace.getByRole("button", { name: /開始/ }).click();
  const heading = workspace.getByTestId("voicing-loop-current-next").getByRole("heading", { level: 2 });
  await expect(heading).toHaveText("休符");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-current-voicing")).toHaveCount(0);
  await expect(workspace.getByTestId("voicing-loop-detail").locator("svg[role='img']"))
    .toHaveAttribute("aria-label", /お手本0音/);
  await expect(workspace.getByRole("button", { name: "現在のコードを試聴", exact: true })).toBeDisabled();
  await cards.nth(2).focus();
  await page.keyboard.press("Enter");
  // Current Voicing Loop auditions a keyboard-selected card while paused.
  await expect(cards.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(heading).toHaveText("Cmaj7");
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await expect(heading).toHaveText("Cmaj7");
  await expect(workspace).toContainText("1 周完了");
  await page.getByRole("button", { name: "停止", exact: true }).click();
});

test("P5.31 slash identity remains playable through promoted Core upper-structure rules", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  const workspace = await saveTextToLoop(page, "| Am9/C | Am11/B | Am9/C |");
  await expect(workspace.getByRole("button", { name: "Lesson Rules", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await workspace.getByRole("button", { name: "Core", exact: true }).click();
  await expect(workspace.getByRole("button", { name: "Core", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(workspace.getByTestId("voicing-loop-current-next").getByRole("heading", { level: 2 })).toHaveText("Am9/C");
  await expect(workspace.getByTestId("voicing-loop-current-explanation"))
    .toContainText("Family Core");
  await expect(workspace.getByTestId("voicing-loop-current-explanation"))
    .toContainText("Literal");
  await expect(workspace.getByTestId("slash-bass-reference")).toHaveCount(0);
  await expect(workspace.locator("[data-guide-hand='left']")).toHaveCount(1);
  await expect(workspace.locator("[data-guide-hand='right']")).toHaveCount(4);
  await expect(workspace.getByRole("button", { name: /開始/ })).toBeEnabled();
  const card = workspace.getByTestId("voicing-loop-event").nth(1);
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(workspace.getByTestId("voicing-loop-current-next").getByRole("heading", { level: 2 })).toHaveText("Am11/B");
  await assertNoHorizontalOverflow(page);
  const axe = await new AxeBuilder({ page: page as never }).include("[data-testid='voicing-loop-workspace']").analyze();
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  await workspace.getByRole("button", { name: "Recall（コード名のみ）", exact: true }).click();
  await expect(workspace.locator("[data-guide-hand]")).toHaveCount(0);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
});
test("P5.31 all-rest maximum score is saveable and honest at 320px, 200% and reduced motion", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await saveTextToLoop(page, `| ${Array(32).fill("_").join(" | ")} |`);
  await expect(workspace.getByTestId("voicing-loop-event")).toHaveCount(1);
  await expect(workspace.getByTestId("voicing-loop-event")).toHaveAttribute("data-duration-beats", "128");
  await page.getByLabel("カウントイン").selectOption("0");
  await workspace.getByRole("button", { name: /開始/ }).click();
  await expect(workspace).toContainText("自動送り中");
  await expect(workspace.getByRole("progressbar", { name: "拍" })).toHaveCount(0);
  await expect(workspace.getByRole("progressbar", { name: "位置" })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const axe = await new AxeBuilder({ page: page as never }).include("[data-testid='voicing-loop-workspace']").analyze();
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
  await expect(workspace.getByTestId("voicing-loop-playhead")).toHaveCSS("transition-duration", "1e-05s");
});
