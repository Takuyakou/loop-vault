import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, createSavedProgression, openApp, openVault } from "./helpers/app";

/**
 * P23-26: the settings screen regrouped into 表示 / MIDI 入力 / データ / このアプリについて / 開発者向け, the song
 * page given the base look and its new empty sentence, and the Bass Practice home's duplicated title gone (X1 is
 * checked in e2e/p23-25-bass-practice.spec.ts, which owns that screen).
 */
const PREFS = "loop-vault:live-midi-preferences:v1";

async function openSettings(page: Page) {
  await page.locator('[data-nav="settings"]').click();
  await expect(page.getByTestId("settings-view")).toBeVisible();
}

test("C1 S1-S6 + C2: the five groups hold every setting that was there", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await createSavedProgression(page, "P23-26 settings");
  await openSettings(page);
  const view = page.getByTestId("settings-view");

  // S1: the five groups, in this order, in the page and in the left list.
  const headings = await view.locator("h2").evaluateAll((elements) => elements.map((element) => element.textContent));
  expect(headings).toEqual(["表示", "MIDI 入力", "データ", "このアプリについて", "開発者向け"]);
  const nav = view.locator('nav[aria-label="設定の欄"]');
  expect(await nav.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.textContent))).toEqual(
    ["表示", "MIDI 入力", "データ", "このアプリについて", "開発者向け"],
  );
  // S3: the reader's section is lit, and the MIDI row carries the same state dot as the top band.
  await expect(nav.getByRole("button").first()).toHaveAttribute("aria-current", "true");
  await expect(nav.locator(".lv-midi-dot")).toHaveCount(1);

  // S4: rows are name + explanation on the left, the control on the right (the checkboxes are switches).
  for (const id of ['settings-show-degrees', 'settings-standard-title-bar']) {
    const toggle = view.getByTestId(id);
    await expect(toggle).toHaveAttribute("role", "switch");
    await expect(toggle).toHaveAttribute("aria-checked", /true|false/);
  }
  const degreeRow = view.locator(".lv-settings-row").filter({ hasText: "コードカードに度数を表示" });
  await expect(degreeRow.locator(".lv-settings-row-text")).toContainText("キーが分かる場合");
  await expect(degreeRow.locator(".lv-settings-row-control [role='switch']")).toHaveCount(1);

  // S5: 「今の様子」 — name/state, the 88 keys, the last note, 探し直す.
  await expect(view.getByTestId("settings-midi-status")).toBeVisible();
  await expect(view.getByTestId("settings-midi-keys").locator("[data-midi]")).toHaveCount(88);
  await expect(view.getByTestId("settings-midi-last-note")).toContainText(/最後に届いた音|鍵盤を弾くと|つながると/);
  await expect(view.getByRole("button", { name: "探し直す" })).toBeVisible();
  // The MIDI settings themselves (the old 「音と MIDI」 and 「Live MIDI」).
  await expect(view.locator("#settings-live-midi-device")).toBeVisible();
  await expect(view.getByRole("switch", { name: "起動した時に自動でつなぐ" })).toBeVisible();
  await expect(view.locator("#settings-record-channel")).toBeVisible();
  // S7: the one setting this release adds.
  await expect(view.getByTestId("settings-live-midi-always-on-top")).toHaveAttribute("aria-checked", "true");

  // S6: location (with the counts), two cards, the backup list.
  await expect(view.locator(".lv-settings-path-text")).toBeVisible();
  await expect(view.locator(".lv-settings-counts")).toContainText("進行");
  await expect(view.locator(".lv-settings-counts")).toContainText("曲");
  await expect(view.locator(".lv-settings-io-card")).toHaveCount(2);
  await expect(view.getByRole("button", { name: "JSONを書き出す" })).toBeVisible();
  await expect(view.getByRole("button", { name: "JSONを読み込む" })).toBeVisible();
  await expect(view.locator(".lv-settings-backup-head")).toContainText("バックアップ");

  // このアプリについて: the format facts and the piano attribution moved here.
  const about = view.locator("#settings-about");
  await expect(about.locator("[data-testid='loop-vault-format-info']")).toBeVisible();
  await expect(about.locator("[data-testid='piano-sample-attribution']")).toContainText("Salamander Grand Piano V3");

  // 開発者向け: still collapsed, still everything inside.
  const developer = view.locator("#settings-developer button[aria-expanded]");
  await expect(developer).toHaveAttribute("aria-expanded", "false");
  await developer.click();
  await expect(view.locator("[data-testid='loop-vault-build-info']")).toBeVisible();
  await expect(view.locator("[data-testid='stored-api-key-removal']")).toBeVisible();
  await expect(view).toContainText("解析（開発用）");
});

test("C3 S7: always-on-top turns off, is written to the record and stays off after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await openSettings(page);
  const toggle = page.getByTestId("settings-live-midi-always-on-top");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.alwaysOnTop, PREFS)).toBe(false);

  await page.reload();
  await openSettings(page);
  await expect(page.getByTestId("settings-live-midi-always-on-top")).toHaveAttribute("aria-checked", "false");
});

test("C1 D1/D2: the song page keeps its words, with the base colour and corner", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await createSavedProgression(page, "P23-26 song page");
  await openVault(page);
  // Remove the one progression: the song stays, and that is the page D1/D2 are about.
  await page.locator(".lv-vault-progression").first().click();
  await page.getByRole("button", { name: "そのほか", exact: true }).click();
  await page.getByRole("button", { name: "この進行を削除…", exact: true }).click();
  const deleted = page.locator(".lv-toast").filter({ hasText: "保存したコード進行を削除しました" });
  await expect(deleted).toBeVisible();
  // The removal commits when the undo window closes; the song page is opened after that.
  await expect(deleted).toHaveCount(0, { timeout: 15_000 });

  const orphans = page.getByTestId("vault-orphan-ideas");
  await orphans.getByRole("button", { name: /進行のない曲/ }).click();
  await orphans.locator(".lv-vault-orphan").first().click();

  const main = page.locator("#main-content");
  // D2: the sentence no longer says only MIDI.
  await expect(main).toContainText("まだ保存したコード進行はありません。");
  await expect(main).not.toContainText("まだMIDIから保存したコード進行はありません。");
  // D1: the base colour and corner are applied (no rebuild — the same panels as before).
  const base = await main.evaluate((root) => {
    const panel = [...root.querySelectorAll("section")]
      .map((element) => getComputedStyle(element))
      .find((style) => style.backgroundColor !== "rgba(0, 0, 0, 0)");
    return panel ? { background: panel.backgroundColor, radius: panel.borderTopLeftRadius } : undefined;
  });
  expect(base?.radius).not.toBe("0px");
  expect(base?.background).not.toBe("rgba(0, 0, 0, 0)");
  await main.screenshot({ path: "p89-generated/p23-26/song-page-1440x900.png" });
});

test("C6: four widths stay inside the window, axe is clean and the keys still work", async ({ page }) => {
  test.setTimeout(120_000);
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 640 },
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await openApp(page);
    await openSettings(page);
    await assertNoHorizontalOverflow(page);

    // Numbers instead of eyes: every row keeps its text and its control apart, and inside the card.
    const box = await page.evaluate(() => {
      const rect = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
      };
      const view = document.querySelector<HTMLElement>("[data-testid='settings-view']")!;
      const rows = [...view.querySelectorAll<HTMLElement>(".lv-settings-row")].map((row) => ({
        row: rect(row),
        text: rect(row.querySelector(".lv-settings-row-text")!),
        control: rect(row.querySelector(".lv-settings-row-control")!),
      }));
      return { view: rect(view), rows, body: { client: document.body.clientWidth, scroll: document.body.scrollWidth } };
    });
    for (const entry of box.rows) {
      expect(entry.text.width).toBeGreaterThan(80);
      expect(entry.control.width).toBeGreaterThan(0);
      // Either side by side (no overlap) or wrapped onto its own line.
      const sideBySide = entry.control.x >= entry.text.right - 1;
      const wrapped = entry.control.y >= entry.text.bottom - 1;
      expect(sideBySide || wrapped, `row overlap at ${size.width}`).toBe(true);
      expect(entry.row.right).toBeLessThanOrEqual(box.view.right + 1);
    }
    expect(box.body.scroll).toBeLessThanOrEqual(box.body.client + 1);
    await page.screenshot({ path: `p89-generated/p23-26/settings-${size.width}x${size.height}.png`, fullPage: true });
  }

  // C6: no serious/critical accessibility violation.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await openSettings(page);
  // The content fades in when the view changes; measure the settled screen, not a frame of the fade.
  await page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
    .map((animation) => animation.finished.catch(() => undefined))));
  const axe = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blocking.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
  }))).toEqual([]);

  // C6: the keys are the ones the screen had — the switches take Space, the left list takes Enter.
  const degrees = page.getByTestId("settings-show-degrees");
  await degrees.focus();
  await page.keyboard.press("Space");
  await expect(degrees).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Space");
  await expect(degrees).toHaveAttribute("aria-checked", "true");

  await page.locator('nav[aria-label="設定の欄"]').getByRole("button", { name: "データ" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('nav[aria-label="設定の欄"]').getByRole("button", { name: "データ" })).toHaveAttribute("aria-current", "true");
});
