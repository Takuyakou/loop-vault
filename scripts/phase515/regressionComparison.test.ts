import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { baselineLockSchema } from "./lockContract";
import {
  compareExistingCorpusRegression,
  invariantDeepEqual,
} from "./regressionComparison";

function baseline() {
  return baselineLockSchema.parse(JSON.parse(readFileSync(
    resolve("docs/phase5.15/00-baseline-lock.json"),
    "utf8",
  ))).existingCorpusBaselines;
}

describe("P5.15 stage regression comparison API", () => {
  it("passes an identical non-Holdout observation", () => {
    const frozen = baseline();
    expect(compareExistingCorpusRegression(frozen, structuredClone(frozen)))
      .toMatchObject({ pass: true, issues: [] });
  });

  it("detects accuracy, correction, catalog-size, and determinism regression", () => {
    const frozen = baseline();
    const current = structuredClone(frozen);
    const condition = current.corpora[0]!.conditions[0]!;
    condition.canonicalExact = Math.max(0, condition.canonicalExact - 0.03);
    condition.manualInputRate = Math.min(1, condition.manualInputRate + 0.03);
    condition.correctionCostMean += 0.03;
    condition.duplicateCandidates += 1;
    condition.maxCandidatesPerEvent += 1;
    condition.deterministic = false;
    expect(compareExistingCorpusRegression(frozen, current).issues.map(
      (item) => item.metric,
    )).toEqual(expect.arrayContaining([
      "canonicalExact",
      "manualInputRate",
      "correctionCostMean",
      "duplicateCandidates",
      "maxCandidatesPerEvent",
      "deterministic",
    ]));
  });

  it("detects Voicing Gold regression independently of R2 support data", () => {
    const frozen = baseline();
    const current = structuredClone(frozen);
    current.voicingGold[0]!.metrics.noteF1 = Math.max(
      0,
      current.voicingGold[0]!.metrics.noteF1 - 0.03,
    );
    current.voicingGold[0]!.metrics.melodyLeakRate = Math.min(
      1,
      current.voicingGold[0]!.metrics.melodyLeakRate + 0.03,
    );
    expect(compareExistingCorpusRegression(frozen, current).issues.map(
      (item) => item.metric,
    )).toEqual(expect.arrayContaining(["noteF1", "melodyLeakRate"]));
  });

  it("rejects case and event denominator drift", () => {
    const frozen = baseline();
    const current = structuredClone(frozen);
    current.corpora[0]!.caseCount += 1;
    expect(() => compareExistingCorpusRegression(frozen, current))
      .toThrow(/corpus contract differs/);
  });

  it("provides stable canonical deep equality for invariant stages", () => {
    expect(invariantDeepEqual({ b: 2, a: [1] }, { a: [1], b: 2 })).toBe(true);
    expect(invariantDeepEqual({ a: null }, { a: undefined })).toBe(false);
  });
});
