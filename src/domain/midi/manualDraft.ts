import type { ChordTimelineItem } from "../types";
import { BEATS_PER_BAR, type CandidateChordEvent } from "./candidateBlock";
import {
  createCandidateFromTimelineRange,
  manualRangeSource,
  type TimelineRange,
} from "./manualRange";

/**
 * A candidate someone is still working on.
 *
 * Deliberately not a `CandidateOccurrence` and deliberately not in the catalog.
 * The catalog is the inventory of what the analysis found; a draft is what a
 * person is making. Mixing them would mean either the draft is subject to a
 * quality floor it was never scored for — the M1 note about `score: 0` — or the
 * floor has to be loosened for everything, which is worse. Keeping the draft on
 * its own path means neither.
 *
 * Nothing here is persisted. A draft lives for as long as the session does and
 * becomes a saved progression only when the user says so.
 */

/** Every action that changes a draft, for measuring how much repair costs. */
export type ManualRepairOperation =
  | { type: "create-from-range" }
  | { type: "extend-start"; beats: number }
  | { type: "extend-end"; beats: number }
  | { type: "trim-start"; beats: number }
  | { type: "trim-end"; beats: number }
  | { type: "reselect-range" }
  | { type: "add-chord"; eventId: string }
  | { type: "delete-chord"; eventId: string }
  | { type: "replace-chord"; eventId: string; from: string; to: string }
  | { type: "move-event"; eventId: string; deltaBeats: number }
  | { type: "resize-event"; eventId: string; deltaBeats: number }
  | { type: "split-event"; eventId: string }
  | { type: "merge-events"; eventIds: string[] }
  | { type: "undo" }
  | { type: "redo" };

export interface ManualCandidateDraft {
  draftId: string;
  source: typeof manualRangeSource;
  /** Ties the draft to the analysis it was cut from. */
  sourceTimelineFingerprint: string;
  selectedRange: TimelineRange;
  events: CandidateChordEvent[];
  /** What the range gave before any editing, so "revert" has something to mean. */
  originalEvents: CandidateChordEvent[];
  repairOperations: ManualRepairOperation[];
  createdAt: string;
  isDirty: boolean;
  beatsPerBar: number;
  lengthBars: number;
  warnings: string[];
}

/**
 * A stable, cheap identity for a timeline.
 *
 * Only used to notice that a draft belongs to a different analysis than the one
 * on screen — reanalysing the file and then editing a draft cut from the old
 * timeline would silently mix two songs. FNV-1a rather than a real digest
 * because this runs on every draft creation in the browser and the failure it
 * guards against is a mismatch, not an attack.
 */
export function fingerprintTimeline(
  timeline: readonly ChordTimelineItem[],
  beatsPerBar: number = BEATS_PER_BAR,
): string {
  let hash = 0x811c9dc5;
  const feed = (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  feed(`${beatsPerBar}|${timeline.length}`);
  for (const item of timeline) {
    feed(`;${item.bar}.${item.beat}:${item.durationBeats}:${item.chord.label}`);
  }
  return `tl-${hash.toString(16).padStart(8, "0")}`;
}

export interface CreateManualDraftInput {
  timeline: readonly ChordTimelineItem[];
  range: TimelineRange;
  beatsPerBar?: number;
  /** Supplied by the caller so the draft is reproducible in tests. */
  now?: string;
  draftId?: string;
}

/**
 * Cuts a draft out of the timeline.
 *
 * Throws for a range that cannot become a candidate; the caller is expected to
 * have checked with `timelineRangeIssues` and to have offered the user something
 * better than an exception.
 */
export function createManualDraft(input: CreateManualDraftInput): ManualCandidateDraft {
  const beatsPerBar = input.beatsPerBar ?? BEATS_PER_BAR;
  const occurrence = createCandidateFromTimelineRange({
    timeline: input.timeline,
    beatsPerBar,
    ...input.range,
  });
  const createdAt = input.now ?? new Date().toISOString();

  return {
    draftId: input.draftId ?? `draft-${occurrence.id}-${createdAt}`,
    source: manualRangeSource,
    sourceTimelineFingerprint: fingerprintTimeline(input.timeline, beatsPerBar),
    selectedRange: { ...input.range },
    events: occurrence.events,
    // A separate array, not the same reference: editing must not rewrite the
    // record of what the range originally gave.
    originalEvents: occurrence.events.map((event) => ({ ...event })),
    repairOperations: [{ type: "create-from-range" }],
    createdAt,
    isDirty: false,
    beatsPerBar,
    lengthBars: occurrence.lengthBars,
    warnings: occurrence.warnings,
  };
}

/** Operations that changed the music, as opposed to creating or undoing. */
export function editOperationCount(draft: ManualCandidateDraft): number {
  return draft.repairOperations.filter(
    (operation) => operation.type !== "create-from-range"
      && operation.type !== "undo"
      && operation.type !== "redo",
  ).length;
}

/** Whether the draft still describes the timeline currently on screen. */
export function draftMatchesTimeline(
  draft: ManualCandidateDraft,
  timeline: readonly ChordTimelineItem[],
  beatsPerBar: number = BEATS_PER_BAR,
): boolean {
  return draft.sourceTimelineFingerprint === fingerprintTimeline(timeline, beatsPerBar);
}
