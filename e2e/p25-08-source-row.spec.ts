import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

/** P25-08 L4: the 「音の出どころ」 row with 「形 ▼」 stays one line, without a horizontal scroll. */
for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]] as const) {
  test(`L4: the source row is one line at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?p527Status=p533-rules");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    const row = page.getByTestId("voicing-loop-controls-row");
    await expect(page.getByTestId("voicing-loop-shape-button")).toBeVisible();
    const lines = await row.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const outside = [...node.children].filter((child) => (child as HTMLElement).offsetParent !== null).filter((child) => {
        const rect = child.getBoundingClientRect();
        const middle = rect.top + rect.height / 2;
        return rect.width > 0 && (middle < box.top || middle > box.bottom);
      }).length;
      return { height: box.height, outside, overflow: node.scrollWidth - node.clientWidth };
    });
    // One line: the row keeps its single-line height (38px) and every part sits inside it.
    expect(lines.height).toBeLessThanOrEqual(40);
    expect(lines.outside).toBe(0);
    expect(lines.overflow).toBeLessThanOrEqual(1);
    await assertNoHorizontalOverflow(page);
    // The words on the row: 覚える / 思い出す (their explanation is the title). P25-16 N7 moved なめらかにつなぐ into 「形 ▼」.
    await expect(row.getByRole("button", { name: "覚える（Voicing表示）" })).toHaveText("覚える");
    await expect(row.getByRole("button", { name: "覚える（Voicing表示）" })).toHaveAttribute("title", "カードに押さえ方(Voicing)を出して覚える");
    await expect(row.getByRole("button", { name: "思い出す（コード名のみ）" })).toHaveAttribute("title", "カードにはコード名だけを出して、押さえ方を思い出す");
  });
}
