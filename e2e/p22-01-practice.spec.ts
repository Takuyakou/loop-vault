import { expect, test, type Page } from "@playwright/test";
import { openDojo, type MidiControl } from "./helpers/p12";

/**
 * P22-01 §4 (step E): the five practice screens share one frame. Rows, top to bottom (in the DOM and on the screen):
 * conditions → cards → result → guide → actions; a usual result never moves the cards or the buttons; a long one is
 * shown whole; the 「?」 opens and closes the explanation that used to be always on.
 */
const connect = (page: Page) => page.evaluate(async () => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.connect());
const settle = (page: Page) => page.evaluate(async () => { await document.fonts.ready; await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); });
async function list(page: Page) {
  await openDojo(page, "midi");
  await page.getByRole("button", { name: "定番の進行", exact: true }).click();
  await expect(page.locator(".dojo-builtin-page")).toBeVisible();
}
const builtin = (page: Page, name: string) => page.locator(".dojo-builtin-card").filter({ has: page.getByRole("heading", { name, exact: true }) }).getByRole("button", { name: / を練習する$/ });

const SCREENS: Record<string, (page: Page) => Promise<void>> = {
  async "定番の進行"(page) { await list(page); await builtin(page, "王道進行").click(); await expect(page.locator("[data-dojo-screen=practice]")).toBeVisible(); await connect(page); },
  async "ランダムキー"(page) { await list(page); await page.getByTestId("dojo-random-toggle").click(); await builtin(page, "王道進行").click(); await expect(page.getByTestId("dojo-endless")).toBeVisible(); await connect(page); await expect(page.getByTestId("dojo-endless")).toHaveAttribute("data-endless-phase", "active", { timeout: 10000 }); },
  async "Original Practice"(page) { await list(page); await page.locator(".dojo-original-card[data-original=op-traditional-passing]").getByRole("button", { name: / を練習する$/ }).click(); await expect(page.getByTestId("dojo-original")).toBeVisible(); await connect(page); },
  async "Jazz Progressions"(page) { await list(page); await page.locator("[data-jazz-item=jazz-progressions-001]").getByTestId("jazz-open").click(); await expect(page.getByTestId("dojo-jazz")).toBeVisible(); await connect(page); },
  async "ボイシングドリル"(page) { await openDojo(page, "midi"); await page.getByRole("button", { name: "ボイシングドリル", exact: true }).click(); await page.getByTestId("drill-open-cycle-a").click(); await expect(page.getByTestId("dojo-drill")).toBeVisible(); },
};
const ROWS = ["[data-testid=practice-conditions]", ".dojo-endless-cards", "[data-testid=practice-result]", "[data-testid=practice-guide]", "[data-testid=practice-actions]"];

for (const [name, open] of Object.entries(SCREENS)) {
  test(`${name}: the rows are conditions → cards → result → guide → actions, in the DOM and on the screen`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await settle(page);
    const rows = await page.evaluate((selectors) => {
      const els = selectors.map((s) => document.querySelector(s));
      return {
        found: els.map((e) => Boolean(e)),
        domOrder: els.every((e, i) => i === 0 || Boolean(els[i - 1]!.compareDocumentPosition(e!) & Node.DOCUMENT_POSITION_FOLLOWING)),
        tops: els.map((e) => e ? Math.round(e.getBoundingClientRect().top) : -1),
        bottoms: els.map((e) => e ? Math.round(e.getBoundingClientRect().bottom) : -1),
      };
    }, ROWS);
    expect(rows.found).toEqual([true, true, true, true, true]);
    expect(rows.domOrder).toBe(true);
    for (let i = 1; i < ROWS.length; i += 1) expect(rows.tops[i]!, `${ROWS[i]} is under ${ROWS[i - 1]}`).toBeGreaterThanOrEqual(rows.bottoms[i - 1]! - 1);
  });

  test(`${name}: a usual result does not move the cards or the buttons; a long one is shown whole`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await settle(page);
    const where = () => page.evaluate(() => ({
      cards: Math.round(document.querySelector(".dojo-endless-cards")!.getBoundingClientRect().top),
      actions: Math.round(document.querySelector("[data-testid=practice-actions]")!.getBoundingClientRect().top),
    }));
    const put = (text: string) => page.evaluate((text) => {
      const band = document.querySelector("[data-testid=practice-result]")!;
      band.replaceChildren(...(text ? [Object.assign(document.createElement("p"), { textContent: text })] : []));
    }, text);
    await put("");
    const empty = await where();
    await put("✓ 合いました");
    expect(await where()).toEqual(empty);
    const long = "✗ 合いませんでした。左手の音が足りません。右手のいちばん上の音を、もう一度確かめてから弾いてください。合っていれば次へ進みます。";
    expect(long.length).toBeGreaterThanOrEqual(60);
    await put(long);
    const shown = await page.evaluate(() => {
      const p = document.querySelector("[data-testid=practice-result] p")! as HTMLElement;
      const r = p.getBoundingClientRect();
      return { whole: p.scrollWidth <= p.clientWidth + 1 && p.scrollHeight <= p.clientHeight + 1, inside: r.left >= 0 && r.right <= innerWidth, text: p.innerText };
    });
    expect(shown.whole).toBe(true);
    expect(shown.inside).toBe(true);
    expect(shown.text).toBe(long);
  });

  test(`${name}: a key is a <kbd> mark; the button keeps its name 「◯◯（key）」`, async ({ page }) => {
    await open(page);
    const buttons = await page.locator("[data-testid=practice-actions] button, [data-testid=practice-result] button").evaluateAll((list) => list.map((b) => {
      const kbd = b.querySelector("kbd");
      return { label: b.getAttribute("aria-label"), text: (b.textContent ?? "").replace(kbd?.textContent ?? "", ""), kbd: kbd?.textContent ?? null, bracket: /（(L|Space|Enter|Y|N|R)）/.test(b.textContent ?? "") };
    }));
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.bracket, `${b.text}: no 「（key）」 in the text`).toBe(false);
      if (b.kbd) expect(b.label).toBe(`${b.text}（${b.kbd}）`);
    }
    expect(buttons.some((b) => b.kbd)).toBe(name !== "ボイシングドリル");   // the drill's idle row has only 「始める」
  });

  test(`${name}: the 「?」 opens the explanation and closes it again`, async ({ page }) => {
    await open(page);
    const help = page.getByTestId("practice-help");
    const note = page.locator("[data-testid=practice-conditions] [role=note]");
    await expect(help).toHaveAttribute("aria-expanded", "false");
    await expect(note).toBeHidden();
    await help.click();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(note).toBeVisible();
    await help.click();
    await expect(note).toBeHidden();
  });
}
