import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("P11 zero sources and persisted stale selection recover without an availability banner", async ({ page }) => {
  await page.goto("/?p527Status=p11-source-empty");
  await page.locator('[data-nav="voicing-loop"]').click();
  const generated = page.getByRole("button", { name: "自動生成", exact: true });
  await expect(generated).toHaveAttribute("aria-pressed", "true");
  for (const [label, id] of [["保存した音", "saved"], ["元MIDI", "source-midi"], ["カスタム", "custom"]]) {
    const control = page.getByRole("button", { name: label!, exact: true });
    await expect(control).toBeDisabled();
    await expect(page.getByTestId(`voicing-loop-${id}-availability`)).toHaveText("0/8");
    await expect(control).toHaveAttribute("title", /Voicingがありません/);
  }
  await expect(page.getByTestId("voicing-loop-source-info")).toHaveCount(0);
  // Record a genuine preference, then reload the same progression after its Source is gone.
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
  await page.getByRole("button", { name: "元MIDI", exact: true }).click();
  await page.goto("/?p527Status=p11-source-empty");
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(generated).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("voicing-loop-shape-button")).toBeEnabled();
  await expect(page.getByTestId("voicing-loop-source-info")).toHaveCount(0);
  const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="voicing-loop-controls"]').analyze();
  expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("P11 partial Source stays selectable with existing visible AUTO fallback", async ({ page }) => {
  await page.goto("/?p527Status=p11-source-partial");
  await page.locator('[data-nav="voicing-loop"]').click();
  const source = page.getByRole("button", { name: "元MIDI", exact: true });
  await expect(source).toBeEnabled();
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("voicing-loop-source-midi-availability")).toHaveText("1/8");
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeEnabled();
  await page.getByTestId("voicing-loop-event").nth(1).click();
  await expect(page.getByTestId("voicing-loop-event").nth(1)).toHaveAttribute("data-auto-fallback", "true");
  await expect(page.getByTestId("voicing-loop-event").nth(1).getByLabel("代わりの形で鳴らしています", { exact: true })).toBeVisible();
  await expect(page.getByTestId("voicing-loop-source-info")).toHaveCount(0);
});

test("P11 fixed sources disable the shape menu and keep the shape, parts and order across transitions (P25-08 L1)", async ({ page }) => {
  await page.goto("/?p527Status=p11-source-settings");
  await page.locator('[data-nav="voicing-loop"]').click();
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  const trigger = page.getByTestId("voicing-loop-shape-button");
  const menu = page.getByTestId("voicing-loop-shape-menu");
  await trigger.click();
  await menu.locator('[data-shape="shell"]').click();
  await trigger.click();
  await menu.getByTestId("voicing-loop-shape-tension").check();
  await menu.getByTestId("voicing-loop-shape-spread").check();
  await page.keyboard.press("Escape");
  await expect(trigger).toContainText("シェル");
  await expect(trigger).toContainText("+ テンション + 広げる");
  const generatedNotes = await page.getByTestId("voicing-loop-current-voicing").innerText();
  for (const source of ["保存した音", "元MIDI", "カスタム"]) {
    await page.getByRole("button", { name: source, exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeDisabled();
    await trigger.dispatchEvent("click");
    await expect(menu).toHaveCount(0);
    await page.getByRole("button", { name: "自動生成", exact: true }).click();
    await expect(trigger).toBeEnabled();
    await expect(trigger).toContainText("シェル");
    await expect.poll(() => page.getByTestId("voicing-loop-current-voicing").innerText()).toBe(generatedNotes);
    await trigger.click();
    await expect(menu.getByTestId("voicing-loop-shape-tension")).toBeChecked();
    await expect(menu.getByTestId("voicing-loop-shape-spread")).toBeChecked();
    await page.keyboard.press("Escape");
  }
  await trigger.click();
  await menu.locator('[data-shape="rootless"]').click();
  await trigger.click();
  await menu.locator('[data-order="B"]').click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "元MIDI", exact: true }).click();
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await expect(trigger).toContainText("ルートレス");
  await trigger.click();
  await expect(menu.locator('[data-order="B"]')).toHaveAttribute("aria-pressed", "true");
  await expect(menu.getByTestId("voicing-loop-shape-spread")).toBeChecked();
});
