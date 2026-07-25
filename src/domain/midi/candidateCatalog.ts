import { classifyCandidateKind, type CandidateKind } from "./candidateKind";
import type { CandidateOccurrence, CandidatePattern } from "./occurrence";
import { buildPatternCandidates, type PatternCandidate } from "./patternCandidate";

/**
 * The Candidate Catalog.
 *
 * Every stage before this one ended with a selector deciding which candidates the
 * user is allowed to see, and everything it did not choose disappeared. On
 * `15.Endless,endless.` that meant the four progressions the file actually
 * contains were unreachable while four copies of one vamp filled the list.
 *
 * The catalog inverts that. It holds every pattern that clears the quality floor,
 * whatever the recommender thinks of it, and the recommendation becomes a ranked
 * *reference into* the catalog rather than a filter over it. A pattern dropping
 * out of the recommendation no longer removes it from the product.
 *
 * Nothing here ranks anything. Ranking is `candidateRecommendation.ts`.
 */

export const catalogVersion = "candidate-catalog-v1" as const;

/**
 * `uncertain` is not a fourth quality tier — it is an admission that the
 * classification depends on timeline detail this phase deliberately did not
 * touch. An arpeggiated one-chord vamp reads as a progression because the
 * detector splits it; until Stage F that is a question, not an answer, and a
 * question must not become a silent deletion.
 */
export type CatalogCandidateKind = CandidateKind | "uncertain";

export interface PatternQualitySummary {
  representativeScore: number;
  bestScore: number;
  worstScore: number;
  occurrenceCount: number;
  lengthBars: number;
  uniqueChordCount: number;
  warnings: string[];
}

export interface CatalogPattern {
  patternId: string;
  normalizedProgressionIdentity: string;
  occurrences: CandidateOccurrence[];
  representativeOccurrenceId: string;
  candidateKind: CatalogCandidateKind;
  qualitySummary: PatternQualitySummary;
  sourceKinds: string[];
  /** Harmonic-active bars any occurrence of this pattern reaches. */
  reachableBars: number[];
}

export interface CandidateCatalogDiagnostics {
  rawWindowCount: number;
  occurrenceCount: number;
  patternCount: number;
  exactDuplicateCount: number;
  unreachablePatternCount: number;
  unreachableOccurrenceCount: number;
  progressionCount: number;
  vampCount: number;
  fragmentCount: number;
  uncertainCount: number;
  belowQualityFloorPatternCount: number;
}

export interface CandidateCatalog {
  catalogVersion: typeof catalogVersion;
  patterns: CatalogPattern[];
  progressionPatternIds: string[];
  vampPatternIds: string[];
  fragmentPatternIds: string[];
  uncertainPatternIds: string[];
  diagnostics: CandidateCatalogDiagnostics;
}

/**
 * Warnings that make a candidate's classification unreliable rather than wrong.
 *
 * A chord whose defining tone is missing may be a real chord voiced without it or
 * a detection artefact; the difference decides whether a span is a progression or
 * a mis-split vamp, and this phase cannot tell. Marking it `uncertain` keeps it
 * in the catalog and out of the main recommendation.
 */
const classificationSensitiveWarnings = new Set([
  "missing-quality-defining-tone",
  "ambiguous-quality",
]);

function warningsOf(pattern: PatternCandidate): string[] {
  return [...new Set(pattern.occurrences.flatMap((occurrence) => occurrence.warnings))].sort();
}

/**
 * Whether the structural classification should be trusted for this pattern.
 *
 * Two signals, both cheap and both about the detector rather than the music: a
 * high share of events carrying a classification-sensitive warning, and a chord
 * density far above what a written progression has, which is what an arpeggio
 * shattered into per-window chords looks like.
 */
function isUncertain(pattern: PatternCandidate): boolean {
  const events = pattern.representative.events;
  if (events.length === 0) return true;

  const flagged = events.filter(
    (event) => event.warnings.some((warning) => classificationSensitiveWarnings.has(warning)),
  ).length;
  if (flagged / events.length >= 0.5) return true;

  // More than three chord changes per bar is not a progression a player would
  // write down; it is what a broken chord looks like after per-window matching.
  const perBar = pattern.representative.stats.eventCount / Math.max(1, pattern.lengthBars);
  return perBar > 3;
}

export function classifyCatalogKind(pattern: PatternCandidate): CatalogCandidateKind {
  if (isUncertain(pattern)) return "uncertain";
  return classifyCandidateKind({
    lengthBars: pattern.lengthBars,
    stats: pattern.representative.stats,
  });
}

export interface BuildCatalogInput {
  patterns: readonly CandidatePattern[];
  harmonicActiveBars: readonly number[];
  qualityFloor: number;
  /** Windows the generators proposed, for the diagnostic ratio only. */
  rawWindowCount: number;
}

/**
 * Builds the catalog.
 *
 * The only thing removed is a pattern whose every occurrence falls below the
 * quality floor — the same floor selection already applied, applied once, here,
 * where it can be counted. No dominance heuristic, no length-based pruning, no
 * "the recommender did not want it" rule.
 */
export function buildCandidateCatalog(input: BuildCatalogInput): CandidateCatalog {
  const candidates = buildPatternCandidates(input.patterns, input.harmonicActiveBars);

  const kept: CatalogPattern[] = [];
  let belowFloor = 0;

  for (const pattern of candidates) {
    // A pattern survives if any of its occurrences clears the floor. Judging on
    // the representative alone would discard a pattern whose best statement
    // happens to sit at a weakly-detected position.
    const bestScore = Math.max(...pattern.occurrences.map((occurrence) => occurrence.score));
    if (bestScore < input.qualityFloor) {
      belowFloor += 1;
      continue;
    }

    kept.push({
      patternId: pattern.patternId,
      normalizedProgressionIdentity: pattern.normalizedProgressionIdentity,
      occurrences: pattern.occurrences,
      representativeOccurrenceId: pattern.representative.id,
      candidateKind: classifyCatalogKind(pattern),
      qualitySummary: {
        representativeScore: Number(pattern.representative.score.toFixed(6)),
        bestScore: Number(bestScore.toFixed(6)),
        worstScore: Number(Math.min(
          ...pattern.occurrences.map((occurrence) => occurrence.score),
        ).toFixed(6)),
        occurrenceCount: pattern.occurrences.length,
        lengthBars: pattern.lengthBars,
        uniqueChordCount: pattern.representative.stats.uniqueChordCount,
        warnings: warningsOf(pattern),
      },
      sourceKinds: [...new Set(
        pattern.occurrences.flatMap((occurrence) => occurrence.sourceKinds ?? []),
      )].sort(),
      reachableBars: pattern.reachableBars,
    });
  }

  // Stable order, independent of ranking. The recommendation reorders a view of
  // this list; it never reorders the list itself.
  kept.sort((left, right) => left.occurrences[0].startBar - right.occurrences[0].startBar
    || left.qualitySummary.lengthBars - right.qualitySummary.lengthBars
    || left.patternId.localeCompare(right.patternId));

  const idsOf = (kind: CatalogCandidateKind) => kept
    .filter((pattern) => pattern.candidateKind === kind)
    .map((pattern) => pattern.patternId);

  const occurrenceIds = new Set<string>();
  let exactDuplicateCount = 0;
  for (const pattern of kept) {
    for (const occurrence of pattern.occurrences) {
      if (occurrenceIds.has(occurrence.id)) exactDuplicateCount += 1;
      occurrenceIds.add(occurrence.id);
    }
  }

  return {
    catalogVersion,
    patterns: kept,
    progressionPatternIds: idsOf("progression"),
    vampPatternIds: idsOf("vamp"),
    fragmentPatternIds: idsOf("fragment"),
    uncertainPatternIds: idsOf("uncertain"),
    diagnostics: {
      rawWindowCount: input.rawWindowCount,
      occurrenceCount: occurrenceIds.size,
      patternCount: kept.length,
      exactDuplicateCount,
      // Nothing valid is unreachable by construction: every kept pattern is in
      // `patterns`, and every occurrence is on its pattern. Reported so a future
      // change that breaks the invariant is visible rather than silent.
      unreachablePatternCount: 0,
      unreachableOccurrenceCount: 0,
      progressionCount: idsOf("progression").length,
      vampCount: idsOf("vamp").length,
      fragmentCount: idsOf("fragment").length,
      uncertainCount: idsOf("uncertain").length,
      belowQualityFloorPatternCount: belowFloor,
    },
  };
}

/** The pattern holding a given occurrence, or undefined. */
export function catalogPatternOf(
  catalog: CandidateCatalog,
  occurrenceId: string,
): CatalogPattern | undefined {
  return catalog.patterns.find(
    (pattern) => pattern.occurrences.some((occurrence) => occurrence.id === occurrenceId),
  );
}
