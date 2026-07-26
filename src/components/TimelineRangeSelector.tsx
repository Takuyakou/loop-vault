import { useCallback, useMemo, useState } from "react";
import type { AppCopy } from "../i18n";
import type { ChordTimelineItem } from "../domain/types";
import { createManualDraft, type ManualCandidateDraft } from "../domain/midi/manualDraft";
import {
  beginSelection,
  endSelectionDrag,
  moveSelectionFocus,
  nudgeSelectionEdge,
  selectionRange,
  summariseSelection,
  type RangeSelection,
} from "../domain/midi/timelineRangeSelection";

/**
 * Choosing the bars a candidate should cover.
 *
 * The measurement in `docs/phase4.1.3/00-manual-repair-baseline.md` found that
 * every region a user could not reach had its chords sitting in the timeline
 * already — the app simply had no way to be told which bars were wanted. This is
 * that way.
 *
 * Two routes on purpose. Dragging is faster when the bars are on screen; typing
 * is the only usable route on a 160-bar song where the two ends are nowhere near
 * each other, and the only route at all without a pointer.
 */

export interface TimelineRangeSelectorProps {
  timeline: readonly ChordTimelineItem[];
  totalBars: number;
  beatsPerBar: number;
  copy: AppCopy;
  onCreate(draft: ManualCandidateDraft): void;
  /** Supplied in tests so a draft is reproducible. */
  now?: string;
}

function clampBar(value: number, totalBars: number): number {
  return Math.min(Math.max(1, Math.round(value)), Math.max(1, totalBars));
}

function clampBeat(value: number, beatsPerBar: number): number {
  return Math.min(Math.max(1, Math.round(value)), beatsPerBar);
}

export function TimelineRangeSelector({
  timeline,
  totalBars,
  beatsPerBar,
  copy,
  onCreate,
  now,
}: TimelineRangeSelectorProps) {
  const [selection, setSelection] = useState<RangeSelection | null>(null);
  const text = copy.capture.manualRange;

  const summary = useMemo(
    () => (selection === null
      ? null
      : summariseSelection(selection, timeline, totalBars, beatsPerBar)),
    [selection, timeline, totalBars, beatsPerBar],
  );

  /**
   * Types a value into one named edge.
   *
   * Deliberately not routed through the drag normalisation. A drag has no
   * inherent direction, so sorting its two ends is right; typing does — "start
   * bar 14" means the start, and sorting it would turn the first number the user
   * enters into an end bar and leave the start at 1. When an edge is pushed past
   * the other, the other follows rather than the range inverting.
   */
  const setEdge = useCallback((
    edge: "start" | "end",
    next: { bar?: number; beat?: number },
  ) => {
    setSelection((current) => {
      const range = current === null
        // A fresh selection is one whole bar, so setting a start bar gives a
        // usable range immediately rather than a zero-width one.
        ? {
          startBar: 1, startBeat: 1, endBar: 1, endBeat: beatsPerBar,
        }
        : selectionRange(current, totalBars, beatsPerBar);

      const start = { bar: range.startBar, beat: range.startBeat };
      const end = { bar: range.endBar, beat: range.endBeat };
      const target = edge === "start" ? start : end;
      if (next.bar !== undefined) target.bar = clampBar(next.bar, totalBars);
      if (next.beat !== undefined) target.beat = clampBeat(next.beat, beatsPerBar);

      const beatOf = (position: { bar: number; beat: number }) =>
        (position.bar - 1) * beatsPerBar + position.beat;
      if (beatOf(start) > beatOf(end)) {
        // The edge that follows lands on the far side of the leader's bar, so a
        // range typed one bar at a time covers whole bars. Copying the leader's
        // beat instead would silently turn "bars 14 to 32" into a range ending on
        // the first beat of 32, one beat short of the bar the user named.
        if (edge === "start") {
          end.bar = start.bar;
          end.beat = beatsPerBar;
        } else {
          start.bar = end.bar;
          start.beat = 1;
        }
      }

      return { anchor: start, focus: end, dragging: false };
    });
  }, [beatsPerBar, totalBars]);

  const nudge = useCallback((edge: "start" | "end", deltaBeats: number) => {
    setSelection((current) => (current === null
      ? null
      : nudgeSelectionEdge(current, edge, deltaBeats, totalBars, beatsPerBar)));
  }, [beatsPerBar, totalBars]);

  const create = useCallback(() => {
    if (selection === null || summary === null || !summary.canCreate) return;
    onCreate(createManualDraft({
      timeline,
      range: summary.range,
      beatsPerBar,
      ...(now === undefined ? {} : { now }),
    }));
  }, [beatsPerBar, now, onCreate, selection, summary, timeline]);

  // Esc and Enter are handled on the container so they work wherever focus sits
  // inside the panel, including the number inputs.
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setSelection(null);
      return;
    }
    if (event.key === "Enter" && summary?.canCreate) {
      event.preventDefault();
      create();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!event.shiftKey && !event.altKey) return;
    event.preventDefault();
    const step = event.altKey ? beatsPerBar : 1;
    nudge("end", event.key === "ArrowRight" ? step : -step);
  }, [beatsPerBar, create, nudge, summary]);

  const bars = useMemo(
    () => Array.from({ length: Math.max(1, totalBars) }, (_unused, index) => index + 1),
    [totalBars],
  );
  const range = summary?.range;
  const inRange = (bar: number) => range !== undefined
    && bar >= range.startBar && bar <= range.endBar;

  const announcement = summary === null
    ? text.nothingSelected
    : `${text.selected(
      summary.range.startBar, summary.range.startBeat,
      summary.range.endBar, summary.range.endBeat,
    )}. ${text.lengthBars(summary.lengthBars)}. ${text.chordEvents(summary.chordEventCount)}.`;

  return (
    <div
      className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)]/40 p-4"
      onKeyDown={onKeyDown}
      data-testid="timeline-range-selector"
    >
      <h4 className="text-sm font-semibold text-[var(--lv-text)]">{text.title}</h4>
      <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{text.description}</p>
      <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{text.dragHint}</p>

      <div
        role="group"
        aria-label={text.title}
        className="mt-3 flex flex-wrap gap-1 overflow-x-auto"
        onPointerUp={() => setSelection((current) => (current ? endSelectionDrag(current) : null))}
        onPointerLeave={() => setSelection((current) => (current ? endSelectionDrag(current) : null))}
      >
        {bars.map((bar) => (
          <button
            key={bar}
            type="button"
            // The bar is both a drag target and a focusable control, so the range
            // can be built with a pointer or with the keyboard alone.
            aria-pressed={inRange(bar)}
            aria-label={text.barLabel(bar)}
            data-bar={bar}
            data-selected={inRange(bar) ? "true" : "false"}
            onPointerDown={() => setSelection(beginSelection({ bar, beat: 1 }))}
            onPointerEnter={() => setSelection((current) => (current?.dragging
              ? moveSelectionFocus(current, { bar, beat: beatsPerBar })
              : current))}
            onClick={() => setSelection((current) => (current === null
              ? beginSelection({ bar, beat: 1 })
              : endSelectionDrag(moveSelectionFocus(current, { bar, beat: beatsPerBar }))))}
            className={`min-w-9 border px-2 py-1 text-xs tabular-nums transition ${
              inRange(bar)
                // Underline as well as colour: a selection that is only a hue is
                // invisible to a good share of readers.
                ? "border-amber-300 bg-amber-200/20 font-bold text-[var(--lv-text)] underline underline-offset-2"
                : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
            }`}
          >
            {bar}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["startBar", text.startBar, range?.startBar ?? 1, totalBars,
            (value: number) => setEdge("start", { bar: value })],
          ["startBeat", text.startBeat, range?.startBeat ?? 1, beatsPerBar,
            (value: number) => setEdge("start", { beat: value })],
          ["endBar", text.endBar, range?.endBar ?? 1, totalBars,
            (value: number) => setEdge("end", { bar: value })],
          ["endBeat", text.endBeat, range?.endBeat ?? beatsPerBar, beatsPerBar,
            (value: number) => setEdge("end", { beat: value })],
        ] as const).map(([name, label, value, max, onChange]) => (
          <label key={name} className="grid gap-1 text-xs text-[var(--lv-text-muted)]">
            {label}
            <input
              type="number"
              min={1}
              max={max}
              value={value}
              name={name}
              onChange={(event) => {
                const parsed = Number(event.currentTarget.value);
                if (Number.isFinite(parsed)) onChange(parsed);
              }}
              className="min-h-9 border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 text-sm text-[var(--lv-text)]"
            />
          </label>
        ))}
      </div>

      <p aria-live="polite" className="mt-3 text-sm text-[var(--lv-text)]">
        {announcement}
      </p>
      {summary?.silent ? (
        <p className="mt-1 text-xs text-amber-300">{text.silent}</p>
      ) : null}
      {summary?.startsMidChord ? (
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{text.startsMidChord}</p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{text.keyboardHint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="lv-button-primary inline-flex min-h-10 items-center px-4 disabled:opacity-40"
          disabled={!summary?.canCreate}
          onClick={create}
        >
          {text.create}
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 items-center border border-[var(--lv-border)] px-4 text-sm text-[var(--lv-text-muted)]"
          onClick={() => setSelection(null)}
        >
          {text.clear}
        </button>
      </div>
    </div>
  );
}
