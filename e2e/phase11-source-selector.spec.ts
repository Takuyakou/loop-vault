import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const fixture of ["p11-identical", "p11-saved", "p11-one-hand"]) {
  test(`P11 fixed sources ${fixture} keep exact notes and compact geometry`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/?p527Status=${fixture}`);
    await page.locator('[data-nav="voicing-loop"]').click();
    const saved = page.getByRole("button", { name: "保存した音", exact: true });
    if (fixture !== "p11-saved") {
      await expect(saved).toHaveCount(0);
      await expect(page.getByRole("button", { name: "元MIDI", exact: true })).toHaveAttribute("aria-pressed", "true");
    } else {
      await expect(saved).toBeVisible();
      await expect(saved).toHaveAttribute("aria-pressed", "true");
    }
    const panel = page.getByTestId("voicing-loop-current-panel");
    const before = await panel.getByTestId("voicing-loop-current-voicing").innerText();
    for (const source of ["元MIDI", "カスタム", ...(fixture === "p11-saved" ? ["保存した音"] : [])]) {
      await page.getByRole("button", { name: source, exact: true }).click();
      await expect.poll(() => panel.getByTestId("voicing-loop-current-voicing").innerText()).toBe(before);
      const geometry = await panel.evaluate(node => ({ client: node.clientHeight, scroll: node.scrollHeight,
        unused: node.getBoundingClientRect().bottom - node.querySelector('[data-testid="voicing-loop-next-move"]')!.getBoundingClientRect().bottom }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
      expect(geometry.unused).toBeGreaterThanOrEqual(12);
      expect(geometry.unused).toBeLessThanOrEqual(14);
    }
    const left = panel.getByTestId("voicing-loop-left-hand");
    const right = panel.getByTestId("voicing-loop-right-hand");
    await expect(right).toBeVisible();
    if (fixture === "p11-one-hand") await expect(left).toHaveCount(0);
    else {
      await expect(left).toContainText("C4");
      await expect(right).not.toContainText("C4");
    }
    await expect(page.getByRole("combobox", { name: "生成タイプ", exact: true })).toBeDisabled();
  });
}

test("P11 generated selector pointer/keyboard dismissal is independent of details and Range", async ({ page }) => {
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
  const selector = page.getByRole("combobox", { name: "生成タイプ", exact: true });
  const details = page.getByTestId("voicing-loop-generated-details");
  const cards = page.getByTestId("voicing-loop-event");
  await cards.nth(1).click({ button: "right" });
  const pending = page.getByTestId("voicing-loop-range-pending");
  await expect(pending).toBeVisible();
  for (const value of ["骨組み", "基本", "骨組み", "基本"]) {
    await details.locator("summary").click();
    await selector.click();
    await expect(details).not.toHaveAttribute("open", "");
    await expect(selector).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("option", { name: value, exact: true }).click();
    await expect(selector).toHaveAttribute("aria-expanded", "false");
    await expect(selector).toContainText(value);
    await expect(selector).toBeFocused();
    await expect(page.getByTestId("voicing-loop-current-explanation")).toContainText(value === "基本" ? "Teacher Style" : "Family Core");
    await expect(page.getByTestId("voicing-loop-next-move")).toBeVisible();
  }
  await selector.press("Space");
  await expect(selector).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(selector).toHaveAttribute("aria-expanded", "false");
  await expect(pending).toBeVisible();
  await expect(selector).toBeFocused();
  await selector.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(selector).toContainText("骨組み");
  await selector.click();
  await details.locator("summary").click();
  await expect(selector).toHaveAttribute("aria-expanded", "false");
  await expect(details).toHaveAttribute("open", "");
  await selector.click();
  await expect(details).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "元MIDI", exact: true }).click();
  await expect(selector).toBeDisabled();
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await selector.click();
  await expect(selector).toHaveAttribute("aria-expanded", "true");
  const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="voicing-loop-controls"]').analyze();
  expect(axe.violations.filter(issue => issue.impact === "serious" || issue.impact === "critical")).toEqual([]);
  await page.getByTestId("voicing-loop-current-panel").locator("h2").click();
  await expect(selector).toHaveAttribute("aria-expanded", "false");
});


test("P11 advanced shape to primary type retains selector keyboard focus", async ({ page }) => {
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
  const details = page.getByTestId("voicing-loop-generated-details");
  await details.locator("summary").click();
  await details.getByLabel("既存の形", { exact: true }).selectOption("basic-shell");
  const selector = page.getByRole("combobox", { name: "生成タイプ", exact: true });
  await selector.click();
  await page.getByRole("option", { name: "基本", exact: true }).click();
  await expect(selector).toBeFocused();
  await expect(selector).toHaveAttribute("aria-expanded", "false");
  await selector.press("Space");
  await expect(selector).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(selector).toBeFocused();
});
