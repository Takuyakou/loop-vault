import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression, openApp } from "./helpers/app";

/**
 * P23-30: the confirm windows (D1-D5, D7) as the running app opens them. The problem panels (P1-P8)
 * and the windows only a component can open are covered by `src/components/StartupStates.test.tsx` and
 * `src/components/Modal.test.tsx`; the panels are photographed from the component gallery.
 */
const dialog = (page: Page) => page.locator("[role='dialog']");
const leaveDialog = (page: Page) => dialog(page).filter({ has: page.locator(".lv-confirm-title") });

const shape = (page: Page) => leaveDialog(page).evaluate((element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    radius: style.borderTopLeftRadius,
    title: getComputedStyle(element.querySelector(".lv-confirm-title")!).fontSize,
    desc: getComputedStyle(element.querySelector(".lv-confirm-desc")!).fontSize,
    right: Math.round(rect.right),
    left: Math.round(rect.left),
  };
});

const windowParts = (page: Page) => leaveDialog(page).evaluate((element) => ({
  title: element.querySelector(".lv-confirm-title")?.textContent,
  description: element.querySelector(".lv-confirm-desc")?.textContent,
  changeCount: element.querySelector("[data-testid='confirm-change-count']")?.textContent,
  actions: [...element.querySelectorAll<HTMLElement>(".lv-confirm-actions > button")].map((button) => ({
    text: button.textContent,
    variant: [...button.classList].find((name) => name.startsWith("lv-button-")) ?? "",
    x: Math.round(button.getBoundingClientRect().x),
  })),
  spacers: element.querySelectorAll(".lv-confirm-spacer").length,
}));

/** A saved progression with one unsaved edit, so the page's own leave guard has something to ask about. */
async function openDirtyProgression(page: Page) {
  await openApp(page);
  await createSavedProgression(page, "P23-30 Leave Fixture");
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: /進行を開く/ }).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
  if (await page.getByTestId("progression-memo-add").isVisible()) await page.getByTestId("progression-memo-add").click();
  await page.getByLabel("メモ", { exact: true }).fill("P23-30 leave fixture memo");
  await page.getByLabel("メモ", { exact: true }).blur();
  await expect(page.getByRole("button", { name: "上書き保存", exact: true })).toBeEnabled();
}

test("C3/C1 D1-D5: the progression page's leave window — one shape, one order, the badges", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDirtyProgression(page);

  await page.locator(".lv-progression-back").click();
  await expect(leaveDialog(page)).toBeVisible();

  const parts = await windowParts(page);
  expect(parts.title).toBe("変更を保存しますか？");
  expect(parts.description).toBe("この進行には、まだ保存していない変更があります。保存せずに移ると、その変更は消えます。");
  // D1: 取り消す方 (left) — the space — 消える方 — 主の方 (right).
  expect(parts.spacers).toBe(1);
  expect(parts.actions.map((action) => action.text)).toEqual(["戻るEsc", "保存せずに移る", "保存して移る"]);
  expect(parts.actions[1]!.variant).toBe("lv-button-danger");
  expect(parts.actions[2]!.variant).toBe("lv-button-primary");
  expect(parts.actions[0]!.x).toBeLessThan(parts.actions[1]!.x);
  expect(parts.actions[1]!.x).toBeLessThan(parts.actions[2]!.x);

  const sized = await shape(page);
  expect(sized.width).toBe(480);
  expect(sized.radius).toBe("16px");
  expect(sized.title).toBe("17px");
  expect(sized.desc).toBe("13px");
  await page.screenshot({ path: "p89-generated/p23-30/window-progression-leave-1440x900.png" });

  // C4: Esc closes and changes nothing; the page is still there with the unsaved edit.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("[data-progression-detail-view]")).toBeVisible();
  await expect(page.getByRole("button", { name: "上書き保存", exact: true })).toBeEnabled();

  // C4: so does a click outside the window.
  await page.locator(".lv-progression-back").click();
  await expect(leaveDialog(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("[data-progression-detail-view]")).toBeVisible();
});

test("C5: four sizes — no sideways overflow, axe clean, and the focus starts inside the window", async ({ page }) => {
  test.setTimeout(240_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openDirtyProgression(page);
    await page.locator(".lv-progression-back").click();
    await expect(leaveDialog(page)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const sized = await shape(page);
    expect(sized.right, `${size.width}`).toBeLessThanOrEqual(size.width);
    expect(sized.left, `${size.width}`).toBeGreaterThanOrEqual(0);
    expect(sized.width, `${size.width}`).toBeLessThanOrEqual(480);
    expect(sized.radius).toBe("16px");
    const focusInside = await page.evaluate(() => Boolean(document.activeElement?.closest("[role='dialog']")));
    expect(focusInside, `${size.width}: the focus starts inside the window`).toBe(true);

    const axe = await new AxeBuilder({ page: page as never })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), `${size.width}`).toEqual([]);

    if (size.width === 768) await page.screenshot({ path: "p89-generated/p23-30/window-progression-leave-768x640.png" });
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  }
});
