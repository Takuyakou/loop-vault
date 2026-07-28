import { describe, expect, it } from "vitest";
import { chordPitchClasses } from "../../src/domain/chordVoicing";
import { makeChordSymbol, normalizePc } from "../../src/domain/chords";
import type { ChordQuality } from "../../src/domain/types";
import {
  generatePartACompanion,
  rankWithIncumbentPreference,
  type PartASourceCandidate,
} from "./partAShadow";

const qualities: readonly ChordQuality[] = [
  "min7",
  "min9",
  "maj9",
  "dom7sus4",
  "dom13",
  "maj7",
  "dom7",
  "maj",
  "add9",
];

describe("Phase 4.7 Part A shadow", () => {
  it("generates a root-position companion generically across qualities and roots", () => {
    for (const quality of qualities) {
      for (let root = 0; root < 12; root += 1) {
        const plain = makeChordSymbol(root, quality);
        const slashBass = chordPitchClasses(plain)
          .find((pitchClass) => pitchClass !== root);
        expect(slashBass).toBeDefined();
        const source = makeChordSymbol(root, quality, [], slashBass);
        const result = generatePartACompanion(
          [{ chord: source, rawScore: 1.25 }],
          supportFor(plain),
        );
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]?.chord.label).toBe(plain.label);
        expect(result.candidates[0]?.rawScore).toBe(1.25);
        expect(result.candidates[0]?.provenance.noteInstanceIds.length)
          .toBeGreaterThanOrEqual(3);
        expect(result.candidates[0]?.provenance.canonicalRoundTrip.passed)
          .toBe(true);
      }
    }
  });

  it("does not add a duplicate or invent missing note provenance", () => {
    const plain = makeChordSymbol(2, "min7");
    const slash = makeChordSymbol(2, "min7", [], 9);
    expect(generatePartACompanion(
      [
        { chord: slash, rawScore: 1 },
        { chord: plain, rawScore: 0.9 },
      ],
      supportFor(plain),
    ).candidates).toHaveLength(0);
    expect(generatePartACompanion(
      [{ chord: slash, rawScore: 1 }],
      supportFor(plain).slice(0, 2),
    ).candidates).toHaveLength(0);
  });

  it("keeps the incumbent winner and all incumbent relative order at score ties", () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      const baseline = deterministicCandidates(seed);
      const source = baseline[0]!;
      const slash = makeChordSymbol(
        source.chord.root,
        source.chord.quality,
        [...source.chord.tensions],
        normalizePc(source.chord.root + 7),
      );
      const generated = generatePartACompanion(
        [{ chord: slash, rawScore: source.rawScore }],
        supportFor(makeChordSymbol(slash.root, slash.quality)),
      ).candidates;
      const ranked = rankWithIncumbentPreference(baseline, generated);
      expect(ranked[0]?.chord.label).toBe(baseline[0]?.chord.label);
      expect(ranked[0]?.rawScore).toBe(baseline[0]?.rawScore);
      expect(ranked.filter((candidate) => candidate.baseline)
        .map((candidate) => candidate.chord.label))
        .toEqual(baseline.map((candidate) => candidate.chord.label));
    }
  });

  it("is deterministic and never exceeds one candidate per event", () => {
    const plain = makeChordSymbol(9, "min9");
    const input = [
      { chord: makeChordSymbol(9, "min9", [], 0), rawScore: 1.1 },
    ];
    const notes = supportFor(plain);
    const first = generatePartACompanion(input, notes);
    const second = generatePartACompanion(input, notes);
    expect(first).toEqual(second);
    expect(first.candidates.length).toBeLessThanOrEqual(1);
  });
});

function supportFor(chord: ReturnType<typeof makeChordSymbol>) {
  return chordPitchClasses(chord).map((pitchClass, index) => ({
    noteInstanceId: `note-${index}-${pitchClass}`,
    pitchClass,
  }));
}
function deterministicCandidates(seed: number): PartASourceCandidate[] {
  const score = 1 + (seed % 5) * 0.01;
  return [
    { chord: makeChordSymbol(seed % 12, "maj7"), rawScore: score },
    { chord: makeChordSymbol((seed + 5) % 12, "min7"), rawScore: score },
    { chord: makeChordSymbol((seed + 7) % 12, "dom7"), rawScore: score - 0.1 },
  ];
}
