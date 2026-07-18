import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { analyzeCanonicalVoicingPair, generateSmoothCandidates } from "./smoothCandidates";

const c = makeChordSymbol(0, "maj7");
const dm = makeChordSymbol(2, "min7");
const g = makeChordSymbol(7, "dom7");

describe("smooth chord candidates", () => {
  it("measures Chord Drip pair features on deterministic canonical voicings", () => {
    const first = analyzeCanonicalVoicingPair(c, dm);
    const second = analyzeCanonicalVoicingPair(c, dm);
    expect(first).toEqual(second);
    expect(first.commonToneCount).toBeGreaterThan(0);
    expect(first.totalVoiceMovement).toBeGreaterThanOrEqual(0);
    expect(first.bassMovement).toBeGreaterThanOrEqual(0);
  });

  it("uses previous and next context and excludes the current chord", () => {
    const result = generateSmoothCandidates({
      previousChord: c,
      currentChord: dm,
      nextChord: g,
      progression: [c, dm, g],
      targetIndex: 1,
      keySignature: "C major",
      durationBeats: 4,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((candidate) => candidate.chord.label !== dm.label)).toBe(true);
    expect(result.every((candidate) => candidate.primarySource === "smoothConnection")).toBe(true);
    expect(generateSmoothCandidates({
      previousChord: c,
      currentChord: dm,
      nextChord: g,
      progression: [c, dm, g],
      targetIndex: 1,
      keySignature: "C major",
      durationBeats: 4,
    })).toEqual(result);
  });

  it("wraps first and last context only when loop is enabled", () => {
    const first = generateSmoothCandidates({
      currentChord: c,
      nextChord: dm,
      progression: [c, dm, g],
      targetIndex: 0,
      keySignature: "C major",
      durationBeats: 4,
      loop: true,
    });
    const last = generateSmoothCandidates({
      previousChord: dm,
      currentChord: g,
      progression: [c, dm, g],
      targetIndex: 2,
      keySignature: "C major",
      durationBeats: 4,
      loop: true,
    });
    expect(first.length).toBeGreaterThan(0);
    expect(last.length).toBeGreaterThan(0);
  });

  it("rejects impossible duration input", () => {
    expect(generateSmoothCandidates({
      currentChord: c,
      progression: [c],
      targetIndex: 0,
      durationBeats: 0,
    })).toEqual([]);
  });
});
