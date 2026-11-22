import { useEffect, useMemo, useRef } from "react";
import { samePlaybackSource, type PlayingSource } from "../../audio/playbackController";
import type { ChordTimelineItem, SavedProgressionBlock } from "../../domain/types";
import { resolveTimelineVoicings } from "../../domain/voicing";
import { usePlaybackState } from "../../hooks/usePlaybackState";

/** One drawn note: which chord (cell) it belongs to and how far down the band it sits (0 = top, 1 = bottom). */
export interface LoopRollNote {
  readonly chord: number;
  readonly pitch: number;
  readonly y: number;
}

/**
 * P23-09b: the notes of the chords shown as boxes (the first `limit`), the same notes ▶ plays
 * (`resolveTimelineVoicings`). Highest note at the top, lowest at the bottom; one height only → the middle.
 */
export function loopRollNotes(block: SavedProgressionBlock, limit: number): LoopRollNote[] {
  const voicings = resolveTimelineVoicings(block.chords, Boolean(block.textSource));
  const perChord = block.chords.slice(0, limit).map((item) => (item.eventId ? voicings[item.eventId] ?? [] : []));
  const pitches = perChord.flat();
  if (!pitches.length) return [];
  const low = Math.min(...pitches);
  const high = Math.max(...pitches);
  return perChord.flatMap((notes, chord) =>
    [...new Set(notes)].map((pitch) => ({ chord, pitch, y: high === low ? 0.5 : (high - pitch) / (high - low) })));
}

const beatOf = (item: ChordTimelineItem, beatsPerBar: number) => (item.bar - 1) * beatsPerBar + (item.beat - 1);

/** Where the playhead is after `elapsedMs`: the cell (chord index among the first `limit`) and how far through it (0–1); undefined when outside them. */
export function loopRollPosition(
  elapsedMs: number,
  timeline: readonly ChordTimelineItem[],
  limit: number,
  bpm = 96,
  beatsPerBar = 4,
): { readonly chord: number; readonly fraction: number } | undefined {
  if (!timeline.length || elapsedMs < 0) return undefined;
  const first = Math.min(...timeline.map((item) => beatOf(item, beatsPerBar)));
  const beat = first + elapsedMs / (60_000 / bpm);
  const shown = timeline.slice(0, limit);
  for (let chord = 0; chord < shown.length; chord += 1) {
    const start = beatOf(shown[chord], beatsPerBar);
    const length = Math.max(shown[chord].durationBeats, 0.0001);
    if (beat >= start && beat < start + length) return { chord, fraction: (beat - start) / length };
  }
  return undefined;
}

const NOTE_HEIGHT = 4;

/** P23-09b: the small piano roll under the 今日のループ chord boxes. Decorative only. */
export function LoopRoll({ block, limit, source, current, bpm, beatsPerBar }: {
  block: SavedProgressionBlock;
  limit: number;
  source: PlayingSource;
  /** The chord sounding now (from the chord boxes' playhead), -1 when none. */
  current: number;
  bpm: number | undefined;
  beatsPerBar: number;
}) {
  const notes = useMemo(() => loopRollNotes(block, limit), [block, limit]);
  const shown = block.chords.slice(0, limit);
  const rollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const playback = usePlaybackState();
  const active = playback.status === "playing" && samePlaybackSource(playback.source, source);
  const startedAt = active ? playback.startedAt : undefined;
  const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const head = headRef.current;
    const roll = rollRef.current;
    if (!head || !roll || startedAt === undefined || reducedMotion) return undefined;
    let frame = 0;
    const tick = () => {
      const at = loopRollPosition((globalThis.performance?.now() ?? Date.now()) - startedAt, block.chords, limit, bpm, beatsPerBar);
      const cell = at ? roll.querySelector<HTMLElement>(`[data-roll-chord="${at.chord}"]`) : null;
      if (at && cell && cell.offsetWidth > 0) {
        head.hidden = false;
        head.style.transform = `translateX(${cell.offsetLeft + at.fraction * cell.offsetWidth}px)`;
      } else {
        head.hidden = true;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [beatsPerBar, block.chords, bpm, limit, reducedMotion, startedAt]);

  if (!notes.length) return null;
  return (
    <div ref={rollRef} className="lv-home-roll" aria-hidden="true" data-testid="home-loop-roll">
      {shown.map((item, chord) => (
        <span
          key={item.eventId ?? `${item.bar}:${item.beat}:${chord}`}
          className="lv-home-roll-cell"
          style={{ flexGrow: Math.max(1, item.durationBeats) }}
          data-roll-chord={chord}
          data-current={reducedMotion && current === chord ? "true" : undefined}
        >
          {notes.filter((note) => note.chord === chord).map((note) => (
            <i
              key={note.pitch}
              className="lv-home-roll-note"
              data-pitch={note.pitch}
              style={{ top: `calc(${note.y} * (100% - ${NOTE_HEIGHT}px))` }}
            />
          ))}
        </span>
      ))}
      {active && !reducedMotion ? <span ref={headRef} className="lv-home-roll-head" data-testid="home-loop-roll-head" hidden /> : null}
    </div>
  );
}
