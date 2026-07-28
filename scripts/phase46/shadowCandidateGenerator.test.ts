import { describe, expect, it } from "vitest";
import { chordIdentityKey, normalizeChordSymbol } from "../../src/domain/chordIdentity";
import { makeChordSymbol, normalizePc } from "../../src/domain/chords";
import {
  generateRootPositionMin7Shadows,
  shadowCandidateToChord,
} from "./shadowCandidateGenerator";

describe("Phase 4.6 bounded compositional Shadow generator", () => {
  it("generates one provenance-complete root-position min7 companion", () => {
    const source = makeChordSymbol(2, "min7", [], 0);
    const input = {
      rawCandidates: [{ chord: source, rawScore: 1.2 }],
      supportingNotes: [2, 5, 9, 0].map((pitchClass) => ({
        noteInstanceId: `note-${pitchClass}`,
        pitchClass,
      })),
    };
    const result = generateRootPositionMin7Shadows(input);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      root: "D",
      triad: "minor",
      seventh: "minor7",
      tensions: [],
      counterfactualScore: 1.2,
    });
    expect(result.candidates[0].supportingNoteInstanceIds).toHaveLength(4);
    expect(shadowCandidateToChord(result.candidates[0])?.label).toBe("Dm7");
    expect(input.rawCandidates[0].chord).toEqual(source);
  });

  it("does not generate without complete note-instance provenance", () => {
    const result = generateRootPositionMin7Shadows({
      rawCandidates: [{ chord: makeChordSymbol(2, "min7", [], 0), rawScore: 1 }],
      supportingNotes: [2, 5, 9].map((pitchClass) => ({
        noteInstanceId: `note-${pitchClass}`,
        pitchClass,
      })),
    });
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.skippedInsufficientProvenance).toBe(1);
  });

  it("preserves canonical dedup and the four-candidate event budget", () => {
    const rawCandidates = Array.from({ length: 12 }, (_, root) => ({
      chord: makeChordSymbol(root, "min7", [], normalizePc(root + 3)),
      rawScore: 2 - root / 100,
    }));
    const supportingNotes = Array.from({ length: 12 }, (_, pitchClass) => ({
      noteInstanceId: `note-${pitchClass}`,
      pitchClass,
    }));
    const result = generateRootPositionMin7Shadows({ rawCandidates, supportingNotes });
    expect(result.candidates).toHaveLength(4);
    expect(result.diagnostics.canonicalDuplicateCount).toBe(0);
    expect(result.diagnostics.skippedEventBudget).toBe(8);
  });

  it("is deterministic and transposition-general across all 12 roots", () => {
    for (let root = 0; root < 12; root += 1) {
      const required = [0, 3, 7, 10].map((interval) => normalizePc(root + interval));
      const input = {
        rawCandidates: [{
          chord: makeChordSymbol(root, "min7", [], normalizePc(root + 3)),
          rawScore: 1.1,
        }],
        supportingNotes: required.map((pitchClass, index) => ({
          noteInstanceId: `${root}-${index}`,
          pitchClass,
        })).reverse(),
      };
      const first = generateRootPositionMin7Shadows(input);
      const second = generateRootPositionMin7Shadows(input);
      expect(first).toEqual(second);
      expect(first.candidates).toHaveLength(1);
      const chord = shadowCandidateToChord(first.candidates[0]);
      expect(chord).not.toBeNull();
      expect(chordIdentityKey(normalizeChordSymbol(chord!)))
        .toBe(first.candidates[0].canonicalIdentity);
    }
  });

  it("rejects existing root positions and non-min7 families", () => {
    const slash = makeChordSymbol(2, "min7", [], 0);
    const rootPosition = makeChordSymbol(2, "min7");
    const result = generateRootPositionMin7Shadows({
      rawCandidates: [
        { chord: slash, rawScore: 1.2 },
        { chord: rootPosition, rawScore: 1.1 },
        { chord: makeChordSymbol(9, "min9", [], 0), rawScore: 1.3 },
      ],
      supportingNotes: [2, 5, 9, 0].map((pitchClass) => ({
        noteInstanceId: `note-${pitchClass}`,
        pitchClass,
      })),
    });
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.skippedExistingCanonical).toBe(1);
    expect(result.diagnostics.eligibleSourceCount).toBe(1);
  });
});
