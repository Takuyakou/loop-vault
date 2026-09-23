import { describe, expect, it } from "vitest";

import { normalizePc } from "../../src/domain/chords";
import { detectorQualities } from "../../src/domain/midi/evaluation/metricsV2";
import { diagnoseLegacyWindowCandidates } from "../../src/domain/midi/legacy";
import { phase4QualityEvidence } from "../../src/domain/midi/phase4Analyzer";
import { chordFixture } from "../p534/fixtures";
import {
  FAMILY_C_TARGET_ARCHETYPES,
  buildFamilyCTargetIdentities,
  buildFamilyCTargetSlashIdentities,
  buildIndividualAlterationNeighborIdentities,
  buildShadowMetamorphicVariants,
  formatShadowIdentity,
  productionControlIdentity,
  shadowIdentityKey,
  shadowUpperIntervals,
  type ShadowRootRelativeIdentity,
} from "./shadowRootRelativeIdentity";
import {
  FAMILY_C_SHADOW_CANDIDATE_COUNT,
  PRODUCTION_BASE_CANDIDATE_COUNT,
  STAGE02_MAX_CANDIDATE_VISITS,
  STAGE02_MISSING_EXPLICIT_FACT_PENALTY,
  STAGE02_OMISSION_CONFLICT_PENALTY,
  STAGE02_SHADOW_CANDIDATE_VISITS,
  buildStage02ShadowCandidates,
  detectorVocabularyParityGuard,
  diagnoseStage02Target,
  exactRankingEvidence,
  familyCTargetArchetypeCount,
  rankStage02ShadowCandidates,
  rankingEvidenceFromNotes,
} from "./shadowCandidateRanking";

const FROZEN_PRODUCTION_LEGACY_QUALITY_ORDER = [
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "six", "min6", "sixNine", "sus2", "sus4", "dom7sus4", "add9", "maj9",
  "min9", "dom9", "min11", "dom13",
] as const;

function midiPitches(identity: ShadowRootRelativeIdentity, bass?: number): number[] {
  const intervals = shadowUpperIntervals(identity);
  if (!intervals) throw new Error("invalid test identity");
  const rootMidi = 48 + normalizePc(identity.rootPitchClass);
  const upper = intervals.map((interval) => rootMidi + interval);
  return bass === undefined ? upper : [36 + normalizePc(bass), ...upper.map((pitch) => pitch + 12)];
}

function maxIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

function isFamilyC(reason: string): boolean {
  return reason === "family-c-target-a" || reason === "family-c-target-b";
}

describe("P5.39-02 generalized candidate / ranking Shadow", () => {
  it("enumerates the unchanged production 252 followed by exactly 24 Family-C targets", () => {
    const candidates = buildStage02ShadowCandidates();

    expect(detectorVocabularyParityGuard()).toBe(true);
    expect(familyCTargetArchetypeCount()).toBe(2);
    expect(PRODUCTION_BASE_CANDIDATE_COUNT).toBe(252);
    expect(FAMILY_C_SHADOW_CANDIDATE_COUNT).toBe(24);
    expect(candidates).toHaveLength(STAGE02_SHADOW_CANDIDATE_VISITS);
    expect(STAGE02_SHADOW_CANDIDATE_VISITS).toBe(276);
    expect(STAGE02_SHADOW_CANDIDATE_VISITS).toBeLessThanOrEqual(STAGE02_MAX_CANDIDATE_VISITS);
    expect(candidates.map((entry) => entry.enumerationIndex)).toEqual(
      Array.from({ length: 276 }, (_, index) => index),
    );
    expect(candidates.slice(0, 252).every((entry) => (
      entry.generationReason === "production-base-candidate"
    ))).toBe(true);
    expect(candidates.slice(252).filter((entry) => (
      entry.generationReason === "family-c-target-a"
    ))).toHaveLength(12);
    expect(candidates.slice(252).filter((entry) => (
      entry.generationReason === "family-c-target-b"
    ))).toHaveLength(12);

    const expectedProductionKeys = Array.from({ length: 12 }, (_, root) => (
      FROZEN_PRODUCTION_LEGACY_QUALITY_ORDER.map((quality) => (
        shadowIdentityKey(productionControlIdentity(root, quality))
      ))
    )).flat();
    expect(candidates.slice(0, 252).map((entry) => entry.identityKey)).toEqual(
      expectedProductionKeys,
    );
    expect(new Set(candidates.map((entry) => entry.identityKey))).toHaveLength(276);
  });

  it("matches the production legacy scorer for all 252 existing candidates on a large generated corpus", () => {
    expect(detectorQualities).toHaveLength(21);
    for (let root = 0; root < 12; root += 1) {
      for (const quality of detectorQualities) {
        const identity = productionControlIdentity(root, quality);
        const bytes = chordFixture(midiPitches(identity), {
          ticksPerBeat: 96,
          numerator: 4,
          denominator: 4,
        });
        const diagnostic = diagnoseLegacyWindowCandidates(bytes, {
          useQualityEvidence: true,
          qualityEvidence: phase4QualityEvidence,
        })[0];
        expect(diagnostic).toBeDefined();
        if (!diagnostic?.histogram || !diagnostic.bassHistogram) {
          throw new Error("legacy diagnostic omitted histogram evidence");
        }
        const shadow = rankStage02ShadowCandidates({
          histogram: diagnostic.histogram,
          bassPitchClass: maxIndex(diagnostic.bassHistogram),
        });
        const existing = shadow.rankedCandidates.filter((entry) => (
          entry.generationReason === "production-base-candidate"
        ));
        expect(existing).toHaveLength(252);
        expect(existing.map((entry) => entry.canonicalLabel)).toEqual(
          diagnostic.candidates.map((entry) => entry.chord.label),
        );
        existing.forEach((entry, index) => {
          expect(entry.score).toBeCloseTo(diagnostic.candidates[index].rawScore, 12);
        });
      }
    }
  }, 30_000);

  it("binds production parity to phase4's 0.08 quality penalty and separates Shadow extensions", () => {
    expect(phase4QualityEvidence).toMatchObject({
      scope: "full",
      penalty: 0.08,
      presenceThreshold: 0.02,
    });
    expect(STAGE02_MISSING_EXPLICIT_FACT_PENALTY).toBe(0.35);
    expect(STAGE02_OMISSION_CONFLICT_PENALTY).toBe(0.35);
  });

  it("generates and ranks all 24 exact base targets at top-1 with explicit canonical facts", () => {
    const targets = buildFamilyCTargetIdentities();
    expect(targets).toHaveLength(24);

    for (const { identity } of targets) {
      const result = rankStage02ShadowCandidates(exactRankingEvidence(identity));
      const diagnostic = diagnoseStage02Target(result, identity);
      expect(result.candidateVisits).toBe(276);
      expect(diagnostic).toMatchObject({
        classification: "TOP1_CORRECT",
        candidateGenerated: true,
        candidatePresentBeforeRanking: true,
        candidateRank: 1,
      });
      expect(result.topCandidate.identityKey).toBe(shadowIdentityKey(identity));
      expect(result.topCandidate.canonicalLabel).toBe(formatShadowIdentity(identity));
      expect(result.topCandidate.canonicalLabel).toContain("no5");
      expect(result.topCandidate.canonicalLabel).not.toMatch(/alt/i);
      expect(result.topCandidate.explanation.missingExpectedTones).toEqual([]);
      expect(result.topCandidate.explanation.omissionConflicts).toEqual([]);
      expect(result.topCandidate.explanation.matchedExplicitModifiers.length).toBeGreaterThan(0);
    }
  });

  it("keeps top-1 invariant across all nine Stage01 order/register/octave/doubling transforms", () => {
    const rows = buildFamilyCTargetIdentities().flatMap(({ identity }) => (
      buildShadowMetamorphicVariants(identity).map((variant) => ({ identity, variant }))
    ));
    expect(rows).toHaveLength(24 * 9);

    for (const { identity, variant } of rows) {
      const sourceBefore = structuredClone(variant.notes);
      const result = rankStage02ShadowCandidates(rankingEvidenceFromNotes(
        variant.notes,
        identity.rootPitchClass,
      ));
      expect(result.topCandidate.identityKey).toBe(shadowIdentityKey(identity));
      expect(variant.notes).toEqual(sourceBefore);
    }
  });

  it("preserves all 252 supported controls and 12 slash controls without verbose labels", () => {
    let controls = 0;
    for (let root = 0; root < 12; root += 1) {
      for (const quality of detectorQualities) {
        const identity = productionControlIdentity(root, quality);
        const result = rankStage02ShadowCandidates(exactRankingEvidence(identity));
        expect(result.topCandidate.identityKey).toBe(shadowIdentityKey(identity));
        expect(isFamilyC(result.topCandidate.generationReason)).toBe(false);
        controls += 1;
      }

      const bass = normalizePc(root + 4);
      const slash = productionControlIdentity(root, "maj", bass);
      const result = rankStage02ShadowCandidates(exactRankingEvidence(slash));
      expect(result.topCandidate.identityKey).toBe(shadowIdentityKey(slash));
      expect(isFamilyC(result.topCandidate.generationReason)).toBe(false);
      controls += 1;
    }
    expect(controls).toBe(264);
  });

  it("rejects all 24 with-fifth neighbors as exact no5 winners", () => {
    for (const { identity } of buildFamilyCTargetIdentities()) {
      const result = rankStage02ShadowCandidates(exactRankingEvidence(identity, {
        includeOmittedFifth: true,
      }));
      expect(isFamilyC(result.topCandidate.generationReason)).toBe(false);
      const target = result.rankedCandidates.find((entry) => (
        entry.identityKey === shadowIdentityKey(identity)
      ));
      expect(target?.explanation.omissionConflicts).toHaveLength(1);
      expect(target?.explanation.omissionConflictPenalty).toBeGreaterThan(0);
    }
  });

  it("does not overfit the 60 single-alteration controls", () => {
    const controls = buildIndividualAlterationNeighborIdentities();
    expect(controls).toHaveLength(60);
    for (const { identity } of controls) {
      const result = rankStage02ShadowCandidates(exactRankingEvidence(identity));
      expect(isFamilyC(result.topCandidate.generationReason)).toBe(false);
    }
  });

  it("fails closed on partial modifier evidence and explicit omission conflicts", () => {
    for (const { identity } of buildFamilyCTargetIdentities()) {
      const partial = rankStage02ShadowCandidates(exactRankingEvidence(identity, {
        omitExplicitIndex: 0,
      }));
      expect(isFamilyC(partial.topCandidate.generationReason)).toBe(false);
      const partialTarget = partial.rankedCandidates.find((entry) => (
        entry.identityKey === shadowIdentityKey(identity)
      ));
      expect(partialTarget?.explanation.missingExpectedTones).toHaveLength(1);
      expect(partialTarget?.explanation.explicitModifierPenalty).toBeGreaterThan(0);

      const extraTone = rankStage02ShadowCandidates(exactRankingEvidence(identity, {
        includeOmittedFifth: true,
      }));
      expect(isFamilyC(extraTone.topCandidate.generationReason)).toBe(false);
    }
  });

  it("does not over-label sparse shells, guide tones, or power/fifth ambiguity", () => {
    const evidenceRows = [
      { id: "sparse-shell", intervals: [0, 4, 10] },
      { id: "guide-tones", intervals: [4, 10] },
      { id: "power-fifth", intervals: [0, 7] },
    ] as const;
    let rows = 0;
    for (let root = 0; root < 12; root += 1) {
      for (const fixture of evidenceRows) {
        const histogram = Array(12).fill(0) as number[];
        fixture.intervals.forEach((interval) => {
          histogram[normalizePc(root + interval)] += 1;
        });
        const result = rankStage02ShadowCandidates({
          histogram,
          bassPitchClass: root,
        });
        expect(isFamilyC(result.topCandidate.generationReason), fixture.id).toBe(false);
        rows += 1;
      }
    }
    expect(rows).toBe(36);
  });

  it("keeps structural bass separate and ranks all 24 slash targets exactly", () => {
    const slashTargets = buildFamilyCTargetSlashIdentities();
    expect(slashTargets).toHaveLength(24);
    for (const { identity } of slashTargets) {
      const result = rankStage02ShadowCandidates(exactRankingEvidence(identity));
      expect(result.topCandidate.identityKey).toBe(shadowIdentityKey(identity));
      expect(result.topCandidate.identity.bassPitchClass).toBe(identity.bassPitchClass);
      expect(result.topCandidate.canonicalLabel).toContain("/");
    }
  });

  it("is deterministic, bounded, source-immutable, and exposes honest explanation totals", () => {
    const archetype = FAMILY_C_TARGET_ARCHETYPES[0];
    const identity: ShadowRootRelativeIdentity = {
      rootPitchClass: 7,
      ...archetype.descriptor,
    };
    const variant = buildShadowMetamorphicVariants(identity)[4];
    const before = structuredClone(variant.notes);
    const evidence = rankingEvidenceFromNotes(variant.notes, identity.rootPitchClass);
    const first = rankStage02ShadowCandidates(evidence);
    const second = rankStage02ShadowCandidates(evidence);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.candidateVisits).toBe(276);
    expect(first.candidateVisits).toBeLessThanOrEqual(300);
    expect(variant.notes).toEqual(before);
    expect(first.topCandidate.explanation.totalScore).toBe(first.topCandidate.score);
    expect(first.topCandidate.explanation).toMatchObject({
      missingExpectedTones: [],
      omissionConflicts: [],
      explicitModifierPenalty: 0,
      omissionConflictPenalty: 0,
    });
  });

  it("deep-freezes the cached candidate graph so nested mutation cannot corrupt later rankings", () => {
    const candidates = buildStage02ShadowCandidates();
    const familyCandidate = candidates.find((entry) => (
      entry.generationReason === "family-c-target-a"
    ));
    if (!familyCandidate) throw new Error("missing Family-C cache fixture");
    const identity = buildFamilyCTargetIdentities()[0]?.identity;
    if (!identity) throw new Error("missing Family-C ranking fixture");
    const evidence = exactRankingEvidence(identity);
    const candidatesBefore = JSON.stringify(candidates);
    const rankingBefore = JSON.stringify(rankStage02ShadowCandidates(evidence));

    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(familyCandidate)).toBe(true);
    expect(Object.isFrozen(familyCandidate.identity)).toBe(true);
    expect(Object.isFrozen(familyCandidate.identity.extensions)).toBe(true);
    expect(Object.isFrozen(familyCandidate.identity.alterations)).toBe(true);
    expect(Object.isFrozen(familyCandidate.identity.omissions)).toBe(true);
    expect(Object.isFrozen(familyCandidate.upperIntervals)).toBe(true);
    expect(() => {
      (familyCandidate.identity as { rootPitchClass: number }).rootPitchClass = 11;
    }).toThrow(TypeError);
    expect(() => {
      (familyCandidate.identity.extensions as unknown as string[]).push("13");
    }).toThrow(TypeError);
    expect(() => {
      (familyCandidate.identity.alterations as unknown as string[])[0] = "b9";
    }).toThrow(TypeError);
    expect(() => {
      (familyCandidate.identity.omissions as unknown as string[])[0] = "no3";
    }).toThrow(TypeError);
    expect(() => {
      (familyCandidate.upperIntervals as number[])[0] = 11;
    }).toThrow(TypeError);

    expect(JSON.stringify(buildStage02ShadowCandidates())).toBe(candidatesBefore);
    expect(JSON.stringify(rankStage02ShadowCandidates(evidence))).toBe(rankingBefore);
  });
});
