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

test("VL-12 BPM scrub works from the full field and keeps direct input, wheel, and keys", async ({ page }) => {
  await page.goto("/?p527Status=vl09-layout");
  const nav = page.locator("nav").getByRole("button", { name: "Voicing Loop", exact: true });
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator("nav").getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  const bpm = page.locator("#voicing-loop-bpm");
  const field = page.getByTestId("voicing-loop-bpm-field");
  const start = Number(await bpm.inputValue());
  await field.scrollIntoViewIfNeeded();
  const box = await field.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 5, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 5, box!.y + box!.height / 2 - 2);
  expect(Number(await bpm.inputValue())).toBe(start);
  await page.mouse.move(box!.x + 5, box!.y + box!.height / 2 - 16);
  await page.mouse.up();
  await expect(bpm).toHaveValue(String(start + 4));
  await field.hover();
  await page.mouse.wheel(0, -100);
  await expect(bpm).toHaveValue(String(start + 5));
  await bpm.focus();
  await bpm.press("ArrowDown");
  await expect(bpm).toHaveValue(String(start + 4));
  await bpm.press("Shift+ArrowUp");
  await expect(bpm).toHaveValue(String(start + 14));
  await bpm.fill("128");
  await bpm.press("Enter");
  await expect(bpm).toHaveValue("128");
  const dragFrom = async (offsetX: number, deltaY: number, modifier?: "Shift" | "Control") => {
    const bounds = await field.boundingBox();
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(bounds!.x + offsetX, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + offsetX + 100, bounds!.y + bounds!.height / 2 + deltaY);
    await page.mouse.up();
    if (modifier) await page.keyboard.up(modifier);
  };
  await dragFrom(40, -20, "Shift");
  await expect(bpm).toHaveValue("130");
  await dragFrom(72, -8, "Control");
  await expect(bpm).toHaveValue("140");
  await dragFrom(5, -500);
  await expect(bpm).toHaveValue("240");
  await bpm.fill("4");
  await bpm.press("Enter");
  await expect(bpm).toHaveValue("30");
  await field.dblclick();
  expect(await bpm.evaluate((node) => {
    const input = node as HTMLInputElement;
    return input.selectionStart === 0 && input.selectionEnd === input.value.length;
  })).toBe(true);
});
