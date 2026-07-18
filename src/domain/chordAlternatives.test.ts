import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "./chords";
import {
  QUICK_CHORD_ALTERNATIVE_LIMIT,
  canonicalChordAlternative,
  selectQuickChordAlternatives,
} from "./chordAlternatives";

describe("quick chord alternatives", () => {
  it("returns zero through five real candidates without inventing entries", () => {
    const current = makeChordSymbol(0, "maj7");
    expect(selectQuickChordAlternatives(current, [])).toEqual([]);
    expect(selectQuickChordAlternatives(current, [alternative(2, "min7", 0.9)])).toHaveLength(1);
    expect(selectQuickChordAlternatives(current, [
      alternative(2, "min7", 0.9),
      alternative(5, "maj7", 0.8),
    ])).toHaveLength(2);
    expect(selectQuickChordAlternatives(current, [0, 1, 2, 3, 4, 5].map((root) => (
      alternative(root + 1, "min7", 1 - root * 0.05)
    )))).toHaveLength(QUICK_CHORD_ALTERNATIVE_LIMIT);
  });

  it("removes the current chord and canonical duplicates while preserving slash bass", () => {
    const current = makeChordSymbol(6, "maj7");
    const enharmonicDuplicate = {
      chord: { ...makeChordSymbol(6, "maj7"), label: "Gbmaj7" },
      confidence: 0.7,
    };
    const plain = alternative(0, "maj7", 0.8);
    const renamedPlain = { chord: { ...plain.chord, label: "C major seven" }, confidence: 0.6 };
    const inversion = { chord: makeChordSymbol(0, "maj7", [], 4), confidence: 0.75 };
    const result = selectQuickChordAlternatives(current, [
      { chord: current, confidence: 1 },
      enharmonicDuplicate,
      plain,
      renamedPlain,
      inversion,
    ]);

    expect(result.map((entry) => entry.chord.label)).toEqual(["Cmaj7", "Cmaj7/E"]);
    expect(new Set(result.map((entry) => canonicalChordAlternative(entry.chord))).size).toBe(2);
  });

  it("keeps analyzer priority while reserving root, quality, and bass diversity", () => {
    const current = makeChordSymbol(0, "maj");
    const result = selectQuickChordAlternatives(current, [
      alternative(0, "maj7", 0.99),
      alternative(0, "add9", 0.98),
      alternative(0, "six", 0.97),
      alternative(7, "dom7", 0.8),
      { chord: makeChordSymbol(9, "min7", [], 0), confidence: 0.7 },
      alternative(5, "maj", 0.6),
    ]);

    expect(result[0]?.chord.label).toBe("Cmaj7");
    expect(result.some((entry) => entry.chord.root === 7)).toBe(true);
    expect(result.some((entry) => entry.chord.bass === 0)).toBe(true);
    expect(result).toHaveLength(5);
  });
});

function alternative(root: number, quality: Parameters<typeof makeChordSymbol>[1], confidence: number) {
  return { chord: makeChordSymbol(root, quality), confidence };
}
