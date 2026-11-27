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
    // P25-16 N3: the parts rise in; measure after their shown state (a state wait, not a pause).
    await expect(page.getByTestId("voicing-loop-current-voicing")).toHaveAttribute("data-presence", "shown");
    await expect(page.getByTestId("voicing-loop-current-learn")).toHaveAttribute("data-presence", "shown");
    // …and after the 220ms rise itself (the parts carry a transform until then).
    await expect(page.getByTestId("voicing-loop-current-learn")).toHaveCSS("transform", "none");
    await expect(page.getByTestId("voicing-loop-current-voicing")).toHaveCSS("transform", "none");
    const geometry = await panel.evaluate(element => {
      const nodes = [element, ...element.querySelectorAll("[data-testid=voicing-loop-current-content], [data-testid=voicing-loop-current-voicing], [data-testid=voicing-loop-current-explanation], [data-testid=voicing-loop-next-move], [data-testid=voicing-loop-finger-slot]")];
      return nodes.map(node => { const css = getComputedStyle(node); return {
          testId: node.getAttribute("data-testid"), clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, height: css.height,
          minHeight: css.minHeight, maxHeight: css.maxHeight, overflowY: css.overflowY,
          padding: css.padding, border: css.borderWidth, gap: css.gap, flex: css.flex, grid: css.gridTemplateRows,
        }; });
    });
    writeFileSync(join(output, `${width}.json`), JSON.stringify(geometry, null, 2));
    console.log(`${width}: panel ${geometry[0]!.clientHeight}/${geometry[0]!.scrollHeight}, movement ${geometry[4]!.height}`);
    for (const area of geometry) {
      expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
      expect(area.overflowY).not.toBe("hidden");
      expect(area.overflowY).not.toBe("auto");
    }
    const movement = panel.getByTestId("voicing-loop-next-move");
    await expect(movement).toBeVisible();
    const movementBox = (await movement.boundingBox())!;
    // P23-32 P5: one finger slot is 50px (42 in a low window), so the box is 68 / 60.
    const lowWindow = height! <= 760;
    expect(movementBox.height).toBeGreaterThanOrEqual(lowWindow ? 60 : 68);
    expect(movementBox.height).toBeLessThanOrEqual(lowWindow ? 63 : 69);
    const slots = movement.getByTestId("voicing-loop-finger-slot");
    await expect(slots).toHaveCount(10);
    const boxes = await slots.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
    expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThanOrEqual(1);
    const panelBox = (await panel.boundingBox())!;
    expect(movementBox.y + movementBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height - 12);
    for (const hand of ["left", "right"]) {
      const card = panel.getByTestId(`voicing-loop-${hand}-hand`);
      // P23-20 L1: five slot cards (finger name, note, chord tone) and the 「おすすめ」 badge.
      await expect(card.locator('[data-testid="voicing-loop-hand-slot"]')).toHaveCount(5);
      await expect(card).toContainText("おすすめ");
      await expect(card.locator(".voicing-hand-slot-pitch").first()).not.toBeEmpty();
      await expect(card.locator(".voicing-hand-slot-degree").first()).not.toBeEmpty();
    }
    const info = panel.getByTestId("voicing-loop-current-explanation");
    // P25-16 N5: no internal names on the row; the candidate navigation stays (「ほかの押さえ方」).
    await expect(info).toContainText("ほかの押さえ方");
    await expect(info).not.toContainText("Teacher Style");
    await expect(info).not.toContainText("Literal");
    // P23-32 P4: the rule's name is in the i's accessible name, not in the visible row.
    await expect(info).not.toContainText("ルール");
    await expect(info.locator(".lv-vl-rule-info")).toHaveAttribute("aria-label", /ルール P5\./);
    if (width! >= 1440) {
      const left = (await panel.getByTestId("voicing-loop-left-hand").boundingBox())!;
      const right = (await panel.getByTestId("voicing-loop-right-hand").boundingBox())!;
      expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(1);
      expect(right.x).toBeGreaterThan(left.x + left.width);
    }
    const axe = await new AxeBuilder({ page: page as never }).include('[data-testid="voicing-loop-current-panel"]').analyze();
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await panel.screenshot({ path: join(output, `${width}.png`) });
    await page.screenshot({ path: join(output, `${width}-closed.png`), fullPage: true });
    // P25-08 L1: the shape menu took the place of 「詳しい設定」.
    const details = page.getByTestId("voicing-loop-shape-menu");
    await page.getByTestId("voicing-loop-shape-button").click();
    await expect(details).toBeVisible();
    await page.screenshot({ path: join(output, `${width}-open.png`), fullPage: true });
    await page.getByRole("button", { name: "元MIDI", exact: true }).click();
    await expect(details).toHaveCount(0);
    await expect(movement).toBeVisible();
    await page.screenshot({ path: join(output, `${width}-source-change.png`), fullPage: true });
    const changedGeometry = await panel.evaluate(node => ({client: node.clientHeight, scroll: node.scrollHeight}));
    expect(changedGeometry.scroll).toBeLessThanOrEqual(changedGeometry.client + 1);
    await page.getByRole("button", { name: "自動生成", exact: true }).click();
    await expect(panel.getByTestId("voicing-loop-left-hand")).toBeVisible();
    await expect(panel.getByTestId("voicing-loop-right-hand")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: join(output, `${width}-workspace.png`), fullPage: true });
  });
}
