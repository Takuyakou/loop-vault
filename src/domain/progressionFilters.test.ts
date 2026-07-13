import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "./chords";
import { filterAndSortProgressions, type ProgressionFilters } from "./progressionFilters";
import { makeIdea } from "./testFactory";

const base: ProgressionFilters = { query: "", pinnedOnly: false, keys: [], lengths: [], sources: [], tags: [] };
function makeProgressionIdea(key: string, pinned: boolean, tag: string) {
  const value = makeIdea({ key, id: key === "C" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222" });
  return { ...value, progressionBlocks: [{
    id: crypto.randomUUID(), pinned, sourceFileName: `${key}.mid`, lengthBars: 4,
    summaryText: tag, detectedKey: key, tags: [tag], capturedAt: value.createdAt, analyzerVersion: "test",
    chords: [{ bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(key === "C" ? 5 : 7, "maj"), confidence: 1, alternatives: [], warnings: [] }],
  }] };
}

describe("filterAndSortProgressions", () => {
  const ideas = [makeProgressionIdea("C", false, "warm"), makeProgressionIdea("D", true, "bright")];
  it("combines degree query and chips with AND", () => {
    expect(filterAndSortProgressions(ideas, { ...base, query: "IV", keys: ["D"], tags: ["bright"] }, { field: "key", direction: "asc" })).toHaveLength(1);
    expect(filterAndSortProgressions(ideas, { ...base, query: "IV", keys: ["C"], tags: ["bright"] }, { field: "key", direction: "asc" })).toHaveLength(0);
  });
  it("filters pinned, length, and source while keeping pins first", () => {
    const result = filterAndSortProgressions(ideas, { ...base, pinnedOnly: true, lengths: [4], sources: ["D.mid"] }, { field: "capturedAt", direction: "desc" });
    expect(result.map(({ block }) => block.sourceFileName)).toEqual(["D.mid"]);
  });
});
