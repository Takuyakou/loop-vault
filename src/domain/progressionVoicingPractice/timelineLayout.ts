/** View-only timeline geometry. Source beats and PracticeGroups stay separate. */
export type TimelineScale = 8 | 12 | 16;

export function availableTimelineScales(totalGroups: number): readonly TimelineScale[] {
  return ([8, 12, 16] as const).filter((scale) => scale === 8 || totalGroups >= scale);
}

export function clampTimelineScale(scale: TimelineScale, totalGroups: number): TimelineScale {
  const available = availableTimelineScales(totalGroups);
  return available.includes(scale) ? scale : available[available.length - 1]!;
}

export function timelinePixelsPerBeat(
  innerWidth: number,
  totalBeats: number,
  practiceGroupBeats: number,
  selectedScale: TimelineScale,
): number {
  const visibleBeats = Math.min(totalBeats, selectedScale * practiceGroupBeats);
  if (!(innerWidth > 0) || !(visibleBeats > 0)) return 1;
  return innerWidth / visibleBeats;
}

export function compactTimelineCard(width: number): boolean {
  return width < 60;
}
