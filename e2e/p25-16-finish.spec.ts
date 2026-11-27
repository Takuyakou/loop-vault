import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers/app";

/** P25-16 N: the finishing touches (the band's one row of shapes, the motion, the card hover, 「MIDI 未接続」, 「代わり」). */
const PROGRESSION = "[Aメロ]\n| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n[サビ]\n| Fmaj7 G7 | Em7 Am7 |\n| Dm7 G7 | Cmaj7 C7 |";
/** The band's height with the five shapes on two rows (stage 11, the same at every width). */
const STAGE_11_DOCK_HEIGHT = 255;

async function openText(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await openApp(page);
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: "テキスト" }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(PROGRESSION);
  return capture;
}
const chooseEm7 = (capture: ReturnType<Page["getByTestId"]>) => capture.getByTestId("text-preview-band").filter({ hasText: /^.*Em7/ }).first().click();

for (const [width, height] of [[1024, 768], [1280, 720], [1440, 900], [1920, 1080]] as const) {
  test(`N1: the five shapes keep one row with whole names at ${width}x${height}`, async ({ page }) => {
    const capture = await openText(page, width, height);
    await chooseEm7(capture);
    const dock = capture.getByTestId("text-card-dock");
    await expect(dock).toHaveAttribute("data-presence", "shown");
    const fit = await dock.evaluate((element) => {
      const shapes = [...element.querySelectorAll<HTMLElement>("[data-shape]")];
      return {
        count: shapes.length,
        tops: new Set(shapes.map((shape) => Math.round(shape.getBoundingClientRect().top))).size,
        whole: shapes.every((shape) => shape.scrollWidth <= shape.clientWidth
          && [...shape.querySelectorAll<HTMLElement>("[data-testid='text-dock-shape-name']")].every((name) => name.scrollWidth <= name.clientWidth)),
        inside: shapes.every((shape) => shape.getBoundingClientRect().right <= element.getBoundingClientRect().right),
        height: Math.round(element.getBoundingClientRect().height),
      };
    });
    expect(fit).toMatchObject({ count: 5, tops: 1, whole: true, inside: true });
    expect(fit.height).toBeLessThanOrEqual(STAGE_11_DOCK_HEIGHT);
    await expect(capture.locator("[data-shape='triad'] [data-testid='text-dock-shape-name']")).toHaveText("シェル+三和音");
  });
}

test("N2: the band's reset reads 「最初から」", async ({ page }) => {
  const capture = await openText(page, 1440, 900);
  await chooseEm7(capture);
  await capture.getByTestId("text-card-dock").getByRole("button", { name: "転回を上げる" }).click();
  await expect(capture.getByTestId("text-dock-reset")).toHaveText("最初から");
  await expect(capture.getByTestId("text-dock-reset")).toHaveAttribute("title", "このカードを最初の音(基本のおすすめ)に戻します");
});

test("N3: the band rises in and sinks out; with reduced motion it is there and gone at once", async ({ page }) => {
  // A machine-wide "reduce motion" would skip the rise; the first half needs the normal motion.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const capture = await openText(page, 1440, 900);
  // A MutationObserver sees the state changes even when the machine is too busy to give us every frame:
  // the band must be drawn hidden first (opacity 0), then shown — the frames in between are the CSS rise.
  const openStates = await page.evaluate(async () => {
    const states: { presence: string; opacity: number }[] = [];
    const observer = new MutationObserver(() => {
      const dock = document.querySelector<HTMLElement>("[data-testid='text-card-dock']");
      if (dock?.dataset.presence) states.push({ presence: dock.dataset.presence, opacity: Number(getComputedStyle(dock).opacity) });
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-presence"] });
    const band = [...document.querySelectorAll<HTMLElement>("[data-testid='text-preview-band']")].find((element) => (element.textContent ?? "").includes("Em7"))!;
    band.click();
    await new Promise((resolve) => setTimeout(resolve, 700));
    observer.disconnect();
    return states;
  });
  expect(openStates.some((state) => state.presence === "enter" && state.opacity < 0.5), "the band starts hidden").toBe(true);
  await expect.poll(() => capture.getByTestId("text-card-dock").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  expect(openStates.some((state) => state.presence === "shown")).toBe(true);
  const closeStates = await page.evaluate(async () => {
    const states: string[] = [];
    const observer = new MutationObserver(() => {
      const dock = document.querySelector<HTMLElement>("[data-testid='text-card-dock']");
      if (dock?.dataset.presence) states.push(dock.dataset.presence);
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-presence"] });
    document.querySelector<HTMLElement>("[data-testid='text-dock-close']")!.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    observer.disconnect();
    return states;
  });
  expect(closeStates, "the band stays while it leaves").toContain("exit");
  await expect(capture.getByTestId("text-card-dock")).toHaveCount(0);
  await expect(capture.getByTestId("text-card-dock-closed")).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseEm7(capture);
  await expect(capture.getByTestId("text-card-dock")).toHaveAttribute("data-presence", "shown");
  expect(await capture.getByTestId("text-card-dock").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await capture.getByTestId("text-dock-close").click();
  await expect(capture.getByTestId("text-card-dock")).toHaveCount(0);
});

async function openLoop(page: Page, query: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?${query}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
}

test("N3b: a chord card lifts 2px under the pointer; not with reduced motion", async ({ page }) => {
  await openLoop(page, "p527Status=p533-rules");
  const wrap = page.locator(".lv-vl-event-wrap").nth(2);
  await wrap.hover();
  await expect.poll(() => wrap.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(-2);
  await expect(wrap.getByTestId("voicing-loop-event-preview")).toHaveCSS("opacity", "1");
  await page.mouse.move(2, 2);
  await expect.poll(() => wrap.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await expect(wrap.getByTestId("voicing-loop-event-preview")).toHaveCSS("opacity", "0.55");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await wrap.hover();
  await expect(wrap.getByTestId("voicing-loop-event-preview")).toHaveCSS("opacity", "1");
  expect(await wrap.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
});

test("N4・N7: 「MIDI 未接続」 follows the key and bars; 「なめらかにつなぐ」 is inside 「形 ▼」", async ({ page }) => {
  await openLoop(page, "p527Status=p533-rules");
  const noMidi = page.getByTestId("voicing-loop-head").getByTestId("voicing-loop-play-along-no-midi");
  await expect(noMidi).toHaveText("・ MIDI 未接続");
  await expect(page.getByTestId("voicing-loop-transport")).not.toContainText("MIDI 未接続");
  await expect(page.getByTestId("voicing-loop-controls-row").getByText("なめらかにつなぐ", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await page.getByTestId("voicing-loop-shape-button").click();
  const menu = page.getByTestId("voicing-loop-shape-menu");
  await expect(menu.getByRole("switch", { name: "進行に合わせてなめらかにつなぐ", exact: true })).toBeVisible();
  await expect(menu).toContainText("進行全体で、上の音と内側の音がなるべく動かない押さえ方を選びます");
  await expect(menu).toContainText("カードに「代わり」が付きます");
  // P25 V8: the sentence ends there.
  await expect(menu.locator("p").last()).toHaveText("この形で作れないコードは近い形で鳴らし、カードに「代わり」が付きます。");
});

test("N6: a card played in a nearer shape reads 「代わり」 (「代」 on a narrow card)", async ({ page }) => {
  await openLoop(page, "p527Status=p11-generated-fallback");
  await page.getByRole("button", { name: "自動生成", exact: true }).click();
  await page.getByTestId("voicing-loop-shape-button").click();
  await page.getByTestId("voicing-loop-shape-menu").locator('[data-shape="triad"]').click();
  const marks = page.getByTestId("voicing-loop-auto-fallback");
  expect(await marks.count()).toBeGreaterThan(0);
  const words = await marks.evaluateAll((items) => items.map((item) => ({
    text: item.textContent, width: (item.closest("[data-testid='voicing-loop-event']") as HTMLElement).getBoundingClientRect().width,
  })));
  for (const { text, width } of words) expect(text).toBe(width < 132 ? "代" : "代わり");
  await expect(page.getByTestId("voicing-loop-event").filter({ has: marks.first() }).first()).toHaveAttribute("aria-label", /代わりの形で鳴らしています/);
});

/** P25 review 2: the band's left column keeps every word, and the notice wraps instead of being clipped. */
test("N9c: the band's rows fit 1024・1280・1440・1920 — no clipped part, no overlap, the notice fully shown", async ({ page }) => {
  for (const [width, height] of [[1024, 768], [1280, 720], [1440, 900], [1920, 1080]] as const) {
    const capture = await openText(page, width, height);
    await capture.getByTestId("text-progression-input").fill("| Cm7b5 |");
    await capture.getByTestId("text-preview-band").first().click();
    const dock = capture.getByTestId("text-card-dock");
    await expect(dock).toHaveAttribute("data-presence", "shown");
    await dock.locator('[data-shape="triad"]').click();
    await expect(dock.getByTestId("text-dock-notice")).toContainText("代わり:");
    const measured = await dock.evaluate((element) => {
      const left = element.querySelector<HTMLElement>("[data-testid='text-dock-left']")!;
      const right = element.querySelector<HTMLElement>("[data-testid='text-dock-right']")!;
      const leftBox = left.getBoundingClientRect();
      const rightBox = right.getBoundingClientRect();
      const clipped = [...left.querySelectorAll<HTMLElement>("span")]
        .filter((node) => node.textContent !== null && node.textContent.trim() !== "" && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
        .map((node) => `${node.textContent!.trim()}: ${node.scrollWidth} > ${node.clientWidth}`);
      const beyond = [...left.querySelectorAll<HTMLElement>("span")]
        .filter((node) => node.getBoundingClientRect().right > rightBox.left + 1)
        .map((node) => node.textContent!.trim());
      const notice = element.querySelector<HTMLElement>("[data-testid='text-dock-notice']")!;
      return {
        leftRight: leftBox.right, rightLeft: rightBox.left, clipped, beyond,
        noticeText: notice.textContent, noticeClient: notice.clientHeight, noticeScroll: notice.scrollHeight,
      };
    });
    expect(measured.leftRight, `${width}: the left column ends before the right column`).toBeLessThanOrEqual(measured.rightLeft + 1);
    expect(measured.clipped, `${width}: nothing in the left column is clipped`).toEqual([]);
    expect(measured.beyond, `${width}: nothing reaches into the right column`).toEqual([]);
    expect(measured.noticeScroll, `${width}: the notice is fully shown`).toBeLessThanOrEqual(measured.noticeClient + 1);
    // V15: the notice is one line, the long words in its title.
    expect(measured.noticeText).toBe("代わり:ルートレス + 広げる");
    await expect(dock.getByTestId("text-dock-notice")).toHaveAttribute("title", "Cm7♭5 は シェル+三和音 にできないので、ルートレス + 広げる で鳴らしています");
    await expect(dock.getByTestId("text-dock-legend")).toBeVisible();
  }
});

/** P25 review 3: a text card whose shape had to fall back carries 「代わり」, and 基本 takes it away. */
test("N9d: a text card's fallback reads 「代わり」, with the band's notice words; 基本 clears it", async ({ page }) => {
  const capture = await openText(page, 1440, 900);
  await capture.getByTestId("text-progression-input").fill("| Cm7b5 |");
  const card = capture.getByTestId("text-preview-band").first();
  await card.click();
  const dock = capture.getByTestId("text-card-dock");
  await expect(dock).toHaveAttribute("data-presence", "shown");
  const mark = card.getByTestId("text-preview-fallback");
  await expect(mark).toHaveCount(0);
  await dock.locator('[data-shape="triad"]').click();
  const cardWidth = (await card.boundingBox())!.width;
  await expect(mark).toHaveText(cardWidth < 132 ? "代" : "代わり");
  await expect(mark).toHaveAttribute("title", "Cm7♭5 は シェル+三和音 にできないので、ルートレス + 広げる で鳴らしています");
  await expect(mark).toHaveAttribute("aria-label", "Cm7♭5 は シェル+三和音 にできないので、ルートレス + 広げる で鳴らしています");
  await dock.locator('[data-shape="basic"]').click();
  await expect(mark).toHaveCount(0);
});
