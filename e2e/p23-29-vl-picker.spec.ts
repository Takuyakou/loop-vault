import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression, chooseTextSetting } from "./helpers/app";
import { selectedRow, startPracticeFromRow } from "./helpers/voicingLoopPicker";

/**
 * P23-29 C1 (L1, L4, L10) and C5: the 続きから band opens the practice, the chosen progression's main button
 * stays inside the window at 1440x900 and 1280x720 while only the list scrolls, the four sizes have no sideways
 * overflow and no serious/critical axe finding, and the arrows / Enter / Space / Esc follow the rules.
 * The state photos are taken here too (p89-generated/p23-29/, not tracked).
 */

const ROW = "voicing-loop-progression-row";
const MAIN = "voicing-loop-preview-practice";
const LAST_KEY = "loop-vault:voicing-loop-last:v1";
const RECENT_KEY = "loop-vault:voicing-loop-recents:v1";

type Size = readonly [width: number, height: number];

const SIZES: readonly Size[] = [[1440, 900], [1280, 720], [1024, 768], [768, 640]];

const shoot = async (page: Page, name: string) => {
  await waitForScreenSettled(page);
  await page.screenshot({ path: `p89-generated/p23-29/${name}.png` });
};

/** The picker's own last practice (L1) and the recent row, seeded before the app reads them. */
function seed(page: Page, resume: boolean) {
  return page.addInitScript(({ resume, lastKey, recentKey }) => {
    localStorage.setItem(recentKey,
      JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    if (resume) {
      localStorage.setItem(lastKey, JSON.stringify({ version: 1,
        reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
    } else {
      localStorage.removeItem(lastKey);
    }
  }, { resume, lastKey: LAST_KEY, recentKey: RECENT_KEY });
}

/** The shell fades the main screen in; wait for that (and its transitions) so axe and the photos see the final colours. */
async function waitForScreenSettled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    return {
      opacity: main ? getComputedStyle(main).opacity : "1",
      running: document.getAnimations().filter((animation) => animation.playState === "running").length,
    };
  }), { timeout: 10_000 }).toEqual({ opacity: "1", running: 0 });
}

/** Opens the synthetic picker (five rows: two favourites, one recent, one plain, one unavailable). */
async function openPicker(page: Page, size: Size | undefined = undefined): Promise<void> {
  if (size) await page.setViewportSize({ width: size[0], height: size[1] });
  await page.goto("/?p527Status=vl15-picker");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId(ROW).first()).toBeVisible();
  await waitForScreenSettled(page);
}

/** Opens the real (empty) app and saves one progression, then shows the picker with that one row. */
async function openRealPicker(page: Page, title: string): Promise<void> {
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  await createSavedProgression(page, title);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId(ROW)).toHaveCount(1);
  await waitForScreenSettled(page);
}

test("P23-31 C9: the fixture's keyed rows show degrees and role colours; the keyless rows show neither", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, true);
  await openPicker(page, [1440, 900]);
  const rows = await page.evaluate(() => {
    const titleOf = (row: HTMLElement) => row.querySelector<HTMLElement>(".lv-vl-picker-row .min-w-0 p span")?.getAttribute("title") ?? "";
    return [...document.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-progression-row']")].map((row) => ({
      title: titleOf(row),
      chips: [...row.querySelectorAll<HTMLElement>(".lv-vl-row-chord")].map((chip) => ({
        fn: chip.getAttribute("data-fn"),
        degree: chip.querySelector("small")?.textContent ?? "",
      })),
    }));
  });
  const keyed = rows.filter((row) => ["Public favourite loop", "Public second favourite", "Public recent loop"].includes(row.title));
  const keyless = rows.filter((row) => ["Public plain loop", "Public unavailable loop"].includes(row.title));
  expect(keyed).toHaveLength(3);
  expect(keyless).toHaveLength(2);
  for (const row of keyed) {
    expect(row.chips.length, `${row.title}: chips`).toBeGreaterThan(0);
    const withRole = row.chips.filter((chip) => chip.fn !== null);
    expect(withRole.length, `${row.title}: role colours`).toBeGreaterThan(0);
    expect(withRole.every((chip) => ["T", "SD", "SDm", "D"].includes(chip.fn!))).toBe(true);
    // The degree is drawn above each chord the app can place in the key (a chord it cannot place has none).
    expect(row.chips.filter((chip) => chip.degree.trim().length > 0).length, `${row.title}: degrees`).toBeGreaterThan(0);
  }
  for (const row of keyless) {
    expect(row.chips.filter((chip) => chip.fn !== null), `${row.title}: no role colour without a key`).toHaveLength(0);
    expect(row.chips.filter((chip) => chip.degree.trim().length > 0), `${row.title}: no degree without a key`).toHaveLength(0);
  }

  // V2: the right column's chord card carries the role's colour as a 2px line at its top.
  const first = page.getByTestId("voicing-loop-preview-chord").first();
  const role = await first.getAttribute("data-fn");
  expect(role).toBeTruthy();
  const painted = await page.evaluate((fn) => {
    const probe = document.createElement("div");
    probe.style.background = `var(--lv-fn-${fn!.toLowerCase()})`;
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const card = document.querySelector<HTMLElement>("[data-testid='voicing-loop-preview-chord']")!;
    const style = getComputedStyle(card);
    return { expected, actual: style.borderTopColor, width: style.borderTopWidth };
  }, role);
  expect(painted.width).toBe("2px");
  expect(painted.actual).toBe(painted.expected);
});

test("P23-31 C9: a saved progression's degrees and role colours agree with the Vault's chips", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  // A text progression with a key: the same chords and the same key are shown by both screens.
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill("| Cmaj7 | Am7 | Dm7 | G7 |");
  await chooseTextSetting(capture, "text-progression-key", "C major");
  await capture.getByTestId("text-progression-name").fill("P23-31 Vault Parity");
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/)).toBeVisible();

  await page.locator('[data-nav="vault"]').click();
  await expect(page.locator(".lv-vault-row")).toHaveCount(1);
  const vault = await page.evaluate(() => {
    const row = document.querySelector(".lv-vault-row")!;
    return [...row.querySelectorAll<HTMLElement>(".lv-vault-chip")].map((chip) => ({
      fn: chip.getAttribute("data-fn"),
      degree: chip.querySelector(".lv-vault-chip-degree")?.textContent?.trim() ?? "",
    }));
  });
  expect(vault.length, "the Vault shows the chords").toBeGreaterThan(0);

  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId(ROW)).toHaveCount(1);
  await expect(page.getByTestId("voicing-loop-preview-chord").first()).toBeVisible();
  const picker = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-preview-chord']")]
    .map((chip) => ({
      fn: chip.getAttribute("data-fn"),
      degree: chip.querySelector("small")?.textContent?.trim() ?? "",
    })));
  const shown = Math.min(vault.length, picker.length);
  expect(shown, "the two screens show at least one chord").toBeGreaterThan(0);
  console.log("P2331-C9", JSON.stringify({ vault, picker }));
  expect(picker.slice(0, shown).map((chip) => chip.fn)).toEqual(vault.slice(0, shown).map((chip) => chip.fn));
  expect(picker.slice(0, shown).map((chip) => chip.degree)).toEqual(vault.slice(0, shown).map((chip) => chip.degree));
});

test("P23-29 C1/L1: the 続きから band appears after a practice and its 続ける opens it", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRealPicker(page, "P23-29 Resume Target");
  // Practise once, so this PC keeps its last practice (L1's record).
  await startPracticeFromRow(page, page.getByTestId(ROW).first());
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible({ timeout: 20_000 });
  // Back on the picker the band has that progression; L1 also says the day comes from that one record.
  await page.locator('[data-nav="voicing-loop"]').click();
  const band = page.getByTestId("voicing-loop-resume");
  await expect(band).toBeVisible();
  await expect(band).toContainText("続きから");
  await expect(band).toContainText("P23-29 Resume Target");
  await expect(band).toContainText("きょう練習");
  await page.getByTestId("voicing-loop-resume-go").click();
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible({ timeout: 20_000 });
  // P23-32 K4: the practice has no BPM field; the header's 共通 BPM is the one it follows.
  await expect(page.getByTestId("global-bpm-value")).toHaveAttribute("aria-valuenow", /^\d+$/);
});

test("P23-29 L10/C5: the right column's main button stays in the window and only the list scrolls", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, true);
  for (const [width, height] of [[1440, 900], [1280, 720]] as const) {
    await openPicker(page, [width, height]);
    const main = page.getByTestId(MAIN);
    await expect(main).toBeVisible();
    const box = (await main.boundingBox())!;
    expect(box.y, `${width}x${height}: the top is in the window`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${width}x${height}: the bottom is in the window`).toBeLessThanOrEqual(height + 0.5);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    const measured = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>("[data-testid='voicing-loop-workspace']")!;
      const list = document.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-list']")!;
      const inner = list.querySelector<HTMLElement>("[tabindex='0']")!;
      const preview = document.querySelector<HTMLElement>("[data-testid='voicing-loop-preview']")!;
      return {
        documentScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        workspaceScroll: workspace.scrollHeight - workspace.clientHeight,
        listOverflowY: getComputedStyle(inner).overflowY,
        listBottom: list.getBoundingClientRect().bottom,
        previewWidth: preview.getBoundingClientRect().width,
        previewLeft: preview.getBoundingClientRect().left,
        listRight: list.getBoundingClientRect().right,
      };
    });
    // L10: the window itself does not scroll; the list's column is the one that scrolls.
    expect(measured.documentScroll, `${width}x${height}: the page does not scroll`).toBeLessThanOrEqual(1);
    expect(measured.workspaceScroll, `${width}x${height}: the workspace does not scroll`).toBeLessThanOrEqual(1);
    expect(measured.listOverflowY, `${width}x${height}: the list scrolls inside its column`).toBe("auto");
    expect(measured.listBottom).toBeLessThanOrEqual(height + 0.5);
    // L4: the chosen progression is a ~400px column beside the list.
    expect(measured.previewWidth).toBeGreaterThanOrEqual(380);
    expect(measured.previewWidth).toBeLessThanOrEqual(420);
    expect(measured.previewLeft).toBeGreaterThanOrEqual(measured.listRight - 1);
    console.log("P2329-L10", width, height, JSON.stringify({
      mainTop: Math.round(box.y), mainBottom: Math.round(box.y + box.height), mainHeight: Math.round(box.height),
      ...measured, listBottom: Math.round(measured.listBottom), previewWidth: Math.round(measured.previewWidth),
    }));
  }
});

test("P23-29 C1/L4: below 1024px the chosen progression goes under the list, not over it", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, true);
  for (const [width, height, twoColumns] of [[1024, 768, true], [768, 640, false]] as const) {
    await openPicker(page, [width, height]);
    const geometry = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>("[data-testid='voicing-loop-progression-list']")!.getBoundingClientRect();
      const preview = document.querySelector<HTMLElement>("[data-testid='voicing-loop-preview']")!.getBoundingClientRect();
      return { list: { left: list.left, right: list.right, top: list.top, bottom: list.bottom },
        preview: { left: preview.left, right: preview.right, top: preview.top, bottom: preview.bottom } };
    });
    if (twoColumns) {
      expect(geometry.preview.left, `${width}x${height}: beside the list`).toBeGreaterThanOrEqual(geometry.list.right - 1);
    } else {
      expect(geometry.preview.top, `${width}x${height}: under the list`).toBeGreaterThanOrEqual(geometry.list.bottom - 1);
      expect(Math.round(geometry.preview.left), `${width}x${height}: the full width`).toBe(Math.round(geometry.list.left));
      // The stacked column keeps a usable list (a short window must not squeeze it away).
      expect(geometry.list.bottom - geometry.list.top, `${width}x${height}: the list keeps its height`)
        .toBeGreaterThanOrEqual(120);
    }
    console.log("P2329-L4", width, height, JSON.stringify(geometry));
  }
});

test("P23-29 C5: no sideways overflow and no serious or critical axe finding at the four sizes", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, true);
  for (const [width, height] of SIZES) {
    await openPicker(page, [width, height]);
    const overflow = await page.evaluate(() => ({
      clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth }));
    console.log("P2329-OVERFLOW", width, height, JSON.stringify(overflow));
    await assertNoHorizontalOverflow(page);
    const axe = await new AxeBuilder({ page: page as never })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = axe.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target),
        summary: violation.nodes.map((node) => node.failureSummary) }));
    console.log("P2329-AXE", width, height, JSON.stringify(blocking));
    expect(blocking, `${width}x${height}`).toEqual([]);
  }
});

/** Records every keydown and whether the page consumed it (read after the event has finished bubbling). */
async function recordKeys(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: { key: string; prevented: boolean }[] = [];
    (window as unknown as { __p2329Keys: typeof log }).__p2329Keys = log;
    document.addEventListener("keydown", (event) => {
      const key = event.key;
      setTimeout(() => log.push({ key, prevented: event.defaultPrevented }), 0);
    });
  });
}

async function press(page: Page, key: string): Promise<{ key: string; prevented: boolean }> {
  const count = await page.evaluate(() => (window as unknown as { __p2329Keys: unknown[] }).__p2329Keys.length);
  await page.keyboard.press(key);
  await expect.poll(async () => page.evaluate(
    () => (window as unknown as { __p2329Keys: unknown[] }).__p2329Keys.length)).toBeGreaterThan(count);
  return page.evaluate((at) => (window as unknown as { __p2329Keys: { key: string; prevented: boolean }[] })
    .__p2329Keys[at]!, count);
}

test("P23-29 C5: the arrows pick, Space auditions and Esc stays as it was", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, true);
  await openPicker(page, [1440, 900]);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await recordKeys(page);
  const selected = selectedRow(page);
  // L8/L1: the band's progression is the one picked at open.
  await expect(selected).toContainText("Public recent loop");

  // Down and Up move the pick through the playable rows.
  const down = await press(page, "ArrowDown");
  expect(down).toEqual({ key: "ArrowDown", prevented: true });
  await expect(selected).toContainText("Public plain loop");
  const up = await press(page, "ArrowUp");
  expect(up).toEqual({ key: "ArrowUp", prevented: true });
  await expect(selected).toContainText("Public recent loop");

  // Space auditions the picked progression (its block is there, so the key is the picker's) and starts no practice.
  const space = await press(page, "Space");
  expect(space).toEqual({ key: " ", prevented: true });
  expect(await page.getByTestId("voicing-loop-current-panel").count()).toBe(0);

  // Esc stays as it was: the picker neither consumes it nor starts anything.
  const escape = await press(page, "Escape");
  expect(escape).toEqual({ key: "Escape", prevented: false });
  await expect(selected).toContainText("Public recent loop");
  expect(await page.getByTestId("voicing-loop-current-panel").count()).toBe(0);
});

test("P23-29 C5: Enter starts the picked progression", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRealPicker(page, "P23-29 Enter Target");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("global-bpm-value")).toHaveAttribute("aria-valuenow", /^\d+$/);
});

test("P23-29 photos: 続きから at 1440x900, 1280x720, 1024x768 and 768x640", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, true);
  for (const [width, height] of SIZES) {
    await openPicker(page, [width, height]);
    await expect(page.getByTestId("voicing-loop-resume")).toBeVisible();
    await shoot(page, `resume-${width}x${height}`);
    // P23-31's own photos of the picker (degrees and role colours in the rows and the right column).
    if (width === 1440 || width === 1280) {
      await page.screenshot({ path: `p89-generated/p23-31/vl-picker-${width}x${height}.png` });
    }
  }
});

test("P23-29 photos: no 続きから, a search and the unavailable row at 1440x900 and 1280x720", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, false);
  for (const [width, height] of [[1440, 900], [1280, 720]] as const) {
    await openPicker(page, [width, height]);
    await expect(page.getByTestId("voicing-loop-resume")).toHaveCount(0);
    await shoot(page, `no-resume-${width}x${height}`);

    await page.locator("#voicing-loop-progression-search").fill("Public");
    await expect(page.getByTestId("voicing-loop-section-results")).toBeVisible();
    await shoot(page, `search-${width}x${height}`);
    await page.locator("#voicing-loop-progression-search").fill("");
    await expect(page.getByTestId("voicing-loop-section-favorites")).toBeVisible();

    // 練習できない行を選ぼうとした所: it stays unpicked and starts nothing.
    const unavailable = page.getByTestId(ROW).filter({ hasText: "Public unavailable loop" });
    const box = (await unavailable.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(unavailable).not.toHaveAttribute("data-selected", "true");
    expect(await page.getByTestId("voicing-loop-current-panel").count()).toBe(0);
    await shoot(page, `unavailable-${width}x${height}`);
  }
});

test("P23-29 photos: a starred row at 1440x900 and 1280x720", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRealPicker(page, "P23-29 Star Target");
  const row = page.getByTestId(ROW).first();
  const star = row.getByTestId("voicing-loop-favorite");
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await shoot(page, "favorite-toggle-1440x900");
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId(MAIN)).toBeVisible();
  await shoot(page, "favorite-toggle-1280x720");
});
