import { describe, expect, it } from "vitest";
import type { ResolvedProgressionPracticeVoicing } from "../domain/progressionVoicingPractice";
import { assignPracticeHandsAcrossProgression, isPracticeHandAssignmentPlayable, progressionFingeringHandTargets } from "./fingeringDisplay";

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


describe("VL-09 practice hand assignment", () => {
  it("rebalances a seven-note slash voicing into playable hands without changing source playback", () => {
    const source = [57, 65, 72, 75, 77, 79, 84];
    const resolved = voicing(source, { bassNote: 57 });
    const [targets] = assignPracticeHandsAcrossProgression("source-midi", [resolved]);
    expect(targets).toEqual({ left: [57, 65], right: [72, 75, 77, 79, 84] });
    expect([...targets!.left, ...targets!.right]).toEqual(source);
    expect(resolved.midiNotes).toEqual(source);
  });

  it.each([
    ["1 + 6", [45, 60, 64, 67, 71, 74, 77]],
    ["6 + 1", [40, 43, 47, 50, 55, 59, 76]],
    ["2 + 6", [40, 45, 60, 64, 67, 71, 74, 77]],
    ["6 + 2", [40, 43, 47, 50, 55, 59, 74, 76]],
    ["3 + 5", [40, 45, 52, 60, 64, 67, 71, 74]],
    ["5 + 3", [40, 43, 47, 50, 55, 60, 64, 67]],
    ["wide", [28, 47, 60, 72, 84, 96]],
    ["close", [60, 61, 62, 63, 64, 65, 66]],
    ["pedal", [33, 45, 60, 64, 67, 71, 74]],
    ["rootless", [36, 48, 53, 57, 60, 64, 69]],
  ] as const)("partitions %s with no omission, duplicate, or crossing", (_scenario, source) => {
    const resolved = voicing(source, { bassNote: source[0] });
    const [targets] = assignPracticeHandsAcrossProgression("source-midi", [resolved]);
    expect(targets!.left.length).toBeLessThanOrEqual(5);
    expect(targets!.right.length).toBeLessThanOrEqual(5);
    expect([...targets!.left, ...targets!.right]).toEqual(source);
    if (targets!.left.length && targets!.right.length) {
      expect(Math.max(...targets!.left)).toBeLessThan(Math.min(...targets!.right));
    }
    expect(resolved.midiNotes).toEqual(source);
  });

  it("preserves explicit Custom assignment and favors a saved personal fingering", () => {
    const resolved = voicing([48, 55, 60, 64, 67, 72], { origin: "custom", leftHandNotes: [48, 55], rightHandNotes: [60, 64, 67, 72] });
    expect(assignPracticeHandsAcrossProgression("custom", [resolved])[0]).toEqual({ left: [48, 55], right: [60, 64, 67, 72] });
    const source = voicing([48, 55, 60, 64, 67, 72], { bassNote: 48 });
    const preferences = { version: 1 as const, entries: [{ signature: "L:48,55", hand: "left" as const,
      pitches: [48, 55], fingers: [5, 1] as const, updatedAt: 1 }] };
    expect(assignPracticeHandsAcrossProgression("source-midi", [source], preferences)[0]!.left).toEqual([48, 55]);
  });

  it("does not silently omit an impossible eleven-note target", () => {
    const notes = Array.from({ length: 11 }, (_, index) => 50 + index);
    const [targets] = assignPracticeHandsAcrossProgression("source-midi", [voicing(notes)]);
    expect(targets).toEqual({ left: [], right: [] });
  });
});


describe("VL-09 assignment validity", () => {
  it("rejects too many per hand, crossing, duplicates, and omissions", () => {
    const source = [48, 52, 55, 59, 64, 67];
    expect(isPracticeHandAssignmentPlayable(source, { left: [48, 52], right: [55, 59, 64, 67] })).toBe(true);
    expect(isPracticeHandAssignmentPlayable(source, { left: [48, 52, 55, 59, 64, 67], right: [] })).toBe(false);
    expect(isPracticeHandAssignmentPlayable(source, { left: [48, 59], right: [52, 55, 64, 67] })).toBe(false);
    expect(isPracticeHandAssignmentPlayable(source, { left: [48, 52], right: [55, 59, 64, 64] })).toBe(false);
    expect(isPracticeHandAssignmentPlayable(source, { left: [48, 52], right: [55, 59, 64] })).toBe(false);
  });
});


describe("P11 saved fixed hand parity", () => {
  it.each([
    [[48, 67, 70, 74, 75], 48],
    [[45, 67, 71, 74, 78], 45],
    [[60, 64, 67], undefined],
    [[59, 62, 65, 69], undefined],
    [[40, 43, 47, 60, 64, 67, 71], 40],
  ] as const)("uses the existing fixed-source partition for %j, bass %s", (notes, bassNote) => {
    const resolved = voicing(notes, { bassNote });
    const before = JSON.stringify(resolved);
    const source = assignPracticeHandsAcrossProgression("source-midi", [resolved]);
    expect(assignPracticeHandsAcrossProgression("saved", [resolved])).toEqual(source);
    expect(assignPracticeHandsAcrossProgression("custom", [resolved])).toEqual(source);
    expect(isPracticeHandAssignmentPlayable(notes, source[0]!)).toBe(true);
    expect(JSON.stringify(resolved)).toBe(before);
  });
  it("preserves explicit generated fallback hand context even under saved selection", () => {
    const resolved = voicing([48, 52, 55, 59], { leftHandNotes: [48, 52], rightHandNotes: [55, 59] });
    expect(assignPracticeHandsAcrossProgression("saved", [resolved])).toEqual([{ left: [48, 52], right: [55, 59] }]);
  });
});
