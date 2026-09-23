import { describe, expect, it } from "vitest";

import { normalizePc } from "../../src/domain/chords";
import { detectorQualities } from "../../src/domain/midi/evaluation/metricsV2";
import {
  buildStage02ShadowCandidates,
  exactRankingEvidence,
  rankStage02ShadowCandidates,
} from "../p539/shadowCandidateRanking";
import {
  buildFamilyCTargetIdentities,
  buildIndividualAlterationNeighborIdentities,
  buildShadowMetamorphicVariants,
  productionControlIdentity,
  shadowIdentityKey,
} from "../p539/shadowRootRelativeIdentity";
import {
  STAGE01_MAX_ADDITIONS,
  buildStage01AdditionalCandidates,
  rankStage01ShadowCandidates,
} from "./shadowCandidateGenerationCorrection";

describe("P5.40-01 bounded Shadow candidate generation", () => {
  it("reaches every individually supported altered identity and slash bass across all roots", () => {
    const controls = buildIndividualAlterationNeighborIdentities();
    expect(controls).toHaveLength(60);
    for (const { identity: upper } of controls) {
      for (const bass of [upper.rootPitchClass, normalizePc(upper.rootPitchClass + 4)]) {
        const identity = bass === upper.rootPitchClass
          ? upper : { ...upper, bassPitchClass: bass };
        const evidence = exactRankingEvidence(identity);
        const result = rankStage01ShadowCandidates(evidence);
        const key = shadowIdentityKey(identity);
        expect(result.generatedCandidates.some((entry) => entry.identityKey === key)).toBe(true);
        expect(result.rankedCandidates.some((entry) => entry.identityKey === key)).toBe(true);
        expect(result.candidateVisits).toBeGreaterThan(276);
        expect(result.candidateVisits).toBeLessThanOrEqual(300);
      }
    }
  }, 30_000);

  it("preserves the exact frozen 276-row prefix and every old candidate score", () => {
    const identity = buildIndividualAlterationNeighborIdentities()[0]?.identity;
    if (!identity) throw new Error("missing synthetic altered identity");
    const evidence = exactRankingEvidence(identity);
    const old = rankStage02ShadowCandidates(evidence);
    const next = rankStage01ShadowCandidates(evidence);
    expect(old.generatedCandidates).toEqual(buildStage02ShadowCandidates());
    expect(next.generatedCandidates.slice(0, 276)).toEqual(old.generatedCandidates);
    const oldByIndex = new Map(old.rankedCandidates.map((entry) => [entry.enumerationIndex, entry]));
    for (const entry of next.rankedCandidates.filter((row) => row.enumerationIndex < 276)) {
      const prior = oldByIndex.get(entry.enumerationIndex);
      expect(entry.score).toBe(prior?.score);
      expect(entry.explanation).toEqual(prior?.explanation);
      expect(entry.identityKey).toBe(prior?.identityKey);
    }
    expect(rankStage02ShadowCandidates(evidence)).toEqual(old);
  });

  it("does not add altered candidates for ordinary and sparse controls", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const quality of ["maj", "min", "dom7", "sus4", "dom7sus4"] as const) {
        const identity = productionControlIdentity(root, quality);
        const evidence = exactRankingEvidence(identity);
        expect(buildStage01AdditionalCandidates(evidence)).toEqual([]);
        expect(rankStage01ShadowCandidates(evidence).topCandidate.identityKey)
          .toBe(rankStage02ShadowCandidates(evidence).topCandidate.identityKey);
      }
      const slash = productionControlIdentity(root, "maj", normalizePc(root + 4));
      const slashEvidence = exactRankingEvidence(slash);
      expect(buildStage01AdditionalCandidates(slashEvidence)).toEqual([]);
      expect(rankStage01ShadowCandidates(slashEvidence).topCandidate.identityKey)
        .toBe(rankStage02ShadowCandidates(slashEvidence).topCandidate.identityKey);
      const histogram = Array(12).fill(0) as number[];
      [root, normalizePc(root + 4), normalizePc(root + 10)].forEach((pc) => { histogram[pc] = 1; });
      expect(buildStage01AdditionalCandidates({ histogram, bassPitchClass: root })).toEqual([]);
    }
  }, 30_000);

  it("protects existing no5 targets and the whole legacy quality set", () => {
    for (const { identity } of buildFamilyCTargetIdentities()) {
      const evidence = exactRankingEvidence(identity);
      expect(rankStage01ShadowCandidates(evidence).topCandidate.identityKey)
        .toBe(rankStage02ShadowCandidates(evidence).topCandidate.identityKey);
    }
    for (let root = 0; root < 12; root += 1) {
      for (const quality of detectorQualities) {
        const evidence = exactRankingEvidence(productionControlIdentity(root, quality));
        expect(rankStage01ShadowCandidates(evidence).topCandidate.identityKey)
          .toBe(rankStage02ShadowCandidates(evidence).topCandidate.identityKey);
      }
    }
  }, 30_000);

  it("keeps eligibility invariant under order, register, octave, and doubling transforms", () => {
    for (const { identity } of buildIndividualAlterationNeighborIdentities()) {
      const expected = buildStage01AdditionalCandidates(exactRankingEvidence(identity))
        .map((entry) => entry.identityKey);
      const variants = buildShadowMetamorphicVariants(identity);
      expect(variants).toHaveLength(9);
      for (const variant of variants) {
        const histogram = Array(12).fill(0) as number[];
        variant.notes.forEach((note) => { histogram[normalizePc(note.pitch)] += 1; });
        const actual = buildStage01AdditionalCandidates({
          histogram,
          bassPitchClass: identity.rootPitchClass,
        }).map((entry) => entry.identityKey);
        expect(actual).toEqual(expected);
      }
    }
  }, 30_000);

  it("requires each structural fact, the alteration, and a compatible independent bass", () => {
    for (const { identity } of buildIndividualAlterationNeighborIdentities()) {
      const key = shadowIdentityKey(identity);
      const original = exactRankingEvidence(identity);
      const base = buildStage01AdditionalCandidates(original);
      expect(base.some((entry) => entry.identityKey === key)).toBe(true);
      const root = identity.rootPitchClass;
      const core = [0, 4, 7, 10].map((interval) => normalizePc(root + interval));
      const alteration = original.histogram.findIndex((weight, pc) => (
        weight > 0 && !core.includes(pc)
      ));
      expect(alteration).toBeGreaterThanOrEqual(0);
      for (const absentPc of [...core, alteration]) {
        const histogram = [...original.histogram];
        histogram[absentPc] = 0;
        expect(buildStage01AdditionalCandidates({ ...original, histogram })
          .some((entry) => entry.identityKey === key)).toBe(false);
      }
      const outsideBass = Array.from({ length: 12 }, (_, pc) => pc)
        .find((pc) => original.histogram[pc] === 0);
      if (outsideBass === undefined) throw new Error("missing outside-bass control");
      expect(buildStage01AdditionalCandidates({ ...original, bassPitchClass: outsideBass })
        .some((entry) => entry.identityKey === key)).toBe(false);
    }
  });

  it("fails closed on over-bound dense evidence without arbitrary candidate selection", () => {
    const evidence = { histogram: Array(12).fill(1) as number[], bassPitchClass: 0 };
    expect(STAGE01_MAX_ADDITIONS).toBe(24);
    expect(buildStage01AdditionalCandidates(evidence)).toEqual([]);
    const result = rankStage01ShadowCandidates(evidence);
    expect(result.candidateVisits).toBe(276);
    expect(result.generatedCandidates).toEqual(buildStage02ShadowCandidates());
  });

  it("is deterministic, source-immutable, and deep-freezes ranked additions", () => {
    const identity = buildIndividualAlterationNeighborIdentities()[12]?.identity;
    if (!identity) throw new Error("missing synthetic altered identity");
    const evidence = exactRankingEvidence(identity);
    const before = structuredClone(evidence);
    const first = rankStage01ShadowCandidates(evidence);
    const second = rankStage01ShadowCandidates(evidence);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(evidence).toEqual(before);
    const addition = first.generatedCandidates[276];
    expect(addition).toBeDefined();
    expect(Object.isFrozen(addition)).toBe(true);
    expect(Object.isFrozen(addition?.identity)).toBe(true);
    expect(Object.isFrozen(addition?.upperIntervals)).toBe(true);
  });
});
