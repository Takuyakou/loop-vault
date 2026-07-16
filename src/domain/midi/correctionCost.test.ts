import { describe, expect, it } from "vitest";
import { makeChordSymbol, parseChordLabel } from "../chords";
import { operationCorrectionCost, operationCorrectionCostFromEditMethod, operationCorrectionCostResult, summarizeOperationCorrectionCosts } from "./correctionCost";

describe("operation correction cost", () => {
  it("assigns the fixed 0-4 costs from the actual candidate and editor paths", () => {
    const detected = {
      primary: "Cmaj7",
      alternatives: ["Dm7", "G7", "Fmaj7", "Am7", "Em7"],
    };
    expect(operationCorrectionCost(detected, ["Cmaj7"])).toBe(0);
    expect(operationCorrectionCost(detected, ["Am7"])).toBe(1);
    expect(operationCorrectionCost(detected, ["Em7"])).toBe(2);
    expect(operationCorrectionCost(detected, ["C7b9"])).toBe(3);
    expect(operationCorrectionCost(detected, ["not-a-chord"])).toBe(4);
    expect(operationCorrectionCost(undefined, ["C"])).toBe(4);
  });

  it("uses the cheapest acceptable answer", () => {
    expect(operationCorrectionCostResult({ primary: "C", alternatives: ["Dm"] }, ["F7b9", "Dm"]))
      .toEqual({ cost: 1, category: "alternative", acceptedLabel: "Dm" });
  });

  it("does not claim tension edits are available in the structure editor", () => {
    expect(operationCorrectionCost({ primary: "C7", alternatives: [] }, ["C7b9"])).toBe(3);
    expect(operationCorrectionCost({ primary: "C7b9", alternatives: [] }, ["D7b9/F#"])).toBe(2);
  });

  it("only treats the four alternatives displayed by Stage B1 as chips", () => {
    expect(operationCorrectionCost({
      primary: "C7b9",
      alternatives: ["D7b9", "E7b9", "F7b9", "G7b9", "A7b9"],
    }, ["A7b9"])).toBe(2);
  });

  it("accepts structured ChordSymbol candidates from analyzer timelines", () => {
    expect(makeChordSymbol(2, "min7")).toEqual(parseChordLabel("Dm7"));
    expect(operationCorrectionCost({
      primary: makeChordSymbol(0, "maj"),
      alternatives: [makeChordSymbol(2, "maj"), makeChordSymbol(5, "min7"), makeChordSymbol(2, "min7")],
    }, ["Dm7"])).toBe(1);
  });

  it("summarizes total, mean, median, p90 and categories", () => {
    expect(summarizeOperationCorrectionCosts([0, 1, 2, 3, 4])).toEqual({
      segmentCount: 5,
      total: 10,
      mean: 2,
      median: 2,
      p90: 4,
      byCost: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
      byCategory: { primary: 1, alternative: 1, "structure-editor": 1, "manual-input": 1, unrepresentable: 1 },
    });
    expect(summarizeOperationCorrectionCosts([0, 1])).toMatchObject({ median: 0.5, p90: 1 });
  });

  it("maps persisted feedback methods without changing their schema names", () => {
    expect(operationCorrectionCostFromEditMethod("alternative-selection")).toBe(1);
    expect(operationCorrectionCostFromEditMethod("structure-editor")).toBe(2);
    expect(operationCorrectionCostFromEditMethod("manual-label")).toBe(3);
    expect(operationCorrectionCostFromEditMethod("manual-input")).toBe(3);
  });
});
