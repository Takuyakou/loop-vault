import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const output = "test-results/p11-09-geometry";
mkdirSync(output, { recursive: true });
for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]]) {
  test(`P11 acceptance geometry ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?p527Status=p533-rules");
    await page.locator('[data-nav="voicing-loop"]').click();
    await page.evaluate(() => document.fonts.ready);
    // P25-16 N3: the parts rise in; measure after their shown state (a state wait, not a pause).
    await expect(page.getByTestId("voicing-loop-current-voicing")).toHaveAttribute("data-presence", "shown");
    await expect(page.getByTestId("voicing-loop-current-learn")).toHaveAttribute("data-presence", "shown");
    // …and after the 220ms rise itself (the parts carry a transform until then).
    await expect(page.getByTestId("voicing-loop-current-learn")).toHaveCSS("transform", "none");
    await expect(page.getByTestId("voicing-loop-current-voicing")).toHaveCSS("transform", "none");
    const measured = await page.evaluate(() => {
      const selectors = ["html", "body", "#root", ".lv-app-frame", ".lv-app-header", "#main-content", '[data-testid="voicing-loop-workspace"]', '[data-testid="voicing-loop-controls"]', '[data-testid="voicing-loop-current-next"]', '[data-testid="voicing-loop-current-panel"]', '[data-testid="voicing-loop-current-content"]', '[data-testid="voicing-loop-current-voicing"]', '[data-testid="voicing-loop-next-move"]', '[data-testid="voicing-loop-timeline"]', '[data-testid="voicing-loop-detail"]', '[data-testid="voicing-loop-transport"]', '[data-testid="voicing-loop-transport-midi-row"]', '[data-testid="voicing-loop-bottom-safe-area"]'];
      return selectors.flatMap(selector => {
        const node = document.querySelector(selector); if (!node) return [];
        const rect = node.getBoundingClientRect(); const css = getComputedStyle(node);
        const children = [...node.children].filter(child => getComputedStyle(child).position !== "absolute");
        return [{ selector, top: rect.top, bottom: rect.bottom, rectHeight: rect.height, client: node.clientHeight, scroll: node.scrollHeight,
          height: css.height, min: css.minHeight, max: css.maxHeight, flex: css.flex, grid: css.gridTemplateRows,
          margin: css.margin, padding: css.padding, border: css.borderWidth, overflow: css.overflow, gap: css.gap,
          lastChildBottom: Math.max(rect.top, ...children.map(child => child.getBoundingClientRect().bottom)) }];
      });
    });
    writeFileSync(`${output}/${width}.json`, JSON.stringify(measured, null, 2));
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
    // P25-08 L1: 「形 ▼」 is the one selector.
    const selector = page.getByTestId("voicing-loop-shape-button");
    await selector.click();
    await expect(selector).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: `${output}/${width}-selector.png`, fullPage: true });
    await page.getByTestId("voicing-loop-shape-menu").locator('[data-shape="shell"]').click();
    await expect(page.getByTestId("voicing-loop-shape-label")).toHaveText("シェル");
    const panel = measured.find(area => area.selector.includes("current-panel"))!;
    const movement = measured.find(area => area.selector.includes("next-move"))!;
    expect(panel.scroll).toBeLessThanOrEqual(panel.client + 1);
    expect(panel.bottom - movement.bottom).toBeGreaterThanOrEqual(12);
    expect(panel.bottom - movement.bottom).toBeLessThanOrEqual(14);
    if (width === 1920) {
      const workspace = measured.find(area => area.selector.includes("workspace"))!;
      expect(workspace.scroll).toBeLessThanOrEqual(workspace.client + 1);
      for (const selector of ["html", "body", "#root", "#main-content"]) {
        const area = measured.find(item => item.selector === selector)!;
        expect(area.scroll).toBe(area.client);
      }
      // P23-32 K4/K6: the bar is the pane's last thing — no MIDI row and no 16px safe area below it.
      expect(measured.find(area => area.selector.includes('"voicing-loop-transport"'))!.bottom).toBeLessThanOrEqual(height!);
    }
  });
}
