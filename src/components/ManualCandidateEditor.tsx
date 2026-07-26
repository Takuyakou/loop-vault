import { useCallback, useMemo, useState } from "react";
import type { AppCopy, AppLanguage } from "../i18n";
import type { ChordTimelineItem } from "../domain/types";
import {
  canRedoProgressionEdit,
  canUndoProgressionEdit,
  redoProgressionEdit,
  undoProgressionEdit,
} from "../domain/progressionEditing/editHistory";
import { replaceEditableChord } from "../domain/progressionEditing/chordReplacement";
import { selectEditableSlot } from "../domain/progressionEditing/editableProgression";
import {
  deleteEditableChord,
  insertSuggestedEditableChordAfter,
  mergeEditableChords,
  splitEditableChord,
  canMergeEditableChords,
  canSplitEditableChord,
} from "../domain/progressionEditing/splitMerge";
import type { EditableProgression } from "../domain/progressionEditing/types";
import { EditableProgressionGrid } from "./progression-editing/EditableProgressionGrid";
import type { ManualCandidateDraft } from "../domain/midi/manualDraft";
import {
  applyEditableToDraft,
  draftEditable,
  nudgeOperation,
  rangeNudges,
  retargetDraftRange,
  validateDraft,
  type RangeNudge,
} from "../domain/midi/manualDraftEditing";
import { clampTimelineRange } from "../domain/midi/manualRange";

/**
 * Editing a manual draft.
 *
 * The chord editing here is the editor that already exists — `EditableProgressionGrid`
 * with the same replace, split, merge, delete, insert, undo and redo functions
 * the saved-progression screen uses. What this adds is the two things only a
 * draft has: a range that can still move, and a check that what is about to be
 * saved can be read back.
 */

export interface ManualCandidateEditorProps {
  draft: ManualCandidateDraft;
  timeline: readonly ChordTimelineItem[];
  totalBars: number;
  copy: AppCopy;
  language: AppLanguage;
  keySignature?: string;
  onChange(draft: ManualCandidateDraft): void;
  onDiscard(): void;
  onReselect(): void;
  onPreview?(draft: ManualCandidateDraft): void;
  onSave?(draft: ManualCandidateDraft): void;
}

export function ManualCandidateEditor({
  draft,
  timeline,
  totalBars,
  copy,
  language,
  keySignature,
  onChange,
  onDiscard,
  onReselect,
  onPreview,
  onSave,
}: ManualCandidateEditorProps) {
  const text = copy.capture.manualDraft;
  const [editable, setEditable] = useState<EditableProgression>(() => draftEditable(draft));
  const [pendingNudge, setPendingNudge] = useState<RangeNudge | null>(null);

  const validation = useMemo(() => validateDraft(draft), [draft]);

  const commit = useCallback((next: EditableProgression, operation?: Parameters<
    typeof applyEditableToDraft
  >[2]) => {
    setEditable(next);
    onChange(applyEditableToDraft(draft, next, operation ?? []));
  }, [draft, onChange]);

  /**
   * Moves one edge of the range.
   *
   * Asks first when there are edits to lose. There is no safe default: keeping
   * an edit can put it in a bar the new range does not contain, and discarding
   * throws away work the user did. Both are bad to do silently.
   */
  const applyNudge = useCallback((nudge: RangeNudge, keepEdits: boolean) => {
    const step = Math.abs(nudge.delta) * (nudge.unit === "bar" ? draft.beatsPerBar : 1);
    const signed = nudge.delta < 0 ? -step : step;
    const range = { ...draft.selectedRange };
    const beats = (bar: number, beat: number) => (bar - 1) * draft.beatsPerBar + (beat - 1);
    const position = (absolute: number) => ({
      bar: Math.floor(absolute / draft.beatsPerBar) + 1,
      beat: (absolute % draft.beatsPerBar) + 1,
    });

    if (nudge.edge === "start") {
      const moved = position(Math.max(0, beats(range.startBar, range.startBeat) + signed));
      range.startBar = moved.bar;
      range.startBeat = moved.beat;
    } else {
      const moved = position(Math.max(0, beats(range.endBar, range.endBeat) + signed));
      range.endBar = moved.bar;
      range.endBeat = moved.beat;
    }

    try {
      const { draft: next } = retargetDraftRange(
        draft,
        clampTimelineRange(range, totalBars, draft.beatsPerBar),
        timeline,
        { keepEdits },
      );
      const recorded = {
        ...next,
        repairOperations: [...next.repairOperations, nudgeOperation(nudge, draft.beatsPerBar)],
      };
      setEditable(draftEditable(recorded));
      onChange(recorded);
    } catch {
      // An unusable range leaves the draft alone rather than emptying it.
    }
    setPendingNudge(null);
  }, [draft, onChange, timeline, totalBars]);

  const requestNudge = useCallback((nudge: RangeNudge) => {
    if (draft.isDirty) setPendingNudge(nudge);
    else applyNudge(nudge, false);
  }, [applyNudge, draft.isDirty]);

  const selectedSlotId = editable.selectedSlotId;
  const selectedIndex = editable.slots.findIndex((slot) => slot.id === selectedSlotId);

  return (
    <section
      className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)]/40 p-4"
      data-testid="manual-candidate-editor"
      aria-label={text.title}
    >
      <header className="flex flex-wrap items-baseline gap-3">
        <h4 className="text-sm font-semibold text-[var(--lv-text)]">{text.title}</h4>
        <span className="text-xs text-[var(--lv-text-muted)]">{text.unsaved}</span>
        {draft.isDirty ? (
          <span className="text-xs font-semibold text-amber-300">{text.dirty}</span>
        ) : null}
      </header>

      <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
        {text.range(
          draft.selectedRange.startBar, draft.selectedRange.startBeat,
          draft.selectedRange.endBar, draft.selectedRange.endBeat,
        )}
        {" · "}
        {text.lengthBars(draft.lengthBars)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={text.rangeControls}>
        {rangeNudges.map((nudge) => (
          <button
            key={`${nudge.edge}-${nudge.unit}-${nudge.delta}`}
            type="button"
            data-nudge={`${nudge.edge}-${nudge.unit}-${nudge.delta}`}
            className="min-h-9 border border-[var(--lv-border)] px-2 text-xs text-[var(--lv-text)]"
            onClick={() => requestNudge(nudge)}
          >
            {text.nudge(nudge.edge, nudge.unit, nudge.delta)}
          </button>
        ))}
        <button
          type="button"
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs text-[var(--lv-text)]"
          onClick={onReselect}
        >
          {text.reselect}
        </button>
      </div>

      {pendingNudge === null ? null : (
        <div role="alertdialog" aria-label={text.confirmTitle} className="mt-3 border border-amber-300/60 p-3">
          <p className="text-xs text-[var(--lv-text)]">{text.confirmBody}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-9 border border-[var(--lv-border)] px-3 text-xs"
              onClick={() => applyNudge(pendingNudge, true)}
            >
              {text.confirmKeep}
            </button>
            <button
              type="button"
              className="min-h-9 border border-[var(--lv-border)] px-3 text-xs"
              onClick={() => applyNudge(pendingNudge, false)}
            >
              {text.confirmDiscard}
            </button>
            <button
              type="button"
              className="min-h-9 border border-[var(--lv-border)] px-3 text-xs"
              onClick={() => setPendingNudge(null)}
            >
              {copy.common.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-action="undo"
          disabled={!canUndoProgressionEdit(editable)}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => commit(undoProgressionEdit(editable), [{ type: "undo" }])}
        >
          {text.undo}
        </button>
        <button
          type="button"
          data-action="redo"
          disabled={!canRedoProgressionEdit(editable)}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => commit(redoProgressionEdit(editable), [{ type: "redo" }])}
        >
          {text.redo}
        </button>
        <button
          type="button"
          data-action="split"
          disabled={selectedSlotId === undefined || !canSplitEditableChord(editable, selectedSlotId)}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => selectedSlotId && commit(
            splitEditableChord(editable, selectedSlotId),
            [{ type: "split-event", eventId: selectedSlotId }],
          )}
        >
          {text.split}
        </button>
        <button
          type="button"
          data-action="merge"
          disabled={selectedIndex < 0 || editable.slots[selectedIndex + 1] === undefined
            || !canMergeEditableChords(
              editable, editable.slots[selectedIndex].id, editable.slots[selectedIndex + 1].id,
            )}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => {
            const first = editable.slots[selectedIndex]?.id;
            const second = editable.slots[selectedIndex + 1]?.id;
            if (first && second) {
              commit(mergeEditableChords(editable, first, second), [
                { type: "merge-events", eventIds: [first, second] },
              ]);
            }
          }}
        >
          {text.merge}
        </button>
        <button
          type="button"
          data-action="insert"
          disabled={selectedSlotId === undefined}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => selectedSlotId && commit(
            insertSuggestedEditableChordAfter(editable, selectedSlotId, keySignature),
            [{ type: "add-chord", eventId: selectedSlotId }],
          )}
        >
          {text.insert}
        </button>
        <button
          type="button"
          data-action="delete"
          disabled={selectedSlotId === undefined || editable.slots.length <= 1}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => selectedSlotId && commit(
            deleteEditableChord(editable, selectedSlotId),
            [{ type: "delete-chord", eventId: selectedSlotId }],
          )}
        >
          {text.delete}
        </button>
      </div>

      <div className="mt-3">
        <EditableProgressionGrid
          editable={editable}
          onSelect={(slotId) => setEditable((current) => selectEditableSlot(current, slotId))}
          onNavigate={(slotId) => setEditable((current) => selectEditableSlot(current, slotId))}
          {...(keySignature === undefined ? {} : { keySignature })}
          language={language}
          quickEditor={{
            onOpen: (slotId) => setEditable((current) => selectEditableSlot(current, slotId)),
            onPreview: (slotId) => setEditable((current) => selectEditableSlot(current, slotId)),
            onReset: (slotId) => setEditable((current) => selectEditableSlot(current, slotId)),
            onOpenInspector: (slotId) => setEditable((current) => selectEditableSlot(current, slotId)),
            onApply: (slotId, chord, source, selection) => {
              const selected = selectEditableSlot(editable, slotId);
              const before = editable.slots.find((slot) => slot.id === slotId);
              commit(
                replaceEditableChord(selected, slotId, chord, source, selection),
                [{
                  type: "replace-chord",
                  eventId: slotId,
                  from: before?.currentChord.label ?? "",
                  to: chord.label,
                }],
              );
            },
          }}
        />
      </div>

      {validation.errors.length > 0 ? (
        <ul className="mt-3 text-xs text-red-300" aria-label={text.errors}>
          {validation.errors.map((issue) => (
            <li key={`${issue.kind}-${issue.eventIndex}`}>
              {text.issue(issue.kind, issue.eventIndex + 1)}
            </li>
          ))}
        </ul>
      ) : null}
      {validation.warnings.length > 0 ? (
        <ul className="mt-2 text-xs text-amber-300" aria-label={text.warnings}>
          {validation.warnings.map((issue) => (
            <li key={`${issue.kind}-${issue.eventIndex}`}>
              {text.issue(issue.kind, issue.eventIndex + 1)}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          data-action="preview"
          className="min-h-10 border border-[var(--lv-border)] px-4 text-sm"
          onClick={() => onPreview?.(draft)}
        >
          {text.preview}
        </button>
        <button
          type="button"
          data-action="save"
          disabled={!validation.canSave}
          className="lv-button-primary min-h-10 px-4 disabled:opacity-40"
          onClick={() => onSave?.(draft)}
        >
          {text.save}
        </button>
        <button
          type="button"
          data-action="discard"
          className="min-h-10 border border-[var(--lv-border)] px-4 text-sm text-[var(--lv-text-muted)]"
          onClick={onDiscard}
        >
          {text.discard}
        </button>
      </div>
    </section>
  );
}
