import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { addBassPlainCompanion } from "./accuracyFirstCandidates";

function chord(label: string) {
  return parseChordLabel(label)!;
}

describe("Accuracy First bass companion", () => {
  const histogram = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
  const baseline = [
    { chord: chord("Cm"), confidence: 0.9 },
    { chord: chord("F"), confidence: 0.8 },
    { chord: chord("G7"), confidence: 0.7 },
    { chord: chord("Am7"), confidence: 0.6 },
    { chord: chord("Dm"), confidence: 0.5 },
  ];

  it("keeps Product Top-3 and adds the plain identity deterministically", () => {
    const first = addBassPlainCompanion(chord("C/E"), baseline, histogram, 1);
    const second = addBassPlainCompanion(chord("C/E"), baseline, histogram, 1);
    expect(first.slice(0, 2)).toEqual(baseline.slice(0, 2));
    expect(first[2]?.chord.label).toBe("C");
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
  });

  it("leaves the candidate sequence byte-equivalent when no companion applies", () => {
    expect(addBassPlainCompanion(chord("C"), baseline, histogram, 1)).toEqual(baseline);
    expect(addBassPlainCompanion(chord("C/E"), baseline, [1], 1)).toEqual(baseline);
  });

  it("does not create duplicate identities", () => {
    const withPlain = [{ chord: chord("C"), confidence: 0.95 }, ...baseline];
    expect(addBassPlainCompanion(chord("C/E"), withPlain, histogram, 1)).toEqual(withPlain);
  });
});
