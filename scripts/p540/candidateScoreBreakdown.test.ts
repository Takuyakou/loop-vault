import { describe, expect, it } from "vitest";

import { buildFamilyCTargetIdentities } from "../p539/shadowRootRelativeIdentity";
import {
  exactRankingEvidence,
  rankStage02ShadowCandidates,
} from "../p539/shadowCandidateRanking";
import {
  buildCandidateScoreBreakdown,
  compareWinnerWithCandidate,
  compareWinnerWithCorrect,
  sumContributions,
} from "./candidateScoreBreakdown";

describe("P5.40-00 evaluation-only score breakdown", () => {
  it("recomposes all 276 unchanged candidates and their exact rank order", () => {
    const identity = buildFamilyCTargetIdentities()[0].identity;
    const evidence = exactRankingEvidence(identity);
    const before = structuredClone(evidence);
    const frozen = rankStage02ShadowCandidates(evidence);
    const breakdown = buildCandidateScoreBreakdown("SYNTHETIC-01", evidence);
    expect(breakdown.candidateVisits).toBe(276);
    expect(breakdown.rows).toHaveLength(276);
    breakdown.rows.forEach((row, index) => {
      const original = frozen.rankedCandidates[index];
      expect(row.rank).toBe(original.rank);
      expect(row.enumerationIndex).toBe(original.enumerationIndex);
      expect(row.identityKey).toBe(original.identityKey);
      expect(row.totalScore).toBe(original.score);
      expect(sumContributions(row.contributions)).toBeCloseTo(original.score, 12);
      expect(row.scoreTemplatePcs).toEqual(original.explanation.scoreTemplatePcs);
      expect(row.missingExpectedTones).toEqual(original.explanation.missingExpectedTones);
      expect(row.conflictingPresentTones).toEqual(original.explanation.conflictingPresentTones);
    });
    expect(evidence).toEqual(before);
  });

  it("reports explicit missing-tone and omission conflicts without changing selection", () => {
    const identity = buildFamilyCTargetIdentities()[0].identity;
    const evidence = exactRankingEvidence(identity, {
      includeOmittedFifth: true,
      omitExplicitIndex: 0,
    });
    const rows = buildCandidateScoreBreakdown("SYNTHETIC-02", evidence).rows;
    const target = rows.find((row) => row.rootPitchClass === identity.rootPitchClass
      && row.generationReason === "family-c-target-a");
    expect(target).toBeDefined();
    expect(target?.missingExpectedTones.length).toBeGreaterThan(0);
    expect(target?.omissionConflicts.length).toBeGreaterThan(0);
    expect(target?.contributions.explicitModifierEvidence).toBeLessThan(0);
    expect(target?.contributions.omissionConflict).toBeLessThan(0);
    expect(rows[0].identityKey).toBe(rankStage02ShadowCandidates(evidence).topCandidate.identityKey);
  });

  it("is deterministic and rejects non-anonymous output IDs", () => {
    const evidence = exactRankingEvidence(buildFamilyCTargetIdentities()[0].identity);
    expect(buildCandidateScoreBreakdown("SYNTHETIC-03", evidence))
      .toEqual(buildCandidateScoreBreakdown("SYNTHETIC-03", evidence));
    expect(() => buildCandidateScoreBreakdown("private/path", evidence))
      .toThrow("Invalid anonymous state ID");
  });

  it("accounts exactly for the winner-versus-correct margin without a private fixture", () => {
    const evidence = exactRankingEvidence(buildFamilyCTargetIdentities()[0].identity);
    const breakdown = buildCandidateScoreBreakdown("SYNTHETIC-04", evidence);
    const correct = breakdown.rows[4];
    const comparison = compareWinnerWithCorrect(breakdown, correct.identityKey);
    expect(comparison?.correctRank).toBe(5);
    expect(comparison?.winnerAdvantage).toBeCloseTo(
      breakdown.rows[0].totalScore - correct.totalScore, 12,
    );
    expect(sumContributions(comparison!.contributionDeltas))
      .toBeCloseTo(comparison!.winnerAdvantage, 12);
    const neutralComparator = compareWinnerWithCandidate(breakdown, correct.identityKey);
    expect(neutralComparator?.candidateRank).toBe(5);
    expect(neutralComparator?.candidateScore).toBe(correct.totalScore);
    expect(compareWinnerWithCorrect(breakdown, "not-generated")).toBeNull();
  });
});
