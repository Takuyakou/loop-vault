import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { SavedProgressionBlock } from "../types";
import { degreeOf, degreeSequence, matchProgression, normalizeQuery } from "./degrees";

function block(key: string, roots: number[], qualities: Array<Parameters<typeof makeChordSymbol>[1]>): SavedProgressionBlock {
  return {
    id: "block", summaryText: "Turnaround", detectedKey: key, tags: ["warm"], capturedAt: "2026-01-01T00:00:00.000Z", analyzerVersion: "test",
    chords: roots.map((root, index) => ({ bar: index + 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(root, qualities[index]), confidence: 1, alternatives: [], warnings: [] })),
  };
}

describe("degrees", () => {
  it("formats major, minor, borrowed flat-seven, and slash degrees", () => {
    expect(degreeOf(makeChordSymbol(5, "maj7"), "C")?.label).toBe("IVmaj7");
    expect(degreeOf(makeChordSymbol(9, "min7"), "C")?.label).toBe("vi7");
    expect(degreeOf(makeChordSymbol(10, "dom9"), "C")?.label).toBe("♭VII9");
    expect(degreeOf(makeChordSymbol(7, "dom7", [], 11), "C")?.label).toBe("V7/3rd");
    expect(degreeOf(makeChordSymbol(9, "min"), "Am")?.label).toBe("i");
  });

  it("searches number sequences across transposed progressions", () => {
    const c = block("C", [5, 7, 4, 9], ["maj", "dom7", "min", "min"]);
    const d = block("D", [7, 9, 6, 11], ["maj", "dom7", "min", "min"]);
    const query = normalizeQuery("4-5-3-6");
    expect(query.kind).toBe("degree");
    expect(matchProgression(c, query)).toBe(true);
    expect(matchProgression(d, query)).toBe(true);
    expect(degreeSequence(c)).toEqual(["IV", "V7", "iii", "vi"]);
  });

  it("matches roman queries as a partial sequence and real chord labels directly", () => {
    const value = block("C", [0, 5, 7, 4, 9], ["maj", "maj7", "dom7", "min", "min"]);
    const roman = normalizeQuery("IV-V-iii-vi");
    const chord = normalizeQuery("Fmaj7");
    expect(matchProgression(value, roman)).toBe(true);
    expect(matchProgression(value, chord)).toBe(true);
  });
});
