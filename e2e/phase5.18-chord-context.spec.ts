import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp } from "./helpers/app";

test("P5.18 production default is keyboard-operable without 320px overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);
  await assertNoHorizontalOverflow(page);
  const card = page.getByTestId("bass-practice-home-card");
  await expect(card).toBeVisible();
  await card.getByRole("button").click();
  await page.getByRole("tab", { name: "Rhythm Echo" }).click();
  const rhythm = page.getByTestId("rhythm-echo-view");
  await expect(rhythm).toContainText("自己評価式の練習です");
  await expect(rhythm.getByLabel("リズムのテンポ")).toBeVisible();
  await page.getByRole("tab", { name: "Bassline Echo" }).click();

  const context = page.getByTestId("chord-context-controls");
  await expect(context).toBeVisible();
  await expect(context.getByRole("radio", { name: "聴く" })).toBeChecked();
  await expect(context.getByRole("radio", { name: "ベース + コード", exact: true })).toBeChecked();
  await assertNoHorizontalOverflow(page);

  const bpm = context.getByTestId("chord-context-effective-bpm");
  await bpm.fill("100");
  await context.getByTestId("chord-context-bpm-plus-four").click();
  await expect(bpm).toHaveValue("104");

  const play = context.getByRole("radio", { name: "演奏" });
  await play.focus();
  await page.keyboard.press("Space");
  await expect(play).toBeChecked();
  await expect(context.getByRole("radio", { name: "コードのみ", exact: true })).toBeChecked();
  await expect(context.getByText("演奏モードではお手本のベースを自動再生しません。")).toBeVisible();

  const startStop = context.getByTestId("chord-context-start-stop");
  await startStop.focus();
  await page.keyboard.press("Enter");
  await expect(context.getByTestId("chord-context-status")).toContainText("演奏を再生中です。");
  await page.keyboard.press("Enter");
  await expect(context.getByTestId("chord-context-status")).toContainText("Chord Contextは停止しています。");
  await assertNoHorizontalOverflow(page);
});

test("P5.18 remains operable with reduced motion and an effective 200% scale", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 640, height: 720 });
  await openApp(page);
  await page.getByTestId("bass-practice-home-card").getByRole("button").click();
  await page.getByRole("tab", { name: "Bassline Echo" }).click();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });

  const context = page.getByTestId("chord-context-controls");
  await expect(context).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("2");
  await assertNoHorizontalOverflow(page);

  const durations = await context.locator("*").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationDuration, transition: style.transitionDuration };
  }));
  const parseDuration = (value: string) => Math.max(...value.split(",").map((part) => {
    const trimmed = part.trim();
    return trimmed.endsWith("ms") ? Number.parseFloat(trimmed) : Number.parseFloat(trimmed) * 1_000;
  }));
  expect(durations.every(({ animation, transition }) =>
    parseDuration(animation) <= 0.01 && parseDuration(transition) <= 0.01)).toBe(true);

  const play = context.getByRole("radio", { name: "演奏" });
  await play.focus();
  await page.keyboard.press("Space");
  await context.getByRole("radio", { name: "コード + メトロノーム", exact: true }).click();
  await context.getByTestId("chord-context-bpm-plus-four").click();
  await expect(context.getByTestId("chord-context-effective-bpm")).toHaveValue("100");

  const startStop = context.getByTestId("chord-context-start-stop");
  await startStop.click();
  await expect(context.getByTestId("chord-context-status")).toContainText("演奏を再生中です。");
  await startStop.click();
  await expect(context.getByTestId("chord-context-status")).toContainText("Chord Contextは停止しています。");
  await assertNoHorizontalOverflow(page);
});

test("P5.18 explicit rollback hides only Chord Context and preserves Bassline Echo", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("loop-vault:bass-practice-chord-context-enabled:v1", "false");
  });
  await openApp(page);
  await page.getByTestId("bass-practice-home-card").getByRole("button").click();
  await page.getByRole("tab", { name: "Bassline Echo" }).click();

  await expect(page.getByTestId("bassline-echo-view")).toBeVisible();
  await expect(page.getByTestId("bassline-listen")).toBeVisible();
  await expect(page.getByTestId("chord-context-controls")).toHaveCount(0);
});
