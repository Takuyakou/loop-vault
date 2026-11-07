import { expect, test, type Page } from "@playwright/test";
import { writeMidi, type MidiEvent } from "midi-file";
import { loadMidiForPreAnalysis, openApp } from "./helpers/app";
import { createMidiFixture } from "./helpers/midiFixture";

/**
 * P15-01 取り込み前の確認: one screen at every window size the app can have
 * (768×640 is the smallest window; 2560×1440 is a full screen).
 */
const SIZES = [
  { width: 768, height: 640 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;

async function metrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content")!;
    const root = document.documentElement;
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const analyze = rect("[data-testid='pre-analysis-analyze']")!;
    const area = rect(".lv-pa-roll-area")!;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='pre-analysis-piano-roll']")!;
    const canvasRect = canvas.getBoundingClientRect();
    const part = document.querySelector<HTMLElement>(".lv-pa-part");
    return {
      mainOverflowY: main.scrollHeight - main.clientHeight,
      mainOverflowX: main.scrollWidth - main.clientWidth,
      pageOverflowY: root.scrollHeight - window.innerHeight,
      pageOverflowX: root.scrollWidth - window.innerWidth,
      analyzeBottom: analyze.bottom,
      analyzeRight: analyze.right,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      areaBottom: area.bottom,
      canvasBottom: canvasRect.bottom,
      areaHeight: area.height,
      rowHeight: Number(canvas.dataset.rowHeight),
      partNameWrapped: part
        ? [...part.querySelectorAll<HTMLElement>(".lv-pa-pname")].some((element) => element.scrollHeight > element.clientHeight + 1)
        : false,
      bottomVisible: analyze.top >= 0 && analyze.bottom <= window.innerHeight,
    };
  });
}

for (const size of SIZES) {
  test(`取り込み前の確認は ${size.width}×${size.height} で、スクロールせずに「解析する」が見える`, async ({ page }) => {
    await page.setViewportSize(size);
    await openApp(page);
    await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 3 }), "size-check.mid");
    await expect(page.getByTestId("pre-analysis-analyze")).toBeVisible();
    await page.waitForTimeout(250); // the roll is redrawn after the measure

    const m = await metrics(page);
    expect(m.bottomVisible).toBe(true);
    expect(m.analyzeRight).toBeLessThanOrEqual(m.innerWidth);
    expect(m.mainOverflowY).toBeLessThanOrEqual(1);
    expect(m.mainOverflowX).toBeLessThanOrEqual(1);
    expect(m.pageOverflowY).toBeLessThanOrEqual(1);
    expect(m.pageOverflowX).toBeLessThanOrEqual(1);
    // The roll fills its area: nothing is left empty under it.
    expect(m.areaBottom - m.canvasBottom).toBeLessThanOrEqual(m.rowHeight);
    expect(m.rowHeight).toBeGreaterThanOrEqual(6);
    expect(m.rowHeight).toBeLessThanOrEqual(16);
    expect(m.partNameWrapped).toBe(false);
  });
}

test("窓の高さを変えると、ロールの1段の高さがその場で変わる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 3 }), "resize.mid");
  const roll = page.getByTestId("pre-analysis-piano-roll");
  await page.waitForTimeout(250);
  const small = Number(await roll.getAttribute("data-row-height"));

  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect.poll(async () => Number(await roll.getAttribute("data-row-height"))).toBeGreaterThan(small);
  const tall = Number(await roll.getAttribute("data-row-height"));
  expect(tall).toBeLessThanOrEqual(16);
  expect(small).toBeGreaterThanOrEqual(6);
});

test("パートが12あっても、スクロールするのはパート一覧だけで、下の帯は見えたまま", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 12 }), "twelve.mid");
  await expect(page.locator("[data-voice-id]")).toHaveCount(12);
  await page.waitForTimeout(250);

  const m = await metrics(page);
  expect(m.bottomVisible).toBe(true);
  expect(m.mainOverflowY).toBeLessThanOrEqual(1);
  const list = await page.getByTestId("pre-analysis-part-list").evaluate((element) => ({
    scrolls: element.scrollHeight > element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(list.scrolls).toBe(true);
  expect(list.overflowY).toBe("auto");
});

test("役割の色: コード・ベース・メロディ・使わないが、凡例と要約の帯に出る", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 4 }), "colors.mid");
  const summary = page.getByTestId("pre-analysis-summary");
  await expect(summary).toContainText("コード:");
  await expect(summary).toContainText("使わない:");
  await expect(page.locator(".lv-pa-legend")).toContainText("メロディ");
});

/** One chord part, one file; `program` and the meter are what the tests below change. */
function singlePartMidi(options: { numerator: number; denominator: number; program: number; pitches?: readonly number[] }): Uint8Array {
  const pitches = options.pitches ?? [60, 64, 67];
  const events: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: options.numerator, denominator: options.denominator, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: options.program },
  ];
  for (let bar = 0; bar < 8; bar += 1) {
    for (const pitch of pitches) events.push({ deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: 90 });
    pitches.forEach((pitch, index) => events.push({
      deltaTime: index === 0 ? 1920 : 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0,
    }));
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [events] }));
}

test("P15-03: 拍子が 1/4 と書かれていれば、帯に情報として出る（拍子は書き換えない）", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, singlePartMidi({ numerator: 1, denominator: 4, program: 40 }), "odd-meter.mid");
  const band = page.getByTestId("pre-analysis-notices");
  await expect(band).toContainText("拍子が 1/4 と書かれています。解析は書かれた拍子のまま行います");
  await expect(band).not.toContainText("4/4 として読む");
  await expect(band.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".lv-pa-file-meta")).toContainText("1/4");
  await expect(page.getByTestId("pre-analysis-analyze")).toBeEnabled();
});
test("P15-03: 単純な MIDI は、パート一覧を1行にたたんで「解析する」を大きく見せる", async ({ page }) => {
  await openApp(page);
  await loadMidiForPreAnalysis(page, singlePartMidi({ numerator: 4, denominator: 4, program: 88 }), "simple.mid");
  const folded = page.getByTestId("pre-analysis-collapsed");
  await expect(folded).toContainText("1パートをコードとして解析します");
  await expect(page.locator("[data-voice-id]").first()).toBeHidden();
  await expect(page.getByTestId("pre-analysis-piano-roll")).toBeVisible();
  await expect(page.getByTestId("pre-analysis-analyze")).toBeVisible();

  await folded.getByRole("button", { name: /パートを確認する/ }).click();
  await expect(page.locator("[data-voice-id]").first()).toBeVisible();
});

test("P15-03: 前回と同じ並びの MIDI には「前回の設定を使う」が出て、押すまで何も変わらず、元に戻せる", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    localStorage.setItem("loopvault.preAnalysisMemory", JSON.stringify({
      version: 1,
      entries: [{
        signature: JSON.stringify([[0, 0, 0], [1, 33, 0], [2, 80, 0]]),
        contribution: "standard",
        parts: [
          { role: "exclude", included: false, line: false },
          { role: "bass", included: true, line: false },
          { role: "melody-weak", included: true, line: false },
        ],
      }],
    }));
  });
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 3 }), "again.mid");
  const parts = page.locator("[data-voice-id]");
  await expect(page.getByTestId("pre-analysis-offer-memory")).toBeVisible();
  const before = await parts.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.role));

  // Nothing has changed yet.
  await page.getByTestId("pre-analysis-offer-memory").click();
  await expect(page.getByTestId("pre-analysis-memory-applied")).toContainText("前回の役割を使いました");
  const applied = await parts.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.role));
  expect(applied).toEqual(["off", "bass", "melody"]);
  expect(applied).not.toEqual(before);

  await page.getByTestId("pre-analysis-memory-undo").click();
  await expect(page.getByTestId("pre-analysis-memory-applied")).toHaveCount(0);
  const restored = await parts.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.role));
  expect(restored).toEqual(before);
});

test("P15-04: 再生中は縦線が毎フレーム動き、画面もロールの下の層も描き直されず、鳴っている音が光る", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 3 }), "playback.mid");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const log: Array<{ id: string; t: number }> = [];
    (window as unknown as { __draws: typeof log }).__draws = log;
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args: [number, number, number, number]) {
      log.push({ id: (this.canvas as HTMLCanvasElement).dataset.testid ?? "", t: performance.now() });
      return original.apply(this, args);
    };
  });

  await page.getByTestId("pre-analysis-playback-toggle").click();
  const overlay = page.getByTestId("pre-analysis-roll-overlay");
  await expect(overlay).toHaveAttribute("data-sounding-count", /^[1-9]/, { timeout: 5000 });
  await expect(page.getByTestId("pre-analysis-sounding")).toContainText("鳴っている音");
  await page.evaluate(() => { (window as unknown as { __draws: unknown[] }).__draws.length = 0; });
  await page.waitForTimeout(1500);

  const stats = await page.evaluate(() => {
    const log = (window as unknown as { __draws: Array<{ id: string; t: number }> }).__draws;
    const upper = log.filter((entry) => entry.id === "pre-analysis-roll-overlay").map((entry) => entry.t);
    const lower = log.filter((entry) => entry.id === "pre-analysis-piano-roll").length;
    let maxGap = 0;
    for (let index = 1; index < upper.length; index += 1) maxGap = Math.max(maxGap, upper[index]! - upper[index - 1]!);
    return { upper: upper.length, lower, maxGap };
  });
  // About 60 frames a second on the upper layer (the old loop was 20 a second), and the lower layer is left alone.
  expect(stats.upper).toBeGreaterThanOrEqual(60);
  expect(stats.maxGap).toBeLessThan(100);
  expect(stats.lower).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "p89-generated/P15-04-playing.png" });

  await page.getByTestId("pre-analysis-playback-toggle").click();
  await expect(overlay).toHaveAttribute("data-sounding-count", "0");
  await expect(page.getByTestId("pre-analysis-sounding")).toHaveText("");
  // The line stays where it stopped.
  expect(Number(await page.getByTestId("pre-analysis-piano-roll").getAttribute("data-playhead-beat"))).toBeGreaterThan(0);
});

test("P15-04: 再生中は色の凡例の場所に「鳴っている音」が出て（1440×900 で6音の和音が省略されない）、停止で凡例に戻る", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await loadMidiForPreAnalysis(
    page,
    singlePartMidi({ numerator: 4, denominator: 4, program: 88, pitches: [48, 52, 55, 59, 62, 65] }),
    "six-notes.mid",
  );
  await page.waitForTimeout(300);
  const legend = page.locator(".lv-pa-legend");
  const names = page.getByTestId("pre-analysis-sounding");
  await expect(legend).toBeVisible();
  const heightBefore = await page.locator(".lv-pa-transport").evaluate((element) => element.getBoundingClientRect().height);

  await page.getByTestId("pre-analysis-playback-toggle").click();
  await expect(names).toHaveText("鳴っている音 C3 E3 G3 B3 D4 F4", { timeout: 5000 });
  await expect(legend).toBeHidden();
  // Not cut short, and the row has not grown.
  const fit = await names.evaluate((element) => ({ cut: element.scrollWidth > element.clientWidth }));
  expect(fit.cut).toBe(false);
  expect(await page.locator(".lv-pa-transport").evaluate((element) => element.getBoundingClientRect().height)).toBe(heightBefore);
  await page.screenshot({ path: "p89-generated/P15-04-six-notes.png" });

  await page.getByTestId("pre-analysis-playback-toggle").click();
  await expect(legend).toBeVisible();
  await expect(names).toHaveText("");
});
