/**
 * Pure geometry of the correction workspace timeline (spec v2.3 §6.2, §9):
 * which beats to draw, what a narrow card says, when following scrolls, and
 * where Ctrl+wheel keeps the pointer.
 */

import { displayChordLabel } from "../../ui/chordText";

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

// Estimated bold glyph widths at 16 / 13 / 10px, used where nothing can measure (jsdom, a missing canvas).
const charPx: Record<CardSize, number> = { full: 10.5, narrow: 8.6, tiny: 6.8, bare: 0 };
const padPx: Record<CardSize, number> = { full: 22, narrow: 12, tiny: 6, bare: 0 };
/** P23-16 W7: the font size of each size class, and its left + right padding in the CSS (`.lv-cw-card`) plus 2px to spare. */
const fontPx: Record<CardSize, number> = { full: 16, narrow: 13, tiny: 10, bare: 0 };
const measuredPadPx: Record<CardSize, number> = { full: 18, narrow: 12, tiny: 6, bare: 0 };

/** The drawn width of `text` (as shown, ♯ ♭) in the card's bold font at `px`; undefined where nothing can measure. */
export type MeasureText = (text: string, px: number) => number | undefined;

let context: CanvasRenderingContext2D | null | undefined;
/** P23-16 W7: the browser's own width of the shown name (a canvas, the page's font), so a name that fits is never cut. */
export const measureCardText: MeasureText = (text, px) => {
  if (context === undefined) {
    const jsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    try {
      context = jsdom || typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
  }
  if (!context) return undefined;
  context.font = `700 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return context.measureText(text).width;
};

/**
 * What a card shows (P10.2 §10.4): the whole name; if it does not fit, the whole name in
 * the smaller letters (13px); if that does not fit either, the root with 「…」 (「Bmaj9」→
 * 「B…」, never a bare 「B」, which reads as another chord). Tiny cards keep the old rule
 * (the name, else the root, else nothing; spec v2.4 §6.2); bare ones show nothing.
 * P23-16 W7: in the browser the fit is measured (the shown name, ♯ ♭) instead of estimated.
 */
export function cardLabel(label: string, widthPx: number, measure: MeasureText = measureCardText): { text: string; small?: true } {
  const size = cardSize(widthPx);
  if (size === "bare") return { text: "" };
  const fits = (text: string, letters: CardSize = size) => {
    const drawn = measure(displayChordLabel(text), fontPx[letters]);
    return drawn === undefined ? text.length * charPx[letters] + padPx[size] <= widthPx : drawn + measuredPadPx[size] <= widthPx;
  };
  if (fits(label)) return { text: label };
  const root = /^[A-G][#b♯♭]?/.exec(label)?.[0] ?? label.slice(0, 1);
  if (size === "tiny") return { text: fits(root) ? root : "" };
  if (size === "full" && fits(label, "narrow")) return { text: label, small: true };
  return { text: `${root}…` };
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

/**
 * P10.2 §3: where the song plays from when no card is selected — the first card whose
 * head is in view (`from`–`to` in beats; a card starting left of the view does not count),
 * else the card sounding at the left edge, else the next card after it.
 */
export function leftCardInView<T extends { start: number; duration: number }>(cards: readonly T[], from: number, to: number): T | undefined {
  const end = to > from ? to : Infinity;
  return cards.find((card) => card.start >= from - 1e-6 && card.start < end)
    ?? cards.find((card) => card.start < from && card.start + card.duration > from + 1e-6)
    ?? cards.find((card) => card.start >= from);
}
