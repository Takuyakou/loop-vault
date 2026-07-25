import type { CandidateChordStats } from "./candidateBlock";

/**
 * What a candidate is, structurally.
 *
 * Three kinds, decided from the canonical chord identities the candidate
 * contains. `uniqueChordCount` comes from `identityKey`, so a spelling difference
 * is never counted as a chord change.
 *
 * This exists to route a candidate to a lane and to order the lanes. It is
 * deliberately not fed back into `scoreBlockQuality`: reviving chord count as a
 * ranking bonus would undo the Phase 4.0 work that stopped a one-chord vamp being
 * scored as a defective progression.
 */
export type CandidateKind = "progression" | "vamp" | "fragment";

export interface CandidateShape {
  lengthBars: number;
  stats: Pick<CandidateChordStats, "uniqueChordCount" | "harmonicChangeCount">;
}

export function classifyCandidateKind(shape: CandidateShape): CandidateKind {
  const { uniqueChordCount, harmonicChangeCount } = shape.stats;
  // One chord is a vamp at any length: a pedal or a groove, not a weak
  // progression.
  if (uniqueChordCount <= 1) return "vamp";
  if (shape.lengthBars >= 4 && uniqueChordCount >= 2 && harmonicChangeCount >= 1) {
    return "progression";
  }
  return "fragment";
}

/** Main lane first, then vamps, then fragments. */
export const kindRank: Record<CandidateKind, number> = {
  progression: 0,
  vamp: 1,
  fragment: 2,
};

/**
 * How complete a musical statement the candidate is, as a small rank.
 *
 * Length alone is not enough — sixteen bars of one chord is not a fuller
 * statement than eight bars of four — so the rank combines span with how many
 * distinct chords the span actually contains. Kept coarse on purpose: it orders
 * candidates, it does not score them.
 *
 * A loop-coherence term was tried here and removed. The idea was that a window
 * straddling the end of a phrase is worse than the phrase inside it, and
 * `loopFitnessScore` already measures whether a block closes back on itself. It
 * measured worse: demoting windows that do not resolve also demoted the gold
 * blocks that legitimately do not resolve, and `rank-constraint top3MinHits` fell
 * from 39/56 to 31/56 with selected recall dropping from 0.870 to 0.780. Recorded
 * so the idea is not retried blind.
 */
export function structuralUsefulness(shape: CandidateShape): number {
  const { uniqueChordCount } = shape.stats;
  if (shape.lengthBars >= 8 && uniqueChordCount >= 3) return 3;
  if (shape.lengthBars >= 4 && uniqueChordCount >= 2) return 2;
  if (shape.lengthBars >= 4) return 1;
  return 0;
}
