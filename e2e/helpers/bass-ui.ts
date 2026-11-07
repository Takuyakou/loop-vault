import { writeMidi, type MidiEvent } from "midi-file";
import { expect, type Page } from "@playwright/test";
import { openApp } from "./app";

/** Public synthetic notes only; no private MIDI or production library access. */
export async function openSyntheticBass(page: Page, accompaniment = true, songs = 1) {
  await page.addInitScript(({ accompaniment, songs }) => {
    const makeSong = (i: number) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      title: i ? "合成ベース B" : "合成ベース A", favorite: false,
      createdAt: "2026-10-09T00:00:00.000Z", bpm: 120,
      meter: { numerator: 4, denominator: 4 }, lengthBeats: 32, transposeOctaves: 0,
      bass: [28, 33, 38, 28].map((pitch, startBeat) => ({ pitch, startBeat, durationBeats: .5, velocity: .7 }))
        .concat(Array.from({ length: 24 }, (_, j) => ({ pitch: 34, startBeat: 8 + j, durationBeats: .5, velocity: .7 }))),
      accompaniment: accompaniment ? [{ trackLabel: "合成伴奏", notes: [{ pitch: 60, startBeat: 0, durationBeats: 32, velocity: .5 }] }] : [],
      chordLabels: accompaniment ? [{ startBeat: 0, label: "C" }, { startBeat: 4, label: "Am" }] : [],
      importFacts: { trackCount: 2, mergedSimultaneousNotes: 0, tempoChanges: 0 }, attempts: [],
    });
    localStorage.setItem("loop-vault:bass-midi-library-v1:data", JSON.stringify({
      app: "loopvault-bass-midi-library", fileVersion: 1, revision: 1, version: 1,
      songs: Array.from({ length: songs }, (_, i) => makeSong(i)),
      settings: { timingToleranceMs: 70, octaveCountsAsCorrect: true, autoLatencyCorrection: true, defaultWindowBars: 2, defaultTempoPercent: 100 },
    }));
  }, { accompaniment, songs });
  await openApp(page);
  await page.locator('[data-nav="bass-practice"]').click();
  await page.getByRole("tab", { name: "MIDI のベースライン", exact: true }).click();
  if (songs) await page.getByRole("button", { name: "合成ベース A", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}

/** Uses real WebAudio -> MediaRecorder -> decoding -> analysis, with a synthetic microphone. */
export async function syntheticMicrophone(page: Page, mistakes = false, failFirst = false) {
  await page.addInitScript(({mistakes,failFirst}) => {
    const diagnostic = globalThis as typeof globalThis & { bassSyntheticRequests: number };
    diagnostic.bassSyntheticRequests = 0;
    localStorage.setItem("loop-vault:bass-practice-record-channel:v1", "left");
    let attack = () => {};
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      diagnostic.bassSyntheticRequests++;
      if(failFirst && diagnostic.bassSyntheticRequests === 1) throw new DOMException("Synthetic permission refusal", "NotAllowedError");
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      attack = () => {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 4.2), context.sampleRate);
        const pcm = buffer.getChannelData(0);
        const events = mistakes ? [[28, .1], [34, .6], [28, 1.6], [36, 2.6]] : [[28, .1], [33, .6], [38, 1.1], [28, 1.6]];
        for (const [pitch, time] of events) {
          const start = Math.round(time * context.sampleRate), length = Math.round(.25 * context.sampleRate);
          for (let j = 0; j < length; j++) pcm[start + j] = .25 * Math.sin(2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) * j / context.sampleRate) * Math.min(1, j / 100, (length - j) / 100);
        }
        const source = context.createBufferSource(); source.buffer = buffer;
        source.connect(destination); source.start();
      };
      await context.resume();
      return destination.stream;
    } });
    const NativeRecorder = MediaRecorder;
    globalThis.MediaRecorder = class extends NativeRecorder { override start(timeslice?: number) { super.start(timeslice); attack(); } };
  }, {mistakes,failFirst});
}

export async function recordSyntheticBass(page: Page) {
  await page.getByTestId("midi-bass-practice").getByRole("button", { name: "● 録って弾く（R）", exact: true }).click();
  await expect(page.getByTestId("midi-bass-result")).toBeVisible({ timeout: 15000 });
}

/** Multi-track public fixture for import controls, including a drum negative control. */
export function syntheticBassMidi() {
  const track = (label: string, pitches: number[], channel: number, program: number): MidiEvent[] => [
    { deltaTime: 0, type: "trackName", text: label }, { deltaTime: 0, type: "programChange", channel, programNumber: program },
    ...pitches.map(noteNumber => ({ deltaTime: 0, type: "noteOn" as const, channel, noteNumber, velocity: 90 })),
    ...pitches.map((noteNumber, i) => ({ deltaTime: i ? 0 : 15360, type: "noteOff" as const, channel, noteNumber, velocity: 0 })),
    { deltaTime: 0, type: "endOfTrack" },
  ];
  return Buffer.from(writeMidi({ header: { format: 1, numTracks: 4, ticksPerBeat: 480 }, tracks: [
    [{ deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 }, { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 }, { deltaTime: 0, type: "endOfTrack" }],
    track("Synthetic Bass", [28], 0, 32), track("Synthetic Harmony", [60,64,67], 1, 0), track("Synthetic Drums", [36], 9, 0),
  ] }));
}
