import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

const tauriCsp = (JSON.parse(readFileSync(
  new URL("../src-tauri/tauri.conf.json", import.meta.url),
  "utf8",
)) as { app: { security: { csp: string } } }).app.security.csp;

async function applyTauriDocumentCsp(page: import("@playwright/test").Page) {
  await page.route(/http:\/\/127\.0\.0\.1:4174\/(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "content-security-policy": tauriCsp,
      },
    });
  });
}

test("P5.27 Voicing Loop route is keyboard-operable and overflow-safe at 320px", async ({ page }) => {
  await applyTauriDocumentCsp(page);
  await page.setViewportSize({ width: 320, height: 812 });
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();

  const dojo = page.getByRole("tab", { name: "Chord Dojo" });
  await dojo.focus();
  await page.keyboard.press("ArrowRight");
  const voicingLoop = page.getByRole("tab", { name: "Voicing Loop" });
  await expect(voicingLoop).toBeFocused();
  await expect(voicingLoop).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Voicing Loop", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cmaj7", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dm7", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/構成音: C4 · G4 · B4/)).toBeVisible();
  await expect(page.getByTestId("voicing-loop-event-timing")).toHaveText([
    "2拍",
    "2拍",
  ]);
  await expect(page.getByRole("group", { name: "Voicing表示モード" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "コード" })).toBeVisible();
  await expect(page.getByTestId("voicing-loop-beat-indicator")).toBeVisible();
  await expect(page.getByTestId("voicing-loop-current-next")).toContainText("位置");
  await expect(page.getByTestId("voicing-loop-current-next")).toContainText("2拍後に切り替わります");
  await expect(page.getByTestId("voicing-loop-midi-status")).toContainText("MIDI入力");
  await expect(page.getByTestId("voicing-loop-current-next")).not.toContainText("MIDI monitor");
  await expect(page.getByRole("button", { name: "Source MIDI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Basic Full 1–7–3" })).toBeVisible();
  await expect(page.getByRole("button", { name: /開始/ })).toBeEnabled();
  await assertNoHorizontalOverflow(page);

  await page.getByLabel("カウントイン").selectOption("0");
  await page.getByRole("button", { name: /開始/ }).click();
  await expect(page.getByRole("button", { name: /一時停止/ })).toBeVisible();
  await expect(page.locator("[data-testid='voicing-loop-event'][aria-current='step']"))
    .toContainText("Dm7", { timeout: 3_000 });
  await page.getByRole("button", { name: /一時停止/ }).click();
  await expect(page.getByRole("button", { name: /再開/ })).toBeVisible();
  await page.getByRole("button", { name: /再開/ }).click();
  await expect(page.locator("[data-testid='voicing-loop-event'][aria-current='step']"))
    .toContainText("Cmaj7", { timeout: 3_000 });
  await page.getByRole("button", { name: /最初から/ }).click();
  await expect(page.locator("[data-testid='voicing-loop-event'][aria-current='step']"))
    .toContainText("Cmaj7");
  await expect(page.locator("[data-testid='voicing-loop-event'][aria-current='step']"))
    .toContainText("Dm7", { timeout: 3_000 });
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByText("停止しました")).toBeVisible();
});

test("P5.27 Voicing Loop centers a fitted keyboard and exposes MIDI settings beside transport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();

  const keyboardRegion = page.getByRole("region", { name: "ピアノ鍵盤" });
  const keyboard = keyboardRegion.locator("svg");
  const [regionBox, keyboardBox] = await Promise.all([keyboardRegion.boundingBox(), keyboard.boundingBox()]);
  expect(regionBox).not.toBeNull();
  expect(keyboardBox).not.toBeNull();
  expect(Math.abs(
    (regionBox!.x + regionBox!.width / 2) - (keyboardBox!.x + keyboardBox!.width / 2),
  )).toBeLessThan(2);

  const transport = page.getByTestId("voicing-loop-transport");
  await expect(transport.getByRole("button", { name: "設定", exact: true })).toBeVisible();
  await transport.getByRole("button", { name: "設定", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("P5.27 Voicing Loop populated surface is reduced-motion, 200% scale, and axe-clean", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 812 });
  await openApp(page);
  await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
  await page.getByRole("tab", { name: "Voicing Loop" }).click();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });

  const workspace = page.getByTestId("voicing-loop-workspace");
  await expect(workspace).toBeVisible();
  await assertNoHorizontalOverflow(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

  const axe = await new AxeBuilder({ page: page as never }).include("[data-testid='voicing-loop-workspace']").analyze();
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
});

test("P5.27 populated harness exposes every resolver status without fallback", async ({ page }) => {
  const scenarios = [
    ["", "Cmaj7"],
    ["unavailable", "選択したVoicingを利用できません"],
    ["unsupported", "選択中Lesson Voicingの規則がありません"],
    ["generation-error", "Voicingを生成できませんでした"],
  ] as const;
  for (const [status, expected] of scenarios) {
    await page.goto(status ? `/?p527Status=${status}` : "/");
    await page.evaluate(() => document.fonts.ready);
    await page.locator("nav").getByRole("button", { name: /Practice/ }).click();
    await page.getByRole("tab", { name: "Voicing Loop" }).click();
    await expect(page.getByTestId("voicing-loop-workspace")).toContainText(expected);
    if (status) await expect(page.getByRole("button", { name: /開始/ })).toBeDisabled();
  }
});
