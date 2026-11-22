import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, dropMidi, openApp, openCapture } from "./helpers/app";

/**
 * P23-11: the first screen of 取り込む (the box on the right, the three steps on the left) and the switch in
 * the header. A file that cannot be read shows its reason inside the box.
 */
const mode = (page: Page) => page.getByTestId("capture-input-mode");
const zone = (page: Page) => page.locator(".lv-capture-zone");
const story = (page: Page) => page.locator(".lv-capture-story");

const settle = (page: Page) => page.evaluate(() => Promise.all((document.getElementById("main-content")?.getAnimations() ?? [])
  .map((animation) => animation.finished.catch(() => undefined))));

async function openCaptureEntry(page: Page) {
  await openApp(page);
  await openCapture(page);
  await expect(page.locator("#capture-empty-title")).toBeVisible();
  await settle(page);
}

async function seriousViolations(page: Page) {
  const result = await new AxeBuilder({ page: page as never })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({ id: violation.id, targets: violation.nodes.slice(0, 8).map((node) => node.target.join(" > ")) }));
}

test("E1 the story and the box stand side by side", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  const storyBox = (await story(page).boundingBox())!;
  const zoneBox = (await zone(page).boundingBox())!;
  expect(zoneBox.x).toBeGreaterThan(storyBox.x + storyBox.width - 1);
  await assertNoHorizontalOverflow(page);
});

test("E2 the text way in opens the text entry and moves the switch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  await page.getByTestId("capture-entry-text").click();
  await expect(page.getByTestId("text-progression-capture")).toBeVisible();
  await expect(mode(page)).toHaveAttribute("data-value", "text");
  await expect(mode(page).getByRole("button", { name: /テキスト/ })).toHaveAttribute("aria-pressed", "true");
});

test("E3 the keyboard way in opens Live MIDI", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  await page.getByTestId("capture-entry-live-midi").click();
  await expect(page.getByTestId("live-midi-web-preview")).toBeVisible();
});

test("E4 a file that cannot be read shows its reason inside the box", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  await dropMidi(page, Uint8Array.from([0, 1, 2, 3]), "broken.mid");
  await expect(page.locator(".lv-capture-hero")).toHaveAttribute("data-zone-state", "error");
  const alert = zone(page).locator("[role='alert']");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("MIDI を読み込めませんでした");
  await expect(page.getByTestId("capture-retry-midi")).toBeVisible();
  await expect(page.getByTestId("capture-choose-midi")).toHaveCount(0);
});

test("E5 pointing at the box lights the three steps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  const numbers = page.locator(".lv-capture-step-n");
  await expect(numbers).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(numbers.nth(index)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  await zone(page).hover();
  for (let index = 0; index < 3; index += 1) {
    await expect(numbers.nth(index)).toHaveCSS("background-color", "rgb(66, 216, 198)");
  }
});

test("E6 the switch keeps its height and drops its pictures on a narrow window", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  const wide = (await mode(page).boundingBox())!;
  expect(Math.round(wide.height)).toBe(38);
  const pictures = mode(page).locator("svg");
  await expect(pictures).toHaveCount(2);
  await expect(pictures.nth(0)).toBeVisible();
  await expect(pictures.nth(1)).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1024, height: 768 });
  await settle(page);
  await expect(pictures.nth(0)).toBeHidden();
  await expect(pictures.nth(1)).toBeHidden();
  await assertNoHorizontalOverflow(page);
});

test("E7 on a narrow window the box comes first", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 640 });
  await openCaptureEntry(page);
  const storyBox = (await story(page).boundingBox())!;
  const zoneBox = (await zone(page).boundingBox())!;
  expect(zoneBox.y).toBeLessThan(storyBox.y);
  await assertNoHorizontalOverflow(page);
});

test("E8 the screen and its failed state have no serious accessibility violations", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCaptureEntry(page);
  expect(await seriousViolations(page), "idle").toEqual([]);

  await dropMidi(page, Uint8Array.from([0, 1, 2, 3]), "broken.mid");
  await expect(page.locator(".lv-capture-hero")).toHaveAttribute("data-zone-state", "error");
  await settle(page);
  expect(await seriousViolations(page), "error").toEqual([]);
});
