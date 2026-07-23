import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { PracticeInputSnapshot } from "../practice";
import type { ChordSymbol } from "../types";
import {
  chordToneDescriptors,
  DEFAULT_OCTAVE_SHIFT_CANDIDATES,
  DEFAULT_VOICING_PRACTICE_PREFERENCES,
  getStyleCompatibility,
  getStyleTonePolicy,
  isVoicingStyleId,
  matchExactPitch,
  matchPitchClasses,
  normalizeVoicingPracticePreferences,
  VOICING_STYLE_CATALOG,
} from ".";

describe("voicing practice catalog and compatibility", () => {
  it("exposes only the three Phase 3.9.2 style IDs", () => {
    expect(VOICING_STYLE_CATALOG.map((entry) => entry.id)).toEqual([
      "shell-17",
      "open-17",
      "rootless-ab",
    ]);
    expect(isVoicingStyleId("rootless-ab")).toBe(true);
    expect(isVoicingStyleId("drop-2")).toBe(false);
  });

  it("supports shell/open broadly and limits rootless to seventh families", () => {
    const major = makeChordSymbol(0, "maj");
    const majorSeven = makeChordSymbol(0, "maj7");
    expect(getStyleCompatibility(major, "shell-17").supported).toBe(true);
    expect(getStyleCompatibility(major, "open-17").supported).toBe(true);
    expect(getStyleCompatibility(major, "rootless-ab")).toEqual(expect.objectContaining({
      supported: false,
      fallbackStyleId: "generated-close",
    }));
    expect(getStyleCompatibility(majorSeven, "rootless-ab").supported).toBe(true);
    expect(getStyleCompatibility({ ...majorSeven, bass: 7 }, "rootless-ab").supported).toBe(false);
  });

  it("keeps defining tones required and forbids the root in rootless mode", () => {
    const altered: ChordSymbol = {
      ...makeChordSymbol(7, "dom7"),
      tensions: ["b9", "b13"],
    };
    const shell = getStyleTonePolicy(altered, "shell-17");
    const rootless = getStyleTonePolicy(altered, "rootless-ab");
    expect(shell.requiredIntervals).toEqual(expect.arrayContaining(["R", "3", "b7", "b9"]));
    expect(rootless.requiredIntervals).toEqual(expect.arrayContaining(["3", "b7"]));
    expect(rootless.forbiddenIntervals).toContain("R");
    expect(chordToneDescriptors(altered).map((tone) => tone.label)).toEqual(
      expect.arrayContaining(["R", "3", "5", "b7", "b9", "b13"]),
    );
  });
});

describe("style matchers", () => {
  const target = [48, 55, 64, 71];

  it("matches only one shared global octave shift in exact-pitch mode", () => {
    expect(matchExactPitch(target, input([60, 67, 76, 83])).state).toBe("match");
    expect(matchExactPitch(target, input([48, 67, 64, 71])).state).toBe("wrong");
    expect(matchExactPitch(target, input([48, 55, 64])).state).toBe("partial");
    expect(matchExactPitch(target, input([48, 55, 64, 71, 72])).state).toBe("wrong");
    expect(DEFAULT_OCTAVE_SHIFT_CANDIDATES).toEqual([-24, -12, 0, 12, 24]);
  });

  it("can disable the global octave shift and preserves attack revision", () => {
    expect(matchExactPitch(target, input([60, 67, 76, 83]), 0, {
      allowGlobalOctaveShift: false,
      octaveShiftCandidates: [0],
    }).state).toBe("wrong");
    expect(matchExactPitch(target, input(target, 1), 2).state).toBe("partial");
  });

  it("matches pitch-class sets regardless of inversion and octave duplicates", () => {
    expect(matchPitchClasses(target, input([59, 60, 67, 76, 84])).state).toBe("match");
    expect(matchPitchClasses(target, input([48, 55, 64])).state).toBe("partial");
    expect(matchPitchClasses(target, input([48, 55, 64, 71, 73])).state).toBe("wrong");
  });
});

describe("voicing practice preferences", () => {
  it("normalizes an unknown record without changing the Vault schema", () => {
    expect(normalizeVoicingPracticePreferences(undefined)).toEqual(
      DEFAULT_VOICING_PRACTICE_PREFERENCES,
    );
    expect(normalizeVoicingPracticePreferences({
      maxLeftHandSpanSemitones: 14,
      maxRightHandSpanSemitones: 16,
      allowGlobalOctaveShift: false,
    })).toEqual({
      maxLeftHandSpanSemitones: 14,
      maxRightHandSpanSemitones: 16,
      allowGlobalOctaveShift: false,
    });
  });
});

function input(
  heldMidiNotes: number[],
  attackRevision = 0,
): PracticeInputSnapshot {
  return {
    heldMidiNotes,
    sustainedMidiNotes: [],
    attackRevision,
    timestampMs: 0,
  };
}
