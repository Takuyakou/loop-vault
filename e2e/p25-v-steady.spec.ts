import { expect, test, type Page } from "@playwright/test";

/**
 * P25 V6・V7・V10 (V0): a switch in Voicing Loop moves nothing else. Before and after each switch the parts below keep
 * their `getBoundingClientRect` (差 0.5px 未満). Each switch prints one line `V… <switch> @<w>x<h>: max drift …px`.
 */
type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
type Boxes = Record<string, Box>;

const V6_PARTS = {
  "今のコード": "[data-testid='voicing-loop-current-panel']",
  "次": "[data-testid='voicing-loop-next-panel']",
  "進行": "[data-testid='voicing-loop-timeline']",
  "鍵盤": "[data-testid='voicing-loop-detail']",
  "下の帯": "[data-testid='voicing-loop-transport']",
};

async function openLoop(page: Page, width: number, height: number, query = "p527Status=p533-rules", midi = false) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width, height });
  await page.goto(`/?${query}${midi ? "&p12=midi" : ""}`);
  await page.evaluate(() => { localStorage.removeItem("loop-vault:voicing-loop-shape:v1"); localStorage.removeItem("lv-voicing-loop-play-along"); });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  if (midi) await page.evaluate(async () => { await (window as unknown as { __p12Midi: { connect: () => Promise<void> } }).__p12Midi.connect(); });
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
  await settle(page);
}

/** Past every motion (the longest is 260ms) and two frames. */
const settle = (page: Page) => page.waitForTimeout(400);

function measure(page: Page, parts: Record<string, string>): Promise<Boxes> {
  return page.evaluate((entries) => Object.fromEntries(entries.flatMap(([name, selector]) =>
    [...document.querySelectorAll(selector)].map((node, index, all) => {
      const rect = node.getBoundingClientRect();
      return [all.length > 1 ? `${name}${index + 1}` : name, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }];
    }))), Object.entries(parts));
}

function drift(before: Boxes, after: Boxes, keys: readonly (keyof Box)[]): { readonly max: number; readonly worst: string } {
  let max = 0;
  let worst = "-";
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[name];
    const b = after[name];
    if (!a || !b) return { max: Number.POSITIVE_INFINITY, worst: `${name} ${a ? "gone" : "came"}` };
    for (const key of keys) {
      const value = Math.abs(a[key] - b[key]);
      if (value > max) { max = value; worst = `${name}.${key} ${a[key].toFixed(1)}→${b[key].toFixed(1)}`; }
    }
  }
  return { max, worst };
}

async function steady(page: Page, label: string, parts: Record<string, string>, keys: readonly (keyof Box)[], change: () => Promise<void>) {
  const before = await measure(page, parts);
  await change();
  await settle(page);
  const after = await measure(page, parts);
  const result = drift(before, after, keys);
  console.log(`${label} @${page.viewportSize()!.width}x${page.viewportSize()!.height}: max drift ${result.max.toFixed(2)}px (${result.worst})`);
  expect(result.max, `${label}: ${result.worst}`).toBeLessThan(0.5);
}

/** A click as the user's: no scrolling first (Playwright would scroll a low window's workspace to reach a part). */
const press = (target: ReturnType<Page["locator"]>) => target.evaluate((node) => (node as HTMLElement).click());

const shapeMenu = (page: Page) => page.getByTestId("voicing-loop-shape-menu");
async function openShapeMenu(page: Page) {
  if (await page.getByTestId("voicing-loop-shape-button").getAttribute("aria-expanded") !== "true") {
    await press(page.getByTestId("voicing-loop-shape-button"));
  }
  await expect(shapeMenu(page)).toHaveAttribute("data-presence", "shown");
  await settle(page);
}

for (const [width, height] of [[1440, 900], [1024, 768]] as const) {
  test(`V6: the sources, the shapes and their parts move nothing at ${width}x${height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await openLoop(page, width, height);
    const source = (name: string) => page.getByTestId("voicing-loop-source-group").getByRole("button", { name, exact: true });
    for (const name of ["元MIDI", "カスタム", "自動生成", "元MIDI", "自動生成"]) {
      await steady(page, `V6 出どころ → ${name}`, V6_PARTS, ["top", "height"], () => press(source(name)));
    }
    for (const shape of ["shell", "rootless", "triad", "quartal", "basic", "shell"]) {
      await steady(page, `V6 形 → ${shape}`, V6_PARTS, ["top", "height"], async () => {
        await openShapeMenu(page);
        await press(shapeMenu(page).locator(`[data-shape="${shape}"]`));
      });
    }
    // V14 (N3 の 3): 運指 ON/OFF fades only the finger words; the columns and the keyboard stay.
    const fingering = page.getByRole("switch", { name: "おすすめ運指を表示", exact: true });
    for (const label of ["運指 OFF", "運指 ON"]) await steady(page, `V6 ${label}`, V6_PARTS, ["top", "height"], () => press(fingering));
    // Inside the open menu: the parts, ②'s order and なめらかにつなぐ. The menu stays open and where it is.
    await openShapeMenu(page);
    const menuParts = { ...V6_PARTS, "形 ▼": "[data-testid='voicing-loop-shape-menu']" };
    const toggles: [string, () => Promise<void>][] = [
      ["テンション ON", () => press(shapeMenu(page).getByTestId("voicing-loop-shape-tension"))],
      ["広げる ON", () => press(shapeMenu(page).getByTestId("voicing-loop-shape-spread"))],
      ["テンション OFF", () => press(shapeMenu(page).getByTestId("voicing-loop-shape-tension"))],
      ["広げる OFF", () => press(shapeMenu(page).getByTestId("voicing-loop-shape-spread"))],
      ["なめらかにつなぐ OFF", () => press(shapeMenu(page).getByRole("switch", { name: "進行に合わせてなめらかにつなぐ" }))],
      ["なめらかにつなぐ ON", () => press(shapeMenu(page).getByRole("switch", { name: "進行に合わせてなめらかにつなぐ" }))],
    ];
    for (const [label, change] of toggles) {
      await steady(page, `V6 ${label}`, menuParts, ["left", "top"], change);
      await expect(shapeMenu(page)).toHaveAttribute("data-presence", "shown");
    }
    await press(shapeMenu(page).locator('[data-shape="rootless"]'));
    await openShapeMenu(page);
    for (const order of ["A", "B", "auto"]) {
      await steady(page, `V6 ルートレスの並び → ${order}`, menuParts, ["left", "top"],
        () => press(shapeMenu(page).getByRole("group", { name: "ルートレスの並び" }).locator(`[data-order="${order}"]`)));
      await expect(shapeMenu(page)).toHaveAttribute("data-presence", "shown");
    }
  });

  test(`V6: 保存した音 ⇄ 元MIDI ⇄ 自動生成 move nothing at ${width}x${height}`, async ({ page }) => {
    await openLoop(page, width, height, "p527Status=p11-saved");
    const source = (name: string) => page.getByTestId("voicing-loop-source-group").getByRole("button", { name, exact: true });
    for (const name of ["元MIDI", "保存した音", "自動生成", "保存した音"]) {
      await steady(page, `V6 出どころ → ${name}`, V6_PARTS, ["top", "height"], () => press(source(name)));
    }
  });

  test(`V7: 覚える ⇄ 思い出す keeps the hands' place, the keyboard, the progression and the band at ${width}x${height}`, async ({ page }) => {
    await openLoop(page, width, height);
    const learn = page.getByRole("button", { name: "覚える（Voicing表示）" });
    const recall = page.getByRole("button", { name: "思い出す（コード名のみ）" });
    const parts = { ...V6_PARTS, "左右の欄": "[data-testid='voicing-loop-current-hands']" };
    for (let round = 0; round < 2; round += 1) {
      await steady(page, "V7 覚える → 思い出す", parts, ["top", "height"], () => press(recall));
      await expect(page.getByTestId("voicing-loop-current-voicing")).toHaveCount(0);
      await expect(page.getByTestId("voicing-loop-current-recall")).toContainText("思い出して弾く");
      await steady(page, "V7 思い出す → 覚える", parts, ["top", "height"], () => press(learn));
      await expect(page.getByTestId("voicing-loop-current-voicing")).toBeVisible();
    }
  });
}

for (const [width, height] of [[768, 640], [1024, 768], [1440, 900]] as const) {
  test(`V10: 弾き合わせ ON/OFF moves no word of the progress row, no key and no card at ${width}x${height}`, async ({ page }) => {
    await openLoop(page, width, height, "p527Status=p533-rules", true);
    const toggle = page.getByRole("switch", { name: "弾き合わせ", exact: true });
    const parts = {
      "進行の行": ".lv-vl-timeline-head > *, [data-testid='voicing-loop-status'] > *",
      "凡例": "[data-testid='voicing-loop-keyboard-legend'] > *",
      "試聴": ".lv-vl-legend-row > button",
      "鍵盤": "[data-testid='voicing-loop-detail'] [data-keyboard-event-index]",
      "カード": "[data-testid='voicing-loop-event']",
    };
    for (let round = 0; round < 2; round += 1) {
      await steady(page, "V10 弾き合わせ ON", parts, ["left", "top", "width", "height"], () => press(toggle));
      await expect(page.getByTestId("voicing-loop-play-along-judge")).toBeVisible();
      await expect(page.getByTestId("voicing-loop-play-along-count")).toBeVisible();
      await steady(page, "V10 弾き合わせ OFF", parts, ["left", "top", "width", "height"], () => press(toggle));
      await expect(page.getByTestId("voicing-loop-play-along-judge")).toBeHidden();
      await expect(page.getByTestId("voicing-loop-play-along-count")).toBeHidden();
    }
  });
}
