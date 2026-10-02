import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
});

test("P11 details close and disable after fixed Source change, reopen on generated", async ({ page }) => {
  const details = page.getByTestId("voicing-loop-generated-details");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "元MIDI", exact: true }).click();
  await expect(details).not.toHaveAttribute("open", "");
  await expect(details.locator("summary")).toHaveAttribute("aria-disabled", "true");
  await details.locator("summary").dispatchEvent("click");
  await details.locator("summary").press("Space");
  await details.locator("summary").press("Enter");
  await expect(details).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
});

test("P11 details close on outside pointer and Escape, toggle, keep internal controls open", async ({ page }) => {
  const details = page.getByTestId("voicing-loop-generated-details");
  const trigger = details.locator("summary");
  await trigger.click();
  await page.getByTestId("voicing-loop-current-panel").locator("h2").click();
  await expect(details).not.toHaveAttribute("open", "");
  await trigger.click();
  await details.getByLabel("Open配置", { exact: true }).check();
  await expect(details).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(details).not.toHaveAttribute("open", "");
  await trigger.click();
  await trigger.click();
  await expect(details).not.toHaveAttribute("open", "");
});

test("P11 generated type switches close details without disabling later dismissals", async ({ page }) => {
  const details = page.getByTestId("voicing-loop-generated-details");
  const trigger = details.locator("summary");
  for (const type of ["core", "teacher"]) {
    await trigger.click();
    await page.getByLabel("生成タイプ", { exact: true }).click();
    await page.getByRole("option", { name: (type === "core" ? "骨組み" : "基本"), exact: true }).click();
    await expect(details).not.toHaveAttribute("open", "");
    await trigger.click();
    await expect(details).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();
  }
  await trigger.press("Space");
  await expect(details).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeVisible();
});
