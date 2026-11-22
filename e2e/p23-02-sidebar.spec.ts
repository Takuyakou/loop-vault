import { expect, test, type Page } from "@playwright/test";
import { openApp, openTextCapture, waitForSidebarSettled } from "./helpers/app";

/** P23-02 §3: practice marks, the accent bar of the current entry, 集める, and the Vault count. */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

const iconCentres = (page: Page) => page.locator(".lv-sidebar-nav .lv-nav-item svg").evaluateAll((icons) =>
  icons.map((icon) => {
    const box = icon.getBoundingClientRect();
    return box.left + box.width / 2;
  }));

test("the practice entries carry VL, CD and BP, and the icons stay centred", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-nav="voicing-loop"] .lv-nav-mark')).toHaveText("VL");
  await expect(page.locator('[data-nav="chord-dojo"] .lv-nav-mark')).toHaveText("CD");
  await expect(page.locator('[data-nav="bass-practice"] .lv-nav-mark')).toHaveText("BP");
  const expanded = await iconCentres(page);
  expect(expanded.length).toBeGreaterThan(5);
  for (const centre of expanded) expect(Math.abs(centre - expanded[0]!)).toBeLessThanOrEqual(0.5);

  await page.getByRole("button", { name: "サイドバーを狭める" }).click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
  await waitForSidebarSettled(page);
  const collapsed = await iconCentres(page);
  expect(collapsed).toHaveLength(expanded.length);
  for (const centre of collapsed) expect(Math.abs(centre - collapsed[0]!)).toBeLessThanOrEqual(0.5);
});

test("the current entry has the accent bar on its left edge and no outline", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  const dojo = page.locator('[data-nav="chord-dojo"]');
  await expect(dojo).toHaveAttribute("aria-current", "page");
  const current = await dojo.evaluate((element) => {
    const bar = getComputedStyle(element, "::before");
    return { width: bar.width, background: bar.backgroundColor, shadow: getComputedStyle(element).boxShadow };
  });
  expect(current).toEqual({ width: "3px", background: "rgb(66, 216, 198)", shadow: "none" });
  const other = await page.locator('[data-nav="home"]').evaluate((element) => getComputedStyle(element, "::before").content);
  expect(other).toBe("none");
});

test("集める sits above 取り込む, and 練習 above Voicing Loop", async ({ page }) => {
  await openApp(page);
  const order = await page.locator(".lv-sidebar-nav").evaluate((nav) => [...nav.children].map((child) => {
    if (child.classList.contains("lv-sidebar-heading")) return child.textContent?.trim() ?? "";
    if (child.classList.contains("lv-sidebar-rule")) return "(線)";
    return child.querySelector(".lv-nav-label")?.textContent?.trim() ?? "";
  }));
  expect(order).toEqual(["ホーム", "集める", "取り込む", "Vault", "練習", "Voicing Loop", "Chord Dojo", "Bass Practice", "(線)", "Live MIDI", "設定"]);
});

test("Vault shows how many progressions there are, and the button is still called Vault", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("nav-vault-count")).toHaveCount(0);
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 Dm7 | G7 Cmaj7 |");
  await capture.getByTestId("text-progression-save").click();
  await expect(page.getByTestId("nav-vault-count")).toHaveText("1");
  await expect(page.locator(".lv-sidebar").getByRole("button", { name: "Vault", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "サイドバーを狭める" }).click();
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
  await waitForSidebarSettled(page);
  await expect.poll(() => page.getByTestId("nav-vault-count").evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
});
