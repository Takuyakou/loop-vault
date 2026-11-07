import type { CorrectionSegment } from "./correctionModel";

/**
 * P17-02: the time map of a capture whose bars were cut out (「小節を消して詰める」).
 *
 * `removed` is kept in **source** beats (the original MIDI's time), sorted and
 * non-overlapping. Nothing else in the model changes time: the source notes and
 * the analysis stay at their original positions, and every screen position goes
 * through these functions. Adding another cut means adding its source span to
 * `removed`, so any number of cuts compose as one map (never a chain of maps).
 */

export interface BeatRange {
  start: number;
  end: number;
}

export const BEAT_EPSILON = 1e-6;

/** Sorted, merged, positive-length spans. Input is never changed. */
export function normalizeRemoved(ranges: readonly BeatRange[]): BeatRange[] {
  const out: BeatRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.end - range.start <= BEAT_EPSILON) continue;
    const last = out[out.length - 1];
    if (last && range.start <= last.end + BEAT_EPSILON) last.end = Math.max(last.end, range.end);
    else out.push({ start: range.start, end: range.end });
  }
  return out;
}

function removedBefore(beat: number, removed: readonly BeatRange[]): number {
  let total = 0;
  for (const range of removed) {
    if (range.end <= beat + BEAT_EPSILON) total += range.end - range.start;
    else break;
  }
  return total;
}

/** Source beat → screen beat; undefined when the beat itself was cut out. */
export function sourceToScreen(beat: number, removed: readonly BeatRange[]): number | undefined {
  for (const range of removed) {
    if (beat >= range.start - BEAT_EPSILON && beat < range.end - BEAT_EPSILON) return undefined;
  }
  return beat - removedBefore(beat, removed);
}

/**
 * Screen range → the source ranges it shows (sorted, disjoint, same total length).
 * Empty when the whole screen range is outside every source block (should not
 * happen: the screen time is built from the source time minus the cuts).
 */
export function screenToSource(start: number, end: number, removed: readonly BeatRange[]): BeatRange[] {
  if (end - start <= BEAT_EPSILON) return [];
  const out: BeatRange[] = [];
  let removedSoFar = 0;
  let blockScreenStart = 0;
  const take = (screenStart: number, screenEnd: number, offset: number) => {
    const from = Math.max(start, screenStart);
    const to = Math.min(end, screenEnd);
    if (to - from <= BEAT_EPSILON) return;
    out.push({ start: from + offset, end: to + offset });
  };
  for (const range of removed) {
    const screenEnd = range.start - removedSoFar;
    take(blockScreenStart, screenEnd, removedSoFar);
    removedSoFar += range.end - range.start;
    blockScreenStart = screenEnd;
  }
  take(blockScreenStart, Number.POSITIVE_INFINITY, removedSoFar);
  return out;
}

/** True when the screen range includes any part of a removed span. */
export function spanCrossesRemoved(start: number, end: number, removed: readonly BeatRange[]): boolean {
  return removed.some((range) => range.start < end - BEAT_EPSILON && range.end > start + BEAT_EPSILON);
}

/** A screen bar range shown by exactly one source bar range (undefined when it crosses a cut). */
export function screenBarsToSourceBars(
  range: { startBar: number; endBar: number },
  meter: number,
  removed: readonly BeatRange[],
): { startBar: number; endBar: number } | undefined {
  const ranges = screenToSource((range.startBar - 1) * meter, range.endBar * meter, removed);
  if (ranges.length !== 1) return undefined;
  const only = ranges[0]!;
  const startBar = Math.floor(only.start / meter + BEAT_EPSILON) + 1;
  const endBar = Math.round(only.end / meter);
  if (startBar < 1 || endBar < startBar) return undefined;
  return { startBar, endBar };
}

/** The bars (1-based, inclusive) a source beat range covers. */
export function barsOfRange(range: BeatRange, meter: number): { startBar: number; endBar: number } {
  return {
    startBar: Math.floor(range.start / meter + BEAT_EPSILON) + 1,
    endBar: Math.max(1, Math.round(range.end / meter)),
  };
}

/**
 * A save range after cutting `cutStartBar..cutEndBar` (whole bars). Undefined when
 * nothing of the range is left. Ranges after the cut move left; a range that
 * included the cut loses those bars (its start stays on the bar that closed the gap).
 */
export function shiftSaveRange(
  range: { startBar: number; endBar: number },
  cutStartBar: number,
  cutEndBar: number,
): { startBar: number; endBar: number } | undefined {
  const count = cutEndBar - cutStartBar + 1;
  if (range.endBar < cutStartBar) return range;
  if (range.startBar > cutEndBar) return { startBar: range.startBar - count, endBar: range.endBar - count };
  const startBar = range.startBar < cutStartBar ? range.startBar : cutStartBar;
  const endBar = range.endBar > cutEndBar ? range.endBar - count : cutStartBar - 1;
  return endBar < startBar ? undefined : { startBar, endBar };
}

/** The same shift for a `startBar-endBar` key (saved-range marks). */
export function shiftRangeKey(key: string, cutStartBar: number, cutEndBar: number): string | undefined {
  const match = /^(\d+)-(\d+)$/.exec(key);
  if (!match) return key;
  const shifted = shiftSaveRange({ startBar: Number(match[1]), endBar: Number(match[2]) }, cutStartBar, cutEndBar);
  return shifted ? `${shifted.startBar}-${shifted.endBar}` : undefined;
}

/**
 * Recommended ranges (analysis, in source bars) moved to the screen. Ranges that
 * touch a cut are left out: their content is no longer contiguous on screen.
 */
export function recommendedOnScreen<T extends { startBar: number; endBar: number }>(
  candidates: readonly T[],
  removed: readonly BeatRange[],
  meter: number,
  totalBars: number,
): T[] {
  if (!removed.length) return [...candidates];
  const out: T[] = [];
  for (const candidate of candidates) {
    const sourceStart = (candidate.startBar - 1) * meter;
    const sourceEnd = candidate.endBar * meter;
    if (spanCrossesRemoved(sourceStart, sourceEnd, removed)) continue;
    const start = sourceToScreen(sourceStart, removed);
    const end = sourceToScreen(sourceEnd, removed);
    if (start === undefined || end === undefined) continue;
    const startBar = Math.floor(start / meter + BEAT_EPSILON) + 1;
    const endBar = Math.round(end / meter);
    if (endBar < startBar || endBar > totalBars) continue;
    out.push({ ...candidate, startBar, endBar });
  }
  return out;
}

/**
 * Segments after cutting bars: numbers close up, a segment that loses bars keeps
 * its name but drops 「n回出てくる」 (its length changed, so it is no longer the
 * same shape). Segments are never rebuilt from the analysis.
 */
export function shiftSegments(
  segments: readonly CorrectionSegment[],
  cutStartBar: number,
  cutEndBar: number,
): CorrectionSegment[] {
  const count = cutEndBar - cutStartBar + 1;
  const out: CorrectionSegment[] = [];
  for (const segment of segments) {
    if (segment.endBar < cutStartBar) {
      out.push(segment);
      continue;
    }
    if (segment.startBar > cutEndBar) {
      const startBar = segment.startBar - count;
      const endBar = segment.endBar - count;
      const label = segment.source === "fallback-8bar" || segment.label === barLabel(segment.startBar, segment.endBar)
        ? barLabel(startBar, endBar)
        : segment.label;
      out.push({ ...segment, startBar, endBar, label });
      continue;
    }
    const startBar = segment.startBar < cutStartBar ? segment.startBar : cutStartBar;
    const endBar = segment.endBar > cutEndBar ? segment.endBar - count : cutStartBar - 1;
    if (endBar < startBar) continue;
    const { repeatCount: _drop, ...rest } = segment;
    const label = segment.source === "fallback-8bar" || segment.label === barLabel(segment.startBar, segment.endBar)
      ? barLabel(startBar, endBar)
      : segment.label;
    out.push({ ...rest, startBar, endBar, label });
  }
  return out;
}

function barLabel(startBar: number, endBar: number): string {
  return startBar === endBar ? `${startBar}小節` : `${startBar}〜${endBar}小節`;
}
