import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow } from "./helpers/app";
import { openDojo, type MidiControl } from "./helpers/p12";
import { captureReportShot } from "./helpers/reportShots";

/**
 * P23-50: the P23-49 stage on the advanced course (Lv4–8, 総合確認) and on free practice. The values are the
 * lead's (spec P23-50 §2). The basic Lv1–3 store is seeded as passed so the guide opens on Lv4.
 */
const BANK = JSON.parse(readFileSync("docs/contracts/p23-39/bank-lv1-3-v3.json", "utf8")) as {
  version: string; policyVersion: string; pairId: string;
  items: { id: string; level: number; quality: string; root: number; referenceNotes: number[] }[];
  sets: Record<string, { name: { sameDay: string[]; delay: string[] }; ear?: { items: string[] } }>;
};
const OLD = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
const AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

function completedBasicStore() {
  const trials = [];
  for (const level of [1, 2, 3]) {
    const sets = BANK.sets[String(level)]!;
    for (const [ids, block, at] of [[[...sets.name.sameDay, ...(sets.ear?.items ?? [])], "sameDay", OLD], [sets.name.delay, "delay", AT]] as const) {
      const attemptId = `basic-${level}-${block}`;
      for (const id of ids) {
        const item = BANK.items.find((entry) => entry.id === id)!;
        trials.push({
          trialId: `${attemptId}:${id}`, attemptId, block, itemId: id, level,
          quality: item.quality, root: item.root, result: "correct", sealedNotes: item.referenceNotes,
          speedMs: 1000, hintUsed: false, selfConfirmed: false, midiConfirmed: true, startedAt: at, sealedAt: at,
        });
      }
    }
  }
  return {
    app: "loopvault-guided-course", fileVersion: 1, schema: "loopvault-guided-course", version: 1,
    bankVersion: BANK.version, policyVersion: BANK.policyVersion, pairId: BANK.pairId, trials,
  };
}

function sightAttemptStore() {
  return {
    app: "loopvault-guided-course-advanced", fileVersion: 1, schema: "loopvault-guided-course-advanced", version: 1,
    bankVersion: "p23-45.advanced.v1",
    attempts: [{
      level: "capstone", block: "sameDay", setId: "sameDay", attemptId: "sight-seed", startedAt: OLD,
      mode: "midi", practice: false, itemIds: ["cap-sight-01", "cap-sight-02", "cap-sight-03"],
    }],
    active: "sight-seed",
    trials: [],
  };
}

async function openGuide(page: Page, advanced?: unknown, enter = true): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem("loop-vault:guided-course-v1:data", JSON.stringify(payload.basic));
    if (payload.advanced === null) localStorage.removeItem("loop-vault:guided-course-advanced-v1:data");
    else localStorage.setItem("loop-vault:guided-course-advanced-v1:data", JSON.stringify(payload.advanced));
  }, { basic: completedBasicStore(), advanced: advanced ?? null });
  await openDojo(page, "midi");
  await page.locator('[data-focus-key="home:guide:open"]').click();
  await expect(page.getByTestId("course-map")).toBeVisible();
  if (enter) await page.getByTestId("course-map-go").click();
  await expect(page.getByTestId("guided-course")).toBeVisible();
}

async function play(page: Page, notes: number[]): Promise<void> {
  await page.evaluate((notes) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, true), notes);
  await page.waitForTimeout(300);
  await page.evaluate((notes) => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, false), notes);
}

/** The shell's narrow layout and the stage keyboard settle a moment after the viewport change. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(300);
}

const top = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().top);
const bottom = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().bottom);

test("Lv4: the demo and the question are a stage; the verdict and its reason sit under the chord", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGuide(page);
  await expect(page.getByTestId("advanced-demo")).toBeVisible();
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "demo");
  // Rule 4: the MIDI state is only in the app's top bar.
  await expect(page.locator(".gc-head .gc-midi")).toHaveCount(0);
  await expect(page.locator(".gc-head").getByRole("button", { name: "MIDI 設定" })).toHaveCount(0);
  await captureReportShot(page, "p23-50-assets/lv4-demo-1440.png");

  await page.getByTestId("advanced-demo-skip").click();
  await page.getByTestId("advanced-start").click();
  await expect(page.getByTestId("advanced-prompt-name")).toBeVisible();
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "question");
  await expect(page.locator(".gc-card-top").getByTestId("advanced-feedback-text")).toBeVisible();
  await expect(page.locator(".gc-keyboard-body")).toHaveAttribute("data-stage-height", "176");
  const keysBefore = await top(page, ".gc-keyboard-body");
  await captureReportShot(page, "p23-50-assets/lv4-question-1440.png");

  // C♯·D·E♭ together is no Lv4 chord.
  await play(page, [61, 62, 63]);
  await expect(page.getByTestId("advanced-feedback-text")).toHaveAttribute("data-result", "wrong");
  const reason = page.locator(".gc-card-top").getByTestId("advanced-review-reason");
  await expect(reason).toBeVisible();
  await expect(reason).not.toContainText("枚目");
  expect(Math.abs((await top(page, ".gc-keyboard-body")) - keysBefore)).toBeLessThanOrEqual(1);
  await captureReportShot(page, "p23-50-assets/lv4-wrong-1440.png");

  await page.setViewportSize({ width: 768, height: 640 });
  await settle(page);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, "p23-50-assets/lv4-wrong-768.png");
});

test("Lv6: the progression cards share one height, with or without a flat", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGuide(page, undefined, false);
  await page.getByTestId("course-station-6").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("advanced-level")).toHaveText("Lv6");
  // P23-50 §2: the values were measured on the Lv6 stage, and choosing a level opens its practice panel
  // first, so start the practice to get to the stage that carries the progression cards.
  await page.getByTestId("advanced-start").click();
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "question");
  const cards = page.locator(".gc-card-top .ac-card");
  await expect(cards.first()).toBeVisible();
  const heights = await cards.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  const nameTops = await page.locator(".gc-card-top .ac-card b").evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(Math.max(...nameTops) - Math.min(...nameTops)).toBeLessThanOrEqual(1);
  await captureReportShot(page, "p23-50-assets/lv6-demo-1440.png");
});

test("総合確認: the sight chart's title is a heading, the tempo box is not an OS box, and nothing overlaps", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGuide(page, sightAttemptStore());
  await expect(page.getByTestId("advanced-sight-chart")).toBeVisible();
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "sight");
  await expect(page.getByTestId("advanced-sight-name")).toHaveCSS("font-size", "26px");
  await expect(page.getByTestId("advanced-sight-tempo")).toHaveCSS("appearance", "none");
  await expect(page.locator('[data-testid="advanced-sight-chart"] li')).toHaveCount(8);
  const bars = await page.locator('[data-testid="advanced-sight-chart"] li').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(bars).size).toBe(1);
  await captureReportShot(page, "p23-50-assets/sight-1440.png");

  for (const [width, height, name] of [[1280, 720, "sight-1280"], [768, 640, "sight-768"]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    await assertNoHorizontalOverflow(page);
    expect(await bottom(page, ".gc-head")).toBeLessThanOrEqual(await top(page, '[data-testid="guided-course"] .gc-instruction'));
    expect(await bottom(page, '[data-testid="advanced-beat"]')).toBeLessThanOrEqual(await top(page, ".gc-keyboard-head"));
    await captureReportShot(page, `p23-50-assets/${name}.png`, { fullPage: true });
  }
  await page.setViewportSize({ width: 768, height: 640 });
  const rows = await page.locator('[data-testid="advanced-sight-chart"] li').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(2);
});

test("free practice is the same stage: the verdict under the chord, no MIDI box in the header", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGuide(page, undefined, false);
  await page.getByTestId("course-station-2").click();
  await page.getByTestId("course-map-practice").click();
  await expect(page.getByTestId("course-practice")).toBeVisible();
  await expect(page.getByTestId("guided-course")).toHaveAttribute("data-stage", "question");
  await expect(page.locator(".gc-head .gc-midi")).toHaveCount(0);
  await expect(page.locator(".gc-head").getByRole("button", { name: "MIDI 設定" })).toHaveCount(0);
  await expect(page.locator(".gc-card-top").getByTestId("course-feedback-text")).toBeVisible();
  await expect(page.locator(".gc-keyboard-body")).toHaveAttribute("data-stage-height", "176");
  await captureReportShot(page, "p23-50-assets/free-lv2-1440.png");
  await page.setViewportSize({ width: 768, height: 640 });
  await settle(page);
  await assertNoHorizontalOverflow(page);
  await captureReportShot(page, "p23-50-assets/free-lv2-768.png");
});
