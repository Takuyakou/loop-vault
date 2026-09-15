import { describe, expect, it } from "vitest";
import type { ResolvedProgressionPracticeVoicing } from "../domain/progressionVoicingPractice";
import { progressionFingeringHandTargets } from "./fingeringDisplay";

function voicing(
  midiNotes: readonly number[],
  overrides: Partial<ResolvedProgressionPracticeVoicing> = {},
): ResolvedProgressionPracticeVoicing {
  return {
    origin: "source-midi",
    midiNotes,
    addedColorDegrees: [],
    notes: midiNotes.map((midiNote) => ({
      midiNote,
      pitchClass: midiNote % 12,
      octave: Math.floor(midiNote / 12) - 1,
      degree: null,
    })),
    ...overrides,
  };
}

describe("progressionFingeringHandTargets", () => {
  it("uses the resolved lesson hand assignments unchanged", () => {
    const resolved = voicing([36, 47, 52, 55, 59], {
      origin: "full-shell",
      leftHandNotes: [36, 47],
      rightHandNotes: [52, 55, 59],
    });
    expect(progressionFingeringHandTargets("full-shell", resolved)).toEqual({
      left: [36, 47],
      right: [52, 55, 59],
    });
  });

  it("uses an exact saved bass role as the left-hand target without changing Source pitches", () => {
    const resolved = voicing([45, 67, 71, 74, 78], { bassNote: 45 });
    const targets = progressionFingeringHandTargets("source-midi", resolved);
    expect(targets).toEqual({ left: [45], right: [67, 71, 74, 78] });
    expect([...targets.left, ...targets.right].sort((a, b) => a - b)).toEqual(resolved.midiNotes);
  });

  it("keeps an exact Custom voicing right-hand-only when no bass role is stored", () => {
    const resolved = voicing([60, 64, 67], { origin: "custom" });
    expect(progressionFingeringHandTargets("custom", resolved)).toEqual({
      left: [],
      right: [60, 64, 67],
    });
  });

  it("does not turn a separate Left-hand slash bass reference into a fingering target", () => {
    const resolved = voicing([48, 52, 55, 59], {
      origin: "left-hand",
      referenceBassNote: 45,
      leftHandNotes: [48, 52],
      rightHandNotes: [55, 59],
    });
    expect(progressionFingeringHandTargets("left-hand", resolved)).toEqual({
      left: [48, 52, 55, 59],
      right: [],
    });
  });
});
