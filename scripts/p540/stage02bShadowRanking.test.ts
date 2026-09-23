import { describe, expect, it } from "vitest";

import { normalizePc } from "../../src/domain/chords";
import { exactRankingEvidence, rankStage02ShadowCandidates } from "../p539/shadowCandidateRanking";
import {
  STAGE02B_FIXED_ARCHETYPES,
  formatShadowIdentity,
  parseShadowChordLabel,
  productionControlIdentity,
  shadowIdentityKey,
  buildShadowMetamorphicVariants,
  type ShadowRootRelativeIdentity,
} from "../p539/shadowRootRelativeIdentity";
import { buildStage02bAdditionalCandidates, rankStage02bShadowCandidates } from "./stage02bShadowRanking";

describe("P5.40-02b bounded source-semantic Shadow ranking", () => {
  it("represents both fixed semantic structures across every root and compatible bass", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const archetype of STAGE02B_FIXED_ARCHETYPES) {
        const upper: ShadowRootRelativeIdentity = { rootPitchClass: root, ...archetype.descriptor };
        const third = normalizePc(root + (upper.triad === "minor" ? 3 : 4));
        for (const bassPitchClass of [root, third]) {
          const identity = bassPitchClass === root ? upper : { ...upper, bassPitchClass };
          const evidence = exactRankingEvidence(identity);
          const key = shadowIdentityKey(identity);
          const result = rankStage02bShadowCandidates(evidence);
          expect(result.generatedCandidates.some((entry) => entry.identityKey === key)).toBe(true);
          expect(result.candidateVisits).toBeLessThanOrEqual(300);
          const label = formatShadowIdentity(identity, true);
          expect(label).not.toBeNull();
          expect(shadowIdentityKey(parseShadowChordLabel(label!, true)!)).toBe(key);
        }
      }
    }
  }, 30_000);

  it("resolves equal pitch-content semantics from material fifth and named extensions", () => {
    const minor = { rootPitchClass: 0, ...STAGE02B_FIXED_ARCHETYPES[0]!.descriptor };
    const minorResult = rankStage02bShadowCandidates(exactRankingEvidence(minor));
    expect(minorResult.topCandidate.identityKey).toBe(shadowIdentityKey(minor));

    const thirteenth = {
      rootPitchClass: 0, triad: "major" as const, seventh: "minor7" as const,
      extensions: [] as const, alterations: ["b13"] as const, omissions: [] as const,
    };
    const altered = rankStage02bShadowCandidates(exactRankingEvidence(thirteenth));
    expect(altered.topCandidate.identityKey).toBe(shadowIdentityKey(thirteenth));
  });

  it("keeps fixed-generation eligibility under order/register/octave/doubling and rejects absent facts", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const archetype of STAGE02B_FIXED_ARCHETYPES) {
        const identity: ShadowRootRelativeIdentity = { rootPitchClass: root, ...archetype.descriptor };
        const key = shadowIdentityKey(identity);
        const evidence = exactRankingEvidence(identity);
        expect(buildStage02bAdditionalCandidates(evidence).some((entry) => entry.identityKey === key)).toBe(true);
        for (const variant of buildShadowMetamorphicVariants(identity)) {
          const histogram = Array(12).fill(0) as number[];
          variant.notes.forEach((note) => { histogram[normalizePc(note.pitch)] += 1; });
          expect(buildStage02bAdditionalCandidates({ histogram, bassPitchClass: root })
            .some((entry) => entry.identityKey === key)).toBe(true);
        }
        const required = archetype.id === "explicit-minor-nine-eleven"
          ? [0, 2, 3, 5, 7, 10] : [0, 4, 6, 8, 10];
        for (const interval of required) {
          const histogram = [...evidence.histogram];
          histogram[normalizePc(root + interval)] = 0;
          expect(buildStage02bAdditionalCandidates({ ...evidence, histogram })
            .some((entry) => entry.identityKey === key)).toBe(false);
        }
        if (archetype.id === "dual-upper-alteration-no5") {
          const histogram = [...evidence.histogram];
          histogram[normalizePc(root + 7)] = 1;
          expect(buildStage02bAdditionalCandidates({ ...evidence, histogram })
            .some((entry) => entry.identityKey === key)).toBe(false);
        }
      }
    }
  }, 30_000);

  it("retains the frozen 276-row prefix, ordinary controls, hard bound and determinism", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const quality of ["maj", "min", "dom7", "sus4", "aug"] as const) {
        const evidence = exactRankingEvidence(productionControlIdentity(root, quality));
        expect(rankStage02bShadowCandidates(evidence).topCandidate.identityKey)
          .toBe(rankStage02ShadowCandidates(evidence).topCandidate.identityKey);
      }
    }
    const evidence = { histogram: Array(12).fill(1) as number[], bassPitchClass: 0 };
    const before = JSON.stringify(evidence);
    const additions = buildStage02bAdditionalCandidates(evidence);
    expect(additions.length).toBeLessThanOrEqual(24);
    const first = rankStage02bShadowCandidates(evidence);
    expect(first.generatedCandidates.slice(0, 276))
      .toEqual(rankStage02ShadowCandidates(evidence).generatedCandidates);
    expect(first.candidateVisits).toBeLessThanOrEqual(300);
    expect(rankStage02bShadowCandidates(evidence)).toEqual(first);
    expect(JSON.stringify(evidence)).toBe(before);
  }, 30_000);
});
