import { expect, test } from "@playwright/test";

test("VL-12 Space shortcut respects native controls and keeps keyboard focus visible", async ({ page }) => {
  await page.goto("/?p527Status=vl09-layout");
  const nav = page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true });
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  const workspace = page.getByTestId("voicing-loop-workspace");
  await workspace.locator("#voicing-loop-count-in").selectOption("0");
  await expect(workspace.getByTestId("voicing-loop-current-panel")).not.toHaveAttribute("tabindex");
  await expect(workspace.getByTestId("voicing-loop-next-panel")).not.toHaveAttribute("tabindex");
  await page.locator("body").focus();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "再開" })).toBeVisible();
  await workspace.getByRole("button", { name: "再開" }).click();
  await expect(workspace.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "再開" })).toBeVisible();
  await workspace.locator("#voicing-loop-bpm").focus();
  await page.keyboard.press("Space");
  await expect(workspace.getByRole("button", { name: "再開" })).toBeVisible();
  const timeline = workspace.getByTestId("voicing-loop-timeline-viewport");
  await timeline.focus();
  expect(await timeline.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
});
