import { describe, expect, test } from "vitest";
import { compareBassNotes, extractPlayedBass } from "./analysis";
import type { MidiBassNote } from "./model";
import { JUDGE } from "../stage/useJudgedTake";

/**
 * P25 V45: the judge is checked with fixed audio — the same PCM that `phase13`'s synthetic microphone plays,
 * built here instead of recorded — so a slow machine cannot change the answer. The screen's take only has to
 * finish with a result; whether the four notes read is decided here.
 */
const PITCHES = [28, 33, 38, 28] as const;
/** The MIDI bassline practice's rule while 「オクターブを正解にする」 is on. */
const PITCH_RULE = "octave" as const;

/** `phase13`'s fixture: 2.2 s, each note from (0.1 + i × 0.5) s for 0.25 s, same envelope. */
function fixturePcm(sampleRate: number): Float32Array {
  const pcm = new Float32Array(Math.ceil(sampleRate * 2.2));
  PITCHES.forEach((pitch, index) => {
    const start = Math.round((0.1 + index * 0.5) * sampleRate);
    const len = Math.round(0.25 * sampleRate);
    for (let j = 0; j < len; j += 1) {
      pcm[start + j] = 0.25 * Math.sin(2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) * j / sampleRate)
        * Math.min(1, j / 100, (len - j) / 100);
    }
  });
  return pcm;
}

/** The e2e MIDI's target: 28・33・38・28, one beat each, half a beat long, velocity 90. */
const TARGET: readonly MidiBassNote[] = PITCHES.map((pitch, index) => ({
  pitch, startBeat: index, durationBeats: 0.5, velocity: 90 / 127,
}));

describe("P25 V45: the take's own PCM, judged without the recorder", () => {
  for (const sampleRate of [48_000, 44_100]) {
    test(`extracts the four notes at ${sampleRate} Hz`, () => {
      const played = extractPlayedBass(fixturePcm(sampleRate), sampleRate);
      expect(played.map((note) => note.pitch)).toEqual([28, 33, 38, 28]);
      played.forEach((note, index) => {
        expect(Math.abs(note.onsetMs - (100 + index * 500))).toBeLessThanOrEqual(30);
      });
    });

    test(`judges all four as correct at ${sampleRate} Hz`, () => {
      const played = extractPlayedBass(fixturePcm(sampleRate), sampleRate);
      const result = compareBassNotes(TARGET, 120, played, { ...JUDGE, pitchRule: PITCH_RULE }, 0);
      expect(result.counts).toEqual({ correct: 4, wrongPitch: 0, timing: 0, missed: 0, extra: 0, total: 4 });
      expect(result.extras).toHaveLength(0);
    });
  }
});
