import { expect, test } from "@playwright/test";
import { openApp } from "./helpers/app";

test("P5.18 production default exposes keyboard-accessible Chord Context at a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);
  const card = page.getByTestId("bass-practice-home-card");
  await expect(card).toBeVisible();
  await card.getByRole("button").click();
  await page.getByRole("tab", { name: "Bassline Echo" }).click();

  const context = page.getByTestId("chord-context-controls");
  await expect(context).toBeVisible();
  await expect(context.getByRole("radio", { name: "Listen" })).toBeChecked();
  await expect(context.getByRole("radio", { name: "Bass + Chords", exact: true })).toBeChecked();
  await expect(context.getByTestId("chord-context-start-stop")).toBeVisible();

  const play = context.getByRole("radio", { name: "Play" });
  await play.focus();
  await page.keyboard.press("Space");
  await expect(play).toBeChecked();
  await expect(context.getByRole("radio", { name: "Chords only", exact: true })).toBeChecked();
  await expect(context.getByText("Play never auto-plays the target bass.")).toBeVisible();
});