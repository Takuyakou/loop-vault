import {
  chordIdentityKey,
  normalizeChordLabel,
} from "../../src/domain/chordIdentity";
import type { LegacyWindowCandidateDiagnostic } from "../../src/domain/midi/legacy";

export interface SameRootOracleInput {
  fileId: string;
  eventId: string;
  scenarioId: string;
  expected: string;
  currentCandidates: string[];
  rawWindow: LegacyWindowCandidateDiagnostic | null;
}

export interface SameRootOracleRow {
  fileId: string;
  eventId: string;
  scenarioId: string;
  expected: string;
  currentCandidates: string[];
  oracleCandidates: string[];
  rank1Invariant: boolean;
  currentCanonicalRank: number | null;
  oracleCanonicalRank: number | null;
  currentRootRescue: boolean;
  oracleRootRescue: boolean;
  gainedCanonicalRescue: boolean;
  lostRootRescue: boolean;
}

export interface OracleCorrectionResult {
  currentCost: number;
  oracleCost: number;
  currentManual: boolean;
  oracleManual: boolean;
}

export interface SameRootOracleSummary {
  eventCount: number;
  rank1ChangeCount: number;
  currentTop3Canonical: number;
  oracleSameRootTop3Canonical: number;
  oracleSameRootGain: number;
  currentTop3Root: number;
  oracleTop3Root: number;
  top3RootDelta: number;
  currentMRR: number;
  oracleMRR: number;
  MRRDelta: number;
  gainedCanonicalRescueCount: number;
  lostRootRescueCount: number;
  netRescueCount: number;
  lostRootToGainedRatio: number | null;
}

export function buildSameRootOracleRow(
  input: SameRootOracleInput,
): SameRootOracleRow {
  const primary = input.currentCandidates[0] ?? null;
  const primaryIdentity = primary ? normalizeChordLabel(primary) : null;
  const expectedIdentity = normalizeChordLabel(input.expected);
  const expectedKey = expectedIdentity ? chordIdentityKey(expectedIdentity) : null;
  const selected = primary ? [primary] : [];
  const selectedKeys = new Set(selected.flatMap((label) => {
    const identity = normalizeChordLabel(label);
    return identity ? [chordIdentityKey(identity)] : [];
  }));

  if (primaryIdentity) {
    for (const candidate of input.rawWindow?.candidates ?? []) {
      const identity = normalizeChordLabel(candidate.chord.label);
      if (!identity || identity.rootPitchClass !== primaryIdentity.rootPitchClass) continue;
      const key = chordIdentityKey(identity);
      if (selectedKeys.has(key)) continue;
      selected.push(candidate.chord.label);
      selectedKeys.add(key);
      if (selected.length === 3) break;
    }
  }
  for (const label of input.currentCandidates.slice(3)) {
    const identity = normalizeChordLabel(label);
    if (!identity) continue;
    const key = chordIdentityKey(identity);
    if (selectedKeys.has(key)) continue;
    selected.push(label);
    selectedKeys.add(key);
  }

  const currentRank = expectedKey
    ? canonicalRank(input.currentCandidates.slice(0, 3), expectedKey)
    : null;
  const oracleRank = expectedKey ? canonicalRank(selected.slice(0, 3), expectedKey) : null;
  const currentRootRescue = expectedIdentity
    ? hasRoot(input.currentCandidates.slice(0, 3), expectedIdentity.rootPitchClass)
    : false;
  const oracleRootRescue = expectedIdentity
    ? hasRoot(selected.slice(0, 3), expectedIdentity.rootPitchClass)
    : false;

  return {
    fileId: input.fileId,
    eventId: input.eventId,
    scenarioId: input.scenarioId,
    expected: input.expected,
    currentCandidates: input.currentCandidates,
    oracleCandidates: selected,
    rank1Invariant: primary === (selected[0] ?? null),
    currentCanonicalRank: currentRank,
    oracleCanonicalRank: oracleRank,
    currentRootRescue,
    oracleRootRescue,
    gainedCanonicalRescue: currentRank === null && oracleRank !== null,
    lostRootRescue: currentRootRescue && !oracleRootRescue,
  };
}

export function summarizeSameRootOracle(
  rows: readonly SameRootOracleRow[],
): SameRootOracleSummary {
  const count = rows.length;
  const ratio = (value: number) => count === 0 ? 0 : value / count;
  const currentCanonical = rows.filter((row) => row.currentCanonicalRank !== null).length;
  const oracleCanonical = rows.filter((row) => row.oracleCanonicalRank !== null).length;
  const currentRoot = rows.filter((row) => row.currentRootRescue).length;
  const oracleRoot = rows.filter((row) => row.oracleRootRescue).length;
  const currentReciprocal = rows.reduce((sum, row) =>
    sum + (row.currentCanonicalRank ? 1 / row.currentCanonicalRank : 0), 0);
  const oracleReciprocal = rows.reduce((sum, row) =>
    sum + (row.oracleCanonicalRank ? 1 / row.oracleCanonicalRank : 0), 0);
  const gained = rows.filter((row) => row.gainedCanonicalRescue).length;
  const lostRoot = rows.filter((row) => row.lostRootRescue).length;
  const currentMRR = ratio(currentReciprocal);
  const oracleMRR = ratio(oracleReciprocal);

  return {
    eventCount: count,
    rank1ChangeCount: rows.filter((row) => !row.rank1Invariant).length,
    currentTop3Canonical: ratio(currentCanonical),
    oracleSameRootTop3Canonical: ratio(oracleCanonical),
    oracleSameRootGain: ratio(oracleCanonical - currentCanonical),
    currentTop3Root: ratio(currentRoot),
    oracleTop3Root: ratio(oracleRoot),
    top3RootDelta: ratio(oracleRoot - currentRoot),
    currentMRR,
    oracleMRR,
    MRRDelta: oracleMRR - currentMRR,
    gainedCanonicalRescueCount: gained,
    lostRootRescueCount: lostRoot,
    netRescueCount: gained - lostRoot,
    lostRootToGainedRatio: gained === 0 ? null : lostRoot / gained,
  };
}

function canonicalRank(labels: readonly string[], expectedKey: string): number | null {
  const index = labels.findIndex((label) => {
    const identity = normalizeChordLabel(label);
    return identity !== null && chordIdentityKey(identity) === expectedKey;
  });
  return index >= 0 ? index + 1 : null;
}

function hasRoot(labels: readonly string[], root: number): boolean {
  return labels.some((label) =>
    normalizeChordLabel(label)?.rootPitchClass === root);
}
