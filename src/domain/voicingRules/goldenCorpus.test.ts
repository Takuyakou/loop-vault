import { describe, expect, it } from "vitest";
import { VOICING_RULE_GOLDEN_CORPUS } from "./goldenCorpus";
import type {
  VoicingCoverage,
  VoicingRuleContext,
  VoicingRuleExplanation,
  VoicingRuleIdentity,
  VoicingRuleProvenance,
  VoicingRuleSource,
  VoicingStudyCategory,
} from "./types";

describe("P5.33 domain axes and Golden Corpus", () => {
  it("keeps S01-S16 ordered, unique, and explicit about representability", () => {
    expect(VOICING_RULE_GOLDEN_CORPUS.map(({ id }) => id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`),
    );
    expect(new Set(VOICING_RULE_GOLDEN_CORPUS.map(({ id }) => id)).size).toBe(16);
    expect(VOICING_RULE_GOLDEN_CORPUS.filter(({ representable }) => !representable)).toEqual([
      expect.objectContaining({ id: "S16", deferredReason: expect.any(String) }),
    ]);
  });

  it("models source, study, identity, coverage, context, and provenance independently", () => {
    const source: VoicingRuleSource = "lesson-rules";
    const study: VoicingStudyCategory = "core";
    const identity: VoicingRuleIdentity = {
      ruleId: "V25",
      family: "slash-bass-upper-structure",
      variantId: "compact",
    };
    const coverage: VoicingCoverage = "performance-reduction";
    const context: VoicingRuleContext = { bass: "self-played", top: "normal-voicing-top" };
    const provenance: VoicingRuleProvenance = {
      kind: "analysis-proposal",
      sourceIds: ["T03", "W07", "W13"],
      note: "Pitch accounting is promoted; concrete fingering is not teacher evidence.",
    };
    const explanation: VoicingRuleExplanation = {
      source,
      study,
      identity,
      coverage,
      context,
      provenance,
      omittedDegrees: ["5"],
      addedDegrees: [],
      topRole: "normal-voicing-top",
      candidateIndex: 1,
      candidateCount: 2,
    };

    expect(explanation).toMatchObject({ source, study, identity, coverage, context, provenance });
  });

  it("does not mislabel an app-selected top as a fixed Melody", () => {
    const context: VoicingRuleContext = { bass: "self-played", top: "top-candidate" };
    expect(context.top).not.toBe("fixed-melody");
  });
});
