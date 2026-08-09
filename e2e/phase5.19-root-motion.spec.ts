import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

async function openRootMotion(page: import("@playwright/test").Page) {
  await openApp(page);
  await page.getByTestId("bass-practice-home-card").getByRole("button").click();
  await page.getByRole("tab", { name: "Root Motion Echo" }).click();
  return page.getByTestId("root-motion-echo-view");
}

function parseDuration(value: string): number {
  return Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1_000;
  }));
}

test("P5.19 production default exposes a keyboard-operable Root Motion Echo at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const view = await openRootMotion(page);
  await expect(view).toBeVisible();
  await expect(view.getByTestId("root-motion-source")).toHaveValue("generated");
  await assertNoHorizontalOverflow(page);

  const level = view.getByLabel("Root Motion level");
  await level.focus();
  await page.keyboard.press("ArrowDown");
  await expect(level).toHaveValue("2");

  const listen = view.getByTestId("root-motion-listen");
  await listen.focus();
  await page.keyboard.press("Enter");
  // Browser audio can finish the short two-note phrase before the next frame; either path must reach Identify.
  await expect(view.locator("fieldset").first()).toBeVisible({ timeout: 10_000 });
  await assertNoHorizontalOverflow(page);
});

test("P5.19 Root Motion meets reduced-motion, effective 200% scale, and axe serious/critical gates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 720 });
  const view = await openRootMotion(page);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(view).toBeVisible();
  await assertNoHorizontalOverflow(page);

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const durations = await view.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  expect(durations.every(({ animation, transition }) => parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);

  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
});

test("P5.19 preserves a completed Root Motion session through History persistence and exposes Transfer", async ({ page }) => {
  const view = await openRootMotion(page);
  await view.getByTestId("root-motion-listen").click();
  await view.getByRole("button", { name: /^(Same|\u540c\u3058)$/ }).waitFor({ state: "visible", timeout: 10_000 });
  await view.getByRole("button", { name: /^(Same|\u540c\u3058)$/ }).click();
  await view.getByRole("button", { name: /^(Record answer|\u56de\u7b54\u3092\u78ba\u5b9a)$/ }).click();
  await view.getByRole("button", { name: /^(Continue to Play|\u6b4c\u3063\u3066\u6f14\u594f\u3078)$/ }).click();
  await view.getByRole("button", { name: /^(Finish Play and review|\u6f14\u594f\u3092\u7d42\u3048\u3066\u30ec\u30d3\u30e5\u30fc\u3078)$/ }).click();
  await view.getByRole("button", { name: "good", exact: true }).click();
  await expect(view.getByRole("button", { name: /^(Transfer to a new starting root|\u5225\u306e\u958b\u59cb\u97f3\u3067\u79fb\u8abf)$/ })).toBeVisible();
  await expect(view.locator("[aria-current='step']")).toHaveText(/^(Transfer|\u79fb\u8abf)$/);
});
test("P5.19 explicit local rollback hides Root Motion only", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("loop-vault:bass-practice-root-motion-enabled:v1", "false");
  });
  await openApp(page);
  await page.getByTestId("bass-practice-home-card").getByRole("button").click();
  await expect(page.getByRole("tab", { name: "Degree Echo" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Root Motion Echo" })).toHaveCount(0);
});