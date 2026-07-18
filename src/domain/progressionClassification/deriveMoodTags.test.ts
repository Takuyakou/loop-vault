import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordQuality, SavedProgressionBlock, Tension } from "../types";
import { classifyProgression, deriveMoodTags, MOOD_CONFIDENCE_THRESHOLD } from "./mod";

function block(
  qualities: ChordQuality[],
  roots = qualities.map((_, index) => [0, 5, 7, 0][index] ?? 0),
  tensions: Tension[][] = qualities.map(() => []),
): SavedProgressionBlock {
  return {
    id: "mood-block",
    summaryText: "Mood fixture",
    chords: qualities.map((quality, index) => ({
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(roots[index] ?? 0, quality, tensions[index] ?? []),
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    detectedKey: "C",
    tags: [],
    capturedAt: "2026-07-18T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

describe("Mood classification v1", () => {
  it("requires at least three chords and never exceeds two results", () => {
    expect(deriveMoodTags({ block: block(["maj9", "maj9"]) })).toEqual([]);
    const result = deriveMoodTags({
      block: block(["sus2", "add9", "sus4", "sixNine"]),
    });
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result.every((tag) => (tag.confidence ?? 0) >= MOOD_CONFIDENCE_THRESHOLD)).toBe(true);
    expect(result.every((tag) => tag.reasons.length > 0)).toBe(true);
  });

  it("recognizes strong bright, dreamy, and tense evidence conservatively", () => {
    const bright = deriveMoodTags({ block: block(["maj", "maj7", "maj", "six"]) });
    const dreamy = deriveMoodTags({ block: block(["maj9", "min9", "add9", "sus2"]) });
    const tense = deriveMoodTags({
      block: block(
        ["dom7", "dom9", "dim7", "dom13"],
        [9, 2, 6, 7],
        [["b9"], ["#9"], [], ["b13"]],
      ),
    });

    expect(bright.map((tag) => tag.tagId)).toContain("mood.bright");
    expect(dreamy.map((tag) => tag.tagId)).toContain("mood.dreamy");
    expect(tense.map((tag) => tag.tagId)).toContain("mood.tense");
  });

  it("returns no Mood for a mixed progression without dominant evidence", () => {
    const result = deriveMoodTags({
      block: block(["maj", "min7", "dom7", "min"], [0, 9, 7, 2]),
    });

    expect(result).toEqual([]);
  });

  it("is deterministic and respects ordinary auto-tag suppression", () => {
    const value = block(["maj9", "min9", "add9", "sus2"]);
    value.suppressedAutoTags = [{ tagId: "mood.dreamy", taxonomyVersion: 1 }];
    const first = classifyProgression({ block: value });
    const second = classifyProgression({ block: value });

    expect(second).toEqual(first);
    expect(first.moodTags.map((tag) => tag.tagId)).not.toContain("mood.dreamy");
  });
});
