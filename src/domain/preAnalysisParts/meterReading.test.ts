import { writeMidi, type MidiEvent } from "midi-file";
import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../midi/analysis";
import { createAnalysisSession } from "../midi/preAnalysis";
import { isUnusualMeter } from "./meterReading";
import { buildSplitAnalysisRequest } from "./splitSession";

/**
 * A file that says 1/4 is analysed exactly as it is written (P15-03: the meter is never rewritten).
 * The reference is what master does: the file's own bytes, no options.
 */
const CHORDS = [
  [48, 55, 60, 64, 71],
  [45, 52, 60, 64, 67],
  [50, 57, 60, 65, 69],
  [43, 50, 59, 62, 65],
];

function midi(meter: { numerator: number; denominator: number }, options: { bars?: number; varied?: boolean } = {}) {
  const bars = options.bars ?? 8;
  const ev: Array<{ at: number; e: MidiEvent }> = [];
  const add = (pitch: number, start: number, dur: number, vel: number) => {
    ev.push({ at: Math.round(start * 480), e: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: pitch, velocity: vel } });
    ev.push({ at: Math.round((start + dur) * 480) - 1, e: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: pitch, velocity: 0 } });
  };
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = CHORDS[bar % CHORDS.length]!;
    for (const pitch of chord) add(pitch, bar * 4, options.varied ? 3 : 4, 70 + (bar % 3) * 10);
  }
  ev.sort((a, b) => a.at - b.at);
  let last = 0;
  const track: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: meter.numerator, denominator: meter.denominator, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  for (const { at, e } of ev) { track.push({ ...e, deltaTime: at - last } as MidiEvent); last = at; }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track] }));
}

function summary(result: ReturnType<typeof analyzeMidi>) {
  return {
    totalBars: result.totalBars,
    timeSignature: result.timeSignature,
    bpm: result.bpm,
    timeline: result.fullTimeline.map((item) => ({
      bar: item.bar,
      beat: item.beat,
      durationBeats: item.durationBeats,
      chord: item.chord.label,
    })),
  };
}

describe("meter", () => {
  it("knows an unusual meter", () => {
    expect(isUnusualMeter(1, 4)).toBe(true);
    expect(isUnusualMeter(13, 4)).toBe(true);
    expect(isUnusualMeter(4, 4)).toBe(false);
    expect(isUnusualMeter(6, 8)).toBe(false);
    expect(isUnusualMeter(3, 3)).toBe(true);
  });

  for (const varied of [false, true]) {
    it(`an untouched 1/4 file is analysed exactly as master does: its own bytes, no options, still 1/4 (${varied ? "varied" : "plain"})`, () => {
      const bytes = midi({ numerator: 1, denominator: 4 }, { varied });
      const odd = createAnalysisSession([{ sourceId: "odd", displayName: "odd.mid", bytes }]).session!;
      expect(odd.sources[0]!.timeSignatures[0]).toMatchObject({ numerator: 1, denominator: 4 });

      const { request } = buildSplitAnalysisRequest(odd, {});
      expect(request.backwardEquivalent).toBe(true);
      expect(request.options).toEqual({});
      expect(request.bytes).toBe(odd.sources[0]!.bytes);
      const result = analyzeMidi(request.bytes, request.options);
      expect(result.timeSignature).toBe("1/4");
      expect(summary(result)).toEqual(summary(analyzeMidi(bytes)));
    });
  }
});
