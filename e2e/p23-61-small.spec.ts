import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, chooseTextSetting } from "./helpers/app";
import { practiceFromVault } from "./helpers/practice";
import { openDojo } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-61: eleven small fixes found by hand (inbox/P23-61.md). The tests here cover §4 (the strip card's role line
 * and badge), §5 (the keyboard's height ceiling), §6 (the mini window's single frame) and §9 (the key field's
 * width); the same spec takes the report screenshots of §1, §3, §6, §7, §8 and §10.
 */
const ROW = "voicing-loop-progression-row";
const EIGHT = "| Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 | Dm7 | G7 |";

/** Toasts are not the subject of a review photo. */
async function closeToasts(page: Page) {
  for (let index = 0; index < 8; index += 1) {
    const closes = page.locator(".lv-toast-close");
    if (await closes.count() === 0) return;
    await closes.first().click();
  }
}

async function saveText(page: Page, name: string, text: string, key?: string) {
  // p528Direct=1 keeps the Voicing Loop fixtures out of the way: these screens use the real saved progression.
  await page.goto("/?p528Direct=1");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#main-content")).toBeVisible();
  await page.locator('[data-nav="capture"]').click();
  await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
  const capture = page.getByTestId("text-progression-capture");
  await capture.getByTestId("text-progression-input").fill(text);
  if (key) await chooseTextSetting(capture, "text-progression-key", key);
  await capture.getByTestId("text-progression-name").fill(name);
  await capture.getByTestId("text-progression-save").click();
  await expect(capture.getByText(/保存しました/, { exact: true })).toBeVisible();
}

/** Vault → the row → 「Voicing Loop で弾く」 (the practice of that progression). */
async function openVoicingPractice(page: Page, name: string) {
  await page.locator('[data-nav="vault"]').click();
  await practiceFromVault(page, "Voicing Loop", name);
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible();
  await expect(page.locator("[data-sidebar-animating]")).toHaveCount(0);
}

async function practiceEight(page: Page) {
  await saveText(page, "P23-61 8 コード", EIGHT, "C major");
  await openVoicingPractice(page, "P23-61 8 コード");
}

const keyboardBox = (page: Page) => page.locator("[data-testid='voicing-loop-detail'] [data-keyboard-event-index]");

async function keyboardMetrics(page: Page) {
  return keyboardBox(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const pane = element.closest("[data-testid='voicing-loop-workspace']")?.getBoundingClientRect();
    return { height: box.height, width: box.width, paneWidth: pane?.width ?? box.width };
  });
}

/** P23-61 §5: a white key is 6.5 times as tall as it is wide, at most 210px, with the rest left free below. */
async function expectKeyboardCeiling(page: Page, size: { width: number; height: number }) {
  const metrics = await keyboardMetrics(page);
  expect(metrics.height, `${size.width}×${size.height}: the box is at most 210px`).toBeLessThanOrEqual(210.5);
  // The ceiling is 12.5% of the pane (the same basis as the CSS rule); the key's own box loses its 10px frame.
  const paneRatio = (metrics.height - 10) / (metrics.paneWidth / 52);
  expect(paneRatio, `${size.width}×${size.height}: pane ratio ${paneRatio.toFixed(2)} (h=${metrics.height.toFixed(1)}, pane=${metrics.paneWidth.toFixed(1)})`)
    .toBeLessThanOrEqual(6.6);
  const boxRatio = (metrics.height - 10) / ((metrics.width - 10) / 52);
  expect(boxRatio, `${size.width}×${size.height}: key ratio ${boxRatio.toFixed(2)} (w=${metrics.width.toFixed(1)})`).toBeLessThanOrEqual(6.7);
  const transport = (await page.getByTestId("voicing-loop-transport").boundingBox())!;
  expect(size.height - (transport.y + transport.height), `${size.width}×${size.height}: the free height stays below`)
    .toBeGreaterThanOrEqual(16);
}

test("P23-61 §4: the strip card carries its role in the key (line, degree colour, badge)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?p527Status=both-hands");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId("voicing-loop-current-panel")).toBeVisible();
  const cards = page.getByTestId("voicing-loop-event");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-fn", "T");
  await expect(cards.nth(1)).toHaveAttribute("data-fn", "SD");
  await expect(page.getByTestId("voicing-loop-event-role")).toHaveText([/^T/, /^SD/]);
  const colours = await page.evaluate(() => {
    const card = document.querySelectorAll<HTMLElement>('[data-testid="voicing-loop-event"]')[1]!;
    const degree = card.querySelector<HTMLElement>('[data-testid="voicing-loop-event-degree"]')!;
    const probe = document.createElement("span");
    probe.style.color = "var(--lv-fn-sd)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { expected, line: getComputedStyle(card, "::before").backgroundColor, degree: getComputedStyle(degree).color };
  });
  expect(colours.line, "the 2px line is the role's colour").toBe(colours.expected);
  expect(colours.degree, "the degree's letters are the role's colour").toBe(colours.expected);
  // The card's degree is the small size of the mock (10.5px) with an 8.5px role badge.
  const sizes = await page.evaluate(() => {
    const degree = document.querySelector<HTMLElement>('[data-testid="voicing-loop-event-degree"]')!;
    const role = degree.closest(".lv-vl-event-degree")!.querySelector<HTMLElement>(".lv-vl-degree-role")!;
    return { degree: getComputedStyle(degree).fontSize, role: getComputedStyle(role).fontSize };
  });
  expect(sizes).toEqual({ degree: "10.5px", role: "8.5px" });
});

test("P23-61 §5: the keyboard stops growing at a piano's key shape and leaves the rest free", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await practiceEight(page);
  for (const size of [{ width: 1920, height: 1080 }, { width: 1668, height: 1040 }]) {
    await page.setViewportSize(size);
    await expectKeyboardCeiling(page, size);
    await closeToasts(page);
    await captureReportShot(page, `p23-61-assets/vl-${size.width}.png`);
  }
  // 1440×900 keeps the height it had (141px); 1280×720 keeps its drawn 80px box.
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(Math.abs((await keyboardMetrics(page)).height - 141)).toBeLessThanOrEqual(1.5);
  await closeToasts(page);
  await captureReportShot(page, "p23-61-assets/vl-1440.png");
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(Math.abs((await keyboardMetrics(page)).height - 80)).toBeLessThanOrEqual(1.5);
  await closeToasts(page);
  await captureReportShot(page, "p23-61-assets/vl-1280.png");
});

test("P23-61 §6: the mini window's device field has one frame over its own", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.locator('[data-nav="live-midi"]').click();
  await expect(page.getByTestId("live-midi-web-preview")).toBeVisible();
  const field = page.locator(".lv-live-mini-device").first();
  await expect(field).toBeVisible();
  const select = field.locator("select");
  await expect(select).toHaveCSS("border-top-width", "0px");
  await expect(select).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const framed = await field.evaluate((element) => [element, ...element.querySelectorAll("*")].filter((node) => {
    const style = getComputedStyle(node);
    const border = ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"]
      .some((name) => Number.parseFloat(style.getPropertyValue(name)) > 0);
    return border || (style.boxShadow !== "none" && style.boxShadow !== "");
  }).length);
  expect(framed, "only the field's own box is drawn").toBe(1);
  const head = (await page.locator(".lv-live-mini-head").first().boundingBox())!;
  await captureReportShot(page, "p23-61-assets/mini-device.png", {
    clip: { x: head.x - 4, y: head.y - 10, width: head.width + 8, height: head.height + 60 },
  });
});

test("P23-61 §9: the key field's letters are never cut (F♯マイナー / F♯メジャー with (元))", async ({ page }) => {
  test.setTimeout(180_000);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    for (const [key, expected] of [["F# minor", "F♯マイナー (元)"], ["F# major", "F♯メジャー (元)"]] as const) {
      const name = `P23-61 キー ${key}`;
      await saveText(page, name, "| F#m7 | Bm7 | C#7 | F#m7 |", key);
      await openVoicingPractice(page, name);
      const keySelect = page.locator("#voicing-loop-key");
      await expect(keySelect).toHaveValue("6");
      const measured = await keySelect.evaluate((element) => {
        const select = element as HTMLSelectElement;
        const style = getComputedStyle(select);
        const label = select.selectedOptions[0]?.textContent ?? "";
        const probe = document.createElement("span");
        probe.style.font = style.font;
        probe.style.letterSpacing = style.letterSpacing;
        probe.style.whiteSpace = "nowrap";
        probe.textContent = label;
        document.body.append(probe);
        const textWidth = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          label,
          textWidth,
          inner: select.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
        };
      });
      expect(measured.label, "the field shows the key with (元)").toBe(expected);
      expect(measured.textWidth, `${size.width}×${size.height}: ${expected} fits the field`)
        .toBeLessThanOrEqual(measured.inner);
      const primary = page.getByTestId("voicing-loop-transport-primary");
      expect(await primary.evaluate((element) => element.scrollHeight - element.clientHeight),
        "the transport stays on one line").toBeLessThanOrEqual(1);
      await assertNoHorizontalOverflow(page);
    }
  }
});

test("P23-61 §3: the picker with progressions has no text entry and the search takes the row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveText(page, "P23-61 ピッカー", EIGHT, "C major");
  // Leave the capture screen first, then open the picker (the saved-notice's own route is not this test's subject).
  await page.locator('[data-nav="home"]').click();
  await expect(page.getByTestId("home-continue")).toBeVisible();
  await page.locator('[data-nav="voicing-loop"]').click();
  await expect(page.getByTestId(ROW).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /テキストで新しい進行/ })).toHaveCount(0);
  const search = (await page.locator("#voicing-loop-progression-search").boundingBox())!;
  const list = (await page.getByTestId("voicing-loop-progression-list").boundingBox())!;
  expect(list.x + list.width - (search.x + search.width), "the search takes the row").toBeLessThanOrEqual(24);
  await closeToasts(page);
  await captureReportShot(page, "p23-61-assets/picker-1440.png");
});

test("P23-61 §1/§7: the home's Chord Dojo 続きから has no empty strip and the menu has no dot", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await saveText(page, "P23-61 ホーム", EIGHT, "C major");
  await page.locator('[data-nav="vault"]').click();
  await practiceFromVault(page, "Chord Dojo", "P23-61 ホーム");
  await expect(page.locator("[data-dojo-screen='practice']")).toBeVisible();
  const reveal = page.getByRole("button", { name: "答えを見る（Space）" });
  if (await reveal.count()) await reveal.click();
  await page.getByRole("button", { name: "弾けた（Y）" }).click();
  await page.locator('[data-nav="home"]').click();
  const card = page.getByTestId("home-continue");
  await expect(card).toHaveAttribute("data-continue-kind", "chord-dojo");
  await expect(card.locator(".lv-home-strip")).toHaveCount(0);
  await expect(page.getByTestId("nav-today-dot")).toHaveCount(0);
  await closeToasts(page);
  await captureReportShot(page, "p23-61-assets/home-continue-1440.png", { fullPage: true });
  const sidebar = (await page.locator("[data-sidebar]").boundingBox())!;
  await captureReportShot(page, "p23-61-assets/nav-1440.png", {
    clip: { x: sidebar.x, y: sidebar.y, width: sidebar.width, height: Math.min(560, sidebar.height) },
  });
});

test("P23-61 §8: the Dojo's notice without a MIDI keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDojo(page, "no-midi");
  const banner = page.getByTestId("home-midi-banner");
  await expect(banner).toBeVisible();
  await expect(banner).not.toContainText("秒数は測りません");
  const box = (await banner.boundingBox())!;
  await captureReportShot(page, "p23-61-assets/dojo-home-midi-1440.png", {
    clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
  });
});

test("P23-61 §10: the header's chip says 未接続 in a short word", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("loop-vault:live-midi-preferences:v1", JSON.stringify({
      alwaysOnTop: true, showHistory: true,
      preferredInput: { backendId: "digital-piano", name: "Digital Piano", previousIndex: 0 },
    }));
    localStorage.setItem("loop-vault:live-midi-connection:v1", JSON.stringify({ autoConnect: true }));
  });
  await page.goto("/?p12=midi");
  await expect(page.locator("#main-content")).toBeVisible();
  const chip = page.locator(".lv-midi-chip").first();
  await expect(chip).toHaveAttribute("data-midi-kind", "missing");
  await expect(chip.locator(".lv-midi-label")).toHaveText("Digital Piano 未接続");
  const box = (await chip.boundingBox())!;
  await captureReportShot(page, "p23-61-assets/header-missing-1440.png", {
    clip: { x: box.x - 12, y: box.y - 8, width: box.width + 120, height: box.height + 16 },
  });
});
