import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { SavedProgressionBlock, SongIdea } from "../types";
import {
  buildProgressionIndex,
  filterProgressionIndex,
  removeIdeaFromProgressionIndex,
  replaceIdeaInProgressionIndex,
} from "./mod";

const timestamp = "2026-07-18T00:00:00.000Z";

function savedBlock(id: string, tags: string[] = []): SavedProgressionBlock {
  return {
    id,
    sourceFileName: `${id}.mid`,
    startBar: 1,
    endBar: 4,
    lengthBars: 4,
    summaryText: "Cmaj7 Am7 Dm7 G7",
    chords: [
      chord(1, 0, "maj7"),
      chord(2, 9, "min7"),
      chord(3, 2, "min7"),
      chord(4, 7, "dom7"),
    ],
    detectedKey: "C",
    bpm: 110,
    tags,
    capturedAt: timestamp,
    analyzerVersion: "legacy-v1",
  };
}

function chord(bar: number, root: number, quality: "maj7" | "min7" | "dom7") {
  return {
    bar,
    beat: 1,
    durationBeats: 4,
    chord: makeChordSymbol(root, quality),
    confidence: 1,
    alternatives: [],
    warnings: [],
  };
}

function idea(id: string, title: string, blocks: SavedProgressionBlock[]): SongIdea {
  return {
    id,
    title,
    moods: [],
    status: "idea",
    nextAction: { text: "", updatedAt: timestamp },
    chordMemo: "",
    references: [],
    assets: [],
    progressionBlocks: blocks,
    statusHistory: [{ status: "idea", at: timestamp }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("Progression Index", () => {
  it("builds searchable entries without persisting derived tags", () => {
    const block = savedBlock("block-1", ["use:chorus", "warm"]);
    const index = buildProgressionIndex([idea("idea-1", "Night Loop", [block])]);

    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({
      id: "idea-1:block-1",
      normalizedChordText: "cmaj7 am7 dm7 g7",
      romanNumeralText: "Imaj7 vi7 ii7 V7",
      effectiveTags: expect.arrayContaining(["use.chorus", "warm", "source.midi-capture"]),
    });
    expect(block).not.toHaveProperty("derivedTags");
  });

  it("uses OR inside one category and AND across categories", () => {
    const first = savedBlock("block-1", ["use:chorus"]);
    const second = savedBlock("block-2", ["use:verse"]);
    second.chords = [chord(1, 0, "maj7")];
    const index = buildProgressionIndex([idea("idea-1", "Hooks", [first, second])]);

    expect(filterProgressionIndex(index, {
      tagIds: ["use.chorus", "use.verse"],
    })).toHaveLength(2);
    expect(filterProgressionIndex(index, {
      tagIds: ["use.chorus", "feature.maj7-9"],
    }).map((entry) => entry.blockId)).toEqual(["block-1"]);
    expect(filterProgressionIndex(index, { query: "night" })).toHaveLength(0);
    expect(filterProgressionIndex(index, { query: "i ii" })).toHaveLength(0);
    expect(filterProgressionIndex(index, { query: "cmaj7" })).toHaveLength(2);
  });

  it("keeps a matching manual tag effective when the derived version is suppressed", () => {
    const value = savedBlock("block-1", ["feature:maj7-9"]);
    value.suppressedAutoTags = [{ tagId: "feature.maj7-9", taxonomyVersion: 1 }];
    const [entry] = buildProgressionIndex([idea("idea-1", "Manual override", [value])]);

    expect(entry.derivedTags.map((tag) => tag.tagId)).not.toContain("feature.maj7-9");
    expect(entry.effectiveTags).toContain("feature.maj7-9");
  });

  it("replaces renamed or edited Idea entries and removes deleted Ideas deterministically", () => {
    const original = idea("idea-1", "Old Name", [savedBlock("block-1")]);
    const initial = buildProgressionIndex([original]);
    const updated = {
      ...original,
      title: "New Name",
      progressionBlocks: [savedBlock("block-2", ["use:bridge"])],
    };
    const replaced = replaceIdeaInProgressionIndex(initial, updated);

    expect(replaced.map((entry) => entry.id)).toEqual(["idea-1:block-2"]);
    expect(replaced[0]?.normalizedSearchText).toContain("new name");
    expect(replaced[0]?.effectiveTags).toContain("use.bridge");
    expect(buildProgressionIndex([updated])).toEqual(replaced);
    expect(removeIdeaFromProgressionIndex(replaced, "idea-1")).toEqual([]);
  });

  it("builds and filters 1,000 progressions within the 100ms target", () => {
    const ideas = Array.from({ length: 100 }, (_, ideaIndex) => idea(
      `idea-${String(ideaIndex).padStart(3, "0")}`,
      `Idea ${ideaIndex}`,
      Array.from({ length: 10 }, (_, blockIndex) => savedBlock(
        `block-${String(ideaIndex).padStart(3, "0")}-${blockIndex}`,
        [blockIndex % 2 === 0 ? "use:chorus" : "use:verse"],
      )),
    ));

    const buildStart = performance.now();
    const index = buildProgressionIndex(ideas);
    const buildMs = performance.now() - buildStart;
    const filterStart = performance.now();
    const filtered = filterProgressionIndex(index, {
      query: "cmaj7",
      tagIds: ["use.chorus", "feature.maj7-9"],
    });
    const filterMs = performance.now() - filterStart;

    expect(index).toHaveLength(1_000);
    expect(filtered).toHaveLength(500);
    expect(buildMs).toBeLessThan(100);
    expect(filterMs).toBeLessThan(100);
  });
});
