import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppCopy, AppLanguage } from "../i18n";
import type { ChordTimelineItem } from "../domain/types";
import { replaceEditableChord } from "../domain/progressionEditing/chordReplacement";
import { selectEditableSlot } from "../domain/progressionEditing/editableProgression";
import {
  deleteEditableChordWithMode,
  type ChordContextAction,
} from "../domain/progressionEditing/contextActions";
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
import { draftPreviewTimeline } from "../domain/midi/manualDraftPlayback";
import { timelineVoicingSourceStatus } from "../domain/voicing";
import {
  canRedoCaptureDraft,
  canUndoCaptureDraft,
  jumpCaptureDraftHistory,
  redoCaptureDraft,
  undoCaptureDraft,
} from "../domain/midi/captureEditHistory";
import { SaveProgressionPopover } from "./SaveProgressionPopover";
import type { SongIdea } from "../domain/types";
import { CaptureEditHistoryPanel } from "./CaptureEditHistoryPanel";
import { DraftBoundaryHandles } from "./DraftBoundaryHandles";
import { cutDraftRangeAtEvent } from "../domain/midi/draftRangeEditing";
import { VoicingSourceChip } from "./voicing/VoicingSourceChip";

/**
 * Editing a manual draft.
 *
 * The chord editing here is the editor that already exists — `EditableProgressionGrid`
 * with the same replace, split, merge, delete, insert, undo and redo functions
 * the saved-progression screen uses. What this adds is the two things only a
 * draft has: a range that can still move, and a check that what is about to be
 * saved can be read back.
 */

/**
 * The Vault save path, supplied by the screen rather than reached from here.
 *
 * A draft is saved by the same handlers an automatic candidate is saved by, so
 * it goes through `applyVaultChange` and autosave like everything else. This
 * component never touches the repository.
 */
export interface ManualDraftSaveTarget {
  initialTitle: string;
  ideas: SongIdea[];
  defaultNextAction: string;
  onCreate(
    draft: ManualCandidateDraft, title: string, nextAction: string, userVerified: boolean,
  ): boolean;
  onAppend(draft: ManualCandidateDraft, ideaId: string, userVerified: boolean): boolean;
}

export interface ManualCandidateEditorProps {
  draft: ManualCandidateDraft;
  timeline: readonly ChordTimelineItem[];
  totalBars: number;
  copy: AppCopy;
  language: AppLanguage;
  keySignature?: string;
  /** Text-entry drafts have no source timeline to retarget. */
  allowRangeAdjustment?: boolean;
  /** Text grammar owns timing; text drafts permit chord replacement only. */
  allowStructuralEdits?: boolean;
  /** Text-entry drafts use confidence 0 as a no-analysis sentinel. */
  showConfidenceReview?: boolean;
  /** Defaults to the legacy candidate adapter; text provides a safe factory. */
  createEditable?: (draft: ManualCandidateDraft) => EditableProgression;
  save?: ManualDraftSaveTarget;
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
  allowRangeAdjustment = true,
  allowStructuralEdits = true,
  showConfidenceReview = true,
  createEditable = draftEditable,
  onChange,
  onDiscard,
  onReselect,
  onPreview,
  onSave,
  save,
}: ManualCandidateEditorProps) {
  const text = copy.capture.manualDraft;
  const [editable, setEditable] = useState<EditableProgression>(() => createEditable(draft));
  const [pendingNudge, setPendingNudge] = useState<RangeNudge | null>(null);
  const editorRef = useRef<HTMLElement>(null);

  const validation = useMemo(() => validateDraft(draft), [draft]);
  const voicingSource = useMemo(
    () => timelineVoicingSourceStatus(
      draft.source.type === "text-progression" ? timeline : draftPreviewTimeline(draft),
    ),
    [draft, timeline],
  );
  const sourceLabel = draft.source.type === "automatic-candidate"
    ? language === "ja"
      ? `自動候補から作成${draft.isDirty ? "・編集中" : ""}`
      : `Created from automatic candidate${draft.isDirty ? " · Editing" : ""}`
    : draft.source.type === "text-progression"
      ? language === "ja"
        ? "テキスト入力から作成"
        : "Created from text entry"
      : language === "ja"
        ? "手動範囲から作成"
        : "Created from manual range";

  useEffect(() => {
    setEditable(createEditable(draft));
    setPendingNudge(null);
  }, [createEditable, draft.draftId]);

  const applyHistoryDraft = useCallback((next: ManualCandidateDraft) => {
    setEditable(createEditable(next));
    onChange(next);
  }, [createEditable, onChange]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented
        || event.isComposing
        || !event.ctrlKey
        || !editorRef.current?.contains(document.activeElement)
        || isNativeEditTarget(event.target)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const redo = key === "y" || (key === "z" && event.shiftKey);
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      applyHistoryDraft(redo ? redoCaptureDraft(draft) : undoCaptureDraft(draft));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyHistoryDraft, draft]);

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
        {
          keepEdits,
          operation: nudgeOperation(nudge, draft.beatsPerBar),
        },
      );
      setEditable(createEditable(next));
      onChange(next);
    } catch {
      // An unusable range leaves the draft alone rather than emptying it.
    }
    setPendingNudge(null);
  }, [createEditable, draft, onChange, timeline, totalBars]);

  const requestNudge = useCallback((nudge: RangeNudge) => {
    if (draft.isDirty) setPendingNudge(nudge);
    else applyNudge(nudge, false);
  }, [applyNudge, draft.isDirty]);

  const selectedSlotId = editable.selectedSlotId;
  const selectedIndex = editable.slots.findIndex((slot) => slot.id === selectedSlotId);

  function runContextAction(slotId: string, action: ChordContextAction): boolean {
    if (!allowStructuralEdits) return false;
    if (!allowRangeAdjustment && action === "cut-range-here") return false;
    if (action === "cut-range-here") {
      const nextDraft = cutDraftRangeAtEvent(draft, slotId);
      if (nextDraft === draft) return false;
      applyHistoryDraft(nextDraft);
      return true;
    }

    let next = editable;
    let operations: Parameters<typeof applyEditableToDraft>[2] = [];
    if (action === "delete-extend-previous") {
      next = deleteEditableChordWithMode(editable, slotId, "extend-previous");
      operations = [{ type: "delete-chord", eventId: slotId }];
    } else if (action === "delete-extend-next") {
      next = deleteEditableChordWithMode(editable, slotId, "extend-next");
      operations = [{ type: "delete-chord", eventId: slotId }];
    } else if (action === "delete-close-gap") {
      next = deleteEditableChordWithMode(editable, slotId, "close-gap");
      operations = [{ type: "delete-chord", eventId: slotId }];
    } else if (action === "replace-no-chord") {
      const before = editable.slots.find((slot) => slot.id === slotId);
      next = deleteEditableChordWithMode(editable, slotId, "replace-no-chord");
      operations = [{
        type: "replace-chord",
        eventId: slotId,
        from: before?.currentChord.label ?? "",
        to: "N.C.",
      }];
    } else if (action === "split") {
      next = splitEditableChord(editable, slotId);
      operations = [{ type: "split-event", eventId: slotId }];
    } else {
      const index = editable.slots.findIndex((slot) => slot.id === slotId);
      const left = editable.slots[index + 1] ? editable.slots[index] : editable.slots[index - 1];
      const right = editable.slots[index + 1] ?? editable.slots[index];
      if (left && right) {
        next = mergeEditableChords(
          editable,
          left.id,
          right.id,
          action === "merge-keep-left" ? "first" : "second",
        );
        operations = [{ type: "merge-events", eventIds: [left.id, right.id] }];
      }
    }
    if (next === editable) return false;
    commit(next, operations);
    return true;
  }

  return (
    <section
      ref={editorRef}
      className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)]/40 p-4"
      data-testid="manual-candidate-editor"
      tabIndex={-1}
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
        <span data-testid="draft-source">{sourceLabel}</span>
        {" · "}
        {text.range(
          draft.selectedRange.startBar, draft.selectedRange.startBeat,
          draft.selectedRange.endBar, draft.selectedRange.endBeat,
        )}
        {" · "}
        {text.lengthBars(draft.lengthBars)}
      </p>

      {allowRangeAdjustment ? <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={text.rangeControls}>
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
      </div> : null}

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
          disabled={!canUndoCaptureDraft(draft)}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => applyHistoryDraft(undoCaptureDraft(draft))}
        >
          {text.undo}
        </button>
        <button
          type="button"
          data-action="redo"
          disabled={!canRedoCaptureDraft(draft)}
          className="min-h-9 border border-[var(--lv-border)] px-3 text-xs disabled:opacity-40"
          onClick={() => applyHistoryDraft(redoCaptureDraft(draft))}
        >
          {text.redo}
        </button>
        {allowStructuralEdits ? <>
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
        </> : null}
      </div>

      <div className="mt-3">
        <EditableProgressionGrid
          editable={editable}
          onSelect={(slotId) => setEditable((current) => selectEditableSlot(current, slotId))}
          onNavigate={(slotId) => setEditable((current) => selectEditableSlot(current, slotId))}
          {...(keySignature === undefined ? {} : { keySignature })}
          language={language}
          showConfidenceReview={showConfidenceReview}
          {...(allowStructuralEdits ? {
            contextActions: {
              canCutRange: (slotId: string) => {
                const index = editable.slots.findIndex((slot) => slot.id === slotId);
                return index >= 0 && index < editable.slots.length - 1;
              },
              onAction: runContextAction,
            },
          } : {})}
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

      {allowRangeAdjustment ? <DraftBoundaryHandles
        draft={draft}
        language={language}
        onChange={applyHistoryDraft}
      /> : null}

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

      <div className="mt-3" data-testid="draft-voicing">
        <VoicingSourceChip
          status={voicingSource.status}
          reason={voicingSource.reason}
          sourceAbsentByDesign={draft.source.type === "text-progression"}
          language={language}
          testId="capture-voicing-source-chip"
        />
      </div>

      <CaptureEditHistoryPanel
        draft={draft}
        language={language}
        onJump={(historyIndex) => applyHistoryDraft(
          jumpCaptureDraftHistory(draft, historyIndex),
        )}
      />

      <div className="mt-4 flex flex-wrap items-start gap-2">
        <button
          type="button"
          data-action="preview"
          className="min-h-10 border border-[var(--lv-border)] px-4 text-sm"
          onClick={() => onPreview?.(draft)}
        >
          {text.preview}
        </button>
        {save === undefined || !validation.canSave ? (
          <button
            type="button"
            data-action="save"
            disabled={!validation.canSave}
            className="lv-button-primary min-h-10 px-4 disabled:opacity-40"
            onClick={() => {
              // Without a Vault target the editor is still usable on its own —
              // the screen that mounted it decides what saving means.
              if (save === undefined) onSave?.(draft);
              else save.onCreate(draft, text.defaultTitle, "", false);
            }}
          >
            {text.save}
          </button>
        ) : (
          // The same popover the automatic candidates use, so a manual block is
          // saved by the path everything else is saved by rather than a second
          // one that would have to be kept in step with it.
          <SaveProgressionPopover
            initialTitle={save.initialTitle}
            ideas={save.ideas}
            defaultNextAction={save.defaultNextAction}
            copy={copy}
            onCreate={(title, nextAction, userVerified) => (
              save.onCreate(draft, title, nextAction, userVerified)
            )}
            onAppend={(ideaId, userVerified) => save.onAppend(draft, ideaId, userVerified)}
            onCopyMemo={() => false}
            onSaved={() => onSave?.(draft)}
          />
        )}
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

function isNativeEditTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target.isContentEditable;
}
