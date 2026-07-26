import type { ChordTimelineItem } from "../types";
import { BEATS_PER_BAR, buildCandidateEventsInBeatRange } from "./candidateBlock";
import {
  clampTimelineRange,
  timelineRangeBeats,
  timelineRangeIssues,
  type ManualRangeIssue,
  type TimelineRange,
} from "./manualRange";

/**
 * The state behind dragging a range across the timeline.
 *
 * Kept out of the component so the awkward parts — dragging backwards, nudging
 * an edge past the other one, running off the end of the song — can be tested
 * as data. They are exactly the parts that are tedious to exercise through a DOM.
 */

export interface TimelinePosition {
  bar: number;
  beat: number;
}

export interface RangeSelection {
  /** Where the drag started. Stays put while the other end moves. */
  anchor: TimelinePosition;
  focus: TimelinePosition;
  /** True between pointer down and pointer up. */
  dragging: boolean;
}

export type SelectionEdge = "start" | "end";

export function beginSelection(at: TimelinePosition): RangeSelection {
  return { anchor: { ...at }, focus: { ...at }, dragging: true };
}

export function moveSelectionFocus(
  selection: RangeSelection,
  to: TimelinePosition,
): RangeSelection {
  return { ...selection, focus: { ...to } };
}

export function endSelectionDrag(selection: RangeSelection): RangeSelection {
  return { ...selection, dragging: false };
}

/**
 * The selection as an ordered, in-bounds range.
 *
 * The anchor is wherever the drag began, so it can be after the focus. Sorting
 * happens here rather than in the drag handler so a backwards drag behaves like
 * a forwards one all the way through.
 */
export function selectionRange(
  selection: RangeSelection,
  totalBars: number,
  beatsPerBar: number = BEATS_PER_BAR,
): TimelineRange {
  return clampTimelineRange(
    {
      startBar: selection.anchor.bar,
      startBeat: selection.anchor.beat,
      endBar: selection.focus.bar,
      endBeat: selection.focus.beat,
    },
    totalBars,
    beatsPerBar,
  );
}

function positionOfBeat(absoluteBeat: number, beatsPerBar: number): TimelinePosition {
  return {
    bar: Math.floor(absoluteBeat / beatsPerBar) + 1,
    beat: (absoluteBeat % beatsPerBar) + 1,
  };
}

/**
 * Moves one edge of the range by a number of beats.
 *
 * The edge that moves is named rather than inferred from the anchor, because a
 * user pressing "extend the end" means the end whether or not they happened to
 * drag right-to-left. An edge is never pushed past the other one: the range
 * collapses to a single beat and stops, rather than inverting under the cursor.
 */
export function nudgeSelectionEdge(
  selection: RangeSelection,
  edge: SelectionEdge,
  deltaBeats: number,
  totalBars: number,
  beatsPerBar: number = BEATS_PER_BAR,
): RangeSelection {
  const range = selectionRange(selection, totalBars, beatsPerBar);
  const { startBeat, endBeat } = timelineRangeBeats(range, beatsPerBar);
  const lastBeat = totalBars * beatsPerBar - 1;

  // `endBeat` is exclusive, so the last selected beat is one below it.
  const endInclusive = endBeat - 1;
  const moved = edge === "start"
    ? {
      start: Math.min(endInclusive, Math.max(0, startBeat + deltaBeats)),
      end: endInclusive,
    }
    : {
      start: startBeat,
      end: Math.max(startBeat, Math.min(lastBeat, endInclusive + deltaBeats)),
    };

  return {
    anchor: positionOfBeat(moved.start, beatsPerBar),
    focus: positionOfBeat(moved.end, beatsPerBar),
    dragging: false,
  };
}

export interface SelectionSummary {
  range: TimelineRange;
  lengthBars: number;
  chordEventCount: number;
  issues: ManualRangeIssue[];
  canCreate: boolean;
  /** No chord sounds anywhere in the range: allowed to select, not to keep. */
  silent: boolean;
  /** The first chord starts before the range and sustains into it. */
  startsMidChord: boolean;
}

/** What to show the user about the current selection, and whether it can be used. */
export function summariseSelection(
  selection: RangeSelection,
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  beatsPerBar: number = BEATS_PER_BAR,
): SelectionSummary {
  const range = selectionRange(selection, totalBars, beatsPerBar);
  const { startBeat, endBeat } = timelineRangeBeats(range, beatsPerBar);
  const events = buildCandidateEventsInBeatRange(timeline, startBeat, endBeat, beatsPerBar);
  const issues = timelineRangeIssues({ timeline, beatsPerBar, ...range });

  return {
    range,
    lengthBars: (endBeat - startBeat) / beatsPerBar,
    chordEventCount: events.length,
    issues,
    canCreate: issues.length === 0,
    silent: events.length === 0,
    startsMidChord: events.some((event) => event.carriedIn),
  };
}

/** The bar a chord event belongs to, for hit-testing a pointer over the strip. */
export function barsCovered(range: TimelineRange): number[] {
  const bars: number[] = [];
  for (let bar = range.startBar; bar <= range.endBar; bar += 1) bars.push(bar);
  return bars;
}
