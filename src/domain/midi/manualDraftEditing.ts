import { parseChordLabel } from "../chords";
import { chordIdentityKey, normalizeChordLabel } from "../chordIdentity";
import { createEditableProgression } from "../progressionEditing/editableProgression";
import type { EditableProgression } from "../progressionEditing/types";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import { summaryFromEvents, type CandidateChordEvent } from "./candidateBlock";
import { recordCaptureDraftChange } from "./captureEditHistory";
import { createCandidateFromTimelineRange, timelineRangeBeats, timelineRangeIssues } from "./manualRange";
import type { ManualCandidateDraft, ManualRepairOperation } from "./manualDraft";

/**
 * Editing a manual draft with the editor that already exists.
 *
 * No editing logic is written here. Replace, insert, delete, split, merge, undo
 * and redo all live in `src/domain/progressionEditing/` and are already reachable
 * from two screens; a second implementation for drafts would be a second set of
 * bugs. What this module does is translate a draft into the shape that editor
 * consumes and translate the result back.
 */

/**
 * The draft as the editor's input.
 *
 * Chords are the draft's own clipped events rather than the timeline items they
 * came from. A range that opens partway through a chord has a source item
 * starting before the range; handing that to the editor would show the user a
 * chord outside the block they drew and let them edit bars they did not select.
 */
export function draftToCandidate(draft: ManualCandidateDraft): ProgressionBlockCandidate {
  if (!draft.isDirty && draft.sourceCandidateSnapshot !== undefined) {
    return cloneCandidateSnapshot(draft.sourceCandidateSnapshot);
  }

  const { startBeat } = timelineRangeBeats(draft.selectedRange, draft.beatsPerBar);
  const chords: ChordTimelineItem[] = draft.events.map((event, index) => {
    const absolute = startBeat + event.relativeStartBeat;
    return {
      eventId: event.sourceEventId ?? `${draft.draftId}-${index}`,
      bar: Math.floor(absolute / draft.beatsPerBar) + 1,
      beat: (absolute % draft.beatsPerBar) + 1,
      durationBeats: event.durationBeats,
      chord: event.chord,
      confidence: event.confidence,
      alternatives: event.source.alternatives,
      warnings: event.warnings,
      ...(event.source.voicingMemory ? { voicingMemory: event.source.voicingMemory } : {}),
    };
  });

  const snapshot = draft.sourceCandidateSnapshot;
  return {
    ...snapshot,
    id: snapshot?.id ?? draft.draftId,
    startBar: draft.selectedRange.startBar,
    endBar: draft.selectedRange.endBar,
    lengthBars: draft.lengthBars as ProgressionBlockCandidate["lengthBars"],
    chords,
    events: draft.events,
    stats: {
      eventCount: draft.events.length,
      harmonicChangeCount: draft.events.length,
      uniqueChordCount: new Set(draft.events.map((event) => event.identityKey)).size,
      chordEventsPerBar: draft.lengthBars > 0
        ? Number((draft.events.length / draft.lengthBars).toFixed(4))
        : 0,
      densityClass: "standard",
    },
    structuredSignature: snapshot?.structuredSignature ?? draft.draftId,
    summaryText: summaryFromEvents(draft.events, draft.lengthBars, draft.beatsPerBar),
    confidence: draft.events.length
      ? Number((draft.events.reduce((sum, event) => sum + event.confidence, 0)
        / draft.events.length).toFixed(4))
      : 0,
    selectionScore: snapshot?.selectionScore ?? 0,
    labels: [...new Set(chords.map((item) => item.chord.label))],
    warnings: draft.warnings,
  };
}

/** The existing editor state, built from the draft. */
export function draftEditable(draft: ManualCandidateDraft): EditableProgression {
  return createEditableProgression(draftToCandidate(draft), draft.beatsPerBar);
}

/**
 * Writes the editor's result back into the draft.
 *
 * The editor owns chord identity and timing while it is open; the draft owns the
 * range and the record of what was done. Keeping the two separate is what lets
 * the same editor serve saved progressions, automatic candidates and drafts
 * without any of them knowing about the others.
 */
export function applyEditableToDraft(
  draft: ManualCandidateDraft,
  editable: EditableProgression,
  operations: readonly ManualRepairOperation[] = [],
): ManualCandidateDraft {
  const { startBeat } = timelineRangeBeats(draft.selectedRange, draft.beatsPerBar);
  const events: CandidateChordEvent[] = editable.slots.map((slot, index) => {
    const absolute = (slot.position.bar - 1) * draft.beatsPerBar + (slot.position.beat - 1);
    const previous = draft.events[index] ?? draft.events[draft.events.length - 1];
    return {
      ...previous,
      relativeStartBeat: absolute - startBeat,
      durationBeats: slot.position.durationBeats,
      bar: slot.position.bar,
      beat: slot.position.beat,
      chord: slot.currentChord,
      // Spelling-independent, the same way `buildCandidateEvents` derives it.
      // Storing the display label here instead would make `Gbadd9` and `F#add9`
      // different events, break the signatures built from it, and make every
      // untouched chord look edited to anything comparing keys.
      identityKey: identityKeyOf(slot.currentChord.label),
      warnings: slot.warnings,
      ...(slot.id ? { sourceEventId: slot.id } : {}),
      // The source item has to carry the edit too. Saving goes through
      // `candidateEventsAsTimeline`, which spreads `event.source`, so leaving the
      // detected chord there would store the chord the analyser guessed instead
      // of the one the user chose — the edit would vanish at save time and only
      // be noticed after reload. `originalEvents` still holds what the range
      // first gave, so nothing is lost by moving this forward.
      source: {
        ...previous.source,
        bar: slot.position.bar,
        beat: slot.position.beat,
        durationBeats: slot.position.durationBeats,
        chord: slot.currentChord,
        voicingMemory: slot.voicingMemory,
      },
    };
  });

  const next: ManualCandidateDraft = {
    ...draft,
    events,
    repairOperations: [...draft.repairOperations, ...operations],
    isDirty: true,
  };
  const operation = operations[0] ?? { type: "edit-progression" };
  return recordCaptureDraftChange(
    draft,
    next,
    operation,
    operations.length > 1 ? "Edit progression" : undefined,
  );
}

export interface RetargetOptions {
  /**
   * Keep the chord edits already made, or start again from the timeline.
   *
   * There is no safe default. Keeping them can put an edited chord in a bar the
   * new range does not contain; discarding them throws away the user's work. The
   * caller has to have asked.
   */
  keepEdits: boolean;
  operation?: ManualRepairOperation;
}

export interface RetargetResult {
  draft: ManualCandidateDraft;
  /** Edits that could not be carried over, so the UI can say how many were lost. */
  droppedEditCount: number;
}

/**
 * Moves the draft's range and rebuilds its events from the original timeline.
 *
 * Rebuilding from the timeline rather than from the current events is the point:
 * extending a range has to bring in chords the draft never had, and those only
 * exist upstream.
 */
export function retargetDraftRange(
  draft: ManualCandidateDraft,
  range: ManualCandidateDraft["selectedRange"],
  timeline: readonly ChordTimelineItem[],
  options: RetargetOptions,
): RetargetResult {
  const issues = timelineRangeIssues({ timeline, beatsPerBar: draft.beatsPerBar, ...range });
  if (issues.length > 0) {
    throw new Error(`cannot retarget to this range: ${issues.join(", ")}`);
  }

  const rebuilt = createCandidateFromTimelineRange({
    timeline,
    beatsPerBar: draft.beatsPerBar,
    ...range,
  });

  const edited = new Map(
    draft.events
      .filter((event, index) => draft.originalEvents[index] !== undefined
        && event.identityKey !== draft.originalEvents[index].identityKey)
      .map((event) => [`${event.bar}.${event.beat}`, event]),
  );

  // Carried edits are removed from the map as they land, so what is left is what
  // the new range has no bar for. When the edits are being discarded the whole
  // map is the loss, and the user is told the size of it either way.
  const events = options.keepEdits
    ? rebuilt.events.map((event) => {
      const carried = edited.get(`${event.bar}.${event.beat}`);
      if (carried === undefined) return event;
      edited.delete(`${event.bar}.${event.beat}`);
      return { ...event, chord: carried.chord, identityKey: carried.identityKey };
    })
    : rebuilt.events;
  const droppedEditCount = edited.size;

  const operation = options.operation ?? { type: "reselect-range" };
  const next: ManualCandidateDraft = {
      ...draft,
      selectedRange: { ...range },
      events,
      originalEvents: rebuilt.events.map((event) => ({ ...event })),
      lengthBars: rebuilt.lengthBars,
      warnings: rebuilt.warnings,
      repairOperations: [...draft.repairOperations, operation],
      isDirty: options.keepEdits ? draft.isDirty : false,
  };

  return {
    draft: recordCaptureDraftChange(draft, next, operation),
    droppedEditCount,
  };
}

export type DraftValidationIssue =
  | { kind: "outside-range"; eventIndex: number }
  | { kind: "non-positive-duration"; eventIndex: number }
  | { kind: "out-of-order"; eventIndex: number }
  | { kind: "duplicate-id"; eventIndex: number }
  | { kind: "unparseable-chord"; eventIndex: number; label: string }
  | { kind: "gap"; eventIndex: number; beats: number }
  | { kind: "overlap"; eventIndex: number; beats: number };

export interface DraftValidation {
  /** Blocks saving. Something is structurally wrong. */
  errors: DraftValidationIssue[];
  /** Shown, not blocked. A gap or an overlap can be deliberate. */
  warnings: DraftValidationIssue[];
  canSave: boolean;
}

/**
 * Checks a draft before it becomes a saved progression.
 *
 * Gaps and overlaps are warnings rather than errors on purpose. A rest between
 * two chords and a chord that rings over the next one are both things real music
 * does; refusing to save them would make the editor unable to describe the song
 * it was opened on. What is refused is a draft that cannot be read back: a
 * chord with no length, an event outside its own block, a label no parser
 * accepts.
 */
export function validateDraft(draft: ManualCandidateDraft): DraftValidation {
  const errors: DraftValidationIssue[] = [];
  const warnings: DraftValidationIssue[] = [];
  const seen = new Set<string>();
  const totalBeats = draft.lengthBars * draft.beatsPerBar;

  draft.events.forEach((event, index) => {
    if (event.durationBeats <= 0) errors.push({ kind: "non-positive-duration", eventIndex: index });
    if (event.relativeStartBeat < 0 || event.relativeStartBeat + event.durationBeats > totalBeats + 1e-6) {
      errors.push({ kind: "outside-range", eventIndex: index });
    }
    if (index > 0 && event.relativeStartBeat < draft.events[index - 1].relativeStartBeat) {
      errors.push({ kind: "out-of-order", eventIndex: index });
    }

    const id = event.sourceEventId ?? `${index}`;
    if (seen.has(id)) errors.push({ kind: "duplicate-id", eventIndex: index });
    seen.add(id);

    const label = event.chord.label;
    // A rest is written, not broken: `N.C.` is a legitimate thing to save.
    if (!isRest(label) && parseChordLabel(label) === null) {
      errors.push({ kind: "unparseable-chord", eventIndex: index, label });
    }

    if (index > 0) {
      const previous = draft.events[index - 1];
      const previousEnd = previous.relativeStartBeat + previous.durationBeats;
      const difference = Number((event.relativeStartBeat - previousEnd).toFixed(6));
      if (difference > 0) warnings.push({ kind: "gap", eventIndex: index, beats: difference });
      if (difference < 0) warnings.push({ kind: "overlap", eventIndex: index, beats: -difference });
    }
  });

  return { errors, warnings, canSave: errors.length === 0 && draft.events.length > 0 };
}

function identityKeyOf(label: string): string {
  const identity = normalizeChordLabel(label);
  return identity ? chordIdentityKey(identity) : `raw:${label}`;
}

function isRest(label: string): boolean {
  return /^(n\.?c\.?|no chord|-)$/i.test(label.trim());
}

function cloneCandidateSnapshot(
  candidate: ProgressionBlockCandidate,
): ProgressionBlockCandidate {
  return {
    ...candidate,
    chords: candidate.chords.map((item) => ({
      ...item,
      chord: { ...item.chord, tensions: [...item.chord.tensions] },
      alternatives: item.alternatives.map((alternative) => ({
        ...alternative,
        chord: {
          ...alternative.chord,
          tensions: [...alternative.chord.tensions],
        },
      })),
      warnings: [...item.warnings],
    })),
    ...(candidate.events === undefined
      ? {}
      : {
          events: candidate.events.map((event) => ({
            ...event,
            chord: { ...event.chord, tensions: [...event.chord.tensions] },
            warnings: [...event.warnings],
            source: {
              ...event.source,
              chord: {
                ...event.source.chord,
                tensions: [...event.source.chord.tensions],
              },
              alternatives: event.source.alternatives.map((alternative) => ({
                ...alternative,
                chord: {
                  ...alternative.chord,
                  tensions: [...alternative.chord.tensions],
                },
              })),
              warnings: [...event.source.warnings],
            },
          })),
        }),
    ...(candidate.stats === undefined ? {} : { stats: { ...candidate.stats } }),
    ...(candidate.quality === undefined ? {} : { quality: { ...candidate.quality } }),
    labels: [...candidate.labels],
    warnings: [...candidate.warnings],
  };
}

/** Appends an operation without touching the music. */
export function recordDraftOperation(
  draft: ManualCandidateDraft,
  operation: ManualRepairOperation,
): ManualCandidateDraft {
  return { ...draft, repairOperations: [...draft.repairOperations, operation] };
}

/**
 * How the range can be moved, in the units a person thinks in.
 *
 * Both edges, both directions, by a beat or by a bar. Returned as data so the UI
 * renders eight buttons from one list instead of eight hand-written handlers.
 */
export const rangeNudges = [
  { edge: "start", unit: "beat", delta: -1 },
  { edge: "start", unit: "beat", delta: 1 },
  { edge: "start", unit: "bar", delta: -1 },
  { edge: "start", unit: "bar", delta: 1 },
  { edge: "end", unit: "beat", delta: -1 },
  { edge: "end", unit: "beat", delta: 1 },
  { edge: "end", unit: "bar", delta: -1 },
  { edge: "end", unit: "bar", delta: 1 },
] as const;

export type RangeNudge = typeof rangeNudges[number];

/** The repair operation a nudge amounts to, for the operation record. */
export function nudgeOperation(nudge: RangeNudge, beatsPerBar: number): ManualRepairOperation {
  const beats = Math.abs(nudge.delta) * (nudge.unit === "bar" ? beatsPerBar : 1);
  if (nudge.edge === "start") {
    return nudge.delta < 0
      ? { type: "extend-start", beats }
      : { type: "trim-start", beats };
  }
  return nudge.delta > 0
    ? { type: "extend-end", beats }
    : { type: "trim-end", beats };
}
