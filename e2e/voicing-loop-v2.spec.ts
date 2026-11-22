import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, waitForSidebarSettled } from "./helpers/app";

async function openLoop(page: Page, status = "both-hands-long") {
  await page.goto(`/?p527Status=${status}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  return page.getByTestId("voicing-loop-workspace");
}

test("VL-03 seeks by card, overview, ruler, and shortcuts without previewing", async ({ page }) => {
  const workspace = await openLoop(page);
  const cards = workspace.getByTestId("voicing-loop-event");
  const heading = workspace.getByTestId("voicing-loop-current-next").locator("h2");
  await cards.nth(5).click();
  await expect(cards.nth(5)).toHaveAttribute("aria-current", "step");
  await expect(heading).toHaveText("Dm7");
  await page.keyboard.press("Home");
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("End");
  await expect(cards.last()).toHaveAttribute("aria-current", "step");
  expect((await cards.first().boundingBox())!.width).toBeGreaterThan(0);
  await expect(workspace.getByRole("button", { name: "12", exact: true })).toBeDisabled();
  await expect(workspace.getByRole("button", { name: "16", exact: true })).toBeDisabled();
  const overview = workspace.getByTestId("voicing-loop-overview");
  await overview.click({ position: { x: (await overview.boundingBox())!.width * 0.5, y: 5 } });
  await expect(cards.nth(6)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("Home");
  const ruler = workspace.getByTestId("voicing-loop-ruler");
  await ruler.click({ position: { x: (await cards.first().boundingBox())!.width * 2.2, y: 8 } });
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(workspace.getByTestId("voicing-loop-event-preview")).toHaveCount(0);
  const metronome = page.getByTestId("global-metronome");
  const previousMetronome = await metronome.getAttribute("aria-pressed");
  await page.keyboard.press("m");
  await expect(metronome).toHaveAttribute("aria-pressed", previousMetronome === "true" ? "false" : "true");
  await page.keyboard.press("r");
  // P23-32 K3: the reference sound is a switch named 「お手本の音」.
  await expect(workspace.getByRole("switch", { name: "お手本の音" })).toHaveAttribute("aria-checked", "false");
});

test("VL-03 rollback OFF retains the prior card audition path", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lv-voicing-loop-v2", "off"));
  const workspace = await openLoop(page);
  const cards = workspace.getByTestId("voicing-loop-event");
  await cards.nth(1).click();
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("VL-05 keeps the transport reachable at 1280x720 and effective 200%", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const workspace = await openLoop(page);
  await expect(workspace.getByTestId("voicing-loop-transport")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 640, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
  await expect(workspace.getByTestId("voicing-loop-timeline")).toBeVisible();
});


test("VL-05 preserves the C v3 hierarchy across desktop sizes without a height cutoff", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const workspace = await openLoop(page);
    const current = workspace.getByTestId("voicing-loop-current-panel");
    const next = workspace.getByTestId("voicing-loop-next-panel");
    const timeline = workspace.getByTestId("voicing-loop-timeline");
    const keyboard = workspace.getByTestId("voicing-loop-detail");
    const transport = workspace.getByTestId("voicing-loop-transport");
    const [currentBox, nextBox, thenBox, timelineBox, keyboardBox, transportBox] = await Promise.all([
      current.boundingBox(), next.boundingBox(),
      workspace.getByTestId("voicing-loop-then-next").boundingBox(),
      timeline.boundingBox(), keyboard.boundingBox(), transport.boundingBox(),
    ]);
    expect(currentBox && nextBox && thenBox && timelineBox && keyboardBox && transportBox).toBeTruthy();
    expect(currentBox!.width * currentBox!.height).toBeGreaterThan(nextBox!.width * nextBox!.height);
    expect(currentBox!.y).toBeLessThan(timelineBox!.y);
    expect(nextBox!.y).toBeLessThan(timelineBox!.y);
    expect(thenBox!.y).toBeLessThan(timelineBox!.y);
    expect(timelineBox!.y).toBeLessThan(keyboardBox!.y);
    expect(keyboardBox!.y).toBeLessThan(transportBox!.y);
    const metrics = await workspace.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      currentFontSize: parseFloat(getComputedStyle(element.querySelector("h2")!).fontSize),
      keyboardHeight: element.querySelector("[data-keyboard-layout='wide-88'] svg")!.getBoundingClientRect().height,
    }));
    expect(metrics.overflowY).toBe("auto");
    // P23-32 P2/K2: the chord is 52px (34 in a low window) and the keys take the panel's rest — at least 85px
    // in a normal window and the 70px floor the low window keeps while the workspace scrolls.
    const lowWindow = viewport.height <= 760;
    expect(metrics.currentFontSize, `${viewport.width}x${viewport.height} chord`).toBeGreaterThanOrEqual(lowWindow ? 34 : 52);
    expect(metrics.keyboardHeight, `${viewport.width}x${viewport.height} keys`).toBeGreaterThanOrEqual(lowWindow ? 70 : 85);
    await transport.scrollIntoViewIfNeeded();
    await expect(transport).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});


test("VL-06 selector heading stays inside its content area across sidebar and scaled layouts", async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 720 }, { width: 1280, height: 720 },
    { width: 1600, height: 900 }, { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?p527Status=selector");
    const expand = page.getByRole("button", { name: "サイドバーを広げる" });
    if (await expand.isVisible()) await expand.click();
    await waitForSidebarSettled(page);
    await page.locator('[data-nav="voicing-loop"]').click();
    // P23-29 L2: the picker's own heading is not drawn (the tool row names the screen); the tool row is what
    // has to stay inside the content area now.
    const band = page.getByTestId("voicing-loop-picker-tools");
    for (const collapsed of [false, true]) {
      if (collapsed) await page.getByRole("button", { name: "サイドバーを狭める" }).click();
      await waitForSidebarSettled(page);
      const bounds = await band.boundingBox();
      const main = await page.getByRole("main").boundingBox();
      expect(bounds && main).toBeTruthy();
      expect(bounds!.x).toBeGreaterThanOrEqual(main!.x);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      await assertNoHorizontalOverflow(page);
      if (viewport.width === 1280 && !collapsed) await page.screenshot({ path: ".local-evaluation/vl06/selector.png", fullPage: true });
    }
  }
  await page.setViewportSize({ width: 640, height: 720 });
  await page.goto("/?p527Status=selector");
  await page.locator('[data-nav="chord-dojo"]').click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const band = page.getByTestId("voicing-loop-picker-tools");
  const bounds = await band.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  await assertNoHorizontalOverflow(page);
});

test("VL-06 long timeline scales without truncating cards or losing short card names", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const workspace = await openLoop(page, "long-song");
  const cards = workspace.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(128);
  const viewport = workspace.getByTestId("voicing-loop-timeline-viewport");
  const widths: number[] = [];
  for (const scale of [8, 12, 16]) {
    await workspace.getByRole("button", { name: String(scale), exact: true }).click();
    widths.push((await cards.first().boundingBox())!.width);
    const geometry = await viewport.evaluate((element) => {
      const track = element.firstElementChild!;
      const overview = track.querySelector("[data-testid='voicing-loop-overview']")!;
      const ruler = track.querySelector("[data-testid='voicing-loop-ruler']")!;
      return [track.getBoundingClientRect().width, overview.getBoundingClientRect().width, ruler.getBoundingClientRect().width];
    });
    expect(geometry[1]).toBeCloseTo(geometry[0], 0);
    expect(geometry[2]).toBeCloseTo(geometry[0], 0);
  }
  expect(widths[0]).toBeGreaterThan(widths[1]);
  expect(widths[1]).toBeGreaterThan(widths[2]);
  await cards.nth(127).scrollIntoViewIfNeeded();
  await expect(cards.last()).toContainText("Dm7");
  await workspace.getByRole("button", { name: "8", exact: true }).click();
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".local-evaluation/vl06/long-progression.png", fullPage: true });
});


test("VL-06 Preview auditions without changing the selected chord", async ({ page }) => {
  const workspace = await openLoop(page, "both-hands");
  const cards = workspace.getByTestId("voicing-loop-event");
  const previews = workspace.getByTestId("voicing-loop-event-preview");
  await expect(previews).toHaveCount(2);
  await previews.nth(1).click();
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await expect(workspace.getByTestId("voicing-loop-current-panel")).toContainText("Dm7");
});


test("VL-06 acceptance screenshots for short progression and playback states", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const workspace = await openLoop(page, "both-hands");
  await expect(workspace.getByTestId("voicing-loop-event")).toHaveCount(2);
  await page.screenshot({ path: ".local-evaluation/vl06/short-progression.png", fullPage: true });
  await workspace.getByTestId("voicing-loop-event").nth(1).click();
  await expect(workspace.getByTestId("voicing-loop-current-panel")).toContainText("Dm7");
  await page.screenshot({ path: ".local-evaluation/vl06/stopped.png", fullPage: true });
  await workspace.getByRole("button", { name: "開始" }).click();
  await expect(workspace.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.screenshot({ path: ".local-evaluation/vl06/playing.png", fullPage: true });
});


test("VL-07 256 PracticeGroups keep every chord, precise seek, and smooth visual progress", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const started = Date.now();
  const workspace = await openLoop(page, "long-256");
  const mountMilliseconds = Date.now() - started;
  console.log(`VL07_256_UI_MOUNT_MS=${mountMilliseconds}`);
  const cards = workspace.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(256);
  await expect(workspace.getByTestId("voicing-loop-overview").locator("span")).toHaveCount(256);
  await expect(workspace.getByTestId("voicing-loop-ruler").locator("span")).toHaveCount(256);
  expect(mountMilliseconds).toBeLessThan(10000);
  await cards.last().scrollIntoViewIfNeeded();
  await cards.last().click();
  await expect(cards.last()).toHaveAttribute("aria-current", "step");
  await expect(workspace.getByTestId("voicing-loop-position-metric")).toContainText("256 / 256");
  await expect(workspace.getByTestId("voicing-loop-current-panel")).toContainText("Dm7");
  await page.screenshot({ path: ".local-evaluation/vl07/long-progression.png", fullPage: true });
  await page.keyboard.press("Home");
  await expect(cards.first()).toHaveAttribute("aria-current", "step");
  await workspace.locator("#voicing-loop-count-in").selectOption("0");
  await workspace.getByRole("button", { name: "開始" }).click();
  await expect(workspace.getByRole("button", { name: "一時停止" })).toBeVisible();
  const playhead = workspace.getByTestId("voicing-loop-playhead");
  const x1 = await playhead.evaluate((element) => Number((element as HTMLElement).style.transform.match(/translateX\((.+)px\)/)?.[1]));
  await page.waitForTimeout(220);
  const x2 = await playhead.evaluate((element) => Number((element as HTMLElement).style.transform.match(/translateX\((.+)px\)/)?.[1]));
  expect(x2).toBeGreaterThan(x1);
  await workspace.getByRole("button", { name: "一時停止" }).click();
  const paused = await playhead.evaluate((element) => (element as HTMLElement).style.transform);
  await page.waitForTimeout(100);
  expect(await playhead.evaluate((element) => (element as HTMLElement).style.transform)).toBe(paused);
  await cards.last().scrollIntoViewIfNeeded();
  await cards.last().click();
  await expect(cards.last()).toHaveAttribute("aria-current", "step");
  const seekX = await playhead.evaluate((element) => Number((element as HTMLElement).style.transform.match(/translateX\((.+)px\)/)?.[1]));
  expect(seekX).toBeGreaterThan(x2 + 1000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await workspace.getByRole("button", { name: "再開" }).click();
  await page.waitForTimeout(180);
  const resumedX = await playhead.evaluate((element) => Number((element as HTMLElement).style.transform.match(/translateX\((.+)px\)/)?.[1]));
  expect(resumedX).toBeGreaterThan(seekX);
  await workspace.getByRole("button", { name: "停止", exact: true }).click();
  await expect(playhead).toHaveAttribute("style", /translateX\(0px\)/);
});

test("VL-07 compact Current, keyboard legend and acceptance states", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const workspace = await openLoop(page, "both-hands");
  const current = workspace.getByTestId("voicing-loop-current-panel");
  const next = workspace.getByTestId("voicing-loop-next-panel");
  const then = workspace.getByTestId("voicing-loop-then-next");
  const transport = workspace.getByTestId("voicing-loop-transport");
  const boxes = await Promise.all([current.boundingBox(), next.boundingBox(), then.boundingBox(), transport.boundingBox()]);
  expect(boxes.every(Boolean)).toBe(true);
  expect(boxes[0]!.height).toBeLessThan(boxes[1]!.height + boxes[2]!.height + 60);
  // P23-32 K6: the 16px strip under the bar is gone — the bar is the pane's last child.
  await expect(workspace.getByTestId("voicing-loop-bottom-safe-area")).toHaveCount(0);
  expect(boxes[3]!.y).toBeGreaterThanOrEqual(boxes[1]!.y + boxes[1]!.height);
  await expect(workspace.getByTestId("voicing-loop-keyboard-legend")).toContainText("ペダル保持");
  await page.screenshot({ path: ".local-evaluation/vl07/stopped.png", fullPage: true });
  await workspace.locator("#voicing-loop-count-in").selectOption("0");
  await workspace.getByRole("button", { name: "開始" }).click();
  await expect(workspace.getByRole("button", { name: "一時停止" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: ".local-evaluation/vl07/playing.png", fullPage: true });
});

test("VL-07 the bar is the pane's last thing at every size and Windows scaling", async ({ page }) => {
  // R-02: the sizes of §2 of the spec, including what Windows display scaling turns a 1920×1080 screen into
  // (125% ≒ 1536×864, 150% ≒ 1280×720 — already in the list, 200% ≒ 960×540, before the taskbar strip).
  const viewports = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 960, height: 540 },
  ];
  for (const status of ["both-hands", "long-256"]) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const workspace = await openLoop(page, status);
      await expect(workspace.getByTestId("voicing-loop-event").first()).toBeVisible();
      // P23-32 K6: no 16px safe area under the bar; the bar is the last child and the pane scrolls to it.
      await expect(workspace.getByTestId("voicing-loop-bottom-safe-area")).toHaveCount(0);
      const measured = await workspace.evaluate((root) => {
        const transport = root.querySelector("[data-testid='voicing-loop-transport']")!;
        root.scrollTop = root.scrollHeight;
        const pane = root.getBoundingClientRect();
        const bar = transport.getBoundingClientRect();
        const heading = root.querySelector("[data-testid='voicing-loop-current-panel'] h2") as HTMLElement;
        const keyboard = root.querySelector("[data-keyboard-layout='wide-88'] svg")!;
        return {
          lastChild: root.lastElementChild === transport,
          barVisible: bar.bottom <= pane.bottom + 1 && bar.top >= pane.top - 1,
          barHeight: bar.height,
          headingFont: parseFloat(getComputedStyle(heading).fontSize),
          keyboardHeight: keyboard.getBoundingClientRect().height,
        };
      });
      expect(measured.lastChild, `${viewport.width}x${viewport.height} last child`).toBe(true);
      expect(measured.barVisible, `${viewport.width}x${viewport.height} bar at the end of the scroll`).toBe(true);
      expect(measured.barHeight, `${viewport.width}x${viewport.height} bar height`).toBeGreaterThanOrEqual(41);
      // VL-07 / P23-32 P2: the chord name follows the window (52 / 34) and the keys keep a drawn height.
      expect(measured.headingFont, `${viewport.width}x${viewport.height} chord`).toBeGreaterThanOrEqual(viewport.height <= 760 ? 34 : 52);
      expect(measured.keyboardHeight, `${viewport.width}x${viewport.height} keys`).toBeGreaterThan(0);
      await assertNoHorizontalOverflow(page);
      if (viewport.width === 1280 && viewport.height === 720) {
        await page.screenshot({ path: `p89-generated/r02/bar-${status}-1280x720.png`, fullPage: true });
      }
    }
  }
});

test("VL-07 selector clipping remains absent at 200 percent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?p527Status=selector-vl07");
  await page.locator('[data-nav="voicing-loop"]').click();
  const choices = page.getByTestId("voicing-loop-progression-choice");
  const rows = page.getByTestId("voicing-loop-progression-row");
  await expect(choices).toHaveCount(3);
  // P23-29 L6/L7: a row has no practice button of its own; the right column's main button is the one.
  await expect(rows.locator("button[data-testid='voicing-loop-progression-practice']")).toHaveCount(0);
  await expect(page.getByTestId("voicing-loop-preview-practice")).toBeEnabled();
  // P23-29 L8: the list's top playable row is picked at open — 「Public capacity case」 is newer but unavailable,
  // so the missing-BPM row (the next in the list) is the first one that can be practised.
  await expect(rows.filter({ hasText: "Public missing BPM" })).toHaveAttribute("data-selected", "true");
  // VL-15: the picker shows the BPM number only; a provisional tempo is faded and explained on hover.
  const provisional = choices.filter({ hasText: "Public missing BPM" }).locator("[data-tempo-origin='PRACTICE_INITIAL']");
  await expect(provisional).toHaveText("120 BPM");
  await expect(provisional).toHaveAttribute("title", "BPMが保存されていないため、仮の 120 BPM です");
  // P22-02 §1-6: the reason sits on the chords line (the full sentence stays in its tooltip).
  const capacity = page.getByTestId("voicing-loop-progression-row").filter({ hasText: "Public capacity case" });
  await expect(capacity).toContainText("長すぎるため、ここでは練習できません(範囲を分けて保存してください)");
  await expect(capacity.getByTestId("voicing-loop-progression-reason")).toHaveAttribute("title", /256/);
  await page.screenshot({ path: ".local-evaluation/vl07/selector.png", fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await assertNoHorizontalOverflow(page);
});
