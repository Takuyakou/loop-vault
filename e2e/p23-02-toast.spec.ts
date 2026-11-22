import { expect, test } from "@playwright/test";
import { createSavedProgression, openApp } from "./helpers/app";

/** P23-02 §2: the toast has no coloured edge, its time bar grows from the left, and a Home favourite says nothing. */

test("the time bar starts empty and the toast has no coloured edge", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page);
  await createSavedProgression(page, "P23-02 toast");
  await page.locator('[data-nav="vault"]').click();
  const row = page.locator(".lv-vault-row").first();
  await expect(row).toBeVisible();
  // P23-10 V3: the row has no copy button; the chosen row's contents have 「コードをコピー」.
  await page.getByTestId("vault-preview").getByRole("button", { name: "コードをコピー" }).click();
  const toast = page.locator(".lv-toast").first();
  await expect(toast).toBeVisible();
  const shape = await toast.evaluate((element) => ({
    shadow: getComputedStyle(element).boxShadow,
    barAnimation: getComputedStyle(element.querySelector(".lv-toast-bar")!).animationName,
  }));
  expect(shape.shadow).not.toContain("inset");
  expect(shape.barAnimation).toBe("lvToastTime");
  const frames = await page.evaluate(() => {
    const visit = (rules: CSSRuleList): CSSKeyframesRule | undefined => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule && rule.name === "lvToastTime") return rule;
        if ("cssRules" in rule) {
          const inner = visit((rule as CSSGroupingRule).cssRules);
          if (inner) return inner;
        }
      }
      return undefined;
    };
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      const found = visit(rules);
      if (found) {
        return {
          first: found.findRule("0%")?.style.transform ?? found.findRule("from")?.style.transform,
          last: found.findRule("100%")?.style.transform ?? found.findRule("to")?.style.transform,
        };
      }
    }
    return undefined;
  });
  expect(frames).toEqual({ first: "scaleX(0)", last: "scaleX(1)" });
});

test("a favourite on the Home says nothing in the corner", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "P23-02 favourite");
  await page.locator('[data-nav="home"]').click();
  const loop = page.getByTestId("home-today-loop");
  await expect(loop).toBeVisible();
  // the save's own toast has to be gone first
  await expect(page.locator(".lv-toast")).toHaveCount(0, { timeout: 10_000 });
  await loop.getByRole("button", { name: "お気に入りに追加", exact: true }).click();
  await expect(loop.getByRole("button", { name: "お気に入りから外す", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator(".lv-toast")).toHaveCount(0);
  await loop.getByRole("button", { name: "お気に入りから外す", exact: true }).click();
  await expect(loop.getByRole("button", { name: "お気に入りに追加", exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator(".lv-toast")).toHaveCount(0);
});

test("the undo toast after deleting a progression stays on one line (P23-03 M10)", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "P23-03 one line");
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await page.locator('[data-nav="vault"]').click();
    await page.locator(".lv-vault-progression").first().click();
    await page.getByRole("button", { name: "そのほか", exact: true }).click();
    await page.getByRole("button", { name: "この進行を削除…", exact: true }).click();
    const toast = page.locator(".lv-toast").filter({ hasText: "保存したコード進行を削除しました" });
    await expect(toast).toBeVisible();
    const height = await toast.locator(".lv-toast-message").evaluate((element) => element.getBoundingClientRect().height);
    expect(height, `${size.width}x${size.height}`).toBeLessThan(30);
    await toast.getByRole("button", { name: "元に戻す" }).click();
    await expect(toast).toHaveCount(0);
  }
});
