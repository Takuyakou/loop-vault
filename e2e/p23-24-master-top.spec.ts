import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { emptyStore } from "../src/domain/chordDojo/store";
import { emptyMaster } from "../src/domain/master251/model";
import { openDojo } from "./helpers/p12";

/**
 * P23-24: the 2-5-1 Master top row (M1-M12) and the twelve keys' strip (K1'-K9', ANSWER: the strip shares the
 * identity row). The run, the judgement and the records are not touched.
 */
const PRACTICE_FILE = "loop-vault:chord-dojo-txt-jazz-v1:data";
const LEARNING_KEYS = [0, 10, 8, 6, 4, 2, 1, 11, 9, 7, 5, 3];

/** Opens the Master. `learned`: keys of Form A that are already learned (their position). */
async function openMaster(page: Page, options: { learned?: number[] } = {}) {
  if (options.learned) {
    const file = emptyStore();
    file.master251 = { ...emptyMaster() } as never;
    for (const key of options.learned) {
      const id = `A:${key}`;
      (file.master251 as unknown as { cells: Record<string, Record<string, unknown>> }).cells[id] = {
        ...(file.master251 as unknown as { cells: Record<string, Record<string, unknown>> }).cells[id],
        learnedAt: "2026-10-01T00:00:00.000Z",
        status: "passed",
      };
    }
    await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), { key: PRACTICE_FILE, value: JSON.stringify(file) });
  }
  await openDojo(page, "midi");
  await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
  await expect(page.getByTestId("master251")).toBeVisible();
}

const header = (page: Page) => page.locator(".master251-header");
const keys = (page: Page) => page.getByTestId("master251-key12");

test("C1/C4: the top row keeps its order, its 42px and its centred items", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaster(page);
  const root = page.getByTestId("master251");

  // M1: back, title, no SPECIAL.
  await expect(header(page).getByRole("heading", { name: "2-5-1 Master" })).toBeVisible();
  await expect(header(page)).not.toContainText("SPECIAL");

  // M2: three radios, 32px high (P23-60 §2: the switch is the guided stage's 32px frame), the learning one is on.
  const switchGroup = page.getByRole("radiogroup", { name: "Masterの練習" });
  await expect(switchGroup).toBeVisible();
  const radios = switchGroup.getByRole("radio");
  await expect(radios).toHaveCount(3);
  expect(await radios.evaluateAll((items) => items.map((item) => item.textContent))).toEqual(["学習", "復習", "Mixed Test"]);
  await expect(switchGroup.getByRole("radio", { name: "学習" })).toHaveAttribute("aria-checked", "true");
  const switchBox = await switchGroup.boundingBox();
  expect(Math.abs((switchBox?.height ?? 0) - 32)).toBeLessThanOrEqual(1);

  // M3: Form (learning). M6: the range select is to its right. M7: the description after it. M8: the progress.
  const form = page.getByLabel("MasterのForm", { exact: true });
  const range = page.getByLabel("Masterの音域", { exact: true });
  await expect(form).toBeVisible();
  await expect(range).toBeVisible();
  const x = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())?.x ?? 0;
  expect(await x(range)).toBeGreaterThan(await x(form));
  const description = header(page).locator(".master251-stage-description");
  await expect(description).toBeVisible();
  expect(await x(description)).toBeGreaterThan(await x(range));
  const progress = page.getByTestId("master251-form-progress");
  await expect(progress).toBeVisible();
  await expect(progress).toContainText("Form A");
  await expect(progress).toContainText("/ 12");
  const bar = progress.locator("i");
  const barBox = await bar.boundingBox();
  expect(Math.abs((barBox?.width ?? 0) - 90)).toBeLessThanOrEqual(1);
  expect(Math.abs((barBox?.height ?? 0) - 6)).toBeLessThanOrEqual(1);

  // M9: the tempo sentence is inside 48セル now, not in the top row.
  await expect(page.locator(".master251-stage")).not.toContainText("最終 80 BPM");
  await page.getByText("48セルの進み具合").click();
  await expect(page.locator(".master251-progress").locator("p").first()).toContainText("最終 80 BPM · 2拍 × 3コード + 2拍休み");

  // M10: 48セル comes before MIDI 設定.
  expect(await x(page.locator(".master251-records > summary"))).toBeLessThan(await x(page.locator(".master251-midi")));

  // C4/M11: 42px high and every item's centre within 1px at 1440.
  const measured = await header(page).evaluate((element) => {
    const rect = (selector: string) => {
      const target = element.querySelector(selector);
      if (!target) return null;
      const box = target.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, center: (box.top + box.bottom) / 2, x: box.x };
    };
    return {
      height: element.getBoundingClientRect().height,
      title: rect(".master251-title"),
      stage: rect(".master251-switch"),
      selects: [...element.querySelectorAll(".master251-stage select")].map((select) => {
        const box = select.getBoundingClientRect();
        return (box.top + box.bottom) / 2;
      }),
      description: rect(".master251-stage-description"),
      progress: rect(".master251-form-progress"),
      midi: rect(".master251-midi"),
      records: rect(".master251-records > summary"),
      back: rect("[data-testid=dojo-back]"),
    };
  });
  expect(measured.height).toBe(42);
  const centers = [
    ...measured.selects,
    measured.description!.center,
    measured.progress!.center,
    measured.midi!.center,
    measured.records!.center,
    measured.back!.center,
  ];
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);

  // M4/M5: review shows the scope, mixed shows the sentence; the progress is only for learning.
  await switchGroup.getByRole("radio", { name: "復習" }).click();
  await expect(page.getByLabel("復習のForm範囲")).toBeVisible();
  await expect(page.getByTestId("master251-form-progress")).toHaveCount(0);
  await switchGroup.getByRole("radio", { name: "Mixed Test" }).click();
  await expect(header(page)).toContainText("学習済みの範囲で確認");
  await expect(page.getByLabel("復習のForm範囲")).toHaveCount(0);

  // M12: narrow — the title, 48セル and MIDI 設定 on the first row, the stage under them (the 48セル panel closed).
  await page.getByText("48セルの進み具合").click();
  await page.setViewportSize({ width: 768, height: 640 });
  const narrow = await header(page).evaluate((element) => {
    const rect = (selector: string) => {
      const box = element.querySelector(selector)!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, x: box.x };
    };
    return { title: rect(".master251-title"), records: rect(".master251-records > summary"), midi: rect(".master251-midi"), stage: rect(".master251-stage") };
  });
  expect(Math.abs(narrow.title.top - narrow.records.top)).toBeLessThanOrEqual(3);
  expect(Math.abs(narrow.records.top - narrow.midi.top)).toBeLessThanOrEqual(3);
  expect(narrow.stage.top).toBeGreaterThan(narrow.title.bottom);
  await expect(root).toBeVisible();
});

test("C2: each switch changes the practice, the arrow keys move, and a reload keeps it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaster(page);
  const root = page.getByTestId("master251");
  const switchGroup = page.getByRole("radiogroup", { name: "Masterの練習" });

  await switchGroup.getByRole("radio", { name: "復習" }).click();
  await expect(root).toHaveAttribute("data-practice", "review");
  await expect(switchGroup.getByRole("radio", { name: "復習" })).toHaveAttribute("aria-checked", "true");

  await switchGroup.getByRole("radio", { name: "Mixed Test" }).click();
  await expect(root).toHaveAttribute("data-practice", "mixed");

  // Arrow keys move to the neighbour (right from mixed wraps to learning).
  await switchGroup.getByRole("radio", { name: "Mixed Test" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(root).toHaveAttribute("data-practice", "review");
  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("data-practice", "mixed");

  // It is saved: a reload keeps mixed.
  await page.reload();
  await page.locator('[data-nav="chord-dojo"]').click();
  await page.evaluate(async () => { await (window as typeof window & { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
  await page.getByRole("button", { name: "2-5-1 Master 続きから" }).click();
  await expect(page.getByTestId("master251")).toHaveAttribute("data-practice", "mixed");
});

test("C3: Form's progress shows the learning position and only in learning", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaster(page, { learned: [0, 10, 8] });
  const progress = page.getByTestId("master251-form-progress");
  await expect(progress).toContainText("3 / 12");
  const width = await progress.locator("i > b").evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(width - 22.5)).toBeLessThanOrEqual(2);

  await page.getByRole("radiogroup", { name: "Masterの練習" }).getByRole("radio", { name: "復習" }).click();
  await expect(page.getByTestId("master251-form-progress")).toHaveCount(0);
});

test("C5/C6/C7: the twelve keys are in learning order, one is current, and the keyboard never moves", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaster(page, { learned: [0, 10] });

  // C5/K2'/K3/K7: order, size, learned and current.
  const items = keys(page);
  await expect(items).toHaveCount(12);
  expect(await items.evaluateAll((list) => list.map((item) => Number(item.getAttribute("data-key"))))).toEqual(LEARNING_KEYS);
  const first = await items.first().boundingBox();
  expect(Math.abs((first?.width ?? 0) - 34)).toBeLessThanOrEqual(1);
  expect(Math.abs((first?.height ?? 0) - 20)).toBeLessThanOrEqual(1);
  const gap = await items.evaluateAll((list) => {
    const left = list[0]!.getBoundingClientRect();
    const right = list[1]!.getBoundingClientRect();
    return right.left - left.right;
  });
  expect(Math.abs(gap - 3)).toBeLessThanOrEqual(1);
  const learned = await items.evaluateAll((list) => list.filter((item) => item.hasAttribute("data-learned")).length);
  expect(learned).toBe(2);
  const current = await items.evaluateAll((list) => list.filter((item) => item.hasAttribute("data-current")).map((item) => item.getAttribute("data-key")));
  expect(current).toHaveLength(1);
  const root = page.getByTestId("master251");
  const cell = await root.getAttribute("data-cell");
  expect(current[0]).toBe(cell!.split(":")[1]);
  // K5: not buttons, with an aria-label each.
  expect(await items.first().evaluate((element) => element.tagName)).toBe("SPAN");
  await expect(items.first()).toHaveAttribute("aria-label", /学習済み|まだ|学習中/);
  // K1': the strip shares the identity's row.
  const rowBox = await page.locator(".master251-ident-row").boundingBox();
  expect(Math.abs((rowBox?.height ?? 0) - 20)).toBeLessThanOrEqual(1);

  // C6/K6: the strip carries the keys only (no chord name), in whatever stage the screen is in.
  const stripText = await page.getByTestId("master251-keys12").innerText();
  expect(stripText).not.toMatch(/[A-G](maj|min|m7|7|dim|aug)/);

  // C7: the keyboard's top does not move when the question changes, on pause and after resume.
  const keyboardTop = async () => Math.round((await page.locator(".master251-keyboard").boundingBox())!.y);
  const before = await keyboardTop();
  await page.keyboard.press("p");
  await expect(root).toHaveAttribute("data-phase", "paused");
  expect(Math.abs((await keyboardTop()) - before)).toBeLessThanOrEqual(1);
  await page.keyboard.press("p");
  await expect(root).not.toHaveAttribute("data-phase", "paused");
  expect(Math.abs((await keyboardTop()) - before)).toBeLessThanOrEqual(1);

  // K9': the keyboard is inside the window at both sizes.
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const box = await page.locator(".master251-keyboard").boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0), `${size.width}x${size.height}`).toBeLessThanOrEqual(size.height);
    const main = await page.locator("#main-content").evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(main).toBeLessThanOrEqual(1);
  }
});

test("C8: four widths, axe and the keys on the 2-5-1 screen", async ({ page }) => {
  test.setTimeout(120_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openMaster(page);
    const body = await page.locator("body").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(body.scroll, `${size.width}`).toBeLessThanOrEqual(body.client + 1);
    await page.screenshot({ path: `p89-generated/p23-24/master-learn-${size.width}x${size.height}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaster(page);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
  const axe = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);

  // P pauses and resumes, Space does the primary action (the keys the screen had).
  await page.keyboard.press("p");
  await expect(page.getByTestId("master251")).toHaveAttribute("data-phase", "paused");
  await page.keyboard.press("p");
  await expect(page.getByTestId("master251")).not.toHaveAttribute("data-phase", "paused");

  // Photos of the three practices at the four sizes.
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openMaster(page);
    for (const [name, kind] of [["learn", "学習"], ["review", "復習"], ["mixed", "Mixed Test"]] as const) {
      await page.getByRole("radiogroup", { name: "Masterの練習" }).getByRole("radio", { name: kind }).click();
      await page.screenshot({ path: `p89-generated/p23-24/master-${name}-${size.width}x${size.height}.png`, fullPage: true });
      await page.getByRole("radiogroup", { name: "Masterの練習" }).getByRole("radio", { name: "学習" }).click();
    }
  }
});

test("P23-31 C7: the title is never cut, and the stage description gives way first", async ({ page }) => {
  test.setTimeout(180_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 768, height: 640 }]) {
    await page.setViewportSize(size);
    await openMaster(page);
    await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
      .map((animation) => animation.finished.catch(() => undefined))));
    const measured = await page.evaluate(() => {
      const title = document.querySelector<HTMLElement>(".master251-title")!;
      const heading = title.querySelector("h1")!;
      const description = document.querySelector<HTMLElement>(".master251-stage-description");
      return {
        titleScroll: title.scrollWidth,
        titleClient: title.clientWidth,
        headingScroll: heading.scrollWidth,
        headingClient: heading.clientWidth,
        text: title.textContent,
        description: description ? {
          scroll: description.scrollWidth,
          client: description.clientWidth,
          title: description.getAttribute("title"),
        } : null,
      };
    });
    console.log("P2331-C7", size.width, size.height, JSON.stringify(measured));
    expect(measured.text, `${size.width}`).toContain("2-5-1 Master");
    expect(measured.titleScroll, `${size.width}: the title is not cut`).toBeLessThanOrEqual(measured.titleClient);
    expect(measured.headingScroll, `${size.width}: the name is not cut`).toBeLessThanOrEqual(measured.headingClient);
    // When the description does not fit, it is the one that is shortened (and keeps its full text in the title).
    if (measured.description && measured.description.scroll > measured.description.client) {
      expect(measured.description.title).toBeTruthy();
    }
    await page.screenshot({ path: `p89-generated/p23-31/master-title-${size.width}x${size.height}.png` });
  }
});

test("P23-31b C7: the Master top row never overlaps at the five sizes", async ({ page }) => {
  test.setTimeout(300_000);
  const cases = [
    { width: 768, height: 640, sidebar: undefined },
    { width: 1024, height: 768, sidebar: true },
    { width: 1024, height: 768, sidebar: false },
    { width: 1280, height: 720, sidebar: undefined },
    { width: 1366, height: 768, sidebar: undefined },
    { width: 1440, height: 900, sidebar: undefined },
  ] as const;
  for (const size of cases) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openMaster(page);
    if (size.sidebar !== undefined) {
      const want = size.sidebar ? "expanded" : "collapsed";
      const now = await page.locator("[data-sidebar]").getAttribute("data-sidebar");
      if (now !== want) await page.locator("[data-sidebar-toggle]").click();
      await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", want);
      await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
    }
    await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
      .map((animation) => animation.finished.catch(() => undefined))));
    const measured = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".master251-header")!;
      const headerBox = header.getBoundingClientRect();
      const selectors = ["[data-testid=dojo-back]", ".master251-title", ".master251-switch", ".master251-stage select",
        ".master251-stage-description", ".master251-form-progress", ".master251-records > summary", ".master251-midi"];
      const boxes = selectors.map((selector) => {
        const element = header.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || element.getClientRects().length === 0) return null;
        const rect = element.getBoundingClientRect();
        return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }).filter(Boolean) as Array<{ selector: string; left: number; right: number; top: number; bottom: number }>;
      const overlaps: string[] = [];
      for (let index = 0; index < boxes.length; index += 1) {
        for (let other = index + 1; other < boxes.length; other += 1) {
          const a = boxes[index]!;
          const b = boxes[other]!;
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
            const contains = (outer: typeof a, inner: typeof b) => outer.left <= inner.left && outer.right >= inner.right && outer.top <= inner.top && outer.bottom >= inner.bottom;
            if (!contains(a, b) && !contains(b, a)) overlaps.push(`${a.selector} / ${b.selector}`);
          }
        }
      }
      return {
        height: Math.round(headerBox.height),
        inside: boxes.every((box) => box.left >= headerBox.left - 1 && box.right <= headerBox.right + 1 && box.top >= headerBox.top - 1 && box.bottom <= headerBox.bottom + 1),
        overlaps,
        visible: boxes.map((box) => box.selector),
      };
    });
    expect(measured.overlaps, `${size.width}x${size.height}: no overlap ${JSON.stringify(measured.visible)}`).toEqual([]);
    expect(measured.inside, `${size.width}x${size.height}: inside the row`).toBe(true);
    if (size.width === 1280 || size.width === 1366) expect(measured.height, `${size.width}: one row (44 or less)`).toBeLessThanOrEqual(44);
    if (size.width === 1440) expect(measured.height).toBe(42);
    await page.screenshot({ path: `p89-generated/p23-31b/master-${size.width}x${size.height}-${size.sidebar === undefined ? "auto" : size.sidebar ? "open" : "closed"}.png` });
  }
});
