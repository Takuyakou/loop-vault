import { describe, expect, it } from "vitest";

import { chordFixture } from "../p534/fixtures";
import {
  evaluateFamilyCPrivatePromotion,
  type FamilyCPromotionPrivateAggregate,
} from "./privatePromotionEvaluation";
import {
  selectPrivateEvaluationDirectory,
  selectSinglePrivateCandidate,
  serializePrivatePromotionAggregate,
} from "./privatePromotionRunner";

describe("P5.39-03 privacy-safe promotion aggregate", () => {
  it("is deterministic, bounded, source-immutable, conservative, and conserved", () => {
    const bytes = chordFixture([48, 51, 52, 56, 58], {
      ticksPerBeat: 96,
      numerator: 4,
      denominator: 4,
    });
    const before = Uint8Array.from(bytes);
    const first = evaluateFamilyCPrivatePromotion(bytes);
    const second = evaluateFamilyCPrivatePromotion(bytes);
    const classified = Object.values(first.changeReview)
      .reduce((sum, count) => sum + count, 0);

    expect(second).toEqual(first);
    expect(first.candidateVisits).toEqual({ min: 276, max: 276 });
    expect(first.knownImprovements).toBe(0);
    expect(first.changeReview["CONFIRMED-KNOWN-TARGET"]).toBe(0);
    expect(classified).toBe(first.changedIdentities);
    expect(first.newFamilyCCandidateWins).toBeLessThanOrEqual(first.changedIdentities);
    expect(first.classificationConserved).toBe(true);
    expect(first.ambiguityAssessment).toBe("UNVERIFIED");
    expect(first.targetFamilies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        independentGroundTruthBinding: "UNAVAILABLE",
        privateRepresentability: "NOT_VERIFIABLE",
        privateRankMovement: null,
      }),
    ]));
    expect(first.sourceBytesUnchanged).toBe(true);
    expect(first.sourceNotesAndTimingUnchanged).toBe(true);
    expect(bytes).toEqual(before);
  });

  it("serializes only the explicit aggregate allowlist", () => {
    const aggregate = evaluateFamilyCPrivatePromotion(chordFixture([48, 51, 52, 56, 58]));
    const serialized = serializePrivatePromotionAggregate(aggregate);

    expect(JSON.parse(serialized)).toEqual(aggregate);
    expect(serialized).not.toMatch(/(?:file|path|checksum|hash|rawNotes|audio|progression)/i);
  });

  it("fails closed for non-unique fixtures and non-allowlisted output", () => {
    expect(() => selectSinglePrivateCandidate([])).toThrow(/could not be selected uniquely/);
    expect(() => selectSinglePrivateCandidate(["a", "b"])).toThrow(/could not be selected uniquely/);
    expect(selectSinglePrivateCandidate(["opaque"])).toBe("opaque");

    const aggregate = evaluateFamilyCPrivatePromotion(chordFixture([48, 51, 52, 56, 58]));
    const unsafe = {
      ...aggregate,
      sourcePath: "forbidden",
    } as FamilyCPromotionPrivateAggregate;
    expect(() => serializePrivatePromotionAggregate(unsafe)).toThrow(/allowlist/);
  });

  it("accepts exactly one directory argument for direct Node and vite-node argv shapes", () => {
    expect(selectPrivateEvaluationDirectory([
      "node",
      "scripts/p539/run-stage03-private-evaluation.ts",
      "synthetic-directory",
    ])).toBe("synthetic-directory");
    expect(selectPrivateEvaluationDirectory([
      "node",
      "node_modules/vite-node/vite-node.mjs",
      "scripts\\p539\\run-stage03-private-evaluation.ts",
      "synthetic-directory",
    ])).toBe("synthetic-directory");
  });

  it.each([
    [["node", "scripts/p539/run-stage03-private-evaluation.ts"]],
    [["node", "scripts/p539/run-stage03-private-evaluation.ts", "one", "two"]],
    [["node", "node_modules/vite-node/vite-node.mjs", "synthetic-directory"]],
  ])("fails closed for missing, extra, or unidentifiable CLI arguments", (processArgv) => {
    expect(() => selectPrivateEvaluationDirectory(processArgv)).toThrow(/private evaluation/);
  });

  it.each([
    ["candidateVisits.notes", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      candidateVisits: { ...aggregate.candidateVisits, notes: [] },
    })],
    ["changeReview.bytes", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      changeReview: { ...aggregate.changeReview, bytes: 1 },
    })],
    ["targetFamilies.bar", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      targetFamilies: [{ ...aggregate.targetFamilies[0]!, bar: 1 }, ...aggregate.targetFamilies.slice(1)],
    })],
    ["targetFamilies.beat", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      targetFamilies: [{ ...aggregate.targetFamilies[0]!, beat: 1 }, ...aggregate.targetFamilies.slice(1)],
    })],
    ["targetFamilies.rootPitchClass", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      targetFamilies: [
        { ...aggregate.targetFamilies[0]!, rootPitchClass: 0 },
        ...aggregate.targetFamilies.slice(1),
      ],
    })],
  ])("rejects unknown nested key %s", (_label, inject) => {
    const aggregate = evaluateFamilyCPrivatePromotion(chordFixture([48, 51, 52, 56, 58]));
    expect(() => serializePrivatePromotionAggregate(
      inject(aggregate) as FamilyCPromotionPrivateAggregate,
    )).toThrow(/allowlist/);
  });

  it.each([
    ["candidateVisits.min", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      candidateVisits: { ...aggregate.candidateVisits, min: "276" },
    })],
    ["changeReview.UNRESOLVED", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      changeReview: { ...aggregate.changeReview, UNRESOLVED: "0" },
    })],
    ["targetFamilies.anonymousFamily", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      targetFamilies: [
        { ...aggregate.targetFamilies[0]!, anonymousFamily: 1 },
        ...aggregate.targetFamilies.slice(1),
      ],
    })],
    ["deterministic", (aggregate: FamilyCPromotionPrivateAggregate) => ({
      ...aggregate,
      deterministic: "true",
    })],
  ])("rejects invalid nested primitive %s", (_label, inject) => {
    const aggregate = evaluateFamilyCPrivatePromotion(chordFixture([48, 51, 52, 56, 58]));
    expect(() => serializePrivatePromotionAggregate(
      inject(aggregate) as FamilyCPromotionPrivateAggregate,
    )).toThrow(/Private evaluation output/);
  });
});
