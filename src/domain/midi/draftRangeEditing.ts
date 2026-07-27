import type { ChordTimelineItem } from "../types";
import { recordCaptureDraftChange } from "./captureEditHistory";
import type {
  CandidateDraftSnapMode,
  ManualCandidateDraft,
  ManualRepairOperation,
} from "./manualDraft";
import { timelineRangeBeats, type TimelineRange } from "./manualRange";
import { retargetDraftRange } from "./manualDraftEditing";

const MIN_EVENT_DURATION_BEATS = 0.25;

export function setDraftSnapMode(
  draft: ManualCandidateDraft,
  snapMode: CandidateDraftSnapMode,
): ManualCandidateDraft {
  if (draft.snapMode === snapMode) return draft;
  const operation: ManualRepairOperation = {
    type: "change-snap",
    from: draft.snapMode,
    to: snapMode,
  };
  return recordCaptureDraftChange(
    draft,
    {
      ...draft,
      snapMode,
      repairOperations: [...draft.repairOperations, operation],
    },
    operation,
  );
}

export function cycleDraftSnapMode(
  draft: ManualCandidateDraft,
  reverse: boolean = false,
): ManualCandidateDraft {
  const modes: CandidateDraftSnapMode[] = ["bar", "harmonic", "beat"];
  const current = modes.indexOf(draft.snapMode);
  const offset = reverse ? modes.length - 1 : 1;
  return setDraftSnapMode(draft, modes[(current + offset) % modes.length]!);
}

export function draftRangeAbsoluteBeats(draft: ManualCandidateDraft) {
  return timelineRangeBeats(draft.selectedRange, draft.beatsPerBar);
}

export function rangeFromAbsoluteBeats(
  startBeat: number,
  endBeat: number,
  beatsPerBar: number,
): TimelineRange {
  const safeStart = Math.max(0, startBeat);
  const safeEnd = Math.max(safeStart + MIN_EVENT_DURATION_BEATS, endBeat);
  const inclusiveEnd = Math.max(safeStart, safeEnd - 1);
  return {
    startBar: Math.floor(safeStart / beatsPerBar) + 1,
    startBeat: (safeStart % beatsPerBar) + 1,
    endBar: Math.floor(inclusiveEnd / beatsPerBar) + 1,
    endBeat: (inclusiveEnd % beatsPerBar) + 1,
  };
}

export function snapAbsoluteBeat(
  value: number,
  mode: CandidateDraftSnapMode,
  timeline: readonly ChordTimelineItem[],
  beatsPerBar: number,
  disabled: boolean = false,
): number {
  if (disabled) return quantise(value);
  if (mode === "bar") return Math.round(value / beatsPerBar) * beatsPerBar;
  if (mode === "beat") return Math.round(value);
  const boundaries = timeline.flatMap((item) => {
    const start = (item.bar - 1) * beatsPerBar + item.beat - 1;
    return [start, start + item.durationBeats];
  });
  // TimelineRange's public bar/beat contract is beat-granular. Harmonic
  // boundaries may be fractional internally, so choose the nearest one and
  // normalise to the nearest representable beat at this UI boundary.
  return Math.round(nearest(value, boundaries));
}

export function retargetDraftByAbsoluteBeats(
  draft: ManualCandidateDraft,
  timeline: readonly ChordTimelineItem[],
  startBeat: number,
  endBeat: number,
  totalBars: number,
  options: { keepEdits: boolean; disableSnap?: boolean },
) {
  const maximum = totalBars * draft.beatsPerBar;
  const snappedStart = clamp(
    snapAbsoluteBeat(
      startBeat,
      draft.snapMode,
      timeline,
      draft.beatsPerBar,
      options.disableSnap,
    ),
    0,
    maximum - MIN_EVENT_DURATION_BEATS,
  );
  const snappedEnd = clamp(
    snapAbsoluteBeat(
      endBeat,
      draft.snapMode,
      timeline,
      draft.beatsPerBar,
      options.disableSnap,
    ),
    snappedStart + MIN_EVENT_DURATION_BEATS,
    maximum,
  );
  const previous = draftRangeAbsoluteBeats(draft);
  const operation = rangeOperation(previous, {
    startBeat: snappedStart,
    endBeat: snappedEnd,
  });
  return retargetDraftRange(
    draft,
    rangeFromAbsoluteBeats(snappedStart, snappedEnd, draft.beatsPerBar),
    timeline,
    { keepEdits: options.keepEdits, operation },
  );
}

export function resizeDraftBoundary(
  draft: ManualCandidateDraft,
  leftEventId: string,
  requestedBoundaryBeat: number,
  options: { disableSnap?: boolean } = {},
): ManualCandidateDraft {
  const events = draft.events.map((event) => ({
    ...event,
    chord: { ...event.chord, tensions: [...event.chord.tensions] },
    warnings: [...event.warnings],
    source: { ...event.source },
  }));
  const leftIndex = events.findIndex(
    (event, index) => (event.sourceEventId ?? `${index}`) === leftEventId,
  );
  const left = events[leftIndex];
  const right = events[leftIndex + 1];
  if (!left || !right) return draft;

  const leftStart = left.relativeStartBeat;
  const rightEnd = right.relativeStartBeat + right.durationBeats;
  const boundaries = draft.originalEvents.flatMap((event) => [
    event.relativeStartBeat,
    event.relativeStartBeat + event.durationBeats,
  ]);
  const snapped = options.disableSnap
    ? quantise(requestedBoundaryBeat)
    : draft.snapMode === "bar"
      ? Math.round(requestedBoundaryBeat / draft.beatsPerBar) * draft.beatsPerBar
      : draft.snapMode === "beat"
        ? Math.round(requestedBoundaryBeat)
        : nearest(requestedBoundaryBeat, boundaries);
  const boundary = clamp(
    snapped,
    leftStart + MIN_EVENT_DURATION_BEATS,
    rightEnd - MIN_EVENT_DURATION_BEATS,
  );
  const previousBoundary = left.relativeStartBeat + left.durationBeats;
  if (Math.abs(boundary - previousBoundary) < 1e-6) return draft;

  left.durationBeats = boundary - leftStart;
  right.relativeStartBeat = boundary;
  right.durationBeats = rightEnd - boundary;
  const rangeStart = draftRangeAbsoluteBeats(draft).startBeat;
  applyAbsoluteTiming(left, rangeStart + left.relativeStartBeat, draft.beatsPerBar);
  applyAbsoluteTiming(right, rangeStart + right.relativeStartBeat, draft.beatsPerBar);

  const operation: ManualRepairOperation = {
    type: "resize-event",
    eventId: leftEventId,
    deltaBeats: boundary - previousBoundary,
  };
  return recordCaptureDraftChange(
    draft,
    {
      ...draft,
      events,
      repairOperations: [...draft.repairOperations, operation],
      isDirty: true,
    },
    operation,
  );
}

function applyAbsoluteTiming(
  event: ManualCandidateDraft["events"][number],
  absoluteBeat: number,
  beatsPerBar: number,
) {
  event.bar = Math.floor(absoluteBeat / beatsPerBar) + 1;
  event.beat = (absoluteBeat % beatsPerBar) + 1;
  event.source = {
    ...event.source,
    bar: event.bar,
    beat: event.beat,
    durationBeats: event.durationBeats,
  };
}

function rangeOperation(
  before: { startBeat: number; endBeat: number },
  after: { startBeat: number; endBeat: number },
): ManualRepairOperation {
  if (before.startBeat !== after.startBeat && before.endBeat === after.endBeat) {
    return after.startBeat < before.startBeat
      ? { type: "extend-start", beats: before.startBeat - after.startBeat }
      : { type: "trim-start", beats: after.startBeat - before.startBeat };
  }
  if (before.endBeat !== after.endBeat && before.startBeat === after.startBeat) {
    return after.endBeat > before.endBeat
      ? { type: "extend-end", beats: after.endBeat - before.endBeat }
      : { type: "trim-end", beats: before.endBeat - after.endBeat };
  }
  return { type: "reselect-range" };
}

function nearest(value: number, candidates: readonly number[]): number {
  if (candidates.length === 0) return Math.round(value);
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ), candidates[0]!);
}

function quantise(value: number): number {
  return Math.round(value / MIN_EVENT_DURATION_BEATS) * MIN_EVENT_DURATION_BEATS;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
