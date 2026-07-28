import {
  chordIdentityKey,
  normalizeChordLabel,
  type NormalizedChordIdentity,
} from "../../src/domain/chordIdentity";
import type { LegacyWindowCandidateDiagnostic } from "../../src/domain/midi/legacy";

export type FunnelStage =
  | "raw-generation"
  | "canonical-dedup"
  | "eligibility"
  | "same-root-pool"
  | "same-root-rank"
  | "global-rank"
  | "allocated-top3";

export interface CandidateFunnelInput {
  fileId: string;
  eventId: string;
  startBeat: number;
  endBeat: number;
  expected: string;
  detectedRank1: string | null;
  displayedCandidates: string[];
  rawWindow: LegacyWindowCandidateDiagnostic | null;
}

export interface CandidateFunnelRow {
  fileId: string;
  eventId: string;
  startBeat: number;
  endBeat: number;
  expected: string;
  expectedRoot: number | null;
  detectedRank1: string | null;
  displayedCandidates: string[];
  rawCandidateCount: number;
  canonicalCandidateCount: number;
  eligibleCandidateCount: number;
  sameRootCandidateCount: number;
  funnel: Record<FunnelStage, boolean>;
  sameRootRank: number | null;
  globalRank: number | null;
  displayedRank: number | null;
  firstDropStage: FunnelStage | null;
  dropReason: string | null;
}

export interface CandidateFunnelSummary {
  eventCount: number;
  rawCandidateRecall: number;
  canonicalCandidateRecall: number;
  eligibleCandidateRecall: number;
  sameRootCandidateRecall: number;
  sameRootGoldTop1Rate: number;
  sameRootGoldTop2Rate: number;
  sameRootGoldTop3Rate: number;
  sameRootGoldMeanRank: number | null;
  globalGoldMeanRank: number | null;
  displayedTop3Canonical: number;
  firstDropStageCounts: Record<FunnelStage, number>;
}

interface CandidateIdentity {
  label: string;
  identity: NormalizedChordIdentity;
  key: string;
  rawScore: number;
}

export function buildCandidateFunnelRow(
  input: CandidateFunnelInput,
): CandidateFunnelRow {
  const expectedIdentity = normalizeChordLabel(input.expected);
  const expectedKey = expectedIdentity ? chordIdentityKey(expectedIdentity) : null;
  const raw = (input.rawWindow?.candidates ?? []).map((entry) => ({
    label: entry.chord.label,
    identity: normalizeChordLabel(entry.chord.label),
    rawScore: entry.rawScore,
  }));
  const rawHasGold = expectedKey !== null && raw.some((entry) =>
    entry.identity !== null && chordIdentityKey(entry.identity) === expectedKey);
  const canonical = deduplicateCandidates(raw);
  const canonicalHasGold = expectedKey !== null
    && canonical.some((entry) => entry.key === expectedKey);
  const eligible = canonical.filter((entry) => Number.isFinite(entry.rawScore));
  const eligibleHasGold = expectedKey !== null
    && eligible.some((entry) => entry.key === expectedKey);
  const sameRoot = expectedIdentity
    ? eligible.filter((entry) =>
        entry.identity.rootPitchClass === expectedIdentity.rootPitchClass)
    : [];
  const sameRootRank = expectedKey
    ? rankOf(sameRoot.map((entry) => entry.key), expectedKey)
    : null;
  const globalRank = expectedKey
    ? rankOf(eligible.map((entry) => entry.key), expectedKey)
    : null;
  const displayed = input.displayedCandidates.flatMap((label) => {
    const identity = normalizeChordLabel(label);
    return identity ? [chordIdentityKey(identity)] : [];
  });
  const displayedRank = expectedKey ? rankOf(displayed.slice(0, 3), expectedKey) : null;
  const funnel: Record<FunnelStage, boolean> = {
    "raw-generation": rawHasGold,
    "canonical-dedup": canonicalHasGold,
    eligibility: eligibleHasGold,
    "same-root-pool": sameRootRank !== null,
    "same-root-rank": sameRootRank !== null,
    "global-rank": globalRank !== null,
    "allocated-top3": displayedRank !== null,
  };
  const firstDropStage = firstFailedStage(funnel);

  return {
    fileId: input.fileId,
    eventId: input.eventId,
    startBeat: input.startBeat,
    endBeat: input.endBeat,
    expected: input.expected,
    expectedRoot: expectedIdentity?.rootPitchClass ?? null,
    detectedRank1: input.detectedRank1,
    displayedCandidates: input.displayedCandidates,
    rawCandidateCount: raw.length,
    canonicalCandidateCount: canonical.length,
    eligibleCandidateCount: eligible.length,
    sameRootCandidateCount: sameRoot.length,
    funnel,
    sameRootRank,
    globalRank,
    displayedRank,
    firstDropStage,
    dropReason: firstDropStage ? dropReason(firstDropStage) : null,
  };
}

export function summarizeCandidateFunnel(
  rows: readonly CandidateFunnelRow[],
): CandidateFunnelSummary {
  const count = rows.length;
  const rate = (value: number) => count === 0 ? 0 : value / count;
  const stageCount = (stage: FunnelStage) =>
    rows.filter((row) => row.funnel[stage]).length;
  const sameRootRanks = rows.flatMap((row) =>
    row.sameRootRank === null ? [] : [row.sameRootRank]);
  const globalRanks = rows.flatMap((row) =>
    row.globalRank === null ? [] : [row.globalRank]);
  const stages: FunnelStage[] = [
    "raw-generation",
    "canonical-dedup",
    "eligibility",
    "same-root-pool",
    "same-root-rank",
    "global-rank",
    "allocated-top3",
  ];
  return {
    eventCount: count,
    rawCandidateRecall: rate(stageCount("raw-generation")),
    canonicalCandidateRecall: rate(stageCount("canonical-dedup")),
    eligibleCandidateRecall: rate(stageCount("eligibility")),
    sameRootCandidateRecall: rate(stageCount("same-root-pool")),
    sameRootGoldTop1Rate: rate(rows.filter((row) => row.sameRootRank === 1).length),
    sameRootGoldTop2Rate: rate(rows.filter((row) =>
      row.sameRootRank !== null && row.sameRootRank <= 2).length),
    sameRootGoldTop3Rate: rate(rows.filter((row) =>
      row.sameRootRank !== null && row.sameRootRank <= 3).length),
    sameRootGoldMeanRank: mean(sameRootRanks),
    globalGoldMeanRank: mean(globalRanks),
    displayedTop3Canonical: rate(stageCount("allocated-top3")),
    firstDropStageCounts: Object.fromEntries(stages.map((stage) => [
      stage,
      rows.filter((row) => row.firstDropStage === stage).length,
    ])) as Record<FunnelStage, number>,
  };
}

function deduplicateCandidates(
  candidates: readonly {
    label: string;
    identity: NormalizedChordIdentity | null;
    rawScore: number;
  }[],
): CandidateIdentity[] {
  const byKey = new Map<string, CandidateIdentity>();
  for (const candidate of candidates) {
    if (!candidate.identity) continue;
    const key = chordIdentityKey(candidate.identity);
    const previous = byKey.get(key);
    if (!previous || candidate.rawScore > previous.rawScore) {
      byKey.set(key, { ...candidate, identity: candidate.identity, key });
    }
  }
  return [...byKey.values()].sort((left, right) =>
    right.rawScore - left.rawScore || left.label.localeCompare(right.label));
}

function rankOf(keys: readonly string[], expectedKey: string): number | null {
  const index = keys.findIndex((key) => key === expectedKey);
  return index >= 0 ? index + 1 : null;
}

function firstFailedStage(
  funnel: Record<FunnelStage, boolean>,
): FunnelStage | null {
  const stages: FunnelStage[] = [
    "raw-generation",
    "canonical-dedup",
    "eligibility",
    "same-root-pool",
    "same-root-rank",
    "global-rank",
    "allocated-top3",
  ];
  return stages.find((stage) => !funnel[stage]) ?? null;
}

function dropReason(stage: FunnelStage): string {
  if (stage === "raw-generation") return "Gold canonical identity was not generated.";
  if (stage === "canonical-dedup") return "Gold identity was lost during canonical deduplication.";
  if (stage === "eligibility") return "Gold identity failed candidate eligibility.";
  if (stage === "same-root-pool") return "Gold identity was absent from its root pool.";
  if (stage === "same-root-rank") return "Gold identity had no same-root rank.";
  if (stage === "global-rank") return "Gold identity had no global rank.";
  return "Gold identity existed upstream but was not allocated to displayed Top-3.";
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
