import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

async function openPopulatedVoicingLoop(page: Page) {
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  return page.getByTestId("voicing-loop-workspace");
}

test("P5.32 suggests exact-key fingering, supports hand selection, and preserves playback", async ({ page }) => {
  const workspace = await openPopulatedVoicingLoop(page);
  await expect(workspace.getByRole("checkbox", { name: "おすすめ運指を表示" })).toBeChecked();
  await expect(workspace.getByTestId("voicing-loop-current-voicing")).toContainText("現在の運指:");
  await expect(workspace.getByText(/次の運指:/)).toBeVisible();
  await expect(workspace.locator("[data-finger-label]")).not.toHaveCount(0);
  await expect(workspace.locator("[data-midi-note] title").filter({ hasText: /, R[1-5]/ }).first()).toBeAttached();

  await workspace.getByRole("button", { name: "左手 L", exact: true }).click();
  await expect(workspace.getByTestId("voicing-loop-current-voicing")).toContainText("現在の運指: L");
  await expect(workspace.locator("[data-finger-label^='L']")).not.toHaveCount(0);

  await workspace.getByRole("checkbox", { name: "おすすめ運指を表示" }).uncheck();
  await expect(workspace.getByTestId("voicing-loop-fingering-summary")).toHaveCount(0);
  await expect(workspace.locator("[data-finger-label]")).toHaveCount(0);
  await workspace.getByRole("checkbox", { name: "おすすめ運指を表示" }).check();

  await page.getByLabel("カウントイン").selectOption("0");
  await workspace.getByRole("button", { name: /開始/ }).click();
  await expect(workspace.getByRole("button", { name: "一時停止", exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
});

test("P5.32 is keyboard-operable, 320px/200%, reduced-motion, and axe clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await openPopulatedVoicingLoop(page);
  const hand = workspace.getByRole("button", { name: "左手 L", exact: true });
  await hand.focus();
  await page.keyboard.press("Enter");
  await expect(hand).toHaveAttribute("aria-pressed", "true");
  const firstFinger = workspace.getByTestId("voicing-loop-fingering-editor").getByRole("combobox").first();
  await firstFinger.focus();
  await page.keyboard.press("ArrowDown");
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
