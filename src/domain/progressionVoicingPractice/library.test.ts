import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { makeIdea } from "../testFactory";
import type { SavedProgressionBlock } from "../types";
import {
  buildVoicingLoopVaultCandidates,
  filterVoicingLoopVaultCandidates,
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
