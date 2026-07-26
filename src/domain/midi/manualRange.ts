import type { ChordTimelineItem } from "../types";
import {
  BEATS_PER_BAR,
  buildCandidateEventsInBeatRange,
  candidateStats,
  relativeSignature,
  structuredSignature,
} from "./candidateBlock";
import type { CandidateOccurrence } from "./occurrence";

/**
 * Candidates built from a range a person chose.
 *
 * The measurement that motivates this (`docs/phase4.1.3/00-manual-repair-baseline.md`)
 * found that in nine of ten regions where no automatic candidate matched, every
 * chord the user needed was already in the Full Timeline. The window generator
 * had simply never proposed that span. So the missing capability is not better
 * generation — it is a way to say which bars are wanted.
 *
 * Everything here is pure and nothing is persisted. The occurrence this returns
 * is detached: it is not in the catalog, not ranked, and not saved until a later
 * stage puts it somewhere.
 */

export const manualRangeSource = "manual-range" as const;

export type ManualRangeSource = typeof manualRangeSource;

export interface TimelineRange {
  /** 1-based bar of the first beat in the range. */
  startBar: number;
  /** 1-based beat within `startBar`. */
  startBeat: number;
  /** 1-based bar of the last beat in the range. */
  endBar: number;
  /** 1-based beat within `endBar`. The range includes all of this beat. */
  endBeat: number;
}

export interface CreateCandidateFromTimelineRangeInput extends TimelineRange {
  timeline: readonly ChordTimelineItem[];
  source?: ManualRangeSource;
  beatsPerBar?: number;
  /** Overrides the derived id. Only for reproducing a stored selection. */
  id?: string;
}

export type ManualRangeIssue =
  | "empty-timeline"
  | "start-before-first-bar"
  | "beat-out-of-bar"
  | "end-before-start"
  | "zero-length"
  | "no-chords-in-range";

/**
 * Absolute beat bounds of a range, end exclusive.
 *
 * `endBeat` is inclusive of the beat the user named — selecting "bar 4 beat 4"
 * means the fourth beat is part of the block, not that the block stops before
 * it. Getting this backwards would silently drop the last beat of every
 * selection, which is the kind of off-by-one a user reads as "it cut my chord".
 */
export function timelineRangeBeats(
  range: TimelineRange,
  beatsPerBar: number = BEATS_PER_BAR,
): { startBeat: number; endBeat: number } {
  return {
    startBeat: (range.startBar - 1) * beatsPerBar + (range.startBeat - 1),
    endBeat: (range.endBar - 1) * beatsPerBar + range.endBeat,
  };
}

/** Empty when the range can be turned into a candidate. */
export function timelineRangeIssues(
  input: CreateCandidateFromTimelineRangeInput,
): ManualRangeIssue[] {
  const beatsPerBar = input.beatsPerBar ?? BEATS_PER_BAR;
  const issues: ManualRangeIssue[] = [];

  if (input.timeline.length === 0) issues.push("empty-timeline");
  if (input.startBar < 1 || input.endBar < 1) issues.push("start-before-first-bar");
  if (
    input.startBeat < 1 || input.startBeat > beatsPerBar
    || input.endBeat < 1 || input.endBeat > beatsPerBar
  ) {
    issues.push("beat-out-of-bar");
  }

  if (issues.length > 0) return issues;

  const { startBeat, endBeat } = timelineRangeBeats(input, beatsPerBar);
  if (endBeat < startBeat) issues.push("end-before-start");
  else if (endBeat === startBeat) issues.push("zero-length");

  if (issues.length > 0) return issues;

  const events = buildCandidateEventsInBeatRange(input.timeline, startBeat, endBeat, beatsPerBar);
  if (events.length === 0) issues.push("no-chords-in-range");

  return issues;
}

/**
 * Pulls a range into the bounds the timeline actually covers.
 *
 * A drag that runs off the end of the song should give the user the last bar,
 * not an error. Beats are clamped into their bar and the ordering is corrected,
 * so a backwards drag reads as the range between the two points rather than as
 * nothing.
 */
export function clampTimelineRange(
  range: TimelineRange,
  totalBars: number,
  beatsPerBar: number = BEATS_PER_BAR,
): TimelineRange {
  const lastBar = Math.max(1, totalBars);
  const bar = (value: number) => Math.min(lastBar, Math.max(1, Math.round(value)));
  const beat = (value: number) => Math.min(beatsPerBar, Math.max(1, Math.round(value)));

  const first = { bar: bar(range.startBar), beat: beat(range.startBeat) };
  const last = { bar: bar(range.endBar), beat: beat(range.endBeat) };
  const backwards = last.bar < first.bar || (last.bar === first.bar && last.beat < first.beat);
  const [from, to] = backwards ? [last, first] : [first, last];

  return { startBar: from.bar, startBeat: from.beat, endBar: to.bar, endBeat: to.beat };
}

/** Stable id for a range, so the same selection is the same candidate. */
export function manualRangeId(range: TimelineRange): string {
  return `manual-${range.startBar}.${range.startBeat}-${range.endBar}.${range.endBeat}`;
}

/**
 * A detached `CandidateOccurrence` for the given range.
 *
 * `score` stays 0, the same value `buildOccurrences` gives an unscored window.
 * A manual candidate is not competing for a ranked slot — it exists because
 * someone asked for it — so giving it a high score to "win" would put a
 * user's own selection into a ranking it was never entered in. The consequence
 * is that anything applying a quality floor has to exempt `manual-range`
 * explicitly rather than inherit it; that is a later stage's job and is called
 * out here so it is not discovered as a disappearing card.
 *
 * Throws on an unusable range. Call `timelineRangeIssues` first, or
 * `clampTimelineRange` to make a drag usable.
 */
export function createCandidateFromTimelineRange(
  input: CreateCandidateFromTimelineRangeInput,
): CandidateOccurrence {
  const issues = timelineRangeIssues(input);
  if (issues.length > 0) {
    throw new Error(`cannot build a candidate from this range: ${issues.join(", ")}`);
  }

  const beatsPerBar = input.beatsPerBar ?? BEATS_PER_BAR;
  const { startBeat, endBeat } = timelineRangeBeats(input, beatsPerBar);
  const events = buildCandidateEventsInBeatRange(input.timeline, startBeat, endBeat, beatsPerBar);
  // Exact rather than rounded: a range of two and a half bars is two and a half
  // bars, and rounding it here would make the density stats describe a block the
  // user did not select.
  const lengthBars = (endBeat - startBeat) / beatsPerBar;

  const warnings = [...new Set(events.flatMap((event) => event.warnings))];
  // The first chord starting before the range is worth saying out loud: the block
  // opens mid-chord, which is a musical choice rather than a mistake, but the
  // user should know it happened.
  if (events.some((event) => event.carriedIn)) warnings.push("manual-range-starts-mid-chord");

  return {
    id: input.id ?? manualRangeId(input),
    startBar: input.startBar,
    endBar: input.endBar,
    startBeat,
    endBeat,
    lengthBars,
    events,
    stats: candidateStats(events, lengthBars),
    structuredSignature: structuredSignature(events),
    relativeSignature: relativeSignature(events),
    score: 0,
    warnings,
    transposeOffset: 0,
    sectionIds: [],
    sourceKinds: [input.source ?? manualRangeSource],
  };
}

/** Whether an occurrence came from a range someone chose. */
export function isManualRangeOccurrence(occurrence: CandidateOccurrence): boolean {
  return occurrence.sourceKinds?.includes(manualRangeSource) ?? false;
}
