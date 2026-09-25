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

/** Presentation only: transport math keeps fractional beats. */
export function remainingBeatsLabel(remaining: number, language: "ja" | "en"): string {
  if (remaining > 0 && remaining < 1) return language === "ja" ? "あと1拍未満" : "Less than 1 beat";
  const beats = Math.max(0, Math.ceil(remaining));
  return language === "ja" ? `あと${beats}拍` : `In ${beats} ${beats === 1 ? "beat" : "beats"}`;
}

/** Between audio-clock callbacks, visual-only interpolation is bounded to one 64th-note tick. */
export function visualTransportBeat(anchorBeat: number, elapsedMilliseconds: number, bpm: number): number {
  if (!Number.isFinite(anchorBeat) || !Number.isFinite(elapsedMilliseconds) || !Number.isFinite(bpm)) return anchorBeat;
  return anchorBeat + Math.min(1 / 16, Math.max(0, elapsedMilliseconds) * bpm / 60_000);
}
