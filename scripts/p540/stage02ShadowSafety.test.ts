import { describe, expect, it } from "vitest";

import { buildMidi } from "../p534/fixtures";
import { evaluateStage03bInteractions, projectStage03bTimeline } from "../p539/stage03bInteraction";
import { rankStage01ShadowCandidates } from "./shadowCandidateGenerationCorrection";

const ticksPerBeat = 96;

function chord(notes: readonly number[]): Uint8Array {
  return buildMidi({
    ticksPerBeat,
    tempoMicrosPerBeat: 500_000,
    notes: notes.map((pitch) => ({ pitch, startTick: 0, durationTick: 4 * ticksPerBeat })),
  });
}

const protectedControls = [
  [48, 52, 55, 59], // major seventh
  [48, 51, 55, 58], // minor seventh
  [48, 52, 55, 58], // dominant seventh
  [48, 53, 55, 58], // suspended seventh
  [52, 55, 60, 64], // slash-like bass
];

describe("P5.40-02 Shadow-only sequencing safety", () => {
  it.each(protectedControls)("retains frozen projection for ordinary control %#", (...notes) => {
    const bytes = chord(notes);
    const before = Uint8Array.from(bytes);
    const frozen = evaluateStage03bInteractions(bytes);
    const shadow = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
    expect(shadow.windows.map((row) => row.w2.result.candidateVisits))
      .toEqual(frozen.windows.map((row) => row.w2.result.candidateVisits));
    expect(projectStage03bTimeline(shadow.data, shadow.windows, "model-a"))
      .toEqual(projectStage03bTimeline(frozen.data, frozen.windows, "model-a"));
    expect(bytes).toEqual(before);
  }, 20_000);

  it("uses the frozen Family B/smoothing path with a bounded opt-in ranker", () => {
    const bytes = buildMidi({
      ticksPerBeat,
      tempoMicrosPerBeat: 500_000,
      notes: [
        ...[48, 52, 55].map((pitch) => ({ pitch, startTick: 0, durationTick: ticksPerBeat })),
        ...[45, 49, 64].map((pitch) => ({ pitch, startTick: ticksPerBeat, durationTick: ticksPerBeat })),
        ...[41, 45, 48].map((pitch) => ({ pitch, startTick: 2 * ticksPerBeat, durationTick: 2 * ticksPerBeat })),
      ],
    });
    const frozen = evaluateStage03bInteractions(bytes);
    const first = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
    const second = evaluateStage03bInteractions(bytes, rankStage01ShadowCandidates);
    expect(frozen.windows.every((row) => row.w2.result.candidateVisits === 276)).toBe(true);
    expect(first.windows.some((row) => row.productionTriggered)).toBe(true);
    expect(first.windows.flatMap((row) => [row.w2, row.b0, row.b1])
      .filter((pair) => pair !== null)
      .every((pair) => pair.result.candidateVisits >= 276 && pair.result.candidateVisits <= 300))
      .toBe(true);
    expect(second).toEqual(first);
    expect(projectStage03bTimeline(second.data, second.windows, "model-a"))
      .toEqual(projectStage03bTimeline(first.data, first.windows, "model-a"));
  });
});
