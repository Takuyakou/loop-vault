import { describe, expect, it } from "vitest";
import { scoreChordCandidates } from "./candidates";
import type { WeightedPitchProfile } from "./profiles";

function profile(pcs: number[], bass = pcs[0]): WeightedPitchProfile {
  const values = Array(12).fill(0) as number[];
  pcs.forEach((pc) => { values[pc] = 1; });
  const bassPcs = Array(12).fill(0) as number[];
  bassPcs[bass] = 1;
  return { qualityPcs: values, rootPcs: [...values], bassPcs, topPcs: Array(12).fill(0), totalWeight: pcs.length };
}

describe("chord candidate scoring", () => {
  it("keeps C6 and Am7/C in Top-K for the ambiguous pitch set", () => {
    const labels = scoreChordCandidates(profile([0, 4, 7, 9], 0)).map((entry) => entry.chord.label);
    expect(labels).toContain("C6");
    expect(labels).toContain("Am7/C");
  });

  it("uses key only as a weak prior", () => {
    const borrowed = scoreChordCandidates(profile([0, 3, 7]), { startBeat: 0, endBeat: 4, tonicPitchClass: 0, mode: "major", score: 1 });
    expect(borrowed.some((entry) => entry.chord.label === "Cm")).toBe(true);
  });
});
