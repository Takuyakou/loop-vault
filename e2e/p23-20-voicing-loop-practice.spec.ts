import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-20: the Voicing Loop practice screen — L1-L7 of the instruction and the checks C1-C6.
 * Shape is verified as numbers (positions, sizes, overlaps, overflow); the photos are for the lead's review.
 */
const OUT = "p89-generated/p23-20";
const SIZES = [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const;
/**
 * The pane's content height. P23-32 made the practice fit its window (1440×900 no longer scrolls): the panels
 * are content-sized, the strip follows its content and the keyboard takes the rest. These are the heights
 * measured after that change, so the screen cannot quietly grow back.
 */
const BASELINE: Record<string, number> = { "1440x900": 792, "1280x720": 676, "1024x768": 802, "768x640": 1050 };

async function openLoop(page: Page, width: number, height: number, status = "p533-rules") {
  await page.setViewportSize({ width, height });
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  const nav = page.locator('[data-nav="voicing-loop"]');
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  await expect(page.getByTestId("voicing-loop-left-hand")).toBeVisible();
}

async function shoot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** The box of one element in the page, rounded. */
async function box(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), bottom: Math.round(rect.bottom), right: Math.round(rect.right) };
  });
}

test("C1 + C5: the four sizes keep every part inside the window and the top band on one line", async ({ page }) => {
  test.setTimeout(240_000);
  const measured: Array<Record<string, unknown>> = [];
  for (const [width, height] of SIZES) {
    await openLoop(page, width, height);
    await assertNoHorizontalOverflow(page);
    const info = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>('[data-testid="voicing-loop-workspace"]')!;
      const row = document.querySelector<HTMLElement>('[data-testid="voicing-loop-controls-row"]')!;
      const doc = document.documentElement;
      const head = document.querySelector<HTMLElement>(".lv-vl-timeline-head")!;
      const viewport = document.querySelector<HTMLElement>(".lv-vl-timeline-viewport")!;
      // Every control has to sit inside the window; the strip's own scroller and the 88-key keyboard
      // are the only places that may extend (both are reachable by scrolling inside themselves).
      const offscreen: string[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("#main-content button, #main-content select, #main-content input"))) {
        if (element.offsetWidth === 0) continue;
        if (element.closest('[data-testid="voicing-loop-timeline-viewport"], [data-testid="voicing-loop-detail"]')) continue;
        const rect = element.getBoundingClientRect();
        if (rect.right > window.innerWidth + 1 || rect.left < -1) offscreen.push(`${element.tagName}:${(element.getAttribute("aria-label") ?? element.textContent ?? "").slice(0, 16)}:+${Math.round(rect.right - window.innerWidth)}`);
      }
      window.scrollTo(0, 200);
      return {
        docScroll: [doc.scrollWidth, doc.clientWidth, doc.scrollHeight, doc.clientHeight],
        docOverflowY: getComputedStyle(doc).overflowY,
        scrolled: window.scrollY,
        inner: [window.innerWidth, window.innerHeight],
        workspace: [workspace.scrollWidth, workspace.clientWidth, workspace.scrollHeight, workspace.clientHeight],
        controlRow: [Math.round(row.getBoundingClientRect().height), row.scrollWidth, row.clientWidth],
        stripHead: [head.scrollWidth, head.clientWidth, Math.round(head.getBoundingClientRect().height)],
        stripViewport: [viewport.scrollHeight, viewport.clientHeight],
        offscreen,
      };
    });
    console.log("P2320-SIZE", `${width}x${height}`, JSON.stringify(info));
    measured.push({ size: `${width}x${height}`, ...info });
    // C5: nothing sticks out sideways, and the window itself cannot scroll (the pane keeps its old height).
    expect(info.docScroll[0]!, `${width} document width`).toBeLessThanOrEqual(info.docScroll[1]! + 1);
    expect(info.workspace[0]!, `${width} workspace width`).toBeLessThanOrEqual(info.workspace[1]! + 1);
    // P23-31b O2: `clip` (not `hidden`) so the page can never be scrolled by focus either.
    expect(info.docOverflowY!, `${width} window`).toBe("clip");
    expect(info.workspace[2]!, `${width} pane content`).toBeLessThanOrEqual(BASELINE[`${width}x${height}`]! + 1);
    // L6: the strip's header and its cards fit inside the strip (no clipped words, no squeezed cards).
    expect(info.stripHead![0], `${width} strip header`).toBeLessThanOrEqual(info.stripHead![1]! + 1);
    expect(info.stripViewport![0], `${width} strip cards`).toBeLessThanOrEqual(info.stripViewport![1]! + 1);
    expect(info.offscreen, `${width} controls in the window`).toEqual([]);
    await shoot(page, `practice-${width}x${height}`);
  }
  // The two chips are one line at the two wide sizes (the same height as before this stage: 46px incl. padding).
  const wide = measured.filter((entry) => entry.size === "1440x900" || entry.size === "1280x720");
  for (const entry of wide) {
    const row = entry.controlRow as number[];
    expect(row[0], `${entry.size} control row height`).toBeLessThanOrEqual(47);
  }

  // C5: 768x640 with the left menu open — the same checks, and every part stays inside.
  await openLoop(page, 768, 640);
  await page.getByRole("button", { name: "サイドバーを広げる" }).click();
  await page.waitForTimeout(700);
  await assertNoHorizontalOverflow(page);
  const open = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[data-testid="voicing-loop-workspace"]')!;
    const clipped: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("#main-content [data-testid]"))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (rect.right > window.innerWidth + 1) clipped.push(`${element.getAttribute("data-testid")}:+${Math.round(rect.right - window.innerWidth)}`);
    }
    return { workspace: [workspace.scrollWidth, workspace.clientWidth], clipped };
  });
  console.log("P2320-SIDEBAR", JSON.stringify(open));
  expect(open.workspace[0]!).toBeLessThanOrEqual(open.workspace[1]! + 1);
  expect(open.clipped).toEqual([]);
  const narrowStrip = await page.evaluate(() => {
    const head = document.querySelector<HTMLElement>(".lv-vl-timeline-head")!;
    const viewport = document.querySelector<HTMLElement>(".lv-vl-timeline-viewport")!;
    return {
      head: [head.scrollWidth, head.clientWidth, Math.round(head.getBoundingClientRect().height)],
      viewport: [viewport.scrollHeight, viewport.clientHeight],
    };
  });
  console.log("P2320-STRIP", JSON.stringify(narrowStrip));
  expect(narrowStrip.head[0]).toBeLessThanOrEqual(narrowStrip.head[1] + 1);
  expect(narrowStrip.viewport[0]).toBeLessThanOrEqual(narrowStrip.viewport[1] + 1);
  await shoot(page, "practice-768x640-sidebar");

  // L2: the two named checks keep a visible name, which the old band hid under 1500px.
  const names = await page.getByTestId("voicing-loop-display-group").locator("label span").evaluateAll((nodes) =>
    nodes.map((node) => ({ text: node.textContent, width: Math.round(node.getBoundingClientRect().width), clipped: getComputedStyle(node).clipPath })));
  console.log("P2320-NAMES", JSON.stringify(names));
  // P25-16 N7: 「なめらかにつなぐ」 moved into 「形 ▼」; 運指 keeps its visible name on the row.
  expect(names.some((entry) => entry.text === "なめらかにつなぐ")).toBe(false);
  expect(names.some((entry) => entry.text === "運指" && entry.width > 12 && entry.clipped === "none")).toBe(true);
});

test("C1 + C2: the hand panels are five fixed slots whatever the chord uses", async ({ page }) => {
  test.setTimeout(240_000);
  await openLoop(page, 1440, 900);
  const geometry = (hand: "left" | "right") => page.getByTestId(`voicing-loop-${hand}-hand`).evaluate((panel) => {
    const slots = Array.from(panel.querySelectorAll<HTMLElement>('[data-testid="voicing-loop-hand-slot"]')).map((slot) => {
      const rect = slot.getBoundingClientRect();
      return {
        slot: slot.getAttribute("data-slot"), used: slot.getAttribute("data-used"),
        x: Math.round(rect.x * 10) / 10, width: Math.round(rect.width * 10) / 10,
        finger: (slot.querySelector(".voicing-hand-slot-finger")?.textContent ?? "").trim(),
        note: (slot.querySelector(".voicing-hand-slot-pitch")?.textContent ?? "").trim(),
        degree: (slot.querySelector(".voicing-hand-slot-degree")?.textContent ?? "").trim(),
        text: (slot.textContent ?? "").trim(),
      };
    });
    return { width: Math.round(panel.getBoundingClientRect().width * 10) / 10, used: Number(panel.getAttribute("data-used")), slots };
  });
  const cards = page.getByTestId("voicing-loop-event");
  const count = Math.min(8, await cards.count());
  expect(count).toBeGreaterThan(3);
  const seen: Array<{ left: Awaited<ReturnType<typeof geometry>>; right: Awaited<ReturnType<typeof geometry>> }> = [];
  for (let index = 0; index < count; index += 1) {
    await cards.nth(index).click();
    await page.waitForTimeout(60);
    seen.push({ left: await geometry("left"), right: await geometry("right") });
  }
  // C2: five ordered slots, equal width, and the same left edges and width in every chord.
  const shape = (hand: { slots: Array<{ slot: string | null; x: number; width: number }> }) =>
    hand.slots.map((slot) => [slot.slot, slot.x, slot.width]);
  for (const entry of seen) {
    expect(entry.left.slots.map((slot) => slot.slot)).toEqual(["L5", "L4", "L3", "L2", "L1"]);
    expect(entry.right.slots.map((slot) => slot.slot)).toEqual(["R1", "R2", "R3", "R4", "R5"]);
    for (const hand of [entry.left, entry.right]) {
      expect(new Set(hand.slots.map((slot) => slot.width)).size).toBe(1);
    }
    expect(shape(entry.left)).toEqual(shape(seen[0]!.left));
    expect(shape(entry.right)).toEqual(shape(seen[0]!.right));
    expect(entry.left.width).toBe(seen[0]!.left.width);
    expect(entry.right.width).toBe(seen[0]!.right.width);
  }
  // A chord that uses three notes and one that uses five: the slot geometry is identical, and an unused slot has no text.
  const three = seen.find((entry) => entry.left.used + entry.right.used === 3);
  const five = seen.find((entry) => entry.left.used + entry.right.used === 5);
  if (three && five) {
    for (const hand of ["left", "right"] as const) {
      expect(three[hand].slots.map((slot) => [slot.x, slot.width])).toEqual(five[hand].slots.map((slot) => [slot.x, slot.width]));
    }
  }
  for (const entry of seen) {
    for (const slot of [...entry.left.slots, ...entry.right.slots]) {
      if (slot.used === "false") {
        // C2: an unused finger is a faint frame — the finger name stays, but no note, no chord tone and no 「·」.
        expect(slot.finger).toBe(slot.slot);
        expect(slot.note).toBe("");
        expect(slot.degree).toBe("");
        expect(slot.text).not.toContain("·");
      } else {
        expect(slot.note).not.toBe("");
        expect(slot.degree).not.toBe("");
      }
    }
  }
  await shoot(page, "hands-1440x900");
});

test("C1: the top band is two groups, the degree carries the role colour, and the next move is two boxes", async ({ page }) => {
  test.setTimeout(240_000);
  await openLoop(page, 1440, 900);
  const controls = page.getByTestId("voicing-loop-controls");
  await expect(controls.locator("legend")).toHaveText(["音の出どころ", "表示"]);
  for (const name of ["保存した音", "元MIDI", "カスタム", "自動生成"]) {
    await expect(controls.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(controls.getByTestId("voicing-loop-shape-button")).toBeVisible();
  // P23-32 T4 / P25-08 L3: the named checks are switches (role="switch"). P25-16 N7: 「なめらかにつなぐ」 is in 「形 ▼」 now.
  await expect(controls.getByRole("switch", { name: "進行に合わせてなめらかにつなぐ", exact: true })).toHaveCount(0);
  await expect(controls.getByRole("switch", { name: "おすすめ運指を表示", exact: true })).toBeVisible();

  // L3: the degree in the key, with the role's colour and its badge.
  const degree = page.getByTestId("voicing-loop-current-degree");
  await expect(degree).toHaveText(/^[♭♯]?[ⅠⅡⅢⅣⅤⅥⅦ]/);
  const wrap = page.getByTestId("voicing-loop-current-degree-wrap");
  const role = await wrap.getAttribute("data-fn");
  expect(["T", "SD", "SDm", "D"]).toContain(role);
  await expect(page.getByTestId("voicing-loop-current-role")).toBeVisible();
  const colour = await wrap.evaluate((element) => getComputedStyle(element).color);
  const token = { T: "--lv-fn-t", SD: "--lv-fn-sd", SDm: "--lv-fn-sdm", D: "--lv-fn-d" }[role as "T" | "SD" | "SDm" | "D"];
  const expected = await page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), token);
  const probe = await page.evaluate((name) => {
    const holder = document.createElement("span");
    holder.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    document.body.append(holder);
    const rgb = getComputedStyle(holder).color;
    holder.remove();
    return rgb;
  }, token);
  console.log("P2320-ROLE", JSON.stringify({ role, colour, expected, probe }));
  expect(colour).toBe(probe);

  // L4: two boxes, each with a border and five slots; the words stay.
  const groups = page.getByTestId("voicing-loop-next-move-hand-group");
  await expect(groups).toHaveCount(2);
  for (const hand of ["left", "right"]) {
    const group = page.locator(`[data-testid="voicing-loop-next-move-hand-group"][data-hand="${hand}"]`);
    const groupBox = await group.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { w: Math.round(rect.width), h: Math.round(rect.height), border: style.borderTopWidth, radius: style.borderTopLeftRadius, slots: element.querySelectorAll('[data-testid="voicing-loop-finger-slot"]').length };
    });
    console.log("P2320-MOVE", hand, JSON.stringify(groupBox));
    expect(groupBox.border).toBe("1px");
    expect(groupBox.slots).toBe(5);
    await expect(group).toContainText(hand === "left" ? "左手" : "右手");
    await expect(group).toContainText("次への動き");
  }
  await shoot(page, "band-1440x900");

  // L7: the chord names drawn on this screen use ♯/♭ only — no half-width accidental.
  const names = await page.evaluate(() => {
    const parts: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(
      '[data-testid="voicing-loop-event"], [data-testid="voicing-loop-current-next"] h2, [data-testid="voicing-loop-current-next"] p, [data-testid="voicing-loop-current-next"] strong, [data-testid="voicing-loop-then-next"] strong, #voicing-loop-key option'))) {
      if (element.offsetWidth === 0 && element.tagName !== "OPTION") continue;
      parts.push(element.textContent ?? "");
    }
    return parts.join("\n");
  });
  console.log("P2320-NAMES-L7", JSON.stringify(names));
  expect(names).toMatch(/[♯♭]/);
  expect(names).not.toMatch(/[A-G][b#]/);
});

test("C4: the repeated stretch uses amber markers, clears on right-click inside or ×, and keeps non-current cards unringed", async ({ page }) => {
  test.setTimeout(240_000);
  await openLoop(page, 1440, 900);
  const cards = page.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(8);

  // Pending start (A?) shows amber dashed bottom line and captures range-pending screenshot.
  await cards.nth(1).click({ button: "right" });
  await expect(cards.nth(1)).toHaveAttribute("data-range", "pending-a");
  await expect(cards.nth(1)).toContainText("A?");
  await captureReportShot(page, "p23-66-assets/range-pending-1440.png");

  await cards.nth(3).click({ button: "right" });
  await expect(page.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  await expect(page.getByTestId("voicing-loop-range-chip")).toHaveAttribute("title", "区間を解除(区間の中を右クリックでも外せます)");
  const band = page.getByTestId("voicing-loop-range-band");
  await expect(band).toBeVisible();
  const bandBox = await box(page, '[data-testid="voicing-loop-range-band"]');
  const first = await box(page, '[data-testid="voicing-loop-event"]:nth-of-type(1)');
  expect(bandBox.w).toBeGreaterThan(0);
  expect(bandBox.x).toBeGreaterThanOrEqual(first.x);
  expect(await cards.nth(1).getAttribute("data-range")).toBe("a");
  expect(await cards.nth(2).getAttribute("data-range")).toBe("inside");
  expect(await cards.nth(3).getAttribute("data-range")).toBe("b");
  expect(await cards.nth(0).getAttribute("data-range")).toBe("outside");

  const bandColor = await band.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(bandColor).toBe("rgb(242, 193, 78)");
  const insideStyles = await cards.nth(1).evaluate((element) => ({
    boxShadow: getComputedStyle(element).boxShadow,
    className: element.className,
  }));
  expect(insideStyles.boxShadow).toContain("rgb(242, 193, 78)");
  expect(insideStyles.className).not.toContain("ring-");
  await captureReportShot(page, "p23-66-assets/range-stopped-1440.png");
  await shoot(page, "range-1440x900");

  // P23-66: right-clicking card 3 (inside 2〜4) clears the range.
  await cards.nth(2).click({ button: "right" });
  await expect(page.getByTestId("voicing-loop-range-chip")).toHaveCount(0);
  await expect(page.getByTestId("voicing-loop-range-band")).toHaveCount(0);
  for (let i = 0; i < 8; i += 1) {
    await expect(cards.nth(i)).toHaveAttribute("data-range", "none");
  }

  // Re-establish 2〜4 and play until card 3 is current: other range cards keep amber underline without cyan ring.
  await cards.nth(1).click({ button: "right" });
  await cards.nth(3).click({ button: "right" });
  await expect(page.getByTestId("voicing-loop-range-chip")).toContainText("2〜4");
  await page.locator("#voicing-loop-count-in").selectOption("0");
  await page.getByRole("button", { name: "開始" }).click();
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "step", { timeout: 15_000 });
  const card2Playing = await cards.nth(1).evaluate((element) => ({
    current: element.getAttribute("aria-current"),
    boxShadow: getComputedStyle(element).boxShadow,
    className: element.className,
  }));
  expect(card2Playing.current).toBeNull();
  expect(card2Playing.boxShadow).toContain("rgb(242, 193, 78)");
  expect(card2Playing.boxShadow).not.toContain("rgba(59, 224, 206");
  expect(card2Playing.className).not.toContain("ring-");
  await captureReportShot(page, "p23-66-assets/range-playing-1440.png");
  await page.getByRole("button", { name: "停止", exact: true }).click();

  await page.getByTestId("voicing-loop-range-chip").click();
  await expect(page.getByTestId("voicing-loop-range-band")).toHaveCount(0);
  expect(await cards.nth(1).getAttribute("data-range")).toBe("none");
  // P23-32 L1/K4: the bar's 区間解除 is gone; the × beside a pending 「ここから n」 is the only clear.
  await expect(page.getByTestId("voicing-loop-range-clear")).toHaveCount(0);
});

test("C3: 「度数を表示」 from the settings hides the degree text only", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=p533-rules");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="settings"]').click();
  const settings = page.getByTestId("settings-show-degrees");
  await expect(settings).toBeVisible();
  if ((await settings.getAttribute("aria-checked")) === "true") await settings.click();
  await expect(settings).toHaveAttribute("aria-checked", "false");
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-left-hand")).toBeVisible();
  await expect(page.getByTestId("voicing-loop-current-degree")).toHaveCount(0);
  // The role colour stays, so the chord still says where it stands in the key.
  const wrap = page.getByTestId("voicing-loop-current-degree-wrap");
  await expect(wrap).toBeVisible();
  expect(await wrap.getAttribute("data-fn")).toMatch(/^(T|SD|SDm|D)$/);
  await expect(page.getByTestId("voicing-loop-current-role")).toBeVisible();
  await shoot(page, "no-degrees-1440x900");

  // Back on, the degree text returns.
  await page.locator('[data-nav="settings"]').click();
  await page.getByTestId("settings-show-degrees").click();
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-current-degree")).toBeVisible();
});

test("C1 + C6: axe has no serious or critical finding, and the keys still work", async ({ page }) => {
  test.setTimeout(300_000);
  await openLoop(page, 1440, 900);
  const axe = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  console.log("P2320-AXE", JSON.stringify(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))));
  expect(blocking.map((violation) => violation.id)).toEqual([]);

  // The keys the screen always answered to: Space starts, ← → move a card, F follow, Esc stops.
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("voicing-loop-transport-primary")).toContainText("一時停止");
  const started = await page.getByTestId("voicing-loop-position-metric").innerText();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("voicing-loop-position-metric")).not.toHaveText(started);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("voicing-loop-transport-primary")).toContainText("開始");
});

test("L7: the picker's chord strip shows ♯/♭ like the rest of the app", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=vl15-picker");
  await page.evaluate(() => document.fonts.ready);
  const nav = page.locator('[data-nav="voicing-loop"]');
  if (await nav.isVisible()) await nav.click();
  const rows = page.getByTestId("voicing-loop-progression-row");
  await expect(rows.first()).toBeVisible();
  const strips = await page.getByTestId("voicing-loop-progression-chords").allInnerTexts();
  console.log("P2320-PICKER", JSON.stringify(strips));
  const text = strips.join("\n");
  expect(text).toMatch(/[♯♭]/);
  expect(text).not.toMatch(/[A-G]b(?![a-z])/);
  expect(text).not.toMatch(/[A-G]#/);
  await shoot(page, "picker-1440x900");
});

test("P23-31b C9/C10: the whole window stays still in the Voicing Loop practice", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [width, height] of SIZES) {
    await openLoop(page, width, height);
    await page.getByTestId("voicing-loop-event").first().click();
    await page.waitForTimeout(120);
    const measured = await page.evaluate(() => {
      const scrolling = document.scrollingElement!;
      const root = document.getElementById("root")!;
      const title = document.querySelector<HTMLElement>(".lv-titlebar")!;
      const main = document.getElementById("main-content")!;
      return {
        scrolling: scrolling.scrollTop,
        body: document.body.scrollTop,
        root: root.scrollTop,
        titleTop: Math.round(title.getBoundingClientRect().top),
        mainBottom: Math.round(main.getBoundingClientRect().bottom),
        height: window.innerHeight,
      };
    });
    expect(measured.scrolling, `${width}: scrollingElement`).toBe(0);
    expect(measured.body, `${width}: body`).toBe(0);
    expect(measured.root, `${width}: #root`).toBe(0);
    expect(measured.titleTop, `${width}: title bar at the top`).toBe(0);
    expect(measured.mainBottom, `${width}: main ends inside the window`).toBeLessThanOrEqual(measured.height + 1);
    await page.screenshot({ path: `p89-generated/p23-31b/practice-${width}x${height}.png` });
  }
  // C10: at 1024 the 「次への動き」 text is not cut.
  await openLoop(page, 1024, 768);
  const moves = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-finger-slot']")]
    .flatMap((slot) => [...slot.querySelectorAll<HTMLElement>(".lv-vl-move-long,.lv-vl-move-short")])
    .filter((element) => getComputedStyle(element).display !== "none")
    .map((element) => ({ text: element.textContent, cut: element.scrollWidth > element.clientWidth + 1 })));
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.filter((move) => move.cut), `1024: no ellipsis ${JSON.stringify(moves)}`).toHaveLength(0);
});

test("P23-31b C13: the header title and the practice tabs at 1024 (sidebar open and closed)", async ({ page }) => {
  test.setTimeout(180_000);
  for (const want of ["expanded", "collapsed"] as const) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/?p527Status=p533-rules");
    await page.evaluate(() => document.fonts.ready);
    const now = await page.locator("[data-sidebar]").getAttribute("data-sidebar");
    if (now !== want) await page.locator("[data-sidebar-toggle]").click();
    await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", want);
    await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
    const tabs = page.locator('[role="tablist"][aria-label="練習モード"]');
    if (await tabs.count()) {
      const measured = await tabs.evaluate((nav) => [...nav.querySelectorAll<HTMLElement>("button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: Math.round(rect.top), height: Math.round(rect.height) };
      }));
      expect(measured.length).toBe(3);
      expect(new Set(measured.map((item) => item.top)).size, `${want}: one line`).toBe(1);
      expect(new Set(measured.map((item) => item.height)).size, `${want}: one height`).toBe(1);
    }
    const title = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>(".lv-app-header-title");
      if (!element) return null;
      return { cut: element.scrollWidth > element.clientWidth + 1, text: element.textContent };
    });
    if (title) expect(title.cut, `${want}: the title is not cut`).toBe(false);
    await page.screenshot({ path: `p89-generated/p23-31b/header-1024-${want}.png` });
  }
});
