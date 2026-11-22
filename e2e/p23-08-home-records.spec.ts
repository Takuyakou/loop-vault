import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, openTextCapture } from "./helpers/app";
import { practiceFromVault } from "./helpers/practice";

/**
 * P23-08: the practice opens (Voicing Loop / Chord Dojo) this PC keeps for the Home. Only opening a practice is
 * counted; the Home's ▶, the Vault and the progression page are not. (P23-61 §7 removed the side menu's dot.)
 */
const OPENS = "loop-vault:practice-opens:v1";
type Open = { ideaId: string; blockId: string; via: string; at: string };

const opens = (page: Page) => page.evaluate((key) => {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as { version: number; opens: Open[] }).opens : [];
}, OPENS);

async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
}

async function saveProgression(page: Page, name = "P23-08 の進行") {
  const capture = await openTextCapture(page);
  await capture.getByTestId("text-progression-input").fill("| Dm7 | G7 | Cmaj7 | A7 |");
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
  await page.locator('[data-nav="home"]').click();
  await settle(page);
}

async function openProgressionPage(page: Page) {
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().getByRole("button", { name: "進行を開く" }).click();
  await expect(page.getByTestId("progression-title")).toBeVisible();
}

async function openVoicingLoopFromPage(page: Page) {
  await openProgressionPage(page);
  await practiceFromVault(page, "Voicing Loop");
  await expect(page.getByTestId("voicing-loop-workspace")).toBeVisible();
}

async function openChordDojoFromPage(page: Page) {
  await openProgressionPage(page);
  await practiceFromVault(page, "Chord Dojo");
  await expect(page.locator("[data-dojo-screen='practice']")).toBeVisible();
}

/** The save toast sits over the Home's lower rows; close it before measuring. */
async function clearToasts(page: Page) {
  for (let index = 0; index < 8; index += 1) {
    const closes = page.locator(".lv-toast-close");
    if (await closes.count() === 0) return;
    await closes.first().click();
  }
}

async function goHome(page: Page) {
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-continue")).toBeVisible();
  await settle(page);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("E1・E2: Voicing Loop and Chord Dojo opened from the progression page are each recorded once", async ({ page }) => {
  test.setTimeout(120_000);
  await saveProgression(page);
  expect(await opens(page)).toEqual([]);
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);

  await openVoicingLoopFromPage(page);
  const first = await opens(page);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ via: "voicing-loop" });
  expect(first[0]!.ideaId.length).toBeGreaterThan(0);
  expect(first[0]!.blockId.length).toBeGreaterThan(0);
  await goHome(page);
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);

  await openChordDojoFromPage(page);
  const second = await opens(page);
  expect(second).toHaveLength(2);
  expect(second.filter((entry) => entry.via === "chord-dojo")).toEqual([
    expect.objectContaining({ ideaId: first[0]!.ideaId, blockId: first[0]!.blockId, via: "chord-dojo" }),
  ]);
  await goHome(page);
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);
});

test("E3: the Home's ▶, the Vault and the progression page add nothing", async ({ page }) => {
  test.setTimeout(120_000);
  await saveProgression(page);
  await openVoicingLoopFromPage(page);
  await goHome(page);
  expect(await opens(page)).toHaveLength(1);

  await page.locator(".lv-home-loop-play").first().click();
  await page.locator('[data-nav="vault"]').click();
  await page.locator(".lv-vault-row").first().click();
  await openProgressionPage(page);
  await goHome(page);
  expect(await opens(page)).toHaveLength(1);
});

test("E4: the search palette's Ctrl+Enter opens the Voicing Loop and is recorded", async ({ page }) => {
  await openApp(page);
  await saveProgression(page, "夜のループ");
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette-input").fill("夜");
  await expect(page.locator('[data-palette-section="progression"]')).toContainText("夜のループ");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByTestId("voicing-loop-controls")).toBeVisible();
  const read = await opens(page);
  expect(read).toHaveLength(1);
  expect(read[0]).toMatchObject({ via: "voicing-loop" });
});

test("T14: opening one of 自分の進行 in the Chord Dojo records it once with that progression", async ({ page }) => {
  test.setTimeout(120_000);
  await saveProgression(page);
  await page.locator('[data-nav="chord-dojo"]').click();
  await expect(page.getByTestId("dojo-home")).toBeVisible();
  await page.getByRole("button", { name: "自分の進行", exact: true }).click();
  await page.locator(".dojo-list .dojo-card").first().getByRole("button", { name: "全体を練習する" }).click();
  const reveal = page.getByRole("button", { name: "答えを見る（Space）" });
  if (await reveal.count()) await reveal.click();
  await page.getByRole("button", { name: /弾けた/ }).click();
  const dojo = await opens(page);
  expect(dojo).toHaveLength(1);
  expect(dojo[0]).toMatchObject({ via: "chord-dojo" });

  // The same progression as the progression page's own ids.
  await openVoicingLoopFromPage(page);
  const both = await opens(page);
  expect(both).toHaveLength(2);
  const voicing = both.find((entry) => entry.via === "voicing-loop")!;
  expect({ ideaId: dojo[0]!.ideaId, blockId: dojo[0]!.blockId }).toEqual({ ideaId: voicing.ideaId, blockId: voicing.blockId });
});

test("E5: the records stay after the app is opened again", async ({ page }) => {
  test.setTimeout(120_000);
  await saveProgression(page);
  await openVoicingLoopFromPage(page);
  const before = await opens(page);
  expect(before).toHaveLength(1);
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible();
  await settle(page);
  expect(await opens(page)).toEqual(before);
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);
});

test("E6: at 1024×768 (narrow menu) nothing overflows and axe is clean", async ({ page }) => {
  test.setTimeout(120_000);
  await saveProgression(page);
  await openVoicingLoopFromPage(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await goHome(page);
  await expect(page.locator("[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await clearToasts(page);
  await settle(page);
  // The Home's recent-row actions are dimmed (0.55) until hover since P22; that existing look is not this check's subject.
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking, JSON.stringify(blocking.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target.join(" > ")) })), null, 2)).toEqual([]);
});
