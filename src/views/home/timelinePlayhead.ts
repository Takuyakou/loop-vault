import { useEffect, useState } from "react";
import { samePlaybackSource, type PlayingSource } from "../../audio/playbackController";
import type { ChordTimelineItem } from "../../domain/types";
import { usePlaybackState } from "../../hooks/usePlaybackState";

/**
 * Index of the chord sounding `elapsedMs` after a timeline preview started.
 * Mirrors the preview's own timing (first event at 0, 60/bpm per beat); read-only, no scheduling.
 */
export function timelineIndexAt(
  elapsedMs: number,
  timeline: readonly ChordTimelineItem[],
  bpm = 96,
  beatsPerBar = 4,
): number {
  if (!timeline.length || elapsedMs < 0) return -1;
  const beatOf = (item: ChordTimelineItem) => (item.bar - 1) * beatsPerBar + (item.beat - 1);
  const ordered = timeline.map((item, index) => ({ index, beat: beatOf(item), end: beatOf(item) + item.durationBeats }))
    .sort((left, right) => left.beat - right.beat);
  const beat = ordered[0].beat + elapsedMs / (60_000 / bpm);
  if (beat >= Math.max(...ordered.map((item) => item.end))) return -1;
  let current = -1;
  for (const item of ordered) if (item.beat <= beat) current = item.index;
  return current;
}

/** Which chord of `timeline` is sounding while `source` plays; -1 otherwise. */
export function useTimelinePlayhead(
  source: PlayingSource,
  timeline: readonly ChordTimelineItem[],
  bpm: number | undefined,
  beatsPerBar: number,
): number {
  const playback = usePlaybackState();
  const active = playback.status === "playing" && samePlaybackSource(playback.source, source);
  const startedAt = active ? playback.startedAt : undefined;
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (startedAt === undefined) {
      setIndex(-1);
      return undefined;
    }
    const tick = () => setIndex(timelineIndexAt((globalThis.performance?.now() ?? Date.now()) - startedAt, timeline, bpm, beatsPerBar));
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [beatsPerBar, bpm, startedAt, timeline]);

  return index;
}
