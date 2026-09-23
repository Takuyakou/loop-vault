/** Evaluation-only coverage, keeping literal semantics separate from sonic aliases. */
import { normalizePc } from "../../src/domain/chords";
import {
  isBoundedShadowGrammarIdentity,
  shadowIdentityKey,
  shadowUpperIntervals,
  type ShadowRootRelativeIdentity,
} from "../p539/shadowRootRelativeIdentity";
import type { CandidateScoreBreakdown } from "./candidateScoreBreakdown";

export interface GroundTruthCoverage {
  literalIdentityInBoundedGrammar: boolean;
  literalSemanticRank: number | null;
  pitchContentEquivalentRanks: readonly number[];
}

export function diagnoseGroundTruthCoverage(
  breakdown: CandidateScoreBreakdown,
  humanIdentity: ShadowRootRelativeIdentity,
): GroundTruthCoverage {
  const key = shadowIdentityKey(humanIdentity);
  const intervals = shadowUpperIntervals(humanIdentity);
  if (!key || !intervals) throw new Error("Invalid human semantic identity");
  const root = normalizePc(humanIdentity.rootPitchClass);
  const bass = humanIdentity.bassPitchClass === undefined
    || normalizePc(humanIdentity.bassPitchClass) === root
    ? null : normalizePc(humanIdentity.bassPitchClass);
  const targetPcs = [...new Set(intervals.map((interval) => normalizePc(root + interval)))].sort((a, b) => a - b);
  const pitchContentEquivalentRanks = breakdown.rows
    .filter((row) => row.rootPitchClass === root
      && row.resolvedSlashBassPitchClass === bass
      && [...row.scoreTemplatePcs].sort((a, b) => a - b).join(",") === targetPcs.join(","))
    .map((row) => row.rank);
  return {
    literalIdentityInBoundedGrammar: isBoundedShadowGrammarIdentity(humanIdentity),
    literalSemanticRank: breakdown.rows.find((row) => row.identityKey === key)?.rank ?? null,
    pitchContentEquivalentRanks,
  };
}
