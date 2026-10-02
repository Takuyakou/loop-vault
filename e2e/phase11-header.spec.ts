import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
const output = join("test-results", "p11-header");
mkdirSync(output, { recursive: true });
for (const width of [1920, 1600, 1444, 1366, 1280, 960]) {
  test(`P11 final header geometry ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/?p527Status=p533-rules");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    const controls = page.getByTestId("voicing-loop-controls");
    for (const name of ["保存した音", "元MIDI", "カスタム", "自動生成"]) {
      await expect(controls.getByRole("button", { name, exact: true })).toBeVisible();
    }
    const geometry = await controls.evaluate(element => {
      const row = element.querySelector('[data-testid="voicing-loop-controls-row"]')!;
      const groups = Array.from(row.children).map(child => {
        const box = child.getBoundingClientRect(); return { width: box.width, y: box.y, height: box.height };
      });
      return { rowWidth: row.getBoundingClientRect().width, groups, rowHeight: row.getBoundingClientRect().height };
    });
    if (width >= 1444) expect(Math.max(...geometry.groups.map(g => g.y)) - Math.min(...geometry.groups.map(g => g.y))).toBeLessThanOrEqual(2);
    await assertNoHorizontalOverflow(page);
    await controls.screenshot({ path: join(output, `${width}.png`) });
    writeFileSync(join(output, `${width}.json`), JSON.stringify(geometry, null, 2));
    const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="voicing-loop-controls"]').analyze();
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
}

test("P11 unavailable source stays disabled with on-demand reason and no banner", async ({ page }) => {
  await page.goto("/?p527Status=p533-rules");
  await page.locator('[data-nav="voicing-loop"]').click();
  // The saved fixture has no adopted saved snapshot; source/custom exist independently.
  const unavailable = page.getByRole("button", { name: "保存した音", exact: true });
  await expect(unavailable).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("voicing-loop-source-info")).toHaveCount(0);
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toHaveAttribute("title", "この進行には保存した音のVoicingがありません。");
  await expect(page.getByTestId("voicing-loop-saved-availability")).toHaveText("0/8");
  await unavailable.dispatchEvent("click");
  await unavailable.dispatchEvent("keydown", { key: "Enter" });
  await expect(page.getByRole("button", { name: "自動生成", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("voicing-loop-source-info")).toHaveCount(0);
  await expect(unavailable).toHaveAttribute("aria-disabled", "true");
});
