import { expect, test, type Page } from "@playwright/test";
import { homeFixture } from "./helpers/p12DojoHome";

/**
 * P24-02 I-1: the three homes share one 「続ける Enter」. This spec reads the computed values that decide
 * how the button looks (not the colours, which the screens still own) on the homes at three window sizes
 * and requires them to be the same.
 *
 * The Voicing Loop band needs the synthetic Vault fixture (`VITE_P527_E2E_FIXTURE=1`, the extended tier:
 * see p23-41). Without it the picker has no progression, so the Voicing Loop part is skipped there; the
 * same button is still measured on the two homes that always have a band.
 */
const AT = "2026-11-08T00:00:00.000Z";

const SIZES = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const BUTTON_PROPERTIES = [
  "display", "height", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-radius", "font-family", "font-size", "font-weight", "line-height", "gap",
] as const;

const KEY_PROPERTIES = [
  "display", "font-family", "font-size", "font-weight", "padding-top", "padding-right",
  "padding-bottom", "padding-left", "margin-left", "border-top-width", "border-radius",
] as const;

const HOMES = {
  cd: { band: "[data-testid='home-resume']", button: "[data-testid='home-resume-go']", background: "rgb(66, 216, 198)" },
  bp: { band: "[data-testid='bass-home-resume']", button: "[data-testid='bass-home-resume-open']", background: "rgb(167, 156, 255)" },
  vl: { band: "[data-testid='voicing-loop-resume']", button: "[data-testid='voicing-loop-resume-go']", background: "rgb(66, 216, 198)" },
} as const;

type HomeKey = keyof typeof HOMES;

async function readStyles(page: Page, selector: string, properties: readonly string[]) {
  return page.locator(selector).evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, properties as string[]);
}

async function seed(page: Page): Promise<void> {
  await page.addInitScript((file) => localStorage.setItem("loop-vault:chord-dojo-txt-jazz-v1:data", JSON.stringify(file)), homeFixture("many"));
  await page.addInitScript((value) => localStorage.setItem("loop-vault:dojo-recent:v1", JSON.stringify(value)), {
    version: 1,
    entries: [
      { kind: "standard", id: "ii-v-i-major", key: 0, random: false, at: AT },
      { kind: "jazz", id: "jazz-progressions-001", stage: "recall", key: 3, random: false, at: AT },
      { kind: "drill", id: "cycle-a", stage: "see", key: 0, random: false, at: AT },
    ],
  });
  await page.addInitScript(({ lastKey, recentKey }) => {
    localStorage.setItem(recentKey, JSON.stringify({ version: 1, references: [{ ideaId: "public-vl15-c", blockId: "c" }] }));
    localStorage.setItem(lastKey, JSON.stringify({ version: 1, reference: { ideaId: "public-vl15-c", blockId: "c" }, at: new Date().toISOString() }));
  }, { lastKey: "loop-vault:voicing-loop-last:v1", recentKey: "loop-vault:voicing-loop-recents:v1" });
}

/** One finished 度数 attempt gives the Bass Practice home its 続きから band (the P23-41 route). */
async function finishOneDegreeAttempt(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await page.locator("[data-testid='bass-home-card'][data-mode='degree']").click();
  const view = page.getByTestId("degree-echo-view");
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 10_000 });
  await view.getByTestId("degree-play-without-take").click();
  await expect(view).toHaveAttribute("data-stage-step", "1");
  await view.getByTestId("degree-show-answer").click();
  await expect(view).toHaveAttribute("data-practice-state", "review", { timeout: 10_000 });
  await view.locator("[data-review-rating='good']").click();
  await view.getByTestId("degree-next").click();
  await page.locator(".bass-modebar").getByRole("button", { name: /Bass Practice/ }).click();
  await expect(page.getByTestId("bass-home-resume")).toBeVisible();
}

test("P24-02 I-1: the 続ける Enter buttons compute the same at three window sizes", async ({ page }) => {
  test.setTimeout(300_000);
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await finishOneDegreeAttempt(page);

  const seen: Partial<Record<HomeKey, Record<string, { button: Record<string, string>; key: Record<string, string> }>>> = {};

  for (const size of SIZES) {
    const label = `${size.width}x${size.height}`;
    await page.setViewportSize(size);

    await page.goto("/");
    await page.locator('[data-nav="chord-dojo"]').click();
    await expect(page.getByTestId("home-resume")).toBeVisible();
    (seen.cd ??= {})[label] = await measure(page, "cd");

    await page.goto("/");
    await page.locator('[data-nav="bass-practice"]').click();
    await expect(page.getByTestId("bass-home-resume")).toBeVisible();
    (seen.bp ??= {})[label] = await measure(page, "bp");

    await page.goto("/?p527Status=vl15-picker");
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nav="voicing-loop"]').click();
    const band = page.getByTestId("voicing-loop-resume");
    if (await band.count()) {
      (seen.vl ??= {})[label] = await measure(page, "vl");
    }
    // Without the synthetic fixture build the picker has no progression, so the band is absent there.
  }

  const measured = (["cd", "bp", "vl"] as const).filter((key) => seen[key]?.["1440x900"]);
  expect(measured).toContain("cd");
  expect(measured).toContain("bp");

  for (const size of SIZES) {
    const label = `${size.width}x${size.height}`;
    const reference = seen[measured[0]!]?.[label];
    if (!reference) continue;
    for (const key of measured) {
      const values = seen[key]?.[label];
      if (!values) continue;
      for (const property of BUTTON_PROPERTIES) {
        expect(values.button[property], `${key} ${label} button ${property}`).toBe(reference.button[property]);
      }
      for (const property of KEY_PROPERTIES) {
        expect(values.key[property], `${key} ${label} key ${property}`).toBe(reference.key[property]);
      }
    }
  }

  const sample = seen.cd!["1440x900"]!;
  // Inside the band's flex row `inline-flex` computes as `flex`, and the span as `block`.
  expect(sample.button).toMatchObject({
    display: "flex", height: "36px", "padding-top": "0px", "padding-right": "12px", "border-radius": "10px",
    "font-size": "12px", "font-weight": "500", "line-height": "16px",
  });
  expect(sample.key).toMatchObject({
    display: "block", "margin-left": "6px", "padding-left": "4px", "font-size": "10px", "font-weight": "700", "border-radius": "4px",
  });

  // The pointer changes the colour only, and never the values.
  for (const key of measured) {
    await openHome(page, key);
    const largest = `${SIZES[2].width}x${SIZES[2].height}`;
    const target = HOMES[key].button;
    await page.locator(target).hover();
    const hovered = await readStyles(page, target, ["backgroundColor", ...BUTTON_PROPERTIES]);
    expect(hovered.backgroundColor, `${key} hover colour`).not.toBe(HOMES[key].background);
    if (seen[key]?.[largest]) {
      for (const property of BUTTON_PROPERTIES) {
        expect(hovered[property], `${key} hover ${property}`).toBe(seen[key]![largest]!.button[property]);
      }
    }
  }

  async function openHome(target: Page, key: HomeKey): Promise<void> {
    if (key === "cd") {
      await target.goto("/");
      await target.locator('[data-nav="chord-dojo"]').click();
      await expect(target.getByTestId("home-resume")).toBeVisible();
      return;
    }
    if (key === "bp") {
      await target.goto("/");
      await target.locator('[data-nav="bass-practice"]').click();
      await expect(target.getByTestId("bass-home-resume")).toBeVisible();
      return;
    }
    await target.goto("/?p527Status=vl15-picker");
    await target.locator('[data-nav="voicing-loop"]').click();
    await expect(target.getByTestId("voicing-loop-resume")).toHaveCount(1);
  }

  async function measure(target: Page, key: HomeKey) {
    await expect(target.locator(HOMES[key].button)).toBeVisible();
    return {
      button: await readStyles(target, HOMES[key].button, BUTTON_PROPERTIES),
      key: await readStyles(target, `${HOMES[key].button} .lv-resume-go-key`, KEY_PROPERTIES),
    };
  }
});
