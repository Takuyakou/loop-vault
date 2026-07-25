import type { CandidateCatalog, CatalogPattern } from "./candidateCatalog";
import type { CandidateOccurrence } from "./occurrence";

/**
 * Recommendations: a ranked reference into the catalog.
 *
 * Every previous selector had the same shape — decide which ten candidates exist,
 * discard the rest — and the recurring complaint was the consequence. A clean
 * eight-bar file with one progression came back as ten cards built from
 * sub-windows of that progression, and the four real progressions in
 * `15.Endless,endless.` came back as four copies of one vamp.
 *
 * Two rules fix that, and neither is about ranking:
 *
 *   1. The count is what the material supports, not what the layout holds. The
 *      cap is a maximum. One eligible pattern means one recommendation.
 *   2. Nothing is admitted to reach the cap. A candidate earns its slot or the
 *      list ends.
 *
 * The catalog is unaffected either way: dropping out of the recommendation is not
 * removal, it is only not being first.
 */

export const recommendationVersion = "recommendation-v1" as const;

/** Shown without interaction. A maximum, never a target. */
export const defaultRecommendationDisplayCap = 10;

export type RecommendationReason =
  | "distinct-progression"
  | "covers-new-ground"
  | "repeats-across-the-song"
  | "strong-evidence"
  | "only-candidate-of-its-kind";

export interface CandidateRecommendation {
  patternId: string;
  rank: number;
  recommendationScore: number;
  reasons: RecommendationReason[];
}

export type RecommendationStop =
  | "all-eligible-used"
  | "display-cap"
  | "quality-floor"
  | "no-eligible-pattern";

export interface RecommendationResult {
  version: typeof recommendationVersion;
  recommendations: CandidateRecommendation[];
  evaluatedPatternCount: number;
  eligiblePatternCount: number;
  stoppedBecause: RecommendationStop;
  /** Always zero. Reported so a regression that pads is visible, not inferred. */
  paddingCount: number;
}

export interface RecommendationOptions {
  displayCap?: number;
  /** Below this a pattern is never recommended, whatever else it offers. */
  minimumRecommendationQuality?: number;
}

const DEFAULT_MINIMUM_QUALITY = 0.35;

/** The chord identities a pattern states, in order. */
function chordSequenceOf(pattern: CatalogPattern): string[] {
  const representative = pattern.occurrences.find(
    (occurrence) => occurrence.id === pattern.representativeOccurrenceId,
  ) ?? pattern.occurrences[0];
  return representative.events.map((event) => event.identityKey);
}

/** Whether `sequence` is `unit` laid end to end. */
function isRepetitionOf(sequence: readonly string[], unit: readonly string[]): boolean {
  if (unit.length === 0 || sequence.length <= unit.length) return false;
  if (sequence.length % unit.length !== 0) return false;
  return sequence.every((identity, index) => identity === unit[index % unit.length]);
}

/** Whether `sequence` is `other` started from a different point in the loop. */
function isRotationOf(sequence: readonly string[], other: readonly string[]): boolean {
  if (sequence.length === 0 || sequence.length !== other.length) return false;
  const doubled = [...other, ...other];
  for (let offset = 0; offset < other.length; offset += 1) {
    if (sequence.every((identity, index) => identity === doubled[offset + index])) return true;
  }
  return false;
}

/**
 * Whether `pattern` is the same music as something already recommended.
 *
 * This is the rule that stops a clean eight-bar file arriving as several cards.
 * `C Am F G C Am F G` produces three shapes that are all one loop: the four-bar
 * unit, the eight-bar window that states it twice, and the windows that start on
 * bar two or three. Only one of them is a suggestion; the rest are the same
 * progression written from a different place.
 *
 * Three relationships, all exact rather than heuristic:
 *
 *   - a sub-window, every occurrence sitting inside a span already shown
 *   - a repetition, the chosen unit laid end to end
 *   - a rotation, the same loop entered at a different point
 *
 * A pattern that merely shares chords with one already shown is not suppressed:
 * a different order is a different progression.
 */
function restatesRecommended(
  pattern: CatalogPattern,
  chosen: readonly CatalogPattern[],
): boolean {
  const sequence = chordSequenceOf(pattern);
  return chosen.some((other) => {
    const isSubWindow = pattern.occurrences.every(
      (occurrence) => other.occurrences.some(
        (span) => span.startBar <= occurrence.startBar && span.endBar >= occurrence.endBar,
      ),
    );
    if (isSubWindow) return true;
    const otherSequence = chordSequenceOf(other);
    return isRepetitionOf(sequence, otherSequence) || isRotationOf(sequence, otherSequence);
  });
}

/** Kinds allowed in the main recommendation. */
function isMainLaneKind(pattern: CatalogPattern): boolean {
  return pattern.candidateKind === "progression";
}

function scoreOf(pattern: CatalogPattern, coveredBars: ReadonlySet<number>): number {
  const newBars = pattern.reachableBars.filter((bar) => !coveredBars.has(bar)).length;
  const reach = pattern.reachableBars.length === 0
    ? 0
    : newBars / pattern.reachableBars.length;
  // Length carries real weight, and the reason is the sub-window rule below
  // rather than a belief that longer is better. Suppression only works forwards:
  // once the eight-bar phrase is recommended its halves are skipped, but if a
  // half is taken first the phrase that contains it is not a sub-window of
  // anything and takes a second slot. A clean eight-bar file then arrives as
  // three cards of the same music, which is the complaint this stage exists to
  // answer. Leading with the fuller statement makes the rule bite.
  const span = Math.min(1, pattern.qualitySummary.lengthBars / 16);
  return 0.38 * pattern.qualitySummary.bestScore
    + 0.24 * reach
    + 0.10 * Math.min(1, pattern.qualitySummary.occurrenceCount / 4)
    + 0.28 * span;
}

function reasonsFor(
  pattern: CatalogPattern,
  newBars: number,
  eligibleCount: number,
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  if (pattern.candidateKind === "progression") reasons.push("distinct-progression");
  if (newBars > 0) reasons.push("covers-new-ground");
  if (pattern.qualitySummary.occurrenceCount >= 3) reasons.push("repeats-across-the-song");
  if (pattern.qualitySummary.bestScore >= 0.75) reasons.push("strong-evidence");
  if (eligibleCount === 1) reasons.push("only-candidate-of-its-kind");
  return reasons;
}

/**
 * Builds the recommendation list.
 *
 * The loop ends when the eligible patterns run out, when the cap is reached, or
 * when the best remaining candidate is below the quality floor. It never ends
 * because a count was satisfied, and it never continues because one was not.
 */
export function recommendPatterns(
  catalog: CandidateCatalog,
  options: RecommendationOptions = {},
): RecommendationResult {
  const displayCap = options.displayCap ?? defaultRecommendationDisplayCap;
  const minimumQuality = options.minimumRecommendationQuality ?? DEFAULT_MINIMUM_QUALITY;

  const eligible = catalog.patterns.filter((pattern) => isMainLaneKind(pattern)
    && pattern.qualitySummary.bestScore >= minimumQuality);

  if (eligible.length === 0) {
    return {
      version: recommendationVersion,
      recommendations: [],
      evaluatedPatternCount: catalog.patterns.length,
      eligiblePatternCount: 0,
      stoppedBecause: "no-eligible-pattern",
      paddingCount: 0,
    };
  }

  const chosen: CatalogPattern[] = [];
  const recommendations: CandidateRecommendation[] = [];
  const coveredBars = new Set<number>();
  const shownIdentities = new Set<string>();
  const remaining = new Set(eligible.map((pattern) => pattern.patternId));
  let stoppedBecause: RecommendationStop = "all-eligible-used";

  while (recommendations.length < displayCap && remaining.size > 0) {
    let best: { pattern: CatalogPattern; score: number; newBars: number } | undefined;

    for (const pattern of eligible) {
      if (!remaining.has(pattern.patternId)) continue;
      // Each of these is a reason the candidate does not deserve a slot, not a
      // reason to look further down the list for a replacement.
      if (shownIdentities.has(pattern.normalizedProgressionIdentity)) continue;
      if (restatesRecommended(pattern, chosen)) continue;

      const score = scoreOf(pattern, coveredBars);
      const newBars = pattern.reachableBars.filter((bar) => !coveredBars.has(bar)).length;
      if (!best
        || score > best.score
        || (score === best.score
          && pattern.patternId.localeCompare(best.pattern.patternId) < 0)) {
        best = { pattern, score, newBars };
      }
    }

    if (!best) {
      // Everything left repeats a shape already shown or sits inside one.
      // Stopping here is the point; the alternative is padding.
      stoppedBecause = "all-eligible-used";
      break;
    }
    if (best.pattern.qualitySummary.bestScore < minimumQuality) {
      stoppedBecause = "quality-floor";
      break;
    }

    remaining.delete(best.pattern.patternId);
    chosen.push(best.pattern);
    shownIdentities.add(best.pattern.normalizedProgressionIdentity);
    for (const bar of best.pattern.reachableBars) coveredBars.add(bar);
    recommendations.push({
      patternId: best.pattern.patternId,
      rank: recommendations.length + 1,
      recommendationScore: Number(best.score.toFixed(6)),
      reasons: reasonsFor(best.pattern, best.newBars, eligible.length),
    });
  }

  if (recommendations.length >= displayCap && remaining.size > 0) {
    stoppedBecause = "display-cap";
  }

  return {
    version: recommendationVersion,
    recommendations,
    evaluatedPatternCount: catalog.patterns.length,
    eligiblePatternCount: eligible.length,
    stoppedBecause,
    paddingCount: 0,
  };
}

/** The catalog patterns a recommendation list points at, in rank order. */
export function recommendedPatterns(
  catalog: CandidateCatalog,
  result: RecommendationResult,
): CatalogPattern[] {
  return result.recommendations
    .map((entry) => catalog.patterns.find((pattern) => pattern.patternId === entry.patternId))
    .filter((pattern): pattern is CatalogPattern => pattern !== undefined);
}

/** Every occurrence a recommendation can reach, for reachability checks. */
export function recommendedOccurrences(
  catalog: CandidateCatalog,
  result: RecommendationResult,
): CandidateOccurrence[] {
  return recommendedPatterns(catalog, result).flatMap((pattern) => pattern.occurrences);
}
