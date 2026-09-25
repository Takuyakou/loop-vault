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
  return Math.max(0, Math.min(Math.max(0, contentWidth - viewportWidth), start - viewportWidth * 0.25));
}

/** Matches a scroll event to the exact programmatic destination, without a timer. */
export function isFollowScrollPosition(actual: number, requested: number | undefined): boolean {
  return requested !== undefined && Math.abs(actual - requested) <= 2;
}
