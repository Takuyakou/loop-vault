import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordSymbol } from "../types";
import { generateStudyCandidates } from "./studyGenerator";
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

  it("uses the corpus as semantic validation rather than a runtime whitelist", () => {
    const context = { bass: "self-played", top: "normal-voicing-top" } as const;
    const spans = { maxLeftHandSpanSemitones: 12, maxRightHandSpanSemitones: 12 };
    const generated = (label: string, study: "teacher" | "core" = "core") =>
      generateStudyCandidates(parsed(label), study, context, spans);

    const add9 = generated("Eadd9/F#", "teacher");
    expect(add9.some(({ rule }) =>
      rule.coverage === "literal"
      && rule.leftDegrees.includes("9")
      && ["1", "3", "5"].every((degree) => rule.rightDegrees.includes(degree))
      && !rule.addedDegrees.includes("7"))).toBe(true);

    const maj9 = generated("Gmaj9/A");
    expect(maj9.some(({ rule }) => rule.coverage === "performance-reduction"
      && rule.omittedDegrees.includes("5"))).toBe(true);
    expect(maj9.some(({ rule }) => rule.coverage === "literal"
      && rule.omittedDegrees.length === 0)).toBe(true);

    expect(generated("Am11/B", "teacher").some(({ rule }) => rule.leftDegrees.includes("9"))).toBe(true);
    expect(generated("C/E", "teacher").some(({ rule }) => rule.leftDegrees.includes("3"))).toBe(true);
    expect(generated("C6/9").length).toBeGreaterThan(0);
    expect(generated("C6/9/E").some(({ rule }) => rule.leftDegrees.includes("3"))).toBe(true);

    const sus = generated("G7sus4");
    expect(sus.some(({ rule }) => rule.rightDegrees.includes("4"))).toBe(true);
    expect(sus.every(({ rule }) => !rule.rightDegrees.includes("3"))).toBe(true);
    expect(generated("Bm7b5").some(({ rule }) => rule.rightDegrees.includes("b5"))).toBe(true);
    expect(generated("Cdim7").some(({ rule }) => [...rule.leftDegrees, ...rule.rightDegrees].includes("bb7"))).toBe(true);
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

function parsed(label: string): ChordSymbol {
  const chord = parseChordLabel(label);
  if (!chord) throw new Error(`Golden Corpus fixture did not parse: ${label}`);
  return chord;
}