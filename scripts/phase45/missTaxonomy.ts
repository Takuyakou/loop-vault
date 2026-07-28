import {
  normalizeChordLabel,
  type NormalizedChordIdentity,
} from "../../src/domain/chordIdentity";
import type { CandidateFunnelRow, FunnelStage } from "./candidateFunnel";

export type PrimaryMissCategory =
  | "candidate-not-generated"
  | "canonical-dedup-loss"
  | "candidate-ineligible"
  | "same-root-ranked-too-low"
  | "alternative-root-allocation-loss"
  | "root-wrong"
  | "quality-family-wrong"
  | "seventh-wrong"
  | "tension-under"
  | "tension-over"
  | "slash-bass-wrong"
  | "canonical-equivalent"
  | "ambiguous"
  | "annotation-contract-issue"
  | "other";

export type SecondaryMissCategory =
  | "root-wrong"
  | "quality-family-wrong"
  | "seventh-wrong"
  | "tension-under"
  | "tension-over"
  | "slash-bass-wrong";

export interface TaxonomyContext {
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
}

export interface TaxonomyRow {
  fileId: string;
  eventId: string;
  expected: string;
  detectedRank1: string | null;
  firstDropStage: FunnelStage | null;
  primaryCategory: PrimaryMissCategory;
  secondaryCategories: SecondaryMissCategory[];
  expectedRootCorrectAt1: boolean;
  expectedCandidateExists: boolean;
  sameRootRank: number | null;
  globalRank: number | null;
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
}

export interface MissTaxonomySummary {
  missCount: number;
  primaryCounts: Record<PrimaryMissCategory, number>;
  secondaryCounts: Record<SecondaryMissCategory, number>;
  allocationEditableCount: number;
  allocationEditableShare: number;
  ambiguousOrAnnotationCount: number;
  ambiguousOrAnnotationShare: number;
}

const primaryCategories: PrimaryMissCategory[] = [
  "candidate-not-generated",
  "canonical-dedup-loss",
  "candidate-ineligible",
  "same-root-ranked-too-low",
  "alternative-root-allocation-loss",
  "root-wrong",
  "quality-family-wrong",
  "seventh-wrong",
  "tension-under",
  "tension-over",
  "slash-bass-wrong",
  "canonical-equivalent",
  "ambiguous",
  "annotation-contract-issue",
  "other",
];

const secondaryCategories: SecondaryMissCategory[] = [
  "root-wrong",
  "quality-family-wrong",
  "seventh-wrong",
  "tension-under",
  "tension-over",
  "slash-bass-wrong",
];

export function classifyTop3Miss(
  row: CandidateFunnelRow,
  context: TaxonomyContext,
): TaxonomyRow {
  const expected = normalizeChordLabel(row.expected);
  const detected = row.detectedRank1 ? normalizeChordLabel(row.detectedRank1) : null;
  const secondary = expected && detected ? musicalDifferences(expected, detected) : [];
  const primary = pipelineCategory(row);

  return {
    fileId: row.fileId,
    eventId: row.eventId,
    expected: row.expected,
    detectedRank1: row.detectedRank1,
    firstDropStage: row.firstDropStage,
    primaryCategory: primary,
    secondaryCategories: secondary,
    expectedRootCorrectAt1: Boolean(
      expected && detected && expected.rootPitchClass === detected.rootPitchClass,
    ),
    expectedCandidateExists: row.funnel["raw-generation"],
    sameRootRank: row.sameRootRank,
    globalRank: row.globalRank,
    ...context,
  };
}

export function summarizeMissTaxonomy(
  rows: readonly TaxonomyRow[],
): MissTaxonomySummary {
  const missCount = rows.length;
  const allocationCategories = new Set<PrimaryMissCategory>([
    "same-root-ranked-too-low",
    "alternative-root-allocation-loss",
  ]);
  const allocationEditableCount = rows.filter((row) =>
    allocationCategories.has(row.primaryCategory)).length;
  const ambiguousOrAnnotationCount = rows.filter((row) =>
    row.primaryCategory === "ambiguous"
    || row.primaryCategory === "annotation-contract-issue").length;
  return {
    missCount,
    primaryCounts: Object.fromEntries(primaryCategories.map((category) => [
      category,
      rows.filter((row) => row.primaryCategory === category).length,
    ])) as Record<PrimaryMissCategory, number>,
    secondaryCounts: Object.fromEntries(secondaryCategories.map((category) => [
      category,
      rows.filter((row) => row.secondaryCategories.includes(category)).length,
    ])) as Record<SecondaryMissCategory, number>,
    allocationEditableCount,
    allocationEditableShare: missCount === 0 ? 0 : allocationEditableCount / missCount,
    ambiguousOrAnnotationCount,
    ambiguousOrAnnotationShare: missCount === 0 ? 0 : ambiguousOrAnnotationCount / missCount,
  };
}

function pipelineCategory(row: CandidateFunnelRow): PrimaryMissCategory {
  if (row.firstDropStage === "raw-generation") return "candidate-not-generated";
  if (row.firstDropStage === "canonical-dedup") return "canonical-dedup-loss";
  if (row.firstDropStage === "eligibility") return "candidate-ineligible";
  if (row.firstDropStage === "same-root-pool"
    || row.firstDropStage === "same-root-rank") {
    return "same-root-ranked-too-low";
  }
  if (row.firstDropStage === "allocated-top3") {
    return row.sameRootRank !== null && row.sameRootRank > 3
      ? "same-root-ranked-too-low"
      : "alternative-root-allocation-loss";
  }
  return "other";
}

function musicalDifferences(
  expected: NormalizedChordIdentity,
  detected: NormalizedChordIdentity,
): SecondaryMissCategory[] {
  const differences: SecondaryMissCategory[] = [];
  if (expected.rootPitchClass !== detected.rootPitchClass) differences.push("root-wrong");
  if (expected.triad !== detected.triad) differences.push("quality-family-wrong");
  if (expected.seventh !== detected.seventh) differences.push("seventh-wrong");

  const expectedTensions = new Set([
    ...expected.extensions.map(String),
    ...expected.alterations,
  ]);
  const detectedTensions = new Set([
    ...detected.extensions.map(String),
    ...detected.alterations,
  ]);
  if ([...expectedTensions].some((value) => !detectedTensions.has(value))) {
    differences.push("tension-under");
  }
  if ([...detectedTensions].some((value) => !expectedTensions.has(value))) {
    differences.push("tension-over");
  }
  if (expected.bassPitchClass !== detected.bassPitchClass) {
    differences.push("slash-bass-wrong");
  }
  return differences;
}
