import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, openApp, openBassPractice } from "./helpers/app";
import { setTakePlan, stageMicrophone } from "./helpers/bass-stage";

/**
 * Record & Compare (P5.17-02) end-to-end with Chromium's fake media device, so
 * no real microphone is needed. The feature ships on by production default — no
 * feature flag is injected here.
 *
 * P23-62: the recorder is headless now (presentation="none"); the shared practice
 * stage starts it with 「録って弾く」, mirrors its status, keeps a take with
 * 「録音を残す」 and lists the kept takes under the 入力 chip's popover. The take
 * still goes through the real WebAudio → MediaRecorder → decoding → analysis path;
 * only the microphone is replaced by the synthetic bass in `helpers/bass-stage.ts`.
 */

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["microphone"],
});

const degree = (page: Page) => page.getByTestId("degree-echo-view");

async function openDegree(page: Page) {
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await expect(page.getByTestId("bass-practice-home")).toBeVisible();
  await openBassPractice(page, "度数");
  const view = degree(page);
  await expect(view).toBeVisible();
  return view;
}

/** 「お手本を聴く」: 度数 goes to 思い出す once the phrase has been heard. */
async function listen(page: Page, view: Locator) {
  await view.getByTestId("degree-listen").click();
  await expect(view).toHaveAttribute("data-practice-state", "recall", { timeout: 20_000 });
}

async function openAllHints(view: Locator) {
  for (let index = 0; index < 4; index += 1) {
    const next = view.locator(".bp-hint[data-state='next']");
    if (await next.count() === 0) return;
    await next.click();
  }
}

/** The お手本 notes' MIDI notes, read from 「n 音目 <degree> <name>」 once 音名と指板 is open. */
async function targetPitches(view: Locator): Promise<number[]> {
  const labels = await view.locator("[data-testid='bp-lane'] .bp-lane-row[aria-label='お手本の段'] .bp-note")
    .evaluateAll((notes) => notes.map((note) => note.getAttribute("aria-label") ?? ""));
  return labels.map((label) => midiOf(label.split(" ").at(-1) ?? ""));
}

/** C3 → 48 (the lane spells ♭/♯). */
function midiOf(name: string): number {
  const match = /^([A-G])([♭♯]?)(-?\d+)$/.exec(name);
  if (!match) throw new Error(`cannot read the note ${name}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "♭" ? -1 : match[2] === "♯" ? 1 : 0;
  return 12 * (Number(match[3]) + 1) + (base[match[1]!] ?? 0) + accidental;
}

async function bpmOf(view: Locator): Promise<number> {
  const meta = await view.locator(".bp-meta").textContent();
  return Number(/(\d+) BPM/.exec(meta ?? "")?.[1] ?? "84");
}

/** One judged take: the stage records, judges, and shows 段 3. */
async function recordTake(page: Page, view: Locator, plan: readonly { readonly pitch: number; readonly beat: number }[]) {
  await setTakePlan(page, plan, await bpmOf(view));
  await view.getByTestId("degree-record").click();
  await expect(view).toHaveAttribute("data-stage-step", "1", { timeout: 10_000 });
  await expect(view).toHaveAttribute("data-stage-step", "2", { timeout: 40_000 });
}

/** 「録音を残す」 → the recorder reports saved. */
async function keepTake(view: Locator) {
  const keep = view.getByTestId("degree-keep-take");
  await expect(keep).toBeVisible();
  await keep.click();
  await expect(keep).toHaveText("残しました");
  await expect(keep).toBeDisabled();
}

/** The 入力 chip (top band) opens the recording channel and the takes kept on this PC. */
async function openInputChip(page: Page) {
  await page.getByTestId("bass-input-chip").click();
  const dialog = page.getByRole("dialog", { name: "録音の入力" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("record, listen back and keep a take with a fake input device", async ({ page }) => {
  test.setTimeout(60_000);
  await stageMicrophone(page);
  const view = await openDegree(page);
  await listen(page, view);
  await openAllHints(view);
  const pitches = await targetPitches(view);
  expect(pitches.length).toBeGreaterThanOrEqual(3);
  // One wrong note (the third, two semitones up): the take really reached the judge, and the comparison says so.
  await recordTake(page, view, pitches.map((pitch, index) => ({ pitch: index === 2 ? pitch + 2 : pitch, beat: index })));

  await expect(view.locator("[data-testid='bp-result-big']")).toContainText(`3 / ${pitches.length}`);
  await expect(view.locator("[data-testid='bp-result-facts']")).toContainText("音が違う 1");

  // 聴き比べ: the take kept on this PC plays back and ends by itself.
  const hearTake = view.getByRole("button", { name: "▶ 自分" });
  await hearTake.click();
  await expect(hearTake).toHaveAttribute("aria-pressed", "true");
  await expect(hearTake).toHaveAttribute("aria-pressed", "false", { timeout: 15_000 });

  await keepTake(view);
  // The recorder's own status (previously data-record-state="saved") is the stage's 「残しました」.
  const saved = await openInputChip(page);
  await expect(saved.getByTestId("retained-take").first()).toContainText("度数");
});

test("a kept take persists across reload and can be deleted from History", async ({ page }) => {
  test.setTimeout(60_000);
  await stageMicrophone(page);
  const view = await openDegree(page);
  await listen(page, view);
  // Any audible notes will do here: this test is about the take being kept, not about its score.
  await recordTake(page, view, [{ pitch: 40, beat: 0 }, { pitch: 43, beat: 2 }]);
  await expect(view.locator("[data-testid='bp-result-big'] b")).toHaveText(/^\d+ \/ \d+$/);
  await keepTake(view);

  // Reload — IndexedDB persists the kept take across restart.
  await page.reload();
  await openDegree(page);
  const dialog = await openInputChip(page);
  await expect(dialog.getByTestId("retained-takes")).toBeVisible();
  const take = dialog.getByTestId("retained-take").first();
  await expect(take).toBeVisible();
  await expect(take).toContainText("度数");

  await take.getByTestId("retained-take-delete").click();
  await take.getByTestId("retained-take-confirm-delete").click();
  await expect(dialog.getByTestId("retained-take")).toHaveCount(0);
});

test("Record & Compare has no serious accessibility violations", async ({ page }) => {
  test.setTimeout(60_000);
  await stageMicrophone(page);
  const view = await openDegree(page);
  await listen(page, view);
  // 段 3 with the take's playback and 「録音を残す」 — the recording controls the old panel used to draw.
  await recordTake(page, view, [{ pitch: 40, beat: 0 }, { pitch: 43, beat: 2 }]);
  const results = await new AxeBuilder({ page: page as never })
    .include('[data-testid="degree-echo-view"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("Record & Compare stays usable at 320px width", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 812 });
  const view = await openDegree(page);
  await listen(page, view);
  await expect(view.getByTestId("degree-record")).toBeEnabled();
  await assertNoHorizontalOverflow(page);
  // The input channel and the kept takes stay reachable in the 入力 chip at 320px.
  await openInputChip(page);
  await assertNoHorizontalOverflow(page);
});
