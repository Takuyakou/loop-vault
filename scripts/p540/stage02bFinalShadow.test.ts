import { describe, expect, it } from "vitest";

import { buildMidi } from "../p534/fixtures";
import { evaluateStage03bInteractions, projectStage03bTimeline } from "../p539/stage03bInteraction";
import { evaluateStage02bFinalShadow } from "./stage02bFinalShadow";

const ticksPerBeat = 96;

function sequence(parts: readonly { notes: readonly number[]; start: number; duration: number }[]): Uint8Array {
  return buildMidi({
    ticksPerBeat,
    tempoMicrosPerBeat: 500_000,
    notes: parts.flatMap((part) => part.notes.map((pitch) => ({
      pitch, startTick: part.start * ticksPerBeat, durationTick: part.duration * ticksPerBeat,
    }))),
  });
}

describe("P5.40-02b Shadow temporal protection", () => {
  it("separates coherent same-root half-beat changes with source onsets", () => {
    const bytes = sequence([
      { notes: [48, 52, 55, 59], start: 0, duration: 1 },
      { notes: [48, 52, 55, 58], start: 1, duration: 0.5 },
      { notes: [48, 51, 55, 58], start: 1.5, duration: 0.5 },
    ]);
    const before = Uint8Array.from(bytes);
    const first = evaluateStage02bFinalShadow(bytes);
    expect(first.traces[0]?.microPartitioned).toBe(true);
    expect(first.traces[0]?.preSmoothing.map((span) => span.durationBeats))
      .toEqual([1, 0.5, 0.5]);
    expect(first.final.filter((span) => span.startBeat < 2).length).toBeGreaterThanOrEqual(2);
    expect(evaluateStage02bFinalShadow(bytes)).toEqual(first);
    expect(bytes).toEqual(before);
    expect(first.traces.flatMap((trace) => trace.halfBeatRankings)
      .every((result) => result.candidateVisits <= 300)).toBe(true);
  });

  it("abstains on same-state re-strikes, bass-only movement and sparse evidence", () => {
    const reStrike = sequence([
      { notes: [48, 52, 55, 58], start: 0, duration: 1 },
      { notes: [48, 52, 55, 58], start: 1, duration: 1 },
    ]);
    const bassOnly = sequence([
      { notes: [48, 52, 55, 58], start: 0, duration: 1 },
      { notes: [52, 55, 58, 60], start: 1, duration: 1 },
    ]);
    const sparse = sequence([
      { notes: [48, 52, 55, 58], start: 0, duration: 1 },
      { notes: [48, 55], start: 1, duration: 1 },
    ]);
    for (const bytes of [reStrike, bassOnly, sparse]) {
      const result = evaluateStage02bFinalShadow(bytes);
      expect(result.traces[0]?.microPartitioned).toBe(false);
    }
  });

  it("keeps the frozen Family B trigger under changed ranking and ordinary controls", () => {
    const bytes = sequence([
      { notes: [48, 52, 55], start: 0, duration: 1 },
      { notes: [45, 49, 64], start: 1, duration: 1 },
      { notes: [41, 45, 48], start: 2, duration: 2 },
    ]);
    const result = evaluateStage02bFinalShadow(bytes);
    expect(result.traces.every((trace) => trace.guardedTriggered === trace.frozenTriggered)).toBe(true);
    expect(result.corrected.flatMap((row) => [row.w2, row.b0, row.b1])
      .filter((pair) => pair !== null)
      .every((pair) => pair.result.candidateVisits <= 300)).toBe(true);

    const ordinary = sequence([{ notes: [48, 52, 55, 59], start: 0, duration: 4 }]);
    const frozen = evaluateStage03bInteractions(ordinary);
    expect(evaluateStage02bFinalShadow(ordinary).final)
      .toEqual(projectStage03bTimeline(frozen.data, frozen.windows, "model-a"));
  });
});
