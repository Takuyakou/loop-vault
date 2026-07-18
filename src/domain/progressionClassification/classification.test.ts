import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { SavedProgressionBlock } from "../types";
import {
  classifyProgression,
  suppressAutoTag,
} from "./mod";

function block(overrides: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return {
    id: "block-1",
    sourceFileName: "source.mid",
    startBar: 1,
    endBar: 4,
    lengthBars: 4,
    summaryText: "| Cmaj9 | A7 | Dm11 | G7 |",
    chords: [
      item(1, makeChordSymbol(0, "maj9")),
      item(2, makeChordSymbol(9, "dom7", ["b9"])),
      item(3, makeChordSymbol(2, "min11", [], 5)),
      item(4, makeChordSymbol(7, "dom7")),
    ],
    detectedKey: "C",
    tags: [],
    capturedAt: "2026-07-18T00:00:00.000Z",
    analyzerVersion: "legacy-v1",
    ...overrides,
  };
}

function item(bar: number, chord: ReturnType<typeof makeChordSymbol>) {
  return { bar, beat: 1, durationBeats: 4, chord, confidence: 1, alternatives: [], warnings: [] };
}

describe("progression classification", () => {
  it("derives deterministic source, objective features, and multiple use tags", () => {
    const input = { block: block(), key: "C", sourceMetadata: { candidateLabels: ["main"] } };
    const first = classifyProgression(input);
    const second = classifyProgression(input);

    expect(second).toEqual(first);
    expect(first.sourceTags.map((tag) => tag.tagId)).toEqual(["source.midi-capture"]);
    expect(first.featureTags.map((tag) => tag.tagId)).toEqual(expect.arrayContaining([
      "feature.maj7-9",
      "feature.minor9-11",
      "feature.slash-bass",
      "feature.altered",
      "feature.secondary-dominant",
    ]));
    expect(first.useTags.map((tag) => tag.tagId)).toEqual([
      "use.loop",
      "use.intro",
      "use.turnaround",
      "use.main",
    ]);
    expect(first.moodTags).toEqual([]);
  });

  it("does not derive key-dependent features or arrangement sections without evidence", () => {
    const result = classifyProgression({
      block: block({ detectedKey: undefined, startBar: 9, lengthBars: 8 }),
    });
    const ids = [...result.featureTags, ...result.useTags].map((tag) => tag.tagId);

    expect(ids).not.toContain("feature.diatonic");
    expect(ids).not.toContain("feature.chromatic");
    expect(ids).not.toContain("feature.secondary-dominant");
    expect(ids).not.toContain("use.verse");
    expect(ids).not.toContain("use.chorus");
    expect(ids).toContain("use.loop");
  });

  it("keeps a stable suppression across repeated classification", () => {
    const saved = block({
      suppressedAutoTags: suppressAutoTag([], "feature.maj7-9"),
    });
    const first = classifyProgression({ block: saved });
    const second = classifyProgression({ block: saved });

    expect(first.featureTags.map((tag) => tag.tagId)).not.toContain("feature.maj7-9");
    expect(second).toEqual(first);
    expect(saved.suppressedAutoTags).toEqual([{
      tagId: "feature.maj7-9",
      taxonomyVersion: 1,
    }]);
  });

  it("does not discard a suppression whose tag was removed from the current taxonomy", () => {
    const saved = block({
      suppressedAutoTags: [{ tagId: "feature.retired-tag", taxonomyVersion: 1 }],
    });

    classifyProgression({ block: saved });

    expect(saved.suppressedAutoTags).toEqual([{
      tagId: "feature.retired-tag",
      taxonomyVersion: 1,
    }]);
  });
});
