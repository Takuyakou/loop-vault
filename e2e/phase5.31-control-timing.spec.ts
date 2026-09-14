import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

async function saveTextToLoop(page: Page, input: string) {
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true }).click();
  await page.getByRole("button", { name: /Textで新しい進行を入力/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(input);
  await expect(capture.getByTestId("text-progression-invalid-card")).toHaveCount(0);
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

test("P5.31 Text rest/repeat/hold reaches the real single-clock practice transport", async ({ page }) => {
  test.setTimeout(60_000);
  const workspace = await saveTextToLoop(page, "| Cmaj7 _ | % = |");
  const cards = workspace.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(3);
  expect(await cards.evaluateAll((items) => items.map((item) => item.getAttribute("data-duration-beats"))))
    .toEqual(["2", "2", "4"]);
  await expect(cards.nth(1)).toBeDisabled();
  await expect(workspace.getByTestId("voicing-loop-current-next")).toContainText("次休符");
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
  await expect(cards.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(heading).toHaveText("休符");
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(workspace).toContainText("1 周完了");
  await page.getByRole("button", { name: "停止", exact: true }).click();
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
  await expect(workspace.getByTestId("voicing-loop-beat-indicator").locator("[data-active]")).toHaveCount(16);
  await assertNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const axe = await new AxeBuilder({ page: page as never }).include("[data-testid='voicing-loop-workspace']").analyze();
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
  await expect(workspace.getByTestId("voicing-loop-playhead")).toHaveCSS("transition-duration", "1e-05s");
});
