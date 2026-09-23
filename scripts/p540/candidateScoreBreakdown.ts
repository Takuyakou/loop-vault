/** Evaluation-only projection of the frozen P5.39 candidate scorer. */
import {
  rankStage02ShadowCandidates,
  type ShadowRankingEvidence,
  type ShadowRankingCandidate,
} from "../p539/shadowCandidateRanking";

export interface ScoreContributions {
  templateHit: number;
  outsideShare: number;
  rootEvidence: number;
  bassEvidence: number;
  bassAttenuation: number;
  qualityEvidence: number;
  explicitModifierEvidence: number;
  omissionConflict: number;
  semanticComplexity: number;
}

export interface CandidateScoreRow {
  stateId: string;
  rank: number;
  enumerationIndex: number;
  canonicalIdentity: string;
  identityKey: string;
  generationReason: ShadowRankingCandidate["generationReason"];
  rootPitchClass: number;
  quality: string;
  explicitModifiers: readonly string[];
  omissions: readonly string[];
  structuralBassPitchClass: number;
  resolvedSlashBassPitchClass: number | null;
  scoreTemplatePcs: readonly number[];
  observedMaterialPcs: readonly number[];
  matchedStructuralPcs: readonly number[];
  matchedExplicitModifierPcs: readonly number[];
  explicitModifierPcs: readonly number[];
  omittedPcs: readonly number[];
  missingExpectedTones: readonly number[];
  conflictingPresentTones: readonly number[];
  omissionConflicts: readonly number[];
  qualityEvidenceCoverage: number;
  semanticTemplateSize: number;
  contributions: ScoreContributions;
  totalScore: number;
  tieBreakFromPrevious: "score" | "canonical-label" | "enumeration-index" | "near-score-no-tie-break";
}

export interface CandidateScoreBreakdown {
  stateId: string;
  candidateVisits: number;
  rows: readonly CandidateScoreRow[];
}

export interface WinnerVsCorrectComparison {
  winnerRank: 1;
  correctRank: number;
  winnerScore: number;
  correctScore: number;
  winnerAdvantage: number;
  contributionDeltas: ScoreContributions;
  largestPositiveAdvantage: keyof ScoreContributions | null;
}

export interface WinnerVsCandidateComparison {
  winnerRank: 1;
  candidateRank: number;
  winnerScore: number;
  candidateScore: number;
  winnerAdvantage: number;
  contributionDeltas: ScoreContributions;
  largestPositiveAdvantage: keyof ScoreContributions | null;
}

export function sumContributions(contributions: ScoreContributions): number {
  return Object.values(contributions).reduce((sum, value) => sum + value, 0);
}

export function buildCandidateScoreBreakdown(
  stateId: string,
  evidence: ShadowRankingEvidence,
): CandidateScoreBreakdown {
  if (!/^[A-Z0-9-]+$/.test(stateId)) throw new Error("Invalid anonymous state ID");
  const result = rankStage02ShadowCandidates(evidence);
  const rows = result.rankedCandidates.map((candidate, index): CandidateScoreRow => {
    const explanation = candidate.explanation;
    const contributions: ScoreContributions = {
      templateHit: explanation.hitRatio,
      outsideShare: -explanation.outsideRatio * 0.12,
      rootEvidence: explanation.rootEvidence * 0.12,
      bassEvidence: explanation.rawBassCompatibility,
      bassAttenuation: -explanation.bassAttenuation,
      qualityEvidence: -explanation.qualityEvidencePenalty,
      explicitModifierEvidence: -explanation.explicitModifierPenalty,
      omissionConflict: -explanation.omissionConflictPenalty,
      semanticComplexity: -explanation.extensionPenalty,
    };
    if (Math.abs(sumContributions(contributions) - candidate.score) > 1e-12) {
      throw new Error("Frozen score did not recompose");
    }
    const previous = result.rankedCandidates[index - 1];
    const scoreDifference = previous ? previous.score - candidate.score : Infinity;
    const tieBreakFromPrevious = scoreDifference === 0
      ? previous.canonicalLabel === candidate.canonicalLabel
        ? "enumeration-index" : "canonical-label"
      : scoreDifference < 1e-12 ? "near-score-no-tie-break" : "score";
    return {
      stateId,
      rank: candidate.rank,
      enumerationIndex: candidate.enumerationIndex,
      canonicalIdentity: candidate.canonicalLabel,
      identityKey: candidate.identityKey,
      generationReason: candidate.generationReason,
      rootPitchClass: candidate.identity.rootPitchClass,
      quality: candidate.productionQuality
        ?? `${candidate.identity.triad}/${candidate.identity.seventh ?? "none"}`,
      explicitModifiers: [...candidate.identity.extensions, ...candidate.identity.alterations],
      omissions: [...candidate.identity.omissions],
      structuralBassPitchClass: evidence.bassPitchClass,
      resolvedSlashBassPitchClass: candidate.identity.bassPitchClass ?? null,
      scoreTemplatePcs: explanation.scoreTemplatePcs,
      observedMaterialPcs: explanation.observedMaterialPcs,
      matchedStructuralPcs: explanation.matchedStructuralPcs,
      matchedExplicitModifierPcs: explanation.matchedExplicitModifiers,
      explicitModifierPcs: explanation.explicitModifierPcs,
      omittedPcs: explanation.omittedPcs,
      missingExpectedTones: explanation.missingExpectedTones,
      conflictingPresentTones: explanation.conflictingPresentTones,
      omissionConflicts: explanation.omissionConflicts,
      qualityEvidenceCoverage: explanation.qualityEvidenceCoverage,
      semanticTemplateSize: explanation.semanticTemplateSize,
      contributions,
      totalScore: candidate.score,
      tieBreakFromPrevious,
    };
  });
  return { stateId, candidateVisits: result.candidateVisits, rows };
}

/** Compare a frozen eligible candidate with the winner; never inserts a candidate. */
export function compareWinnerWithCandidate(
  breakdown: CandidateScoreBreakdown,
  candidateIdentityKey: string,
): WinnerVsCandidateComparison | null {
  const winner = breakdown.rows[0];
  const correct = breakdown.rows.find((row) => row.identityKey === candidateIdentityKey);
  if (!winner || !correct) return null;
  const contributionDeltas = Object.fromEntries(
    (Object.keys(winner.contributions) as Array<keyof ScoreContributions>).map((key) => (
      [key, winner.contributions[key] - correct.contributions[key]]
    )),
  ) as unknown as ScoreContributions;
  const largestPositiveAdvantage = (Object.keys(contributionDeltas) as Array<keyof ScoreContributions>)
    .sort((left, right) => contributionDeltas[right] - contributionDeltas[left])
    .find((key) => contributionDeltas[key] > 0) ?? null;
  const winnerAdvantage = winner.totalScore - correct.totalScore;
  if (Math.abs(sumContributions(contributionDeltas) - winnerAdvantage) > 1e-12) {
    throw new Error("Winner/correct delta did not recompose");
  }
  return {
    winnerRank: 1,
    candidateRank: correct.rank,
    winnerScore: winner.totalScore,
    candidateScore: correct.totalScore,
    winnerAdvantage,
    contributionDeltas,
    largestPositiveAdvantage,
  };
}

/** Only call with a source-first, independently frozen correct semantic key. */
export function compareWinnerWithCorrect(
  breakdown: CandidateScoreBreakdown,
  correctIdentityKey: string,
): WinnerVsCorrectComparison | null {
  const comparison = compareWinnerWithCandidate(breakdown, correctIdentityKey);
  return comparison && {
    ...comparison,
    correctRank: comparison.candidateRank,
    correctScore: comparison.candidateScore,
  };
}
