import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/**
 * P25 V14 (the text band and 「鍵盤で入れる」 rise with the faces shrinking), V15 (one-line notice, five shapes inside),
 * V16 (three rows), V17 (「最初から」 beside ↶), V18 (MIDI swaps the right side in place), V20 (「鍵盤で入れる」).
 * V0: switching, coming and going move nothing else — measured with `getBoundingClientRect`.
 */
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |";
type Midi = { connect: () => Promise<void>; emit: (notes: number[], on?: boolean) => void };

async function openText(page: Page, width: number, height: number, query = "") {
  await page.setViewportSize({ width, height });
  if (query === "") await openApp(page);
  else { await page.goto(`/${query}`); await page.evaluate(() => document.fonts.ready); }
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(PROGRESSION);
  return capture;
}
const chooseEm7 = (capture: ReturnType<Page["getByTestId"]>) => capture.getByTestId("text-preview-band").filter({ hasText: /^.*Em7/ }).first().click();

/** Every rise, fade and row has finished (CSS transitions are in `getAnimations`). */
async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

/** top / height (and left / width) of each part, rounded to 0.1px. */
async function boxes(page: Page, selectors: Record<string, string>) {
  await settled(page);
  return page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, selector]) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return [name, box ? [box.top, box.height, box.left, box.width].map((value) => Math.round(value * 10) / 10) : null];
  })), selectors);
}
function expectSame(before: Record<string, unknown>, after: Record<string, unknown>, what: string) {
  for (const name of Object.keys(before)) {
    const a = before[name] as number[] | null; const b = after[name] as number[] | null;
    expect(a, `${what}: ${name} is there`).not.toBeNull();
    a!.forEach((value, index) => expect(Math.abs(value - b![index]!), `${what}: ${name} [top,height,left,width][${index}] ${value} → ${b![index]}`).toBeLessThan(0.5));
  }
}

for (const [width, height] of [[1024, 768], [1280, 720], [1440, 900], [1470, 919], [1920, 1080]] as const) {
  test(`V15: at ${width} the five shapes are inside the band, the notice is one line, and the band keeps its height across shapes`, async ({ page }) => {
    const capture = await openText(page, width, height);
    await capture.getByTestId("text-progression-input").fill("| Cm7b5 | Em7 |");
    await capture.getByTestId("text-preview-band").first().click();
    const dock = capture.getByTestId("text-card-dock");
    await expect(dock).toHaveAttribute("data-presence", "shown");
    const heights = new Set<number>();
    for (const shape of ["basic", "shell", "rootless", "triad", "quartal"]) {
      await dock.locator(`[data-shape="${shape}"]`).click();
      await expect(dock.locator(`[data-shape="${shape}"]`)).toHaveAttribute("aria-pressed", "true");
      const fit = await dock.evaluate((element) => {
        const band = element.getBoundingClientRect();
        const shapes = [...element.querySelectorAll<HTMLElement>("[data-shape]")];
        const notice = element.querySelector<HTMLElement>("[data-testid='text-dock-notice']");
        return {
          height: Math.round(band.height * 10) / 10,
          inside: shapes.every((item) => item.getBoundingClientRect().right <= band.right - 15 && item.getBoundingClientRect().left >= band.left),
          whole: shapes.every((item) => item.scrollWidth <= item.clientWidth
            && [...item.querySelectorAll<HTMLElement>("[data-testid='text-dock-shape-name']")].every((name) => name.scrollWidth <= name.clientWidth)),
          noticeLines: notice ? Math.round(notice.getBoundingClientRect().height / 15) : 1,
          noticeWhole: notice ? notice.scrollWidth <= notice.clientWidth : true,
        };
      });
      expect(fit, `${width} ${shape}`).toMatchObject({ inside: true, whole: true, noticeLines: 1, noticeWhole: true });
      heights.add(fit.height);
    }
    expect([...heights], `${width}: one band height for every shape`).toHaveLength(1);
    await dock.locator('[data-shape="triad"]').click();
    await expect(dock.getByTestId("text-dock-notice")).toHaveText("代わり:ルートレス + 広げる");
    await expect(dock.getByTestId("text-dock-notice")).toHaveAttribute("title", "Cm7♭5 は シェル+三和音 にできないので、ルートレス + 広げる で鳴らしています");
  });
}

test("V16・V17: the three rows' buttons start on one line; 「最初から」 sits right of ↶ and is off until something changed", async ({ page }) => {
  const capture = await openText(page, 1440, 900);
  await chooseEm7(capture);
  const dock = capture.getByTestId("text-card-dock");
  await expect(dock).toHaveAttribute("data-presence", "shown");
  const lefts = await dock.evaluate((element) => [...element.querySelectorAll<HTMLElement>(".lv-dock-face > [role='group']")]
    .map((group) => Math.round((group.firstElementChild as HTMLElement).getBoundingClientRect().left)));
  expect(new Set(lefts).size, `the rows start at ${lefts.join(", ")}`).toBe(1);
  const undo = (await dock.getByRole("button", { name: "元に戻す" }).boundingBox())!;
  const reset = (await dock.getByTestId("text-dock-reset").boundingBox())!;
  expect(reset.x).toBeGreaterThan(undo.x + undo.width);
  expect(reset.x - (undo.x + undo.width)).toBeLessThanOrEqual(8);
  await expect(dock.getByTestId("text-dock-reset")).toBeDisabled();
  await dock.getByRole("button", { name: "転回を上げる" }).click();
  await expect(dock.getByTestId("text-dock-reset")).toBeEnabled();
  await expect(dock.getByTestId("text-dock-approach")).toHaveText("前のコードに近づけるS");
});

for (const [width, height] of [[1024, 768], [1440, 900]] as const) {
  test(`V18: at ${width}, 「MIDI 鍵盤で弾いて入れる」 swaps the right side in place — nothing else moves`, async ({ page }) => {
    const capture = await openText(page, width, height);
    await chooseEm7(capture);
    const dock = capture.getByTestId("text-card-dock");
    await expect(dock).toHaveAttribute("data-presence", "shown");
    const parts = {
      band: "[data-testid='text-card-dock']", keyboard: "[data-testid='text-dock-keyboard']", right: "[data-testid='text-dock-right']",
      under: "[data-testid='text-dock-under']", preview: "[data-testid='standard-text-preview']", editor: "[data-testid='text-intake-editor']",
      play: "[data-testid='text-dock-play']", status: ".lv-text-status-bar",
    };
    const before = await boxes(page, parts);
    await dock.getByTestId("text-dock-midi").click();
    await expect(dock.getByTestId("text-dock-midi-face")).not.toHaveAttribute("data-off", /.*/);
    await page.waitForTimeout(300);
    await expect(dock.getByTestId("text-dock-midi-face")).toContainText("MIDI 未接続");
    await expect(dock.getByTestId("text-dock-connect")).toBeVisible();
    const on = await boxes(page, parts);
    expectSame(before, on, "MIDI on");
    await page.keyboard.press("Escape");
    await expect(dock.getByTestId("text-dock-midi")).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(300);
    expectSame(before, await boxes(page, parts), "MIDI off");
    console.log(`V18 ${width}: ${JSON.stringify({ before, on })}`);
  });
}

/** Per frame for `ms` after `start` runs: the height of each selector (0 when missing). */
async function framesAfter(page: Page, start: string, selectors: readonly string[], ms: number) {
  await settled(page);
  return page.evaluate(async ({ start: script, selectors: list, ms: wait }) => {
    const frames: number[][] = [];
    const read = () => list.map((selector) => Math.round((document.querySelector(selector)?.getBoundingClientRect().height ?? 0) * 10) / 10);
    frames.push(read());
    const node = document.querySelector<HTMLElement>(script)!;
    node.click();
    const end = performance.now() + wait;
    await new Promise<void>((resolve) => {
      const tick = () => { frames.push(read()); if (performance.now() < end) requestAnimationFrame(tick); else resolve(); };
      queueMicrotask(tick);
    });
    return frames;
  }, { start, selectors, ms });
}

test("V14: the band's row grows while the faces above shrink, at the same time (open 220ms, close 140ms)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const capture = await openText(page, 1440, 900);
  const grid = ".lv-text-intake-grid"; const slot = "[data-testid='text-card-dock-slot']"; const closed = "[data-testid='text-card-dock-closed']";
  await expect(capture.getByTestId("text-card-dock-closed")).toBeVisible();
  await page.evaluate(() => { document.querySelectorAll<HTMLElement>("[data-testid='text-preview-band']")[2]!.dataset.v14 = "em7"; });
  const open = await framesAfter(page, "[data-v14='em7']", [grid, slot, closed], 500);
  const first = open[0]!; const last = open[open.length - 1]!;
  // The face does not jump: right after the click the grid is where it was, and grid + band stay one sum.
  expect(Math.abs(open[1]![0]! - first[0]!), "no instant shrink").toBeLessThan(2);
  const sums = open.map(([g, s, c]) => g! + s! + c!);
  expect(Math.max(...sums) - Math.min(...sums), "the grid and the band move together").toBeLessThan(1.5);
  const between = open.filter(([g]) => g! < first[0]! - 2 && g! > last[0]! + 2);
  expect(between.length, `frames in between: ${open.map(([g]) => g).join(",")}`).toBeGreaterThanOrEqual(2);
  console.log(`V14 open grid heights: ${open.map(([g]) => g).join(",")}`);
  const close = await framesAfter(page, "[data-testid='text-dock-close']", [grid, slot, closed], 400);
  const cFirst = close[0]!; const cLast = close[close.length - 1]!;
  expect(Math.abs(cLast[0]! - first[0]!), "closed again: the grid is back where it was").toBeLessThan(1);
  expect(close.filter(([g]) => g! > cFirst[0]! + 2 && g! < cLast[0]! - 2).length, `closing frames: ${close.map(([g]) => g).join(",")}`).toBeGreaterThanOrEqual(1);
  console.log(`V14 close grid heights: ${close.map(([g]) => g).join(",")}`);
});

test("V14・V20: 「鍵盤で入れる」 rises while the input above shrinks, and its × closes it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const capture = await openText(page, 1440, 900);
  const editor = "[data-testid='text-intake-editor']"; const slot = "[data-testid='keyboard-entry-slot']";
  const open = await framesAfter(page, "[data-testid='text-keyboard-toggle']", [editor, slot], 500);
  const first = open[0]!; const last = open[open.length - 1]!;
  expect(last[1]!, "the band is there").toBeGreaterThan(150);
  expect(Math.abs(open[1]![0]! - first[0]!), "no instant shrink").toBeLessThan(2);
  expect(open.filter(([e]) => e! < first[0]! - 2 && e! > last[0]! + 2).length, `editor heights: ${open.map(([e]) => e).join(",")}`).toBeGreaterThanOrEqual(2);
  console.log(`V20 open editor heights: ${open.map(([e]) => e).join(",")}`);
  // The band sits under the input.
  const band = (await capture.getByTestId("keyboard-entry-band").boundingBox())!;
  const input = (await capture.getByTestId("text-intake-editor").boundingBox())!;
  expect(band.y).toBeGreaterThanOrEqual(input.y + input.height - 1);
  const close = await framesAfter(page, "[data-testid='keyboard-close']", [editor, slot], 400);
  expect(close.filter(([e]) => e! > last[0]! + 2 && e! < first[0]! - 2).length, `closing: ${close.map(([e]) => e).join(",")}`).toBeGreaterThanOrEqual(1);
  await expect(capture.getByTestId("keyboard-entry-band")).toHaveCount(0);
  await expect(capture.getByTestId("text-keyboard-toggle")).toHaveAttribute("aria-pressed", "false");
});

test("V20: the held keys sink and light with their names, the chord is named, ‹ › mark notes outside, R adds %; nothing moves while holding", async ({ page }) => {
  const capture = await openText(page, 1440, 900, "?p12=midi");
  await capture.getByTestId("text-progression-input").fill("");
  await capture.getByTestId("text-keyboard-toggle").click();
  await page.evaluate(async () => { await (window as unknown as { __p12Midi: Midi }).__p12Midi.connect(); });
  const band = capture.getByTestId("keyboard-entry-band");
  await expect(band.getByTestId("keyboard-device")).toBeVisible();
  await expect(band).toContainText("· 押さえて離すと、最後に足されます");
  await expect(band.getByTestId("keyboard-held-name")).toHaveText("—");
  await expect(band.getByTestId("keyboard-repeat")).toBeDisabled();
  const keysWidth = (await band.getByTestId("keyboard-keys").boundingBox())!.width;
  expect(keysWidth).toBeGreaterThanOrEqual(360);
  expect(keysWidth).toBeLessThanOrEqual(400);
  const parts = { band: "[data-testid='keyboard-entry-band']", keys: "[data-testid='keyboard-keys']", chord: "[data-testid='keyboard-held-chord']", editor: "[data-testid='text-intake-editor']" };
  const before = await boxes(page, parts);
  const emit = (notes: number[], on = true) => page.evaluate(([values, down]) => (window as unknown as { __p12Midi: Midi }).__p12Midi.emit(values as number[], down as boolean), [notes, on] as const);
  await emit([60, 64, 67, 70]);
  await expect(band.getByTestId("keyboard-held-name")).toHaveText("C7");
  await expect(band.getByTestId("keyboard-held-notes")).toHaveText("C4 · E4 · G4 · A♯4");
  const held = await band.getByTestId("keyboard-keys").evaluate((element) => [...element.querySelectorAll<HTMLElement>("[data-held]")].map((key) => ({
    midi: Number(key.dataset.midi), top: getComputedStyle(key).top, background: getComputedStyle(key).backgroundColor, name: key.textContent,
  })));
  expect(held).toEqual([
    { midi: 60, top: "3px", background: "rgb(94, 234, 212)", name: "C4" }, { midi: 64, top: "3px", background: "rgb(94, 234, 212)", name: "E4" },
    { midi: 67, top: "3px", background: "rgb(94, 234, 212)", name: "G4" }, { midi: 70, top: "2px", background: "rgb(94, 234, 212)", name: "A♯4" },
  ]);
  expectSame(before, await boxes(page, parts), "holding C7");
  await emit([60, 64, 67, 70], false);
  await expect(capture.getByTestId("text-progression-input")).toHaveValue("| C7 |");
  await expect(band.getByTestId("keyboard-held-name")).toHaveText("—");
  expectSame(before, await boxes(page, parts), "released");
  await emit([36, 90]);
  await expect(band.getByTestId("keyboard-out-low")).toBeVisible();
  await expect(band.getByTestId("keyboard-out-high")).toBeVisible();
  await emit([36, 90], false);
  await expect(band.getByTestId("keyboard-repeat")).toBeEnabled();
  await page.keyboard.press("r");
  await expect(capture.getByTestId("text-progression-input")).toHaveValue("| C7 | % |");
});
