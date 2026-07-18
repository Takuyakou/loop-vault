import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { generateContextCandidates } from "./contextCandidates";

describe("context chord candidates", () => {
  it("returns five deterministic candidates from neighboring chords and key", () => {
    const input = {
      currentChord: makeChordSymbol(2, "min7"),
      previousChord: makeChordSymbol(0, "maj7"),
      nextChord: makeChordSymbol(7, "dom7"),
      keySignature: "C major",
    };
    const first = generateContextCandidates(input);
    expect(first).toHaveLength(5);
    expect(first.every((candidate) => candidate.primarySource === "harmonicContext")).toBe(true);
    expect(first).toEqual(generateContextCandidates(input));
  });
});
