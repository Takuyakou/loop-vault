import { describe, expect, it } from "vitest";

import { buildMidi } from "../p534/fixtures";
import { evaluateStage03bInteractions, projectedStateAt, projectStage03bTimeline } from "./stage03bInteraction";

const ticksPerBeat = 96;

const twoState = buildMidi({
  ticksPerBeat,
  tempoMicrosPerBeat: 500_000,
  notes: [
    ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: ticksPerBeat })),
    ...[45, 49, 64].map((pitch) => ({ pitch, startTick: ticksPerBeat, durationTick: ticksPerBeat })),
    ...[41, 45, 48].map((pitch) => ({ pitch, startTick: 2 * ticksPerBeat, durationTick: 2 * ticksPerBeat })),
  ],
});

const heldRichChord = buildMidi({
  ticksPerBeat,
  tempoMicrosPerBeat: 500_000,
  notes: [48, 52, 55, 59, 62].map((pitch) => ({
    pitch, startTick: 0, durationTick: 4 * ticksPerBeat,
  })),
});

const reattack = buildMidi({
  ticksPerBeat,
  tempoMicrosPerBeat: 500_000,
  notes: [0, 1, 2, 3].flatMap((beat) => (
    [47, 50, 54, 57].map((pitch) => ({
      pitch, startTick: beat * ticksPerBeat, durationTick: ticksPerBeat,
    }))
  )),
});

describe("P5.39-03b frozen candidate × Family B interaction", () => {
  it("uses exactly 276 visits for W2 and non-empty beat buckets without changing source", () => {
    const before = Uint8Array.from(twoState);
    const { windows } = evaluateStage03bInteractions(twoState);
    expect(windows.length).toBeGreaterThan(0);
    for (const row of windows) {
      expect(row.w2.result.candidateVisits).toBe(276);
      expect(row.b0?.result.candidateVisits).toBe(276);
      expect(row.b1?.result.candidateVisits).toBe(276);
    }
    expect(twoState).toEqual(before);
  });

  it("keeps the established two-harmony Family B trigger visible to the sequencing audit", () => {
    const { windows } = evaluateStage03bInteractions(twoState);
    expect(windows[0]?.productionTriggered).toBe(true);
    expect(windows[0]?.b0).not.toBeNull();
    expect(windows[0]?.b1).not.toBeNull();
  });

  it.each([
    ["held rich harmony", heldRichChord],
    ["same-chord reattack", reattack],
  ])("does not invent a split for %s", (_name, bytes) => {
    const { windows } = evaluateStage03bInteractions(bytes);
    expect(windows.every((row) => !row.productionTriggered
      && !row.controlDecision.triggered && !row.expandedDecision.triggered)).toBe(true);
  });

  it("projects all three sequencing models through the production smoother deterministically", () => {
    const first = evaluateStage03bInteractions(twoState);
    const second = evaluateStage03bInteractions(twoState);
    expect(second).toEqual(first);
    for (const mode of ["control", "model-a", "model-b"] as const) {
      const firstSpans = projectStage03bTimeline(first.data, first.windows, mode);
      const repeated = projectStage03bTimeline(second.data, second.windows, mode);
      expect(repeated).toEqual(firstSpans);
      expect(firstSpans.length).toBeGreaterThan(0);
      expect(firstSpans.every((span) => span.durationBeats > 0)).toBe(true);
      expect(projectedStateAt(firstSpans, 0.5)).not.toBeNull();
    }
  });
});
