// P15 evidence screenshots (git-ignored output): 取り込み前の確認 at the five window sizes of mock/sizes.
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeMidi, type MidiEvent } from "midi-file";
import { loadMidiForPreAnalysis, openApp } from "../../e2e/helpers/app";
import { createMidiFixture } from "../../e2e/helpers/midiFixture";

const SIZES = [[768, 640], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]] as const;

test("P15 evidence", async ({ page }) => {
  const out = resolve("p89-generated", process.env.P89_SCREENS_NAME!);
  mkdirSync(out, { recursive: true });
  const audits: { file: string; overflowX: number; overflowY: number }[] = [];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await openApp(page);
    await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 4 }), "song_idea.mid");
    await expect(page.getByTestId("pre-analysis-analyze")).toBeVisible();
    await page.waitForTimeout(400);
    const file = `import-check-${width}x${height}.png`;
    const overflow = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>("#main-content")!;
      return { x: main.scrollWidth - main.clientWidth, y: main.scrollHeight - main.clientHeight };
    });
    audits.push({ file, overflowX: overflow.x, overflowY: overflow.y });
    await page.screenshot({ path: resolve(out, file) });
  }
  // The same screen with 「アプリに任せる」 and the settings panel open.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await loadMidiForPreAnalysis(page, createMidiFixture({ voiceCount: 4 }), "song_idea.mid");
  await page.locator("[data-analysis-contribution-preset='harmonic-core']").click();
  await page.getByRole("button", { name: /詳しい設定/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, "import-check-harmonic-core-advanced-1440x900.png") });
  // P15-03: the notices band (an unusual meter), the folded view of a simple MIDI, and 「前回と同じ設定」.
  const single = (numerator: number, program: number) => {
    const events: MidiEvent[] = [
      { deltaTime: 0, meta: true, type: "timeSignature", numerator, denominator: 4, metronome: 24, thirtyseconds: 8 },
      { deltaTime: 0, type: "programChange", channel: 0, programNumber: program },
    ];
    for (let bar = 0; bar < 8; bar += 1) {
      for (const pitch of [60, 64, 67]) events.push({ deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: 90 });
      [60, 64, 67].forEach((pitch, index) => events.push({ deltaTime: index === 0 ? 1920 : 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 }));
    }
    events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    return Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [events] }));
  };
  await openApp(page);
  await loadMidiForPreAnalysis(page, single(1, 88), "odd-meter.mid");
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, "import-check-notice-meter-1440x900.png") });
  await openApp(page);
  await loadMidiForPreAnalysis(page, single(4, 88), "simple.mid");
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, "import-check-collapsed-1440x900.png") });
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
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, "import-check-memory-offer-1440x900.png") });
  await page.getByTestId("pre-analysis-offer-memory").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, "import-check-memory-applied-1440x900.png") });
  writeFileSync(resolve(out, "manifest.json"), JSON.stringify({ synthetic: true, audits }, null, 2));
});
