import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { makeIdea } from "../testFactory";
import type { SavedProgressionBlock } from "../types";
import { buildAuthorReferenceIndex, generateStyleCandidates } from "./styleCandidates";

const progression = (key: string, userVerified = false, userEdited = false, pinned = false): SavedProgressionBlock => ({
  id: `block-${key}-${userVerified}-${userEdited}-${pinned}`,
  summaryText: "reference",
  chords: [
    makeItem(0, "maj7", 1),
    makeItem(5, "maj7", 2),
    makeItem(7, "dom7", 3),
    makeItem(0, "maj7", 4),
    makeItem(9, "min7", 5),
    makeItem(2, "min7", 6),
  ],
  detectedKey: key,
  tags: [],
  capturedAt: "2026-07-18T00:00:00.000Z",
  analyzerVersion: "test",
  userVerified,
  userEdited,
  pinned,
});

describe("author reference style candidates", () => {
  it("opens the gate with verified transitions and transposes references to the current key", () => {
    const index = buildAuthorReferenceIndex([
      makeIdea({ id: "verified", key: "C major", progressionBlocks: [progression("C major", true)] }),
    ]);
    const candidates = generateStyleCandidates({
      index,
      previousChord: makeChordSymbol(2, "maj7"),
      currentChord: makeChordSymbol(7, "min7"),
      nextChord: makeChordSymbol(9, "dom7"),
      keySignature: "D major",
    });
    expect(index.available).toBe(true);
    expect(index.verifiedTransitionCount).toBeGreaterThanOrEqual(5);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.primarySource === "authorReferenceFit")).toBe(true);
  });

  it("opens the gate with accepted corrections", () => {
    const index = buildAuthorReferenceIndex([
      makeIdea({ id: "edited", progressionBlocks: [progression("C major", false, true)] }),
    ]);
    expect(index.acceptedCorrectionCount).toBeGreaterThanOrEqual(3);
    expect(index.available).toBe(true);
  });

  it("does not use unverified or favorite-only data to open the gate", () => {
    const index = buildAuthorReferenceIndex([
      makeIdea({ id: "plain", progressionBlocks: [progression("C major")] }),
      makeIdea({ id: "favorite", progressionBlocks: [progression("C major", false, false, true)] }),
    ]);
    expect(index.available).toBe(false);
    expect(generateStyleCandidates({
      index,
      currentChord: makeChordSymbol(0, "maj7"),
      keySignature: "C major",
    })).toEqual([]);
  });

  it("is deterministic and excludes the current chord", () => {
    const index = buildAuthorReferenceIndex([
      makeIdea({ id: "verified", progressionBlocks: [progression("C major", true)] }),
    ]);
    const input = {
      index,
      previousChord: makeChordSymbol(0, "maj7"),
      currentChord: makeChordSymbol(5, "maj7"),
      nextChord: makeChordSymbol(7, "dom7"),
      keySignature: "C major",
    };
    const first = generateStyleCandidates(input);
    expect(first).toEqual(generateStyleCandidates(input));
    expect(first.every((candidate) => candidate.chord.label !== input.currentChord.label)).toBe(true);
  });
});

function makeItem(root: number, quality: Parameters<typeof makeChordSymbol>[1], bar: number) {
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
