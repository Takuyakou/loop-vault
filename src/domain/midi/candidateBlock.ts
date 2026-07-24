import { chordIdentityKey, normalizeChordLabel } from "../chordIdentity";
import type { ChordTimelineItem } from "../types";

/**
 * Candidate Block v2.
 *
 * v1 collapsed each bar to a single representative chord and then used the
 * resulting display string as the candidate's identity. That lost the second
 * chord of a two-chord bar, turned the tail of a sustained chord into `N.C.`,
 * and made two structurally different candidates collide whenever their
 * compressed text happened to match.
 *
 * v2 keeps the actual timeline events that overlap the block and derives both
 * the identity and the display text from that structure.
 */

/** Fallback only. Callers that know the time signature pass the real value. */
export const BEATS_PER_BAR = 4;

/** Beats are quantised to integer ticks so float drift never splits a signature. */
const SIGNATURE_TICKS_PER_BEAT = 960;

export type CandidateDensityClass = "vamp" | "compact" | "standard" | "dense";

export interface CandidateChordEvent {
  sourceEventId?: string;
  /** Beats from the start of the block, clipped to the block window. */
  relativeStartBeat: number;
  /** Sounding length inside the block, which may be shorter than the event. */
  durationBeats: number;
  /** Full length of the underlying timeline event, before clipping. */
  sourceDurationBeats: number;
  /** True when the event started before this block and sustains into it. */
  carriedIn: boolean;
  bar: number;
  beat: number;
  chord: ChordTimelineItem["chord"];
  identityKey: string;
  confidence: number;
  warnings: string[];
  /**
   * The timeline item this event came from. Kept so saving a candidate can
   * retime the event without dropping its alternatives or voicing memory.
   */
  source: ChordTimelineItem;
}

export interface CandidateChordStats {
  eventCount: number;
  harmonicChangeCount: number;
  uniqueChordCount: number;
  chordEventsPerBar: number;
  densityClass: CandidateDensityClass;
}

function startBeatOf(item: ChordTimelineItem, beatsPerBar: number): number {
  return (item.bar - 1) * beatsPerBar + item.beat - 1;
}

function quantise(beats: number): number {
  return Math.round(beats * SIGNATURE_TICKS_PER_BEAT);
}

/**
 * Every timeline event that overlaps the block, not just those starting inside
 * it, so a chord sustaining across the block boundary is still represented.
 */
export function buildCandidateEvents(
  timeline: readonly ChordTimelineItem[],
  startBar: number,
  lengthBars: number,
  beatsPerBar: number = BEATS_PER_BAR,
): CandidateChordEvent[] {
  const blockStart = (startBar - 1) * beatsPerBar;
  const blockEnd = blockStart + lengthBars * beatsPerBar;

  return timeline
    .filter((item) => {
      const start = startBeatOf(item, beatsPerBar);
      return start < blockEnd && start + item.durationBeats > blockStart;
    })
    .map((item) => {
      const start = startBeatOf(item, beatsPerBar);
      const clippedStart = Math.max(start, blockStart);
      const clippedEnd = Math.min(start + item.durationBeats, blockEnd);
      const identity = normalizeChordLabel(item.chord.label);
      return {
        ...(item.eventId ? { sourceEventId: item.eventId } : {}),
        relativeStartBeat: clippedStart - blockStart,
        durationBeats: clippedEnd - clippedStart,
        sourceDurationBeats: item.durationBeats,
        carriedIn: start < blockStart,
        bar: item.bar,
        beat: item.beat,
        chord: item.chord,
        identityKey: identity ? chordIdentityKey(identity) : `raw:${item.chord.label}`,
        confidence: item.confidence,
        warnings: item.warnings,
        source: item,
      };
    })
    .sort((left, right) => left.relativeStartBeat - right.relativeStartBeat
      || left.identityKey.localeCompare(right.identityKey));
}

export function candidateStats(
  events: readonly CandidateChordEvent[],
  lengthBars: number,
): CandidateChordStats {
  const eventCount = events.length;
  const uniqueChordCount = new Set(events.map((event) => event.identityKey)).size;
  const harmonicChangeCount = events.reduce(
    (count, event, index) => (index > 0 && event.identityKey !== events[index - 1].identityKey
      ? count + 1
      : count),
    events.length ? 1 : 0,
  );
  const chordEventsPerBar = lengthBars > 0 ? eventCount / lengthBars : 0;

  return {
    eventCount,
    harmonicChangeCount,
    uniqueChordCount,
    chordEventsPerBar: Number(chordEventsPerBar.toFixed(4)),
    densityClass: densityClassOf(uniqueChordCount, harmonicChangeCount, chordEventsPerBar),
  };
}

/**
 * A low chord count is a musical shape, not a defect: a one-chord vamp gets its
 * own class rather than being scored as a weak version of a busier block.
 */
function densityClassOf(
  uniqueChordCount: number,
  harmonicChangeCount: number,
  chordEventsPerBar: number,
): CandidateDensityClass {
  if (uniqueChordCount <= 1) return "vamp";
  if (chordEventsPerBar >= 2) return "dense";
  if (harmonicChangeCount <= 5) return "compact";
  return "standard";
}

/**
 * Identity for dedup and repeat detection.
 *
 * Built from relative timing plus chord identity, never from display text, so
 * `Gbadd9` and `F#add9` collapse together while `C6` and `C6/E` stay apart.
 */
export function structuredSignature(events: readonly CandidateChordEvent[]): string {
  if (events.length === 0) return "empty";
  return events
    .map((event) => `${quantise(event.relativeStartBeat)}:${quantise(event.durationBeats)}:${event.identityKey}`)
    .join(";");
}

/**
 * Transposition-independent shape, used to detect the same progression starting
 * on a different root. Intervals are relative to the first event's root.
 */
export function relativeSignature(events: readonly CandidateChordEvent[]): string {
  if (events.length === 0) return "empty";
  const first = events[0].chord.root;
  return events
    .map((event) => {
      const interval = (((event.chord.root - first) % 12) + 12) % 12;
      const suffix = event.identityKey.split("|").slice(1).join("|");
      return `${quantise(event.relativeStartBeat)}:${quantise(event.durationBeats)}:${interval}|${suffix}`;
    })
    .join(";");
}

export const noChordCell = "N.C.";
export const sustainCell = "—";

/**
 * Display text derived from the events.
 *
 * One cell per bar so the cell count always matches the block length. A bar with
 * two chords lists both, a bar that only continues the previous chord shows the
 * sustain marker, and a bar with no event at all is explicitly `N.C.` rather
 * than silently borrowing its neighbour.
 */
export function summaryFromEvents(
  events: readonly CandidateChordEvent[],
  lengthBars: number,
  beatsPerBar: number = BEATS_PER_BAR,
): string {
  const cells: string[] = [];
  for (let bar = 0; bar < lengthBars; bar += 1) {
    const barStart = bar * beatsPerBar;
    const barEnd = barStart + beatsPerBar;
    const starting = events.filter(
      (event) => event.relativeStartBeat >= barStart && event.relativeStartBeat < barEnd,
    );
    if (starting.length > 0) {
      cells.push(starting.map((event) => event.chord.label).join(" · "));
      continue;
    }
    const sustaining = events.some(
      (event) => event.relativeStartBeat < barStart
        && event.relativeStartBeat + event.durationBeats > barStart,
    );
    cells.push(sustaining ? sustainCell : noChordCell);
  }
  return `| ${cells.join(" | ")} |`;
}

/** Counts how many times the block's shape repeats across the whole timeline. */
export function countStructuredRepeats(
  timeline: readonly ChordTimelineItem[],
  totalBars: number,
  lengthBars: number,
  signature: string,
  beatsPerBar: number = BEATS_PER_BAR,
): number {
  let count = 0;
  for (let start = 1; start <= totalBars - lengthBars + 1; start += 1) {
    const events = buildCandidateEvents(timeline, start, lengthBars, beatsPerBar);
    if (structuredSignature(events) === signature) {
      count += 1;
    }
  }
  return count;
}

/**
 * Block-relative events back as absolute timeline items, clipped to the block.
 * Used when a candidate is saved so the stored progression carries exactly what
 * the candidate showed, including a chord that sustained in from earlier bars.
 */
export function candidateEventsAsTimeline(
  events: readonly CandidateChordEvent[],
  startBar: number,
  beatsPerBar: number = BEATS_PER_BAR,
): ChordTimelineItem[] {
  const blockStart = (startBar - 1) * beatsPerBar;
  return events.map((event) => {
    const absoluteStart = blockStart + event.relativeStartBeat;
    return {
      ...event.source,
      bar: Math.floor(absoluteStart / beatsPerBar) + 1,
      beat: (absoluteStart % beatsPerBar) + 1,
      durationBeats: event.durationBeats,
    };
  });
}
