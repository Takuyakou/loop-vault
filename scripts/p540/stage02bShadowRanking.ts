/** P5.40-02b opt-in Shadow grammar and source-semantic exact-tie ranking. */
import { normalizePc } from "../../src/domain/chords";
import { defaultPresenceThreshold } from "../../src/domain/midi/qualityEvidence";
import {
  buildStage02ShadowCandidates,
  rankShadowCandidatesWithAdditions,
  rankStage02ShadowCandidates,
  type ShadowRankedCandidate,
  type ShadowRankingCandidate,
  type ShadowRankingEvidence,
  type ShadowRankingResult,
} from "../p539/shadowCandidateRanking";
import {
  STAGE02B_FIXED_ARCHETYPES,
  formatShadowIdentity,
  shadowIdentityKey,
  shadowUpperIntervals,
  type ShadowRootRelativeIdentity,
} from "../p539/shadowRootRelativeIdentity";
import { STAGE01_MAX_ADDITIONS, buildStage01AdditionalCandidates } from "./shadowCandidateGenerationCorrection";

const MAX_ADDITIONS = STAGE01_MAX_ADDITIONS;
const REQUIRED: Readonly<Record<(typeof STAGE02B_FIXED_ARCHETYPES)[number]["id"], readonly number[]>> = {
  "explicit-minor-nine-eleven": [0, 2, 3, 5, 7, 10],
  "dual-upper-alteration-no5": [0, 4, 6, 8, 10],
};

function material(evidence: ShadowRankingEvidence, pc: number): boolean {
  const total = evidence.histogram.reduce((sum, value) => sum + Math.max(0, value ?? 0), 0);
  return total > 0 && Math.max(0, evidence.histogram[normalizePc(pc)] ?? 0) / total
    > defaultPresenceThreshold;
}

export function buildStage02bAdditionalCandidates(
  evidence: ShadowRankingEvidence,
): readonly ShadowRankingCandidate[] {
  if (evidence.histogram.length !== 12) throw new Error("Stage02b evidence must contain 12 pitch classes");
  const baseCount = buildStage02ShadowCandidates().length;
  const additions = [...buildStage01AdditionalCandidates(evidence)];
  const known = new Set(buildStage02ShadowCandidates().map((candidate) => candidate.identityKey));
  additions.forEach((candidate) => known.add(candidate.identityKey));
  for (let root = 0; root < 12; root += 1) {
    for (const archetype of STAGE02B_FIXED_ARCHETYPES) {
      if (!REQUIRED[archetype.id].every((interval) => material(evidence, root + interval))
        || (archetype.id === "dual-upper-alteration-no5" && material(evidence, root + 7))) continue;
      const upper: ShadowRootRelativeIdentity = { rootPitchClass: root, ...archetype.descriptor };
      const intervals = shadowUpperIntervals(upper);
      const bass = normalizePc(evidence.bassPitchClass);
      if (!intervals || !intervals.some((interval) => normalizePc(root + interval) === bass)) continue;
      const identity: ShadowRootRelativeIdentity = bass === root ? upper : { ...upper, bassPitchClass: bass };
      const identityKey = shadowIdentityKey(identity);
      const canonicalLabel = formatShadowIdentity(identity, true);
      if (!identityKey || !canonicalLabel || known.has(identityKey)) continue;
      known.add(identityKey);
      additions.push({
        enumerationIndex: baseCount + additions.length,
        generationReason: archetype.id === "explicit-minor-nine-eleven"
          ? "stage02b-explicit-minor" : "stage02b-dual-upper-alteration",
        identity,
        identityKey,
        canonicalLabel,
        upperIntervals: intervals,
        ...(archetype.id === "explicit-minor-nine-eleven" ? { productionQuality: "min11" as const } : {}),
      });
      if (additions.length > MAX_ADDITIONS) return [];
    }
  }
  return additions;
}

function sameEvidenceTemplate(a: ShadowRankedCandidate, b: ShadowRankedCandidate): boolean {
  return a.identity.rootPitchClass === b.identity.rootPitchClass
    && (a.identity.bassPitchClass ?? null) === (b.identity.bassPitchClass ?? null)
    && [...a.explanation.scoreTemplatePcs].sort((x, y) => x - y).join(",")
      === [...b.explanation.scoreTemplatePcs].sort((x, y) => x - y).join(",");
}

function semanticEvidence(candidate: ShadowRankedCandidate, evidence: ShadowRankingEvidence) {
  const root = candidate.identity.rootPitchClass;
  const structuralFifthConflict = candidate.identity.alterations.includes("#5") && material(evidence, root + 7)
    ? 1 : 0;
  const namedMaterial = [
    ...candidate.identity.extensions.map((extension) => ({ "6": 9, "9": 2, "11": 5, "13": 9 })[extension]),
    ...candidate.identity.alterations.map((alteration) => (
      { b9: 1, "#9": 3, "#11": 6, b13: 8, "#5": 8 }[alteration]
    )),
  ].filter((interval) => material(evidence, root + interval)).length;
  return { structuralFifthConflict, namedMaterial };
}

/** Numeric scores remain frozen; only exact equal-score, equal-PC semantics resolve. */
export function rankStage02bShadowCandidates(evidence: ShadowRankingEvidence): ShadowRankingResult {
  const additions = buildStage02bAdditionalCandidates(evidence);
  if (additions.length === 0) return rankStage02ShadowCandidates(evidence);
  const prior = rankShadowCandidatesWithAdditions(evidence, additions);
  const reordered = [...prior.rankedCandidates];
  for (let start = 0; start < reordered.length;) {
    let end = start + 1;
    while (end < reordered.length && reordered[end]!.score === reordered[start]!.score) end += 1;
    const seen = new Set<number>();
    for (let index = start; index < end; index += 1) {
      if (seen.has(index)) continue;
      const slots = Array.from({ length: end - start }, (_, offset) => start + offset)
        .filter((slot) => sameEvidenceTemplate(reordered[index]!, reordered[slot]!));
      slots.forEach((slot) => seen.add(slot));
      const choices = slots.map((slot) => reordered[slot]!).sort((a, b) => {
        const left = semanticEvidence(a, evidence);
        const right = semanticEvidence(b, evidence);
        return left.structuralFifthConflict - right.structuralFifthConflict
          || right.namedMaterial - left.namedMaterial
          || a.rank - b.rank;
      });
      slots.forEach((slot, offset) => { reordered[slot] = choices[offset]!; });
    }
    start = end;
  }
  const rankedCandidates = reordered.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return { ...prior, rankedCandidates, topCandidate: rankedCandidates[0]! };
}
