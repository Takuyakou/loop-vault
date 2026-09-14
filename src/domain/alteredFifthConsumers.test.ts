import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "./chords";
import { buildPracticeChordRequirements } from "./practice/chordRequirements";
import { buildSimilarityContext } from "./progressionEditing/similarSegments";
import { analyzeCanonicalVoicingPair } from "./progressionEditing/smoothCandidates";
import type { EditableChordSlot } from "./progressionEditing/types";
import { getStyleCompatibility } from "./voicingPractice/compatibility";

const altered = makeChordSymbol(0, "dom7", ["#5"]);

describe("explicit altered fifth downstream contracts", () => {
  it("requires the altered fifth and never accepts the replaced natural fifth", () => {
    for (const leniency of ["easy", "normal", "strict"] as const) {
      const requirements = buildPracticeChordRequirements(altered, leniency);
      expect(requirements.requiredPitchClasses).toContain(8);
      expect(requirements.allowedPitchClasses).toEqual([0, 4, 8, 10]);
    }
    expect(buildPracticeChordRequirements(makeChordSymbol(0, "dom7", ["b13"]), "normal")
      .allowedPitchClasses).toContain(7);
  });

  it("does not invent a natural fifth for correction similarity or smooth movement", () => {
    const slot: EditableChordSlot = {
      id: "altered", position: { bar: 1, beat: 1, durationBeats: 4 },
      originalChord: altered, currentChord: altered,
      alternatives: [], warnings: [], edited: false,
    };
    const profile = buildSimilarityContext([slot]).segments?.altered.weightedPcp;
    expect(profile?.[7]).toBe(0);
    expect(profile?.[8]).toBeGreaterThan(0);
    const g = makeChordSymbol(7, "maj");
    expect(analyzeCanonicalVoicingPair(altered, g).commonToneCount).toBe(0);
    expect(analyzeCanonicalVoicingPair(makeChordSymbol(0, "dom7", ["b13"]), g)
      .commonToneCount).toBe(1);
    // #5 replaces only a natural fifth, not an independently encoded b5.
    expect(analyzeCanonicalVoicingPair(makeChordSymbol(0, "dim", ["#5"]), makeChordSymbol(6, "maj"))
      .commonToneCount).toBeGreaterThan(0);
  });

  it("fails closed for an unapproved rootless altered-fifth lesson without banning exact generation", () => {
    expect(getStyleCompatibility(altered, "rootless-ab").supported).toBe(false);
    expect(getStyleCompatibility(altered, "open-17").supported).toBe(true);
    expect(getStyleCompatibility(makeChordSymbol(0, "dom7"), "rootless-ab").supported).toBe(true);
  });
});
