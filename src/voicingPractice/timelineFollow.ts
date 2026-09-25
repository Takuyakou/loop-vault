export type TimelineSeekOrigin = "card" | "ruler" | "overview" | "keyboard" | "transport";

/** Card mouse activation keeps the card beneath the pointer until playback advances. */
export function shouldHoldCardPageTurn(origin: TimelineSeekOrigin): boolean {
  return origin === "card";
}

/** A long chord may outlive the visible page; keep its moving playhead in view. */
export function playheadSafetyTarget(playheadPx: number, viewportWidth: number,
  scrollLeft: number, contentWidth: number, margin = 12): number | undefined {
  if (viewportWidth <= 0 || !Number.isFinite(playheadPx)) return undefined;
  if (playheadPx >= scrollLeft + margin && playheadPx <= scrollLeft + viewportWidth - margin) return undefined;
  const target = playheadPx < scrollLeft + margin ? playheadPx - margin : playheadPx - viewportWidth / 4;
  return Math.max(0, Math.min(Math.max(0, contentWidth - viewportWidth), target));
}

export interface TimelineFollowGeometry {
  readonly chordStartBeat: number;
  readonly chordDurationBeats: number;
  readonly pixelsPerBeat: number;
  readonly viewportWidth: number;
  readonly scrollLeft: number;
  readonly contentWidth: number;
}

/** A page turn is needed only when the sounding chord is not fully in view. */
export function pageTurnTarget(geometry: TimelineFollowGeometry, force = false): number | undefined {
  const { chordStartBeat, chordDurationBeats, pixelsPerBeat, viewportWidth, scrollLeft, contentWidth } = geometry;
  if (viewportWidth <= 0 || pixelsPerBeat <= 0) return undefined;
  const start = chordStartBeat * pixelsPerBeat;
  const end = (chordStartBeat + chordDurationBeats) * pixelsPerBeat;
  if (!force && start >= scrollLeft - 1 && end <= scrollLeft + viewportWidth + 1) return undefined;
  return Math.max(0, Math.min(Math.max(0, contentWidth - viewportWidth), start - 12));
}

/** Keep animation semantics independent of scroll events: only explicit user input disables Follow. */
export function easeOutCubic(progress: number): number {
  const bounded = Math.max(0, Math.min(1, progress));
  return 1 - (1 - bounded) ** 3;
}
