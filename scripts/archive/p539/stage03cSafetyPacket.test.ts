import { describe, expect, it } from "vitest";

import {
  renderSafetyChoices,
  renderSafetySource,
  selectChangedEndToEndRegions,
  type LocalSafetyBinding,
} from "./stage03cSafetyPacket";

describe("P5.39-03c blind selection and packet privacy", () => {
  it("selects only final end-to-end changes outside the two frozen prior regions in source order", () => {
    const windows = [4, 2, 1, 3, 0].map((index) => ({ index }));
    const changedBeats = new Set([0, 4, 5, 8]);
    const selected = selectChangedEndToEndRegions(
      windows,
      () => "baseline",
      (beat) => changedBeats.has(Math.floor(beat)) ? "expanded" : "baseline",
      new Set([1, 3]),
    );
    expect(selected).toEqual([
      { windowIndex: 0, changedBeatOffsets: [0] },
      { windowIndex: 2, changedBeatOffsets: [0, 1] },
      { windowIndex: 4, changedBeatOffsets: [0] },
    ]);
  });

  it("fails closed when either final state is unavailable", () => {
    expect(() => selectChangedEndToEndRegions(
      [{ index: 0 }],
      () => null,
      () => "expanded",
      new Set(),
    )).toThrow(/Final-state evidence unavailable/);
  });

  it("keeps source evidence and anonymous choices on separate pages", () => {
    const source = renderSafetySource([{
      id: "FC-SAFETY-01",
      contextBeforeBeats: 1,
      targetDurationBeats: 2,
      contextAfterBeats: 1,
      lowestTargetPitchClass: 0,
      notes: [{ midiPitch: 60, onsetBeats: 0, durationBeats: 1, velocity: 90,
        voice: 1, carriedIntoContext: false }],
      slices: [{ relativeBeat: 0, pitchClassesAboveLowestTarget: [0],
        lowestMidiPitch: 60, attackCount: 1 }],
    }]);
    const binding: LocalSafetyBinding = {
      id: "FC-SAFETY-01",
      windowIndex: 0,
      changedBeatOffsets: [1],
      choices: {
        A: { origin: "production", beatLabels: ["C7", "Fmaj7"] },
        B: { origin: "model-a", beatLabels: ["C7", "C11(no5)"] },
      },
      conflictingPresentToneInChangedBeat: true,
    };
    const choices = renderSafetyChoices([binding]);
    expect(source).toContain("FC-SAFETY-01.mid");
    expect(source).toContain("MIDI pitch");
    expect(source).not.toMatch(/C7|Fmaj7|C11\(no5\)|production|model-a|score|rank|penalty/i);
    expect(choices).toContain("A: first beat C7 → second beat Fmaj7");
    expect(choices).toContain("B: first beat C7 → second beat C11(no5)");
    expect(choices).not.toMatch(/production|model-a|score|rank|penalty|conflictingPresentTone/i);
  });
});
