import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import {
  BEATS_PER_BAR,
  buildCandidateEvents,
  type CandidateChordEvent,
} from "./candidateBlock";
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
  | { type: "edit-progression" }
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
  | {
      type: "change-snap";
      from: CandidateDraftSnapMode;
      to: CandidateDraftSnapMode;
    }
  | { type: "undo" }
  | { type: "redo" };

export type CandidateDraftSource =
  | { type: "manual-range" }
  | {
      type: "automatic-candidate";
      candidateId: string;
      patternId?: string;
      occurrenceId?: string;
    };

/**
 * The analyzer result a Draft was copied from.
 *
 * Session-only by design. It lets an untouched automatic candidate round-trip
 * without rebuilding its scores or labels, while every edit still lands in the
 * detached Draft events.
 */
export type CandidateSnapshot = ProgressionBlockCandidate;

export type CandidateDraftSnapMode = "bar" | "harmonic" | "beat";

export interface DraftSnapshot {
  selectedRange: TimelineRange;
  events: CandidateChordEvent[];
  originalEvents: CandidateChordEvent[];
  repairOperations: ManualRepairOperation[];
  isDirty: boolean;
  snapMode: CandidateDraftSnapMode;
  lengthBars: number;
  warnings: string[];
}

export interface CaptureEditHistoryEntry {
  id: string;
  label: string;
  operation: ManualRepairOperation;
  before: DraftSnapshot;
  after: DraftSnapshot;
  createdAt: string;
}

export interface ManualCandidateDraft {
  draftId: string;
  source: CandidateDraftSource;
  /** Ties the draft to the analysis it was cut from. */
  sourceTimelineFingerprint: string;
  selectedRange: TimelineRange;
  events: CandidateChordEvent[];
  /** What the range gave before any editing, so "revert" has something to mean. */
  originalEvents: CandidateChordEvent[];
  repairOperations: ManualRepairOperation[];
  createdAt: string;
  isDirty: boolean;
  snapMode: CandidateDraftSnapMode;
  sourceCandidateSnapshot?: CandidateSnapshot;
  history: CaptureEditHistoryEntry[];
  historyIndex: number;
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
    source: { type: manualRangeSource },
    sourceTimelineFingerprint: fingerprintTimeline(input.timeline, beatsPerBar),
    selectedRange: { ...input.range },
    events: occurrence.events,
    // A separate array, not the same reference: editing must not rewrite the
    // record of what the range originally gave.
    originalEvents: occurrence.events.map((event) => ({ ...event })),
    repairOperations: [{ type: "create-from-range" }],
    createdAt,
    isDirty: false,
    snapMode: "beat",
    history: [],
    historyIndex: -1,
    beatsPerBar,
    lengthBars: occurrence.lengthBars,
    warnings: occurrence.warnings,
  };
}

export interface CreateDraftFromCandidateInput {
  candidate: ProgressionBlockCandidate;
  timelineFingerprint: string;
  beatsPerBar?: number;
  patternId?: string;
  occurrenceId?: string;
  /** Supplied by the caller so the Draft is reproducible in tests. */
  now?: string;
  draftId?: string;
}

/**
 * Copies an analyzer candidate into the same detached Draft used by a manual
 * range. The input candidate and its Catalog/Occurrence owners are never
 * mutated.
 */
export function createDraftFromCandidate(
  input: CreateDraftFromCandidateInput,
): ManualCandidateDraft {
  const beatsPerBar = input.beatsPerBar ?? BEATS_PER_BAR;
  const createdAt = input.now ?? new Date().toISOString();
  const candidate = cloneCandidate(input.candidate);
  const events = candidate.events?.map(cloneEvent)
    ?? buildCandidateEvents(
      candidate.chords,
      candidate.startBar,
      candidate.lengthBars,
      beatsPerBar,
    ).map(cloneEvent);

  return {
    draftId: input.draftId ?? `draft-${candidate.id}-${createdAt}`,
    source: {
      type: "automatic-candidate",
      candidateId: candidate.id,
      ...(input.patternId === undefined ? {} : { patternId: input.patternId }),
      ...(input.occurrenceId === undefined ? {} : { occurrenceId: input.occurrenceId }),
    },
    sourceTimelineFingerprint: input.timelineFingerprint,
    selectedRange: {
      startBar: candidate.startBar,
      startBeat: 1,
      endBar: candidate.endBar,
      endBeat: beatsPerBar,
    },
    events,
    originalEvents: events.map(cloneEvent),
    repairOperations: [],
    createdAt,
    isDirty: false,
    snapMode: "bar",
    sourceCandidateSnapshot: candidate,
    history: [],
    historyIndex: -1,
    beatsPerBar,
    lengthBars: candidate.lengthBars,
    warnings: [...candidate.warnings],
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

/**
 * Whether the music inside the selected range differs from its current
 * timeline baseline.
 *
 * Moving the range rebuilds both `events` and `originalEvents`, so it remains a
 * saveable Draft change without being mistaken for a chord edit when the user
 * intentionally switches to another candidate preset.
 */
export function draftHasMusicEdits(draft: ManualCandidateDraft): boolean {
  if (!draft.isDirty) return false;
  if (draft.events.length !== draft.originalEvents.length) return true;
  return draft.events.some((event, index) => (
    editableEventSignature(event) !== editableEventSignature(draft.originalEvents[index]!)
  ));
}

/** Whether the draft still describes the timeline currently on screen. */
export function draftMatchesTimeline(
  draft: ManualCandidateDraft,
  timeline: readonly ChordTimelineItem[],
  beatsPerBar: number = BEATS_PER_BAR,
): boolean {
  return draft.sourceTimelineFingerprint === fingerprintTimeline(timeline, beatsPerBar);
}

function cloneCandidate(candidate: ProgressionBlockCandidate): ProgressionBlockCandidate {
  return {
    ...candidate,
    chords: candidate.chords.map(cloneTimelineItem),
    ...(candidate.events === undefined
      ? {}
      : { events: candidate.events.map(cloneEvent) }),
    ...(candidate.stats === undefined ? {} : { stats: { ...candidate.stats } }),
    ...(candidate.quality === undefined ? {} : { quality: { ...candidate.quality } }),
    labels: [...candidate.labels],
    warnings: [...candidate.warnings],
  };
}

function cloneEvent(event: CandidateChordEvent): CandidateChordEvent {
  return {
    ...event,
    chord: cloneChord(event.chord),
    warnings: [...event.warnings],
    source: cloneTimelineItem(event.source),
  };
}

function cloneTimelineItem(item: ChordTimelineItem): ChordTimelineItem {
  return {
    ...item,
    chord: cloneChord(item.chord),
    alternatives: item.alternatives.map((alternative) => ({
      ...alternative,
      chord: cloneChord(alternative.chord),
    })),
    warnings: [...item.warnings],
    ...(item.voicingMemory === undefined
      ? {}
      : {
          voicingMemory: {
            ...(item.voicingMemory.sourceVoicing === undefined
              ? {}
              : {
                  sourceVoicing: {
                    ...item.voicingMemory.sourceVoicing,
                    midiNotes: [...item.voicingMemory.sourceVoicing.midiNotes],
                  },
                }),
            ...(item.voicingMemory.practiceVoicingOverride === undefined
              ? {}
              : {
                  practiceVoicingOverride: {
                    ...item.voicingMemory.practiceVoicingOverride,
                    midiNotes: [...item.voicingMemory.practiceVoicingOverride.midiNotes],
                  },
                }),
          },
        }),
  };
}

function cloneChord(chord: ChordTimelineItem["chord"]): ChordTimelineItem["chord"] {
  return { ...chord, tensions: [...chord.tensions] };
}

function editableEventSignature(event: CandidateChordEvent): string {
  return JSON.stringify({
    relativeStartBeat: event.relativeStartBeat,
    durationBeats: event.durationBeats,
    bar: event.bar,
    beat: event.beat,
    chord: event.chord,
    voicingMemory: event.source.voicingMemory,
  });
}
