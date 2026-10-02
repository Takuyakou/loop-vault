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
  await expect(page.getByLabel("生成タイプ", { exact: true })).toBeEnabled();
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
  await expect(page.getByTestId("voicing-loop-event").nth(1).getByLabel("自動生成で補完", { exact: true })).toBeVisible();
  await expect(page.getByTestId("voicing-loop-source-info")).toHaveCount(0);
});

test("P11 fixed sources disable generation controls and preserve all generated settings across transitions", async ({ page }) => {
  await page.goto("/?p527Status=p11-source-settings");
  await page.locator('[data-nav="voicing-loop"]').click();
  const type = page.getByLabel("生成タイプ", { exact: true });
  const details = page.getByTestId("voicing-loop-generated-details");
  const summary = details.locator("summary");
  await type.click();
  await page.getByRole("option", { name: "骨組み", exact: true }).click();
  await summary.click();
  await details.getByLabel("Colorを加える", { exact: true }).check();
  await details.getByLabel("Open配置", { exact: true }).check();
  const generatedNotes = await page.getByTestId("voicing-loop-current-voicing").innerText();
  for (const source of ["保存した音", "元MIDI", "カスタム"]) {
    await page.getByRole("button", { name: source, exact: true }).click();
    await expect(details).not.toHaveAttribute("open", "");
    await expect(type).toBeDisabled();
    await expect(summary).toHaveAttribute("aria-disabled", "true");
    await summary.dispatchEvent("click");
    await summary.press("Space");
    await summary.press("Enter");
    await type.dispatchEvent("keydown", { key: "ArrowDown" });
    await expect(details).not.toHaveAttribute("open", "");
    await expect(page.getByRole("listbox", { name: "生成タイプ候補" })).toHaveCount(0);
    await page.getByRole("button", { name: "自動生成", exact: true }).click();
    await expect(type).toBeEnabled();
    await expect(type).toHaveAttribute("value", "core");
    await expect.poll(() => page.getByTestId("voicing-loop-current-voicing").innerText()).toBe(generatedNotes);
    await summary.click();
    await expect(details.getByLabel("Colorを加える", { exact: true })).toBeChecked();
    await expect(details.getByLabel("Open配置", { exact: true })).toBeChecked();
  }
  await details.getByLabel("既存の形", { exact: true }).selectOption("left-hand");
  await summary.click();
  await details.getByLabel("左手の形", { exact: true }).selectOption("B");
  await page.getByRole("button", { name: "元MIDI", exact: true }).click();
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await expect(type).toHaveAttribute("value", "advanced");
  await summary.click();
  await expect(details.getByLabel("既存の形", { exact: true })).toHaveValue("left-hand");
  await expect(details.getByLabel("左手の形", { exact: true })).toHaveValue("B");
  await expect(details.getByLabel("Colorを加える", { exact: true })).toBeChecked();
  await expect(details.getByLabel("Open配置", { exact: true })).toBeChecked();
});
