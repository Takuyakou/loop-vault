import type { ChordTimelineItem } from "../../domain/types";

/**
 * Pure geometry of the correction workspace timeline (spec v2.3 §6.2, §9):
 * which beats to draw, what a narrow card says, when following scrolls, and
 * where Ctrl+wheel keeps the pointer.
 */

export interface BeatRange {
  from: number;
  to: number;
}

/** The visible beats plus one viewport of margin on each side (clamped to the song). */
export function visibleBeatRange(scrollLeft: number, viewportWidth: number, pxPerBeat: number, totalBeats: number): BeatRange {
  if (pxPerBeat <= 0 || viewportWidth <= 0) return { from: 0, to: totalBeats };
  const span = viewportWidth / pxPerBeat;
  const from = scrollLeft / pxPerBeat;
  return { from: Math.max(0, from - span), to: Math.min(totalBeats, from + 2 * span) };
}

export function overlaps(start: number, duration: number, range: BeatRange): boolean {
  return start < range.to && start + duration > range.from;
}

export type CardSize = "full" | "narrow" | "tiny" | "bare";

export function cardSize(widthPx: number): CardSize {
  return widthPx < 14 ? "bare" : widthPx < 40 ? "tiny" : widthPx < 72 ? "narrow" : "full";
}

// Estimated bold glyph widths at 16 / 13 / 10px (E2E checks that no drawn name is clipped).
const charPx: Record<CardSize, number> = { full: 10.5, narrow: 8.6, tiny: 6.8, bare: 0 };
const padPx: Record<CardSize, number> = { full: 22, narrow: 12, tiny: 6, bare: 0 };

/**
 * What a card shows: the whole name when it fits, otherwise only the root
 * (「Fmaj7」→「F」, never 「F···」), nothing when not even the root fits (spec v2.4 §6.2).
 */
export function cardLabel(label: string, widthPx: number): string {
  const size = cardSize(widthPx);
  if (size === "bare") return "";
  const fits = (text: string) => text.length * charPx[size] + padPx[size] <= widthPx;
  if (fits(label)) return label;
  const root = /^[A-G][#b♯♭]?/.exec(label)?.[0] ?? label.slice(0, 1);
  return fits(root) ? root : "";
}

/** Following: past 80% of the view, jump so the playhead sits at 20%. Undefined = stay. */
export function followScrollLeft(playheadBeat: number, scrollLeft: number, viewportWidth: number, pxPerBeat: number): number | undefined {
  const x = playheadBeat * pxPerBeat - scrollLeft;
  if (x >= 0 && x <= viewportWidth * 0.8) return undefined;
  return Math.max(0, playheadBeat * pxPerBeat - viewportWidth * 0.2);
}

/** Ctrl+wheel: the beat under the pointer stays under the pointer. */
export function zoomScrollLeft(beatAtPointer: number, pointerX: number, nextPxPerBeat: number): number {
  return Math.max(0, beatAtPointer * nextPxPerBeat - pointerX);
}

/**
 * The playhead in beats (spec v2.5 §7.3), from the controller's start time on the
 * same clock (performance.now()). Drawn every frame, not in 100ms steps.
 */
export function playheadBeatAt(nowMs: number, startedAtMs: number, bpm: number, firstBeat: number): number {
  return firstBeat + Math.max(0, (nowMs - startedAtMs) / 1000) * bpm / 60;
}

/** The beat a timeline item starts on (bar/beat are 1-based). */
const itemStart = (item: ChordTimelineItem, meter: number) => (item.bar - 1) * meter + item.beat - 1;

/**
 * P10.1 §2: the song from `startBeat` to the end, for playback from the selected card.
 * Items ending before it are dropped; one that is sounding at it is clipped to start
 * there. The player schedules relative to the first item, so the rest keep their
 * places and the gap closes by itself. Each item keeps its voicing, so the same card
 * plays the same notes. `startBeat` undefined (nothing selected) = the whole song.
 */
export function timelineFrom(timeline: readonly ChordTimelineItem[], startBeat: number | undefined, meter: number): ChordTimelineItem[] {
  if (startBeat === undefined) return [...timeline];
  return timeline.flatMap((item) => {
    const start = itemStart(item, meter);
    const end = start + item.durationBeats;
    if (end <= startBeat + 1e-6) return [];
    if (start >= startBeat - 1e-6) return [item];
    const bar = Math.floor(startBeat / meter + 1e-6) + 1;
    return [{ ...item, bar, beat: startBeat - (bar - 1) * meter + 1, durationBeats: end - startBeat }];
  });
}
