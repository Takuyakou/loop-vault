import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";

const output = join("test-results", "p11-current-panel");
mkdirSync(output, { recursive: true });
for (const [width, height] of [[1920, 1080], [1440, 900], [960, 1032], [768, 640]]) {
  test(`P11 current panel ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/?p527Status=p533-rules");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    const panel = page.getByTestId("voicing-loop-current-panel");
    const geometry = await panel.evaluate(element => {
      const nodes = [element, ...element.querySelectorAll("[data-testid=voicing-loop-current-content], [data-testid=voicing-loop-current-voicing], [data-testid=voicing-loop-current-explanation]")];
      return nodes.map(node => { const css = getComputedStyle(node); return {
          clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, height: css.height,
          minHeight: css.minHeight, maxHeight: css.maxHeight, overflowY: css.overflowY,
          padding: css.padding, border: css.borderWidth,
        }; });
    });
    writeFileSync(join(output, `${width}.json`), JSON.stringify(geometry, null, 2));
    console.log(`${width}: ${JSON.stringify(geometry)}`);
    for (const area of geometry) {
      expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
      expect(area.overflowY).not.toBe("hidden");
      expect(area.overflowY).not.toBe("auto");
    }
    await expect(panel.getByTestId("voicing-loop-next-move")).toHaveCount(0);
    for (const hand of ["left", "right"]) {
      const card = panel.getByTestId(`voicing-loop-${hand}-hand`);
      for (const fact of ["指", "音名", "構成音", "おすすめ"]) await expect(card).toContainText(fact);
    }
    const info = panel.getByTestId("voicing-loop-current-explanation");
    for (const fact of ["Teacher Style", "Literal", "候補", "ルール", "省略", "トップ"]) await expect(info).toContainText(fact);
    if (width! >= 1440) {
      const left = (await panel.getByTestId("voicing-loop-left-hand").boundingBox())!;
      const right = (await panel.getByTestId("voicing-loop-right-hand").boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
      expect(right.x).toBeGreaterThan(left.x + left.width);
    }
    const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="voicing-loop-current-panel"]').analyze();
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await panel.screenshot({ path: join(output, `${width}.png`) });
    await expect(panel.getByTestId("voicing-loop-left-hand")).toBeVisible();
    await expect(panel.getByTestId("voicing-loop-right-hand")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: join(output, `${width}-workspace.png`), fullPage: true });
  });
}
