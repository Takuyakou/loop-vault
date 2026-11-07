import { expect, test, type Page } from "@playwright/test";

/**
 * The preview audio is recorded as it leaves the browser (an audio worklet sees every sample in order; the bench is
 * `src/testing/previewFadeLab.ts`, present only in the e2e build) while a chord sounds and the next one is started half a second
 * in. What is looked at is the jump between neighbouring samples around the moment of the stop: a sound cut off in the middle of
 * its wave jumps by the value the wave had at that instant; a sound faded out over 15 ms does not.
 *
 * Measured before the fix (12 stops, each moved by 7 ms; the median of the biggest jump of each run):
 *   piano 0.0716 (worst 0.158), electric piano 0.0065 (worst 0.022). The sound's own steepest step is 0.019 for the piano, 0.005 for the electric piano.
 */
const BEFORE_THE_FIX = { piano: 0.0716, "electric-piano": 0.0065 } as const;

interface Click { medianStepAtStop: number; maxStepAtStop: number; steps: number[]; whileSounding: number[]; peakAfterStop: number; peakWhileSounding: number }
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

const lab = (page: Page, sound: string, scenario: string, trials: number) =>
  page.evaluate(([s, sc, n]) => (window as unknown as { __previewFadeLab: { click: (s: string, sc: string, n: number) => Promise<Click> } }).__previewFadeLab.click(s as string, sc as string, n as number), [sound, scenario, trials] as const);

test.describe("preview audio: stopping does not click", () => {
  test.setTimeout(180_000);
  test("Piano shares eight decoded samples across fresh note previews without changing audible fade behaviour", async ({ page }) => {
    await page.addInitScript(() => {
      const state = window as unknown as { __pianoDecodes: number; __pianoDecodeSizes: number[] };
      state.__pianoDecodes = 0;
      state.__pianoDecodeSizes = [];
      const original = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function (...args: Parameters<typeof original>) {
        // standardized-audio-context's testPromiseSupport decodes this exact
        // one-sample empty WAV once. It is not a Piano asset decode.
        const probeWords = [1179011410, 40, 1163280727, 544501094, 16, 131073, 44100, 176400, 1048580, 1635017060, 4, 0];
        const isProbe = args[0].byteLength === 48
          && new Uint32Array(args[0]).every((word, i) => word === probeWords[i]);
        if (!isProbe) {
          state.__pianoDecodes += 1;
          state.__pianoDecodeSizes.push(args[0].byteLength);
        }
        return original.apply(this, args);
      };
    });
    await page.goto("/?previewfade=1&p12=midi");
    await page.waitForFunction(() => Boolean((window as unknown as { __previewFadeLab?: unknown }).__previewFadeLab));
    for (let run = 0; run < 2; run += 1) {
      const result = await lab(page, "piano", "next-chord", 2);
      expect(result.peakWhileSounding).toBeGreaterThan(0.05);
      expect(result.peakAfterStop).toBeLessThan(0.01);
      const observed = await page.evaluate(() => {
        const state = window as unknown as { __pianoDecodes: number; __pianoDecodeSizes: number[] };
        return { count: state.__pianoDecodes, sizes: state.__pianoDecodeSizes };
      });
      expect(observed.count, JSON.stringify(observed)).toBe(8);
    }
  });
  for (const sound of ["piano", "electric-piano"] as const) {
    test(`${sound}: a chord is sounding and the next one is started: the cut is no steeper than the sound itself`, async ({ page }) => {
      await page.goto("/?previewfade=1&p12=midi");
      await page.waitForFunction(() => Boolean((window as unknown as { __previewFadeLab?: unknown }).__previewFadeLab));
      const result = await lab(page, sound, "next-chord", 8);
      const natural = median(result.whileSounding);
      console.log(`PREVIEW-FADE ${sound} next-chord: median step at stop ${result.medianStepAtStop.toFixed(4)} (before the fix ${BEFORE_THE_FIX[sound]}), worst ${result.maxStepAtStop.toFixed(4)}, the sound's own step ${natural.toFixed(4)}`);
      // the old instrument is quiet after the fade and the chord was really sounding
      expect(result.peakWhileSounding).toBeGreaterThan(0.05);
      expect(result.peakAfterStop).toBeLessThan(0.01);
      // no jump beyond the steepness of the sound itself
      expect(result.medianStepAtStop).toBeLessThanOrEqual(natural);
      // and, for the piano (whose cut was big), clearly smaller than what it was before the fix. The electric piano's cut was small to begin
      // with (0.0065), so the first check is the one that tells the old behaviour from the new: with the old code it is 0.0096 against 0.005.
      if (sound === "piano") expect(result.medianStepAtStop).toBeLessThanOrEqual(0.25 * BEFORE_THE_FIX[sound]);
    });
  }
});
