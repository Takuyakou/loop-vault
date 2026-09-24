import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { SavedProgressionBlock } from "../types";
import { normalizedChordKey } from "../voicing";
import { buildProgressionPracticeClockSchedule } from "./clock";
import { buildProgressionVoicingPracticeSnapshot } from "./snapshot";

const chord = parseChordLabel("Cmaj7")!;
function block(meter: number, beats: number): SavedProgressionBlock {
  return {
    id: "public-block", summaryText: "Public synthetic", bpm: 120,
    timeSignature: `${meter}/4`, tags: [], capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "p8-public",
    chords: Array.from({ length: beats }, (_, index) => ({
      bar: Math.floor(index / meter) + 1, beat: index % meter + 1,
      durationBeats: 1, chord, confidence: 1, alternatives: [], warnings: [],
      voicingMemory: { playbackChoice: "SOURCE" as const, sourceVoicing: {
        schemaVersion: 1 as const, source: "midi-extracted" as const,
        representation: "simultaneous-voicing" as const,
        midiNotes: [48, 55, 59, 64], capturedForChordKey: normalizedChordKey(chord),
        confidence: 0.1,
      } },
    })),
  };
}
function snapshot(meter: number, beats: number) {
  const source = block(meter, beats);
  const result = buildProgressionVoicingPracticeSnapshot({
    sourceReference: { ideaId: "public-idea", blockId: source.id },
    block: source, selection: "source-midi",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.snapshot;
}
describe("P8.2 meter-neutral Voicing Loop", () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))("preserves %s/4 source meter and absolute event timing", (meter) => {
    const value = snapshot(meter, 8);
    expect(value.meter).toEqual({ numerator: meter, denominator: 4 });
    expect(value.practiceGroupBeats).toBe(4);
    expect(value.events.map(event => event.startBeat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(value.events.every(event => event.voicing?.midiNotes.join() === "48,55,59,64")).toBe(true);
    expect(buildProgressionPracticeClockSchedule(value, 1).countInBeats).toBe(4);
  });
  it("rejects unsupported meter while keeping source meter separate from practice grouping", () => {
    const unsupported = block(13, 1);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "public-idea", blockId: unsupported.id },
      block: unsupported, selection: "source-midi",
    })).toMatchObject({ ok: false, error: { code: "unsupported-meter" } });
    const compound = block(6, 1);
    compound.timeSignature = "6/8";
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "public-idea", blockId: compound.id },
      block: compound, selection: "source-midi",
    })).toMatchObject({ ok: false, error: { code: "unsupported-meter" } });
    expect(snapshot(1, 8)).toMatchObject({
      meter: { numerator: 1, denominator: 4 },
      practiceGroupBeats: 4,
    });
  });
  it("rejects duration and event budgets rather than counting source bars", () => {
    const tooLong = block(1, 1201);
    const duration = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "public-idea", blockId: tooLong.id },
      block: tooLong, selection: "source-midi",
    });
    expect(duration).toMatchObject({ ok: false, error: { code: "resource-budget" } });
    const tenMinutes = block(1, 1200);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "public-idea", blockId: tenMinutes.id },
      block: tenMinutes, selection: "source-midi",
    }).ok).toBe(true);
    const tooMany = block(1, 2401);
    tooMany.bpm = 240;
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "public-idea", blockId: tooMany.id },
      block: tooMany, selection: "source-midi",
    })).toMatchObject({ ok: false, error: { code: "resource-budget" } });
  });
  it("keeps equal musical duration across 1/4 and 4/4 representations", () => {
    const one = snapshot(1, 128);
    const four = snapshot(4, 128);
    expect(one.lengthBeats).toBe(128);
    expect(four.lengthBeats).toBe(128);
    expect(one.events.map(event => [event.startBeat, event.durationBeats]))
      .toEqual(four.events.map(event => [event.startBeat, event.durationBeats]));
    expect(one.meter.numerator).toBe(1);
    expect(four.meter.numerator).toBe(4);
  });
});
