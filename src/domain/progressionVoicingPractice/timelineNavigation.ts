import type { ProgressionVoicingPracticeSnapshot } from "./types";

/** A click in silence advances to its next chord, or falls back to the last chord. */
export function chordIndexAtTimelineBeat(snapshot: ProgressionVoicingPracticeSnapshot, beat: number): number | undefined {
  if (!Number.isFinite(beat) || snapshot.events.length === 0) return undefined;
  const target = Math.max(0, Math.min(snapshot.lengthBeats, beat));
  const containing = snapshot.events.findIndex((event) => target >= event.startBeat && target < event.startBeat + event.durationBeats);
  if (containing >= 0) return containing;
  const next = snapshot.events.findIndex((event) => event.startBeat >= target);
  return next >= 0 ? next : snapshot.events.length - 1;
}
