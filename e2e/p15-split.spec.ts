import { writeMidi, type MidiEvent } from "midi-file";
import { expect, test } from "@playwright/test";
import { analyzeCurrentMidi, dropMidi, openApp, openCapture } from "./helpers/app";

/**
 * P15-02 「このパートを線で分ける」 through the product: chords and a melody far above them in one
 * track; the line is drawn, the analysis leaves the notes above it out, and the correction workspace
 * shows them again as unused melody.
 */
const CHORDS = [
  { lh: [48, 55], rh: [64, 71], top: [86, 89, 93, 89] },
  { lh: [45, 52], rh: [60, 67], top: [83, 86, 89, 86] },
  { lh: [50, 57], rh: [65, 72], top: [88, 91, 95, 91] },
  { lh: [43, 50], rh: [59, 65], top: [81, 84, 88, 84] },
];

function song(): Uint8Array {
  const events: Array<{ at: number; e: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number, vel: number) => {
    events.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: vel } });
    events.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < 8; bar += 1) {
    const chord = CHORDS[bar % 4]!;
    for (const pitch of [...chord.lh, ...chord.rh]) add(pitch, bar * 4, 4, 70);
    chord.top.forEach((pitch, index) => add(pitch, bar * 4 + index, 1, 100 + index));
  }
  events.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  for (const { at, e } of events) {
    track.push({ ...e, deltaTime: at - last } as MidiEvent);
    last = at;
  }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
}

test("線を引いて解析すると、線より上の音が「使わない」メロディとして修正作業場に出る", async ({ page }) => {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, song(), "chords-and-melody.mid");
  await expect(page.getByTestId("pre-analysis-workspace")).toBeVisible();

  await page.getByTestId("pre-analysis-split-start").click();
  await expect(page.getByTestId("pre-analysis-split-pitch")).toHaveText("A5");
  await expect(page.getByTestId("pre-analysis-split-none")).toHaveCount(0);
  await expect(page.getByTestId("pre-analysis-summary")).toContainText("解析には使わない");

  await analyzeCurrentMidi(page);
  await expect(page.getByTestId("capture-analysis-preset-summary")).toContainText("線で分けたパートあり");
  // The notes above the line are back, as unused melody notes.
  await expect.poll(() => page.locator('.lv-cw-note[data-kind="melody"]').count()).toBeGreaterThan(0);
  // …and the chords are the chords of the song, not the melody's tensions.
  await expect(page.getByTestId("correction-workspace")).toContainText("Cmaj7");
});

test("線を引かなければ、これまでと同じ（線の道具は出ているだけ）", async ({ page }) => {
  await openApp(page);
  await openCapture(page);
  await dropMidi(page, song(), "no-line.mid");
  await expect(page.getByTestId("pre-analysis-split-start")).toBeVisible();
  await analyzeCurrentMidi(page);
  await expect(page.getByTestId("capture-analysis-preset-summary")).not.toContainText("線で分けたパートあり");
  await expect(page.locator('.lv-cw-note[data-kind="melody"]')).toHaveCount(0);
});
