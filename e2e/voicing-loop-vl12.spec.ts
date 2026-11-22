import { expect, test } from "@playwright/test";

test("VL-12 Space shortcut respects native controls and keeps keyboard focus visible", async ({ page }) => {
  await page.goto("/?p527Status=vl09-layout");
  const nav = page.locator('[data-nav="voicing-loop"]');
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator('[data-nav="chord-dojo"]').click();
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
  // P23-32 K4: Space on a control of the bar (the お手本の音 switch) toggles that control, not the transport.
  const reference = workspace.getByRole("switch", { name: "お手本の音" });
  await reference.focus();
  await page.keyboard.press("Space");
  await expect(reference).toHaveAttribute("aria-checked", "false");
  await expect(workspace.getByRole("button", { name: "再開" })).toBeVisible();
  const timeline = workspace.getByTestId("voicing-loop-timeline-viewport");
  await timeline.focus();
  expect(await timeline.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
});

test("VL-12 the practice has no BPM field of its own; the header's 共通 BPM is the one it follows", async ({ page }) => {
  await page.goto("/?p527Status=vl09-layout");
  const nav = page.locator('[data-nav="voicing-loop"]');
  if (await nav.isVisible()) await nav.click();
  else {
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
  }
  // P23-32 K4: the scrub field left this screen; the header's 共通 BPM is the field that applies now.
  await expect(page.locator("#voicing-loop-bpm")).toHaveCount(0);
  await expect(page.getByTestId("voicing-loop-bpm-field")).toHaveCount(0);
  const shared = page.getByTestId("global-bpm-value");
  const start = Number(await shared.getAttribute("aria-valuenow"));
  expect(start).toBeGreaterThan(0);
  await shared.focus();
  await page.keyboard.press("PageUp");
  await expect.poll(async () => Number(await shared.getAttribute("aria-valuenow"))).not.toBe(start);
  // The practice keeps running at that value: the bar still starts and pauses.
  const transport = page.getByTestId("voicing-loop-transport");
  await transport.getByRole("button", { name: /開始/ }).click();
  await expect(transport.getByRole("button", { name: /一時停止/ })).toBeVisible();
});

test("VL-12 transport rows fit vertically at desktop viewports and scaling", async ({ page }) => {
  test.setTimeout(90_000);
  for (const { width, height, zoom } of [
    { width: 1920, height: 1080, zoom: 1 },
    { width: 1440, height: 900, zoom: 1 },
    { width: 1280, height: 800, zoom: 1 },
    { width: 1280, height: 720, zoom: 1 },
    { width: 1536, height: 864, zoom: 1.25 },
    { width: 1280, height: 800, zoom: 1.5 },
    { width: 1280, height: 800, zoom: 2 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?p527Status=vl09-layout");
    const nav = page.locator('[data-nav="voicing-loop"]');
    if (await nav.isVisible()) await nav.click();
    else {
      await page.locator('[data-nav="chord-dojo"]').click();
      await page.getByRole("tab", { name: "Voicing Loop" }).click();
    }
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
    // P23-32 K4: the bar is one row, so the row to check is the primary one.
    for (const id of ["voicing-loop-transport-primary"]) {
      const row = page.getByTestId(id);
      const measure = await row.evaluate((element) => ({
        client: element.clientHeight,
        scroll: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(measure.scroll).toBeLessThanOrEqual(measure.client);
      // P23-20 L6: a narrow bar wraps and grows its row (`visible`); it must never scroll vertically.
      expect(measure.overflowY).not.toBe("auto");
      expect(measure.overflowY).not.toBe("scroll");
    }
  }
});

test("P11 current hand cards keep fingering information with compact Next Move", async ({ page }) => {
  for (const { width, height, zoom } of [
    { width: 1920, height: 1080, zoom: 1 },
    { width: 1280, height: 800, zoom: 1 },
    { width: 1280, height: 800, zoom: 1.5 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?p527Status=vl09-layout");
    const nav = page.locator('[data-nav="voicing-loop"]');
    if (await nav.isVisible()) await nav.click();
    else {
      await page.locator('[data-nav="chord-dojo"]').click();
      await page.getByRole("tab", { name: "Voicing Loop" }).click();
    }
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
    const strip = page.getByTestId("voicing-loop-next-move");
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId("voicing-loop-finger-slot")).toHaveCount(10);
    for (const hand of ["left", "right"]) {
      const card = page.getByTestId(`voicing-loop-${hand}-hand`);
      await expect(card).toBeVisible();
      // P23-20 L1: five slot cards per hand; the finger, note and chord tone live in each card.
      await expect(card.locator("[data-testid='voicing-loop-hand-slot']")).toHaveCount(5);
      await expect(card.locator(".voicing-hand-slot-finger").first()).toHaveText(/^[LR][1-5]$/);
      await expect(card.locator(".voicing-hand-slot-pitch").first()).not.toBeEmpty();
      await expect(card.locator(".voicing-hand-slot-degree").first()).not.toBeEmpty();
      await expect(card).toContainText("おすすめ");
    }
  }
});
