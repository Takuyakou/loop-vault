import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { makeIdea } from "../testFactory";
import type { SavedProgressionBlock } from "../types";
import {
  arrangeVoicingLoopSearchResults,
  buildVoicingLoopVaultCandidates,
  filterVoicingLoopVaultCandidates,
  groupVoicingLoopVaultCandidates,
  voicingLoopSourceId,
  type VoicingLoopVaultCandidate,
} from "./library";

describe("Voicing Loop Vault candidates", () => {
  it("shows readable Vault blocks and diagnoses incompatible handoffs", () => {
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

    expect(candidates).toHaveLength(2);
    expect(candidates.find((candidate) => candidate.sourceReference.blockId === "valid")).toMatchObject({
      title: "Aqua Bossa",
      key: "E major",
      bpm: 122,
      chordLabels: ["E6/9", "Ab7"],
      sourceReference: { ideaId: "idea-aqua", blockId: "valid" },
    });
    expect(candidates.find((candidate) => candidate.sourceReference.blockId === "invalid")).toMatchObject({ unavailableReason: "empty-progression", sourceReference: { blockId: "invalid" } });
  });

  it("lists a stored over-budget progression as unavailable instead of silently hiding it", () => {
    const unit = block("long", "2026-02-02T00:00:00.000Z").chords[0]!;
    const long = { ...block("long", "2026-02-02T00:00:00.000Z"), bpm: 120,
      chords: Array.from({ length: 257 }, (_, index) => ({ ...unit, bar: index + 1, beat: 1, durationBeats: 4 })),
    };
    const candidates = buildVoicingLoopVaultCandidates([
      makeIdea({ id: "long-idea", title: "Public long progression", bpm: 120, progressionBlocks: [long] }),
    ], "Untitled progression");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ unavailableReason: "practice-capacity", chordLabels: expect.any(Array) });
    expect(candidates[0]!.chordLabels).toHaveLength(257);
  });

  it("offers an exact 65-bar legacy progression with missing BPM at a changeable practice initial 120", () => {
    const unit = block("sixty-five", "2026-02-02T00:00:00.000Z").chords[0]!;
    const long = { ...block("sixty-five", "2026-02-02T00:00:00.000Z"),
      chords: Array.from({ length: 65 }, (_, index) => ({ ...unit, bar: index + 1, beat: 1, durationBeats: 4 })),
    };
    const candidates = buildVoicingLoopVaultCandidates([
      { ...makeIdea({ id: "missing-tempo", title: "Public 65-bar range", progressionBlocks: [long] }), bpm: undefined },
    ], "Untitled");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ bpm: 120, tempoOrigin: "PRACTICE_INITIAL", chordLabels: expect.any(Array) });
    expect(candidates[0]!.unavailableReason).toBeUndefined();
    expect(candidates[0]!.chordLabels).toHaveLength(65);
  });

  it("labels a linked MIDI asset with missing BPM as the SMF default", () => {
    const source = block("smf-default", "2026-02-02T00:00:00.000Z");
    source.sourceAssetId = "linked-midi";
    const idea = makeIdea({ id: "smf-idea", bpm: 132, assets: [{ id: "linked-midi", type: "midi" }], progressionBlocks: [source] });
    const candidates = buildVoicingLoopVaultCandidates([idea], "Untitled");
    expect(candidates).toMatchObject([{ bpm: 120, tempoOrigin: "SMF_DEFAULT" }]);
    expect(candidates[0]!.unavailableReason).toBeUndefined();
  });

  it("keeps unsupported meters and other readable incompatibilities visible", () => {
    const source = block("compound", "2026-02-02T00:00:00.000Z");
    source.timeSignature = "6/8";
    const candidates = buildVoicingLoopVaultCandidates([
      makeIdea({ id: "compound-idea", title: "Public compound meter", bpm: 120, progressionBlocks: [source] }),
    ], "Untitled");
    expect(candidates).toMatchObject([{ unavailableReason: "unsupported-meter" }]);
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

  it("reads the Vault favourite flag and the saved bar count into each candidate", () => {
    const pinned = { ...block("pinned", "2026-02-01T00:00:00.000Z"), pinned: true, lengthBars: 8 };
    const plain = { ...block("plain", "2026-02-02T00:00:00.000Z"), lengthBars: 4 };
    const candidates = buildVoicingLoopVaultCandidates([
      makeIdea({ id: "idea", title: "Facts", bpm: 120, progressionBlocks: [pinned, plain] }),
    ], "Untitled");
    expect(candidates.map(({ favorite, lengthBars, sourceReference }) =>
      [sourceReference.blockId, favorite, lengthBars])).toEqual([
      ["plain", false, 4],
      ["pinned", true, 8],
    ]);
  });

  it("keeps a missing saved length absent instead of inventing one", () => {
    const candidates = buildVoicingLoopVaultCandidates([
      makeIdea({ id: "no-length", title: "No length", bpm: 120, progressionBlocks: [block("no-length", "2026-02-01T00:00:00.000Z")] }),
    ], "Untitled");
    expect(candidates[0]).not.toHaveProperty("lengthBars");
  });
});

describe("Voicing Loop picker sections", () => {
  it("puts favourites first, keeps each progression in one section, and caps the recent section at three", () => {
    const all = [
      candidate("a", "2026-01-01", false),
      candidate("b", "2026-01-02", true),
      candidate("c", "2026-01-03", false),
      candidate("d", "2026-01-04", false),
      candidate("e", "2026-01-05", true),
      candidate("f", "2026-01-06", false),
      candidate("g", "2026-01-07", false),
    ];
    const recent = ["f", "a", "b", "c", "d"].map(reference);
    const sections = groupVoicingLoopVaultCandidates(all, recent);
    expect(sections.map(({ kind, candidates }) => [kind, candidates.map(({ title }) => title)])).toEqual([
      ["favorites", ["e", "b"]],
      ["recent", ["f", "a", "c"]],
      ["others", ["g", "d"]],
    ]);
    const shown = sections.flatMap(({ candidates }) => candidates.map(({ id }) => id));
    expect(new Set(shown).size).toBe(all.length);
  });

  it("omits an empty section and keeps the newest-first order inside each one", () => {
    const all = [candidate("a", "2026-01-01", false), candidate("b", "2026-01-02", false)];
    expect(groupVoicingLoopVaultCandidates(all, [])).toEqual([
      { kind: "others", candidates: [all[1], all[0]] },
    ]);
  });

  it("keeps a progression that cannot be practised inside its own section", () => {
    const all = [
      { ...candidate("fav", "2026-01-02", true), unavailableReason: "resource-budget" as const },
      { ...candidate("bad", "2026-01-01", false), unavailableReason: "unsupported-meter" as const },
    ];
    expect(groupVoicingLoopVaultCandidates(all, []).map(({ kind, candidates }) => [kind, candidates.map(({ title }) => title)]))
      .toEqual([["favorites", ["fav"]], ["others", ["bad"]]]);
  });

  it("orders search results favourites, then recently used, then the rest", () => {
    const all = [
      candidate("a", "2026-01-01", false),
      candidate("b", "2026-01-02", true),
      candidate("c", "2026-01-03", false),
      candidate("d", "2026-01-04", false),
      candidate("e", "2026-01-05", false),
    ];
    const recent = ["e", "c", "a", "d"].map(reference);
    expect(arrangeVoicingLoopSearchResults(all, recent).map(({ title }) => title))
      .toEqual(["b", "e", "c", "a", "d"]);
  });
});

function reference(id: string) {
  return { ideaId: `idea-${id}`, blockId: `block-${id}` };
}

function candidate(id: string, capturedAt: string, favorite: boolean): VoicingLoopVaultCandidate {
  const referenceValue = reference(id);
  return {
    id: voicingLoopSourceId(referenceValue),
    sourceReference: referenceValue,
    title: id,
    bpm: 120,
    tempoOrigin: "SAVED_BPM",
    chordLabels: ["Cmaj7"],
    capturedAt: `${capturedAt}T00:00:00.000Z`,
    favorite,
  };
}

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
