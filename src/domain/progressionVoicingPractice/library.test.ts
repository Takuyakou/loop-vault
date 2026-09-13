import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { makeIdea } from "../testFactory";
import type { SavedProgressionBlock } from "../types";
import {
  buildVoicingLoopVaultCandidates,
  filterVoicingLoopVaultCandidates,
} from "./library";

describe("Voicing Loop Vault candidates", () => {
  it("projects only valid P5.27 handoff sources with effective title, timing, key, BPM, and chords", () => {
    const valid = block("valid", "2026-02-02T00:00:00.000Z");
    const invalid = { ...block("invalid", "2026-02-03T00:00:00.000Z"), chords: [] };
    const candidates = buildVoicingLoopVaultCandidates([
      makeIdea({
        id: "idea-aqua",
        title: "Aqua Bossa",
        key: "E major",
        bpm: 122,
        progressionBlocks: [valid, invalid],
      }),
    ], "Untitled progression");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: "Aqua Bossa",
      key: "E major",
      bpm: 122,
      chordLabels: ["E6/9", "Ab7"],
      sourceReference: { ideaId: "idea-aqua", blockId: "valid" },
    });
  });

  it("sorts deterministically and searches only safe title, chord-label, and key facts", () => {
    const candidates = buildVoicingLoopVaultCandidates([
      makeIdea({ id: "older", title: "Favorite DNA", key: "F major", progressionBlocks: [block("one", "2026-02-01T00:00:00.000Z")] }),
      makeIdea({ id: "newer", title: "Aqua Bossa", key: "E major", progressionBlocks: [block("two", "2026-02-02T00:00:00.000Z")] }),
    ], "Untitled progression");

    expect(candidates.map(({ title }) => title)).toEqual(["Aqua Bossa", "Favorite DNA"]);
    expect(filterVoicingLoopVaultCandidates(candidates, "favorite").map(({ title }) => title)).toEqual(["Favorite DNA"]);
    expect(filterVoicingLoopVaultCandidates(candidates, "E major").map(({ title }) => title)).toEqual(["Aqua Bossa"]);
    expect(filterVoicingLoopVaultCandidates(candidates, "Ab7").map(({ title }) => title)).toEqual(["Aqua Bossa", "Favorite DNA"]);
    expect(filterVoicingLoopVaultCandidates(candidates, "private.mid")).toEqual([]);
  });
});

function block(id: string, capturedAt: string): SavedProgressionBlock {
  return {
    id,
    summaryText: "E6/9 → G#7",
    timeSignature: "4/4",
    sourceFileName: "private.mid",
    chords: [
      { bar: 1, beat: 1, durationBeats: 2, chord: makeChordSymbol(4, "sixNine"), confidence: 1, alternatives: [], warnings: [] },
      { bar: 1, beat: 3, durationBeats: 2, chord: makeChordSymbol(8, "dom7"), confidence: 1, alternatives: [], warnings: [] },
    ],
    tags: [],
    capturedAt,
    analyzerVersion: "fixture",
  };
}
