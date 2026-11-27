import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { assertNoHorizontalOverflow } from "./helpers/app";

/**
 * P23-32: the Voicing Loop practice screen, mock A′ (the transport under the keyboard).
 * Shape is checked as numbers (positions, heights, overflow); the photos are for the lead's review.
 * C4 (T1/T2: the back button and the head) is a unit check in ProgressionVoicingPracticeView.test.tsx.
 */
const OUT = "p89-generated/p23-32";
const SIZES = [[1440, 900], [1280, 720]] as const;

async function openLoop(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/?p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  const nav = page.locator('[data-nav="voicing-loop"]');
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  await expect(page.getByTestId("voicing-loop-left-hand")).toBeVisible();
  await page.waitForTimeout(250);
}

async function shoot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** 1440×900 fits the whole practice; 1280×720 may scroll inside the pane but keeps 70px of drawn keys. */
test("P23-32 C1: the practice fits 1440×900 and keeps 70px of keys at 1280×720", async ({ page }) => {
  test.setTimeout(240_000);
  const measured: Array<Record<string, unknown>> = [];
  for (const [width, height] of SIZES) {
    await openLoop(page, width, height);
    const info = await page.evaluate(() => {
      const round = (value: number) => Math.round(value * 10) / 10;
      const workspace = document.querySelector<HTMLElement>('[data-testid="voicing-loop-workspace"]')!;
      const svg = document.querySelector<SVGElement>("[data-keyboard-layout='wide-88'] svg")!;
      const main = document.getElementById("main-content")!;
      return {
        clientH: workspace.clientHeight,
        scrollH: workspace.scrollHeight,
        clientW: workspace.clientWidth,
        scrollW: workspace.scrollWidth,
        svgH: round(svg.getBoundingClientRect().height),
        mainScroll: main.scrollTop,
        rootScroll: document.getElementById("root")!.scrollTop,
        docScroll: document.scrollingElement!.scrollTop,
        docWidth: [document.scrollingElement!.scrollWidth, document.scrollingElement!.clientWidth],
      };
    });
    console.log("P2332-C1", `${width}x${height}`, JSON.stringify(info));
    measured.push({ size: `${width}x${height}`, ...info });
    expect(info.docWidth[0]!, `${width}: document width`).toBeLessThanOrEqual(info.docWidth[1]! + 1);
    expect(info.docScroll, `${width}: the document does not scroll`).toBe(0);
    expect(info.rootScroll, `${width}: #root does not scroll`).toBe(0);
    expect(info.mainScroll, `${width}: #main-content does not scroll`).toBe(0);
    if (width === 1440) {
      // 1440×900: the whole practice fits its pane (the mock's aim; the drawn keys are then ~88px here).
      expect(info.scrollH, "1440: the pane does not scroll").toBeLessThanOrEqual(info.clientH + 1);
      expect(info.svgH, "1440: drawn keys").toBeGreaterThanOrEqual(85);
    } else {
      // 1280×720: the lead's decision — the pane may scroll, and the drawn keyboard keeps its 70px floor.
      expect(info.svgH, "1280: drawn keys").toBeGreaterThanOrEqual(70);
    }
    // At the end of the pane's scroll the keys and the whole transport bar are visible together.
    const bottom = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>('[data-testid="voicing-loop-workspace"]')!;
      workspace.scrollTop = workspace.scrollHeight;
      const pane = workspace.getBoundingClientRect();
      const bar = document.querySelector<HTMLElement>('[data-testid="voicing-loop-transport"]')!.getBoundingClientRect();
      const keys = document.querySelector<SVGElement>("[data-keyboard-layout='wide-88'] svg")!.getBoundingClientRect();
      return {
        barInside: bar.top >= pane.top - 1 && bar.bottom <= pane.bottom + 1,
        keysInside: keys.top >= pane.top - 1 && keys.bottom <= pane.bottom + 1,
        startVisible: (() => {
          const start = document.querySelector<HTMLElement>('[data-testid="voicing-loop-transport"] button')!;
          const box = start.getBoundingClientRect();
          return box.width > 0 && box.bottom <= pane.bottom + 1 && box.top >= pane.top - 1;
        })(),
      };
    });
    expect(bottom.barInside, `${width}: the whole bar at the end of the scroll`).toBe(true);
    expect(bottom.keysInside, `${width}: the keys at the end of the scroll`).toBe(true);
    expect(bottom.startVisible, `${width}: the start button inside the window`).toBe(true);
    await shoot(page, `practice-${width}x${height}-stopped`);
  }
  // 100px is the mock's own keyboard size (kept as a goal, not a gate): log where 1440 landed.
  console.log("P2332-C1-RESULT", JSON.stringify(measured));
});

/** The order of the rows is the mock's: head → controls → current/next → strip → keyboard → transport. */
test("P23-32 C2: the rows keep the mock A′ order at both sizes", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [width, height] of SIZES) {
    await openLoop(page, width, height);
    const order = await page.evaluate(() => {
      const round = (value: number) => Math.round(value * 10) / 10;
      const top = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        return element ? round(element.getBoundingClientRect().top) : null;
      };
      const keys = document.querySelector<SVGElement>("[data-keyboard-layout='wide-88'] svg")!.getBoundingClientRect();
      return {
        head: top('[data-testid="voicing-loop-head"]'),
        inline: top(".lv-vl-head-inline"),
        controls: top('[data-testid="voicing-loop-controls"]'),
        sourceGroup: top('[data-testid="voicing-loop-source-group"]'),
        current: top('[data-testid="voicing-loop-current-panel"]'),
        next: top('[data-testid="voicing-loop-next-panel"]'),
        timeline: top('[data-testid="voicing-loop-timeline"]'),
        detail: top('[data-testid="voicing-loop-detail"]'),
        transport: top('[data-testid="voicing-loop-transport"]'),
        keysBottom: round(keys.bottom),
        backLeft: (() => {
          const back = document.querySelector<HTMLElement>("[data-testid='voicing-loop-back']")!.getBoundingClientRect();
          return round(back.x);
        })(),
        inlineLeft: (() => {
          const inline = document.querySelector<HTMLElement>(".lv-vl-head-inline")!.getBoundingClientRect();
          return round(inline.x);
        })(),
        sourceLeft: (() => {
          const source = document.querySelector<HTMLElement>('[data-testid="voicing-loop-source-group"]')!.getBoundingClientRect();
          return round(source.x);
        })(),
        controlsLeft: ((): number | null => {
          const panel = document.querySelector<HTMLElement>('[data-testid="voicing-loop-controls"]')!.getBoundingClientRect();
          return round(panel.x);
        })(),
      };
    });
    console.log("P2332-C2", `${width}x${height}`, JSON.stringify(order));
    // 1440: the head is a row of its own (the back button starts it). 1280: the head is inline at the start of
    // the controls row — the row is the 「音の出どころ」 row, so the back button starts inside it.
    if (width === 1440) {
      expect(order.head).not.toBeNull();
      expect(order.controls!).toBeGreaterThan(order.head!);
      expect(order.backLeft!).toBeLessThan(order.controlsLeft! + 20);
    } else {
      expect(order.head).toBe(0); // display:none — the inline copy is the one drawn
      expect(order.inline!).toBeGreaterThanOrEqual(order.controls! - 1);
      expect(order.inline!).toBeLessThanOrEqual(order.controls! + 40);
      expect(order.inlineLeft!, `${width}: the head inline starts the row`).toBeLessThan(order.sourceLeft!);
    }
    // Current and next are the two columns of one row; everything else follows in the mock's order.
    expect(order.next, `${width}: next beside current`).toBe(order.current);
    for (const [label, upper, lower] of [
      ["current after controls", order.controls, order.current],
      ["strip after current/next", order.next, order.timeline],
      ["keyboard after strip", order.timeline, order.detail],
      ["transport after keyboard", order.detail, order.transport],
    ] as const) {
      expect(lower, `${width}: ${label}`).toBeGreaterThan(upper!);
    }
    expect(order.transport!, `${width}: the bar starts below the drawn keys`).toBeGreaterThanOrEqual(order.keysBottom!);
  }
});

/** 1024×768 and 768×640: nothing spills sideways; only the pane scrolls vertically. */
test("P23-32 C3: 1024×768 and 768×640 keep everything in the window", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [width, height] of [[1024, 768], [768, 640]] as const) {
    await openLoop(page, width, height);
    await assertNoHorizontalOverflow(page);
    const info = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>('[data-testid="voicing-loop-workspace"]')!;
      // Only the pane is scrolled: the window, #root and #main-content have to stay where they are.
      workspace.scrollTop = 160;
      return {
        docScroll: document.scrollingElement!.scrollTop,
        rootScroll: document.getElementById("root")!.scrollTop,
        workspaceOverflow: getComputedStyle(workspace).overflowY,
        workspaceScrolls: workspace.scrollHeight > workspace.clientHeight + 1,
        workspaceScrollTop: workspace.scrollTop,
        workspaceWidth: [workspace.scrollWidth, workspace.clientWidth],
      };
    });
    console.log("P2332-C3", `${width}x${height}`, JSON.stringify(info));
    expect(info.docScroll, `${width}: the document`).toBe(0);
    expect(info.rootScroll, `${width}: #root`).toBe(0);
    expect(info.workspaceWidth[0]!, `${width}: pane width`).toBeLessThanOrEqual(info.workspaceWidth[1]! + 1);
    expect(["auto", "scroll"], `${width}: the pane is the scroller`).toContain(info.workspaceOverflow);
    await shoot(page, `practice-${width}x${height}-stopped`);
  }
});

/** P4: the rule's internal names moved into the i beside the candidate row. */
test("P23-32 C5: no rule name is visible; the i carries it", async ({ page }) => {
  await openLoop(page, 1440, 900);
  const explanation = page.getByTestId("voicing-loop-current-explanation");
  await expect(explanation).toBeVisible();
  const text = await explanation.innerText();
  expect(text).not.toContain("P5.33");
  expect(text).not.toContain("ルール");
  const info = explanation.locator(".lv-vl-rule-info");
  await expect(info).toHaveAttribute("role", "img");
  // P25-16 N5: the i now starts with the top note's meaning, then the rule's names.
  await expect(info).toHaveAttribute("aria-label", /いちばん上の音:.*ルール P5\.33-GEN-[A-Z]+-MAJ7 · /);
  await expect(info).toHaveAttribute("title", /いちばん上の音:[\s\S]*ルール P5\.33-GEN-/);
  expect(await info.innerText()).toBe("i");
});

/** K4/K5: the bar has no BPM field, range clear or MIDI line, and its three state words. */
test("P23-32 C6: the bar keeps three state words and no BPM / range clear / MIDI line", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [width, height] of SIZES) {
    await openLoop(page, width, height);
    const workspace = page.getByTestId("voicing-loop-workspace");
    const transport = page.getByTestId("voicing-loop-transport");
    await expect(workspace.locator("#voicing-loop-bpm")).toHaveCount(0);
    await expect(workspace.getByTestId("voicing-loop-range-clear")).toHaveCount(0);
    await expect(workspace.getByTestId("voicing-loop-midi-status")).toHaveCount(0);
    await expect(workspace.getByTestId("voicing-loop-transport-midi-row")).toHaveCount(0);
    await expect(transport).toContainText("停止中");
    await page.getByLabel("カウントイン").selectOption("0");
    await transport.getByRole("button", { name: /開始/ }).click();
    await expect(transport).toContainText("再生中");
    await shoot(page, `practice-${width}x${height}-playing`);
    await transport.getByRole("button", { name: /一時停止/ }).click();
    await expect(transport).toContainText("一時停止中");
    // The × beside 「ここから n」 is the only range clear, and it only exists with a pending start.
    await page.getByTestId("voicing-loop-event").nth(1).click({ button: "right" });
    await expect(workspace.getByTestId("voicing-loop-range-clear")).toHaveCount(1);
    await shoot(page, `practice-${width}x${height}-range`);
    await workspace.getByTestId("voicing-loop-range-clear").click();
    await expect(workspace.getByTestId("voicing-loop-range-clear")).toHaveCount(0);
    await expect(transport).toContainText("一時停止中");
    await transport.getByRole("button", { name: /停止/ }).click();
    await expect(transport).toContainText("停止中");
  }
});

/** C7: axe has no serious/critical finding, and Space still runs the transport. */
test("P23-32 C7: axe is clean at 1440×900 and Space runs the transport", async ({ page }) => {
  test.setTimeout(180_000);
  await openLoop(page, 1440, 900);
  const axe = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  console.log("P2332-AXE", JSON.stringify(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))));
  expect(blocking.map((violation) => violation.id)).toEqual([]);

  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("voicing-loop-transport")).toContainText("再生中");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("voicing-loop-transport")).toContainText("一時停止中");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("voicing-loop-transport")).toContainText("停止中");
});
