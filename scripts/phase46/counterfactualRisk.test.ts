import { describe, expect, it } from "vitest";
import { normalizeChordLabel } from "../../src/domain/chordIdentity";
import { classifyCounterfactualChange } from "./counterfactualRisk";

describe("Phase 4.6 counterfactual risk classification", () => {
  it("classifies a tied slash-to-root-position rescue", () => {
    const before = normalizeChordLabel("Dm7/C")!;
    const after = normalizeChordLabel("Dm7")!;
    expect(classifyCounterfactualChange({
      before,
      after,
      expected: after,
      beforeScore: 1.1,
      afterScore: 1.1,
    })).toEqual([
      "correct-new-rank1",
      "tie-break-only",
      "slash-only-change",
    ]);
  });

  it("classifies root, quality, tension and altered displacement separately", () => {
    expect(classifyCounterfactualChange({
      before: normalizeChordLabel("A7")!,
      after: normalizeChordLabel("Bb7b9")!,
      expected: normalizeChordLabel("A7")!,
      beforeScore: 1,
      afterScore: 1.1,
    })).toEqual([
      "incorrect-new-rank1",
      "root-changed",
      "plain-stolen-by-altered",
    ]);
    expect(classifyCounterfactualChange({
      before: normalizeChordLabel("Am7")!,
      after: normalizeChordLabel("Amaj7")!,
      expected: null,
      beforeScore: 1,
      afterScore: 1.1,
    })).toContain("quality-only-change");
    expect(classifyCounterfactualChange({
      before: normalizeChordLabel("A7")!,
      after: normalizeChordLabel("A7b9")!,
      expected: null,
      beforeScore: 1,
      afterScore: 1.1,
    })).toContain("tension-only-change");
  });
});
