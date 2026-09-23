/** P5.40-01 bounded, evidence-derived Shadow candidate generation only. */
import { normalizePc } from "../../src/domain/chords";
import { defaultPresenceThreshold } from "../../src/domain/midi/qualityEvidence";
import {
  buildStage02ShadowCandidates,
  rankShadowCandidatesWithAdditions,
  type ShadowRankingCandidate,
  type ShadowRankingEvidence,
  type ShadowRankingResult,
} from "../p539/shadowCandidateRanking";
import {
  INDIVIDUAL_ALTERATION_NEIGHBOR_ARCHETYPES,
  formatShadowIdentity,
  shadowIdentityKey,
  shadowUpperIntervals,
  type ShadowRootRelativeIdentity,
} from "../p539/shadowRootRelativeIdentity";

export const STAGE01_MAX_ADDITIONS = 24;
const DOMINANT_CORE = [0, 4, 7, 10] as const;

/** Exact pre-implementation rule in P5.40-01-design-lock.md. */
export function buildStage01AdditionalCandidates(
  evidence: ShadowRankingEvidence,
): readonly ShadowRankingCandidate[] {
  if (evidence.histogram.length !== 12) {
    throw new Error("Stage01 evidence must contain 12 pitch classes");
  }
  const histogram = Array.from({ length: 12 }, (_, pc) => (
    Math.max(0, evidence.histogram[pc] ?? 0)
  ));
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  const material = (pc: number): boolean => (
    histogram[normalizePc(pc)] / total > defaultPresenceThreshold
  );
  const bass = normalizePc(evidence.bassPitchClass);
  const base = buildStage02ShadowCandidates();
  const keys = new Set(base.map((entry) => entry.identityKey));
  const additions: ShadowRankingCandidate[] = [];

  for (let root = 0; root < 12; root += 1) {
    if (!DOMINANT_CORE.every((interval) => material(root + interval))) continue;
    for (const archetype of INDIVIDUAL_ALTERATION_NEIGHBOR_ARCHETYPES) {
      const upper: ShadowRootRelativeIdentity = {
        rootPitchClass: root,
        ...archetype.descriptor,
      };
      const intervals = shadowUpperIntervals(upper);
      const alterationIntervals = intervals?.filter((interval) => (
        !DOMINANT_CORE.includes(interval as typeof DOMINANT_CORE[number])
      ));
      if (!intervals || alterationIntervals?.length !== 1
        || !material(root + alterationIntervals[0])
        || !intervals.some((interval) => normalizePc(root + interval) === bass)) continue;

      const identity: ShadowRootRelativeIdentity = bass === root
        ? upper : { ...upper, bassPitchClass: bass };
      const identityKey = shadowIdentityKey(identity);
      const canonicalLabel = formatShadowIdentity(identity);
      if (!identityKey || !canonicalLabel || keys.has(identityKey)) continue;
      keys.add(identityKey);
      additions.push({
        enumerationIndex: base.length + additions.length,
        generationReason: "individual-alteration-neighbor",
        identity,
        identityKey,
        canonicalLabel,
        upperIntervals: intervals,
      });
      if (additions.length > STAGE01_MAX_ADDITIONS) return [];
    }
  }
  return additions;
}

/** Opt-in Stage01 Shadow ranking; the frozen Stage02 entrypoint is untouched. */
export function rankStage01ShadowCandidates(
  evidence: ShadowRankingEvidence,
): ShadowRankingResult {
  return rankShadowCandidatesWithAdditions(
    evidence,
    buildStage01AdditionalCandidates(evidence),
  );
}
