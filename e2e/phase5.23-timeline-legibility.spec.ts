import { expect, test } from "@playwright/test";
import {
  analyzeCurrentMidi,
  assertNoHorizontalOverflow,
  chooseFirstCandidate,
  loadMidiForPreAnalysis,
  openApp,
  waitForSidebarSettled,
} from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

test("Vault save form stays visible with the sidebar expanded at the reported narrow size", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 786, height: 836 });
  await openApp(page);

  const sidebar = page.locator("[data-sidebar]");
  if (await sidebar.getAttribute("data-sidebar") === "collapsed") {
    await page.getByRole("button", { name: "サイドバーを広げる" }).click();
  }
  await expect(sidebar).toHaveAttribute("data-sidebar", "expanded");
  await waitForSidebarSettled(page);

  await loadMidiForPreAnalysis(
    page,
    createMidiFixture({ bars: 20, voiceCount: 3 }),
    "save-popover-narrow.mid",
  );
  // P10.0-07: the workspace's save form (the narrow panel opens first).
  await analyzeCurrentMidi(page);
  await chooseFirstCandidate(page);
  await page.getByTestId("correction-save-form").getByRole("button", { name: /Vaultに保存/, exact: true }).click();
  const form = page.locator('form[role="dialog"]:has(input[name="progression-title"])');
  await expect(form).toBeVisible();

  const bounds = await form.evaluate((element) => {
    const formBounds = element.getBoundingClientRect();
    const mainBounds = document.querySelector("main")!.getBoundingClientRect();
    return {
      formLeft: formBounds.left,
      formRight: formBounds.right,
      formTop: formBounds.top,
      formBottom: formBounds.bottom,
      mainLeft: mainBounds.left,
      mainRight: mainBounds.right,
      viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.formLeft).toBeGreaterThanOrEqual(bounds.mainLeft + 7);
  expect(bounds.formRight).toBeLessThanOrEqual(bounds.mainRight - 7);
  expect(bounds.formTop).toBeGreaterThanOrEqual(7);
  expect(bounds.formBottom).toBeLessThanOrEqual(bounds.viewportHeight - 7);
  await expect(form.locator('input[name="progression-title"]')).toBeFocused();
  await assertNoHorizontalOverflow(page);
});
