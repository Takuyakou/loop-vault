import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, dropMidi, loadMidiForPreAnalysis, openApp, openCapture } from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

/**
 * P23-12: 取り込み前の確認 — the three steps, the low part rows with the details on the selected
 * one, the whole-song strip above the roll, the count chips, the lean bottom band and the hover light.
 * C1-C5 of the instruction.
 */
const workspace = (page: Page) => page.getByTestId("pre-analysis-workspace");
const parts = (page: Page) => page.locator("[data-voice-id]");
const summaryChips = (page: Page) => workspace(page).getByTestId("pre-analysis-summary").locator(".lv-pa-chip");

async function openWorkspace(page: Page, voiceCount = 5) {
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount, bars: 8 }), `p23-12-${voiceCount}.mid`);
  await expect(workspace(page)).toBeVisible();
}

/** The numbers of the screen: the roll's height, the page's scroll, where the strip sits. */
const geometry = (page: Page) => page.evaluate(() => {
  const box = (element: Element | null) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
  };
  const main = document.getElementById("main-content")!;
  return {
    roll: box(document.querySelector("[data-testid='pre-analysis-roll-scroll']")),
    strip: box(document.querySelector("[data-testid='pre-analysis-overview']")),
    parts: box(document.querySelector("[data-testid='pre-analysis-part-list']")),
    page: { scrollHeight: main.scrollHeight, clientHeight: main.clientHeight },
    body: { scrollWidth: document.body.scrollWidth, clientWidth: document.body.clientWidth },
    partsScroll: (() => {
      const list = document.querySelector<HTMLElement>("[data-testid='pre-analysis-part-list']");
      return list ? { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight } : null;
    })(),
  };
});

/** Pixels of each role colour on the roll's lower canvas (the notes are drawn there). */
const rolePixels = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-piano-roll']")!;
  const context = canvas.getContext("2d")!;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const colors: Record<string, [number, number, number]> = {
    chord: [0xf2, 0xb8, 0x4b],
    bass: [0xb7, 0x9c, 0xff],
    melody: [0x6c, 0xc7, 0xff],
  };
  const counts: Record<string, number> = { chord: 0, bass: 0, melody: 0, bright: 0 };
  for (let index = 0; index < data.length; index += 4) {
    const [r, g, b] = [data[index]!, data[index + 1]!, data[index + 2]!];
    if (r + g + b < 120) continue;
    counts.bright += 1;
    for (const [role, [cr, cg, cb]] of Object.entries(colors)) {
      if (Math.abs(r - cr) < 46 && Math.abs(g - cg) < 46 && Math.abs(b - cb) < 46) counts[role] += 1;
    }
  }
  return counts;
});

test("C1 A1/A4/A5/A6: the steps, the strip above the roll, the chips and the lean bottom band", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, 5);

  // A1: the three steps, the third one is where we are.
  const steps = workspace(page).locator(".lv-pa-steps li");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("MIDI をドロップ");
  await expect(steps.nth(1)).toContainText("パートを確かめる");
  // P23-31 P1 (form B): 「（今ここ）」 is not shown any more; the current step is the accent pill instead.
  await expect(steps.nth(1)).not.toContainText("（今ここ）");
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(steps.nth(2)).toContainText("選んで保存");
  // The heading is still there for screen readers.
  await expect(workspace(page).locator("h2")).toHaveText("取り込み前の確認");

  // A4: 「曲全体」 above the roll, its plot starting where the roll's plot starts.
  const geometryNow = await geometry(page);
  expect(geometryNow.strip!.bottom).toBeLessThanOrEqual(geometryNow.roll!.top + 1);
  await expect(workspace(page).locator(".lv-pa-overview-head h3")).toHaveText("曲全体");
  const gutter = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>("[data-testid='pre-analysis-overview']")!;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-piano-roll']")!;
    return {
      stripLeft: Math.round(strip.getBoundingClientRect().left),
      rollLeft: Math.round(canvas.getBoundingClientRect().left),
    };
  });
  // The strip's plot starts where the roll's plot starts (the roll's key column is on its left).
  expect(gutter.stripLeft - gutter.rollLeft).toBe(38);

  // A5: the counts are chips in the play row; the part names are their tooltips.
  await expect(summaryChips(page)).toHaveCount(4);
  expect((await summaryChips(page).evaluateAll((chips) => chips.map((chip) => chip.textContent))).join(" "))
    .toMatch(/コード \d+.*ベース \d+.*メロディ \d+.*使わない \d+/);
  for (const chip of await summaryChips(page).all()) {
    const title = await chip.getAttribute("title");
    expect(title).toMatch(/^(コード|ベース|メロディ|使わない): /);
  }
  expect(await workspace(page).locator(".lv-pa-transport [data-testid='pre-analysis-summary']").count()).toBe(1);
  expect(await workspace(page).locator(".lv-pa-bottom [data-testid='pre-analysis-summary']").count()).toBe(0);

  // A6: the bottom band is 「詳しい設定」 and 「解析する」; the key line lives in 「?」.
  await expect(workspace(page).locator(".lv-pa-bottom .lv-pa-keys")).toHaveCount(0);
  await expect(workspace(page).locator(".lv-pa-bottom").getByRole("button", { name: /詳しい設定/ })).toBeVisible();
  await expect(workspace(page).locator(".lv-pa-bottom").getByTestId("pre-analysis-analyze")).toBeVisible();
  await workspace(page).getByRole("button", { name: "この画面について" }).click();
  await expect(workspace(page).getByRole("note")).toContainText("↑↓ パート");
  await page.keyboard.press("Escape");
  await expect(workspace(page).getByRole("note")).toHaveCount(0);
});

test("C1 A2/C3: the rows are low, only the selected part opens, and 12 parts scroll inside the list", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, 12);

  // A2: every row keeps the name line and the role line; the details are only on the selected row.
  await expect(parts(page)).toHaveCount(12);
  await expect(workspace(page).getByTestId("pre-analysis-part-detail")).toHaveCount(1);
  const rows = await parts(page).evaluateAll((elements) => elements.map((element) => {
    const details = element.querySelector("[data-testid='pre-analysis-part-detail']") !== null;
    return { details, height: Math.round(element.getBoundingClientRect().height) };
  }));
  expect(rows.filter((row) => row.details)).toHaveLength(1);
  // The rows are lower than the old card: 2 lines, ~64px.
  for (const row of rows) if (!row.details) expect(row.height).toBeLessThanOrEqual(78);

  // C3: 12 parts — only the list scrolls.
  const geometryNow = await geometry(page);
  expect(geometryNow.partsScroll!.scrollHeight).toBeGreaterThan(geometryNow.partsScroll!.clientHeight);

  // Selecting another part moves the details (and keeps the same row count).
  await parts(page).nth(3).click();
  await expect(workspace(page).getByTestId("pre-analysis-part-detail")).toHaveCount(1);
  await expect(parts(page).nth(3).getByTestId("pre-analysis-part-detail")).toHaveCount(1);
});

test("C3: one part, and two files keep their own headings", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // One part: a single row, nothing to scroll.
  await openWorkspace(page, 1);
  await expect(parts(page)).toHaveCount(1);
  const single = await geometry(page);
  expect(single.partsScroll!.scrollHeight).toBeLessThanOrEqual(single.partsScroll!.clientHeight + 1);

  // Two files: a heading per file.
  await page.goto("/");
  await openCapture(page);
  await dropMidi(page, createMidiFixture({ voiceCount: 2, bars: 8 }), "p23-12-first.mid");
  await expect(workspace(page)).toBeVisible();
  await dropMidi(page, createMidiFixture({ voiceCount: 2, bars: 8 }), "p23-12-second.mid");
  await expect(workspace(page)).toBeVisible();
  await expect(workspace(page).locator(".lv-pa-source-head")).toHaveCount(2);
  await expect(workspace(page).locator(".lv-pa-source-name").first()).toContainText(".mid");
});

test("C1 A3/C4: hovering a part lights its notes and fades the others, leaving restores the picture, and pressing a part does not dim the others", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, 5);

  const before = await rolePixels(page);
  expect(before.bright).toBeGreaterThan(0);

  // Hover the first part row (its role colour is the one that must stay bright).
  const hoveredRole = await parts(page).first().getAttribute("data-role");
  await parts(page).first().hover();
  await page.waitForTimeout(120);
  const hovered = await rolePixels(page);

  // The whole picture is dimmer, the hovered part keeps its colour.
  expect(hovered.bright).toBeLessThan(before.bright);
  if (hoveredRole && hoveredRole !== "off") {
    expect(hovered[hoveredRole]!).toBeGreaterThan(0);
    expect(before[hoveredRole]!).toBeGreaterThan(hovered[hoveredRole]!);
  }

  // Leaving the row puts the picture back.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(120);
  const after = await rolePixels(page);
  expect(after.bright).toBe(before.bright);
  expect(after.chord).toBe(before.chord);

  // P23-31 C4 (merged here in P25 T3): pressing a part does not dim the others; only the pointer does.
  // Open the selected part with the mouse (its details open), then take the pointer off the row.
  const selected = page.locator(".lv-pa-part[data-selected]").first();
  await selected.click();
  await expect(selected.getByTestId("pre-analysis-part-detail")).toHaveCount(1);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(120);
  const afterPress = await rolePixels(page);
  expect(afterPress.bright).toBe(before.bright);
  expect(afterPress.chord).toBe(before.chord);

  // Hovering is still the only thing that fades the other parts.
  await parts(page).first().hover();
  await page.waitForTimeout(120);
  const hoveredAgain = await rolePixels(page);
  expect(hoveredAgain.bright).toBeLessThan(before.bright);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(120);
  expect((await rolePixels(page)).bright).toBe(before.bright);
});

test("C2/C5: four sizes keep the page still, the roll keeps its height, axe is clean and the keys work", async ({ page }) => {
  test.setTimeout(240_000);
  const heights: Record<string, number> = {};
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openWorkspace(page, 5);
    const geometryNow = await geometry(page);
    heights[`${size.width}x${size.height}`] = geometryNow.roll!.height;
    // P23-31: the sound line's own height is what the roll gave up (it used to sit inside the play row).
    const soundLine = await page.locator(".lv-pa-soundline").evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { height: Math.round(box.height * 10) / 10, marginBottom: Math.round((box.bottom - box.top - box.height) * 10) / 10 };
    }).catch(() => null);
    console.log("P2331-PA", size.width, size.height, JSON.stringify({ roll: geometryNow.roll!.height, soundLine }));
    // No scrolling in either direction.
    expect(geometryNow.page.scrollHeight, `${size.width} vertical`).toBeLessThanOrEqual(geometryNow.page.clientHeight + 1);
    await assertNoHorizontalOverflow(page);
    expect(geometryNow.body.scrollWidth).toBeLessThanOrEqual(geometryNow.body.clientWidth + 1);
    // The strip is above the roll at every size, and the roll keeps a usable height.
    expect(geometryNow.strip!.bottom).toBeLessThanOrEqual(geometryNow.roll!.top + 1);
    expect(geometryNow.roll!.height, `${size.width} roll`).toBeGreaterThan(180);

    if (size.width === 1440) {
      const axe = await new AxeBuilder({ page: page as never })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
      expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);

      // C5: the keys are the ones the screen already answered to.
      await page.keyboard.press("ArrowDown");
      const first = await page.locator("[data-selected]").getAttribute("data-voice-id");
      await page.keyboard.press("2");
      await expect(page.locator(`[data-voice-id="${first}"]`)).toHaveAttribute("data-role", "bass");
      await page.keyboard.press("1");
      await expect(page.locator(`[data-voice-id="${first}"]`)).toHaveAttribute("data-role", "chord");
      await page.keyboard.press("s");
      await expect(page.locator(`[data-voice-id="${first}"] [aria-label$="をソロ"]`)).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("m");
      await expect(page.locator(`[data-voice-id="${first}"] [title='消音']`)).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({ path: `p89-generated/p23-12/pre-analysis-${size.width}x${size.height}.png`, fullPage: true });
      // Enter analyses (the button is enabled).
      await page.keyboard.press("Enter");
      await expect(page.locator('[data-capture-stage="result"]')).toBeVisible({ timeout: 20_000 });
    } else {
      await page.screenshot({ path: `p89-generated/p23-12/pre-analysis-${size.width}x${size.height}.png`, fullPage: true });
    }
  }
  // The roll keeps the same height order as the window grows.
  expect(heights["1440x900"]!).toBeGreaterThan(heights["768x640"]!);
});

/** P23-31: the four model shapes of the mock — steps, mixed-parts row, role buttons and the bottom band. */
test("P23-31 C1/C2/C3/C6: the steps, the mixed row, the roles and the bottom band match the mock", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, 5);
  const space = workspace(page);

  // C1: three round marks (✓, 2, 3); the current step is the accent pill; no visible 「（今ここ）」.
  const steps = space.locator(".lv-pa-steps li");
  await expect(steps).toHaveCount(3);
  await expect(steps.locator(".lv-pa-step-n")).toHaveText(["✓", "2", "3"]);
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(steps.nth(1)).not.toContainText("（今ここ）");
  const stepGeometry = await steps.evaluateAll((elements) => elements.map((element) => {
    const mark = element.querySelector<HTMLElement>(".lv-pa-step-n")!;
    const style = getComputedStyle(mark);
    return { mark: Math.round(mark.getBoundingClientRect().width), radius: style.borderTopLeftRadius };
  }));
  expect(stepGeometry.every((step) => step.mark >= 18 && step.radius === "50%")).toBe(true);

  // C2: the mixed-parts choice is one row (36px or less); its note is in the DOM and linked, and the
  // 「?」 shows it when focused.
  const mix = space.getByTestId("pre-analysis-mix");
  expect(await mix.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBeLessThanOrEqual(36);
  const radios = mix.getByRole("radiogroup", { name: "コードとメロディが混ざっていたら（全パート共通）" });
  await expect(radios).toHaveAttribute("aria-describedby", "pre-analysis-mix-note");
  const note = space.locator("#pre-analysis-mix-note");
  await expect(note).toHaveCount(1);
  await expect(note).toBeHidden();
  await mix.getByRole("button", { name: "混ざったパートの扱いの説明" }).focus();
  await expect(note).toBeVisible();

  // C3: the chosen role is a thin coloured border + coloured name on a light tint (alpha 0.25 or less).
  const chosen = parts(page).first().locator(".lv-pa-role[data-on]");
  const roleName = (await chosen.getAttribute("data-r"))!;
  const roleColours: Record<string, string> = {
    chord: "rgb(242, 184, 75)",
    bass: "rgb(183, 156, 255)",
    melody: "rgb(108, 199, 255)",
    off: "rgb(58, 74, 92)",
  };
  const roleLabels: Record<string, string> = { chord: "コード", bass: "ベース", melody: "メロディ", off: "使わない" };
  const painted = await chosen.evaluate((element) => {
    const style = getComputedStyle(element);
    const text = style.backgroundColor;
    // Chromium serialises a color-mix() as color(srgb r g b / a); plain colours come back as rgb()/rgba().
    const slash = /\/\s*([\d.]+)\s*\)/.exec(text);
    const rgba = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(text);
    const alpha = slash ? Number(slash[1]) : rgba ? Number(rgba[1]) : 1;
    return {
      alpha,
      border: style.borderTopColor,
      colour: style.color,
      width: style.borderTopWidth,
      text: element.textContent?.trim(),
    };
  });
  expect(painted.alpha).toBeLessThanOrEqual(0.25);
  expect(painted.border).toBe(roleColours[roleName]);
  expect(painted.width).toBe("1px");
  expect(painted.text).toBe(roleLabels[roleName]);
  const axe = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);

  // C6: 「詳しい設定」 sits immediately left of 「解析する」 (16px at most).
  const gap = await page.evaluate(() => {
    const advanced = [...document.querySelectorAll<HTMLElement>(".lv-pa-bottom button")]
      .find((button) => button.textContent?.includes("詳しい設定"))!;
    const analyze = document.querySelector<HTMLElement>("[data-testid='pre-analysis-analyze']")!;
    return Math.round(analyze.getBoundingClientRect().left - advanced.getBoundingClientRect().right);
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(16);
});

test("P23-31 photos: the pre-analysis screen at four sizes, and one row hovered", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [768, 640]] as const) {
    await page.setViewportSize({ width, height });
    await openWorkspace(page, 5);
    await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
      .map((animation) => animation.finished.catch(() => undefined))));
    await page.screenshot({ path: `p89-generated/p23-31/pre-analysis-${width}x${height}.png`, fullPage: true });
    if (width === 1440) {
      await parts(page).first().hover();
      await page.waitForTimeout(150);
      await page.screenshot({ path: "p89-generated/p23-31/pre-analysis-hover-1440x900.png", fullPage: true });
      await page.mouse.move(5, 5);
    }
  }
});

test("P23-31 C5: the 鳴っている音 line names the notes at the playhead, under the play row", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, 5);
  const line = workspace(page).getByTestId("pre-analysis-sounding");
  // Bar 1, beat 0: bass C2, pad E3, harmony C4 E4 G4, lead G5 — lowest first, six at most.
  await expect(line).toHaveText("鳴っている音 C2 ・ E3 ・ C4 ・ E4 ・ G4 ・ G5");
  const place = await page.evaluate(() => {
    const transport = document.querySelector<HTMLElement>(".lv-pa-transport")!.getBoundingClientRect();
    const sound = document.querySelector<HTMLElement>(".lv-pa-soundline")!.getBoundingClientRect();
    const overview = document.querySelector<HTMLElement>("[data-testid='pre-analysis-overview']")!.getBoundingClientRect();
    return {
      belowTransport: Math.round(sound.top - transport.bottom),
      aboveOverview: Math.round(overview.top - sound.bottom),
      left: Math.round(sound.left - transport.left),
    };
  });
  expect(place.belowTransport).toBeGreaterThanOrEqual(0);
  expect(place.belowTransport).toBeLessThanOrEqual(8);
  expect(place.aboveOverview).toBeGreaterThanOrEqual(0);
  expect(place.left).toBeLessThanOrEqual(4);
});

test("P23-31b C6: the pre-analysis never cuts a word at the four sizes", async ({ page }) => {
  test.setTimeout(240_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openWorkspace(page, 5);
    const measured = await page.evaluate(() => {
      const cut = (element: HTMLElement) => element.scrollWidth > element.clientWidth + 1;
      const buttons = [...document.querySelectorAll<HTMLElement>("[data-analysis-contribution-preset]")];
      const names = [...document.querySelectorAll<HTMLElement>(".lv-pa-pname")];
      const mix = document.querySelector<HTMLElement>(".lv-pa-mix")!;
      const mixRect = mix.getBoundingClientRect();
      const current = document.querySelector<HTMLElement>(".lv-pa-steps li[data-state='current']");
      return {
        buttons: buttons.map((button) => ({ text: button.textContent, cut: cut(button) })),
        names: names.map((name) => ({ text: name.textContent, cut: cut(name) })),
        mixHeight: Math.round(mix.getBoundingClientRect().height),
        mixRight: mixRect.right,
        mixScroll: mix.scrollWidth,
        mixClient: mix.clientWidth,
        buttonRights: buttons.map((button) => button.getBoundingClientRect().right),
        before: current ? getComputedStyle(current, "::before").display : "none",
      };
    });
    expect(measured.buttons.length).toBe(2);
    expect(measured.buttons.every((button) => !button.cut), `${size.width}: switch buttons ${JSON.stringify(measured.buttons)}`).toBe(true);
    expect(measured.names.length).toBe(5);
    expect(measured.names.every((name) => !name.cut), `${size.width}: part names ${JSON.stringify(measured.names)}`).toBe(true);
    expect(measured.mixHeight, `${size.width}: the mixed row`).toBeLessThanOrEqual(64);
    // P23-31b Z4: the switch stays inside the row with room at its right (the parent row used to cut it).
    if (size.width >= 1280) {
      for (const right of measured.buttonRights) expect(right, `${size.width}: inside the row (${right} <= ${measured.mixRight})`).toBeLessThanOrEqual(measured.mixRight - 10);
      expect(measured.mixScroll, `${size.width}: the row does not overflow`).toBeLessThanOrEqual(measured.mixClient);
    }
    if (size.width <= 1280) expect(measured.before, `${size.width}: no line before the current step`).toBe("none");
    await page.screenshot({ path: `p89-generated/p23-31b/pre-analysis-${size.width}x${size.height}.png`, fullPage: true });
    if (size.width === 1440 || size.width === 1280) {
      await page.screenshot({ path: `p89-generated/p23-31c/pre-analysis-${size.width}x${size.height}.png`, fullPage: true });
    }
  }
});
