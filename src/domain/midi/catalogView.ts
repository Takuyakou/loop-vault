import type { ProgressionBlockCandidate } from "../types";
import { summaryFromEvents } from "./candidateBlock";
import type { CandidateCatalog, CatalogCandidateKind, CatalogPattern } from "./candidateCatalog";
import { occurrenceToCandidate } from "./occurrence";
import {
  defaultRecommendationDisplayCap,
  type CandidateRecommendation,
  type RecommendationResult,
} from "./candidateRecommendation";

/**
 * How the catalog is laid out for reading.
 *
 * Kept out of the view so the rules can be tested as data. The rules themselves
 * come from what went wrong before: a file with one progression must not read as
 * a list of ten, a file with no progression must not be headed "recommended
 * progressions", and a file with 1777 patterns must not lose 1767 of them to a
 * display limit.
 */

export type CatalogLaneKind =
  | "recommended"
  | "progression"
  | "vamp"
  | "fragment"
  | "uncertain";

export interface CatalogLaneEntry {
  /** The catalog id. A pattern shown anywhere is shown as this one entity. */
  patternId: string;
  pattern: CatalogPattern;
  recommendationRank?: number;
  reasons?: CandidateRecommendation["reasons"];
}

export interface CatalogLane {
  kind: CatalogLaneKind;
  entries: CatalogLaneEntry[];
  /** Everything in the lane, not the rendered slice. */
  totalCount: number;
  /** Shown collapsed until asked for. Never a reason to omit the contents. */
  initiallyCollapsed: boolean;
  /** Patterns of this kind that appear in the recommended lane instead. */
  recommendedElsewhere: number;
}

export interface CatalogView {
  /**
   * `unified` when the recommendation and the catalog are the same short list,
   * so showing both would be the same cards twice.
   */
  mode: "unified" | "laned";
  lanes: CatalogLane[];
  totalPatternCount: number;
  recommendationCount: number;
  /** How many cards to render before the reader asks for more. */
  pageSize: number;
}

/**
 * Cards rendered per lane before "show more".
 *
 * Deliberately not the recommendation cap: the cap is how many suggestions the
 * material supports, this is how much DOM to build at once. Tying them together
 * is what would make a 1777-pattern catalog silently become ten patterns.
 */
export const catalogPageSize = 25;

const COLLAPSED_BY_DEFAULT: ReadonlySet<CatalogLaneKind> = new Set(["fragment", "uncertain"]);

const KIND_LANE_ORDER: CatalogCandidateKind[] = [
  "progression",
  "vamp",
  "fragment",
  "uncertain",
];

export interface CatalogViewOptions {
  displayCap?: number;
  pageSize?: number;
}

/**
 * Builds the lane layout.
 *
 * A pattern appears exactly once in the whole view. A recommended pattern sits in
 * the recommended lane and is left out of its kind lane rather than repeated
 * there, which is what keeps "one card per pattern" true across lanes rather than
 * only within one; the kind lane reports how many of its patterns are shown above
 * so the count still adds up for the reader.
 */
export function buildCatalogView(
  catalog: CandidateCatalog,
  recommendation: RecommendationResult,
  options: CatalogViewOptions = {},
): CatalogView {
  const displayCap = options.displayCap ?? defaultRecommendationDisplayCap;
  const pageSize = options.pageSize ?? catalogPageSize;

  const byId = new Map(catalog.patterns.map((pattern) => [pattern.patternId, pattern]));
  const recommendedIds = new Set(recommendation.recommendations.map((entry) => entry.patternId));

  const recommendedEntries: CatalogLaneEntry[] = [];
  for (const entry of recommendation.recommendations) {
    const pattern = byId.get(entry.patternId);
    // A recommendation pointing at nothing would be a broken reference rather
    // than an empty slot, so it is dropped rather than rendered.
    if (pattern === undefined) continue;
    recommendedEntries.push({
      patternId: entry.patternId,
      pattern,
      recommendationRank: entry.rank,
      reasons: entry.reasons,
    });
  }

  // The recommendation and the catalog are the same list: one heading, one list.
  // Two sections of identical cards is the "おすすめ 1件 / すべて 1件" shape that
  // reads as a bug.
  const isUnified = catalog.patterns.length <= displayCap
    && catalog.patterns.every((pattern) => recommendedIds.has(pattern.patternId));

  if (isUnified) {
    return {
      mode: "unified",
      lanes: [{
        kind: "recommended",
        entries: recommendedEntries,
        totalCount: recommendedEntries.length,
        initiallyCollapsed: false,
        recommendedElsewhere: 0,
      }],
      totalPatternCount: catalog.patterns.length,
      recommendationCount: recommendedEntries.length,
      pageSize,
    };
  }

  const lanes: CatalogLane[] = [];

  // An empty recommendation produces no lane at all. A heading reading
  // "recommended progressions" over nothing tells the user the file failed
  // rather than that it has no progressions in it.
  if (recommendedEntries.length > 0) {
    lanes.push({
      kind: "recommended",
      entries: recommendedEntries,
      totalCount: recommendedEntries.length,
      initiallyCollapsed: false,
      recommendedElsewhere: 0,
    });
  }

  for (const kind of KIND_LANE_ORDER) {
    const ofKind = catalog.patterns.filter((pattern) => pattern.candidateKind === kind);
    if (ofKind.length === 0) continue;
    const remaining = ofKind.filter((pattern) => !recommendedIds.has(pattern.patternId));
    const recommendedHere = ofKind.length - remaining.length;
    if (remaining.length === 0) continue;

    lanes.push({
      kind,
      entries: remaining.map((pattern) => ({ patternId: pattern.patternId, pattern })),
      totalCount: remaining.length,
      initiallyCollapsed: COLLAPSED_BY_DEFAULT.has(kind),
      recommendedElsewhere: recommendedHere,
    });
  }

  return {
    mode: "laned",
    lanes,
    totalPatternCount: catalog.patterns.length,
    recommendationCount: recommendedEntries.length,
    pageSize,
  };
}

/**
 * A lane entry as the existing card component consumes it.
 *
 * The card is unchanged: it already knows how to render a candidate and offer its
 * pattern's other occurrences. What changes is where the candidate comes from —
 * the catalog rather than a ten-item shortlist.
 */
export function laneCandidate(
  entry: CatalogLaneEntry,
  beatsPerBar: number,
): ProgressionBlockCandidate {
  const representative = entry.pattern.occurrences.find(
    (occurrence) => occurrence.id === entry.pattern.representativeOccurrenceId,
  ) ?? entry.pattern.occurrences[0];
  const kind = entry.pattern.candidateKind === "uncertain"
    ? undefined
    : entry.pattern.candidateKind;
  return occurrenceToCandidate(
    representative,
    summaryFromEvents(representative.events, representative.lengthBars, beatsPerBar),
    entry.pattern.candidateKind === "progression" ? ["main"] : ["variation"],
    kind,
  );
}

export interface LaneRenderPlan {
  visible: CatalogLaneEntry[];
  /** Entries the reader can still ask for. Never entries that were discarded. */
  remaining: number;
}

/**
 * How much of a lane to put in the DOM right now.
 *
 * Rendering is bounded; membership is not. A closed lane renders nothing and
 * still holds everything, and an open one grows by a page at a time. The reason
 * to separate them is the 1777-pattern file: building every card at once is slow,
 * and dropping the tail to avoid that would be the deletion this whole stage
 * exists to end.
 */
export function laneRenderPlan(
  lane: CatalogLane,
  state: { open: boolean; limit: number },
): LaneRenderPlan {
  if (!state.open) return { visible: [], remaining: 0 };
  const visible = lane.entries.slice(0, Math.max(0, state.limit));
  return { visible, remaining: Math.max(0, lane.entries.length - visible.length) };
}

/** Every pattern id the view can reach, for the reachability gate. */
export function reachablePatternIds(view: CatalogView): Set<string> {
  return new Set(view.lanes.flatMap((lane) => lane.entries.map((entry) => entry.patternId)));
}

/** Every occurrence id the view can reach. */
export function reachableOccurrenceIds(view: CatalogView): Set<string> {
  return new Set(view.lanes.flatMap(
    (lane) => lane.entries.flatMap(
      (entry) => entry.pattern.occurrences.map((occurrence) => occurrence.id),
    ),
  ));
}
