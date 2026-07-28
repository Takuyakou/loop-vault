import {
  chordIdentityKey,
  normalizeChordLabel,
} from "../../src/domain/chordIdentity";

export interface RankDistributionRow {
  expected: string;
  candidates: string[];
}

export interface RankDistributionSummary {
  eventCount: number;
  rank1: { count: number; rate: number };
  rank2: { count: number; rate: number };
  rank3: { count: number; rate: number };
  outsideTop3: { count: number; rate: number };
  correctCandidateAbsent: { count: number; rate: number };
  canonicalEquivalentDuplicateCount: number;
  mrr: number;
  correctCandidateMeanRank: number | null;
}

export function summarizeRankDistribution(
  rows: readonly RankDistributionRow[],
): RankDistributionSummary {
  const rankCounts = [0, 0, 0];
  let absent = 0;
  let duplicateCount = 0;
  let reciprocalRank = 0;
  let rankTotal = 0;
  let rankedCount = 0;

  for (const row of rows) {
    const expected = normalizeChordLabel(row.expected);
    const expectedKey = expected ? chordIdentityKey(expected) : undefined;
    const candidateKeys = row.candidates.flatMap((label) => {
      const identity = normalizeChordLabel(label);
      return identity ? [chordIdentityKey(identity)] : [];
    });
    duplicateCount += candidateKeys.length - new Set(candidateKeys).size;
    const rank = expectedKey
      ? candidateKeys.slice(0, 3).findIndex((key) => key === expectedKey) + 1
      : 0;
    if (rank >= 1 && rank <= 3) {
      rankCounts[rank - 1] += 1;
      reciprocalRank += 1 / rank;
      rankTotal += rank;
      rankedCount += 1;
    } else {
      absent += 1;
    }
  }

  const rate = (count: number) => rows.length === 0 ? 0 : count / rows.length;
  return {
    eventCount: rows.length,
    rank1: { count: rankCounts[0], rate: rate(rankCounts[0]) },
    rank2: { count: rankCounts[1], rate: rate(rankCounts[1]) },
    rank3: { count: rankCounts[2], rate: rate(rankCounts[2]) },
    outsideTop3: { count: absent, rate: rate(absent) },
    correctCandidateAbsent: { count: absent, rate: rate(absent) },
    canonicalEquivalentDuplicateCount: duplicateCount,
    mrr: rate(reciprocalRank),
    correctCandidateMeanRank: rankedCount === 0 ? null : rankTotal / rankedCount,
  };
}
