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
  return widthPx < 18 ? "bare" : widthPx < 40 ? "tiny" : widthPx < 72 ? "narrow" : "full";
}

const charPx: Record<CardSize, number> = { full: 9.6, narrow: 7.8, tiny: 6.2, bare: 0 };
const padPx: Record<CardSize, number> = { full: 20, narrow: 10, tiny: 4, bare: 0 };

/**
 * What a card shows: the whole name when it fits, otherwise only the root
 * (「Fmaj7」→「F」, never 「F···」), nothing on a bare card (spec v2.3 §6.2).
 */
export function cardLabel(label: string, widthPx: number): string {
  const size = cardSize(widthPx);
  if (size === "bare") return "";
  if (label.length * charPx[size] + padPx[size] <= widthPx) return label;
  return /^[A-G][#b♯♭]?/.exec(label)?.[0] ?? label.slice(0, 1);
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
