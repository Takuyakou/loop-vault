import { useState, type MutableRefObject } from "react";
import type { ToastFn } from "../../components/notifications";
import { buildCorrectionEvents } from "../../domain/midi";
import {
  buildProgressionSaveFeedbackEvent,
  type CorrectionPropagationFeedbackEvent,
  type PersistedAnalysisFeedbackEvent,
} from "../../domain/midi/analysisFeedback";
import { buildLabelCorrectionLogs } from "../../domain/midi/labelCorrectionLog";
import { hasProgressionEdits, type EditableProgression } from "../../domain/progressionEditing";
import type { SourceBasslineSnapshotV1 } from "../../domain/sourceBassline";
import type { MidiProgressionAnalysis, ProgressionBlockCandidate, Status } from "../../domain/types";
import type { AppCopy } from "../../i18n";
import { appendAnalysisFeedback } from "../../storage/analysisFeedbackStorage";
import { appendLabelCorrectionLogs } from "../../storage/labelCorrectionLogStorage";
import type { AnalysisState, ProgressionSaveMetadata } from "../../store/vaultStore";

type CreateIdeaFromDraft = (draft: {
  title: string;
  status?: Status;
  bpm?: number;
  key?: string;
  chordMemo?: string;
  nextAction?: string;
  progressionBlock?: ProgressionBlockCandidate;
  progressionAnalysis?: MidiProgressionAnalysis;
  progressionMetadata?: ProgressionSaveMetadata;
}, options?: { stayOnCapture?: boolean }) => string | undefined;

type AppendBlockToIdea = (
  ideaId: string,
  block: ProgressionBlockCandidate,
  analysis?: MidiProgressionAnalysis,
  metadata?: ProgressionSaveMetadata,
) => boolean;

/**
 * Capture save: a new Idea or an existing one, the correction records that go
 * with it, and the save notices and errors. Moved out of CaptureView unchanged
 * (P10.0-02); the new workspace will save through the same two functions.
 */
export function useCaptureSave({
  analysis,
  createIdeaFromDraft,
  appendBlockToIdea,
  sourcePath,
  setToast,
  copy,
  mountedRef,
}: {
  analysis: AnalysisState;
  createIdeaFromDraft: CreateIdeaFromDraft;
  appendBlockToIdea: AppendBlockToIdea;
  sourcePath: string | undefined;
  setToast: ToastFn;
  copy: AppCopy;
  mountedRef: MutableRefObject<boolean>;
}) {
  const captureViewMountedRef = mountedRef;
  const [persistenceError, setPersistenceError] = useState<string>();

  function confirmAggregateSourceBasslineOmission(): boolean {
    return globalThis.confirm("元ベースラインを含めるとVault全体が16 MiBを超えます。コード進行だけを保存しますか？");
  }
  function announcePersistenceError(message: string): void {
    queueMicrotask(() => {
      if (!captureViewMountedRef.current) return;
      setPersistenceError(message);
      setToast(message, "error");
    });
  }
  function saveNew(
    candidate: ProgressionBlockCandidate,
    title: string,
    nextAction: string,
    userVerified: boolean,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
    userEditedOverride?: boolean,
    sourceBassline?: SourceBasslineSnapshotV1,
    options?: { stayOnCapture?: boolean },
  ): boolean {
    setPersistenceError(undefined);
    const corrections = correctionEvents(original, candidate, editable);
    const userEdited = userEditedOverride ?? hasProgressionEdits(editable);
    // The workspace stays on the capture screen after saving; the old screen's call is unchanged.
    const create = (draft: Parameters<CreateIdeaFromDraft>[0]) => options ? createIdeaFromDraft(draft, options) : createIdeaFromDraft(draft);
    const id = create({
      title,
      status: "idea",
      bpm: analysis.result?.tempoDiagnostics?.provenance === "SMF_DEFAULT"
        ? undefined : analysis.result?.bpm,
      key: analysis.result?.detectedKey,
      chordMemo: candidate.summaryText,
      nextAction,
      progressionBlock: candidate,
      progressionAnalysis: analysis.result,
      progressionMetadata: { sourcePath, userEdited, userVerified, onPersistenceError: announcePersistenceError, ...(sourceBassline ? { sourceBassline, confirmSourceBasslineOmission: confirmAggregateSourceBasslineOmission } : {}) },
    });
    if (id) {
      persistCorrectionEvents([
        ...corrections,
        ...propagationEvents,
        ...progressionSaveFeedback(
          original,
          candidate,
          editable,
          userEdited,
          userVerified,
        ),
      ]);
      persistLabelCorrectionLogs(original, editable);
      setToast(copy.capture.savedToVault, "success");
      return true;
    }
    setToast(copy.capture.createFailed, "error");
    return false;
  }

  function correctionEvents(
    original: ProgressionBlockCandidate,
    edited: ProgressionBlockCandidate,
    editable: EditableProgression,
  ) {
    if (!analysis.result) {
      return [];
    }
    return buildCorrectionEvents(
      original,
      edited,
      analysis.result,
      editable.slots.map((slot) => slot.editSource),
      editable.slots.map((slot) => slot.quickCandidateSelection),
    );
  }

  function persistCorrectionEvents(events: readonly PersistedAnalysisFeedbackEvent[]) {
    if (events.length === 0) {
      return;
    }
    void appendAnalysisFeedback(events)
      .catch((error) => setToast(error instanceof Error ? error.message : copy.capture.feedbackSaveFailed, "error"));
  }

  function progressionSaveFeedback(
    original: ProgressionBlockCandidate,
    saved: ProgressionBlockCandidate,
    editable: EditableProgression,
    userEdited: boolean,
    userVerified: boolean,
  ): PersistedAnalysisFeedbackEvent[] {
    if (!analysis.result) return [];
    const event = buildProgressionSaveFeedbackEvent(
      original,
      saved,
      analysis.result,
      editable.slots.map((slot) => slot.editSource),
      {
        occurredAt: new Date().toISOString(),
        userEdited,
        userVerified,
      },
    );
    return event ? [event] : [];
  }

  function persistLabelCorrectionLogs(
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
  ) {
    if (!analysis.result) return;
    const events = buildLabelCorrectionLogs(original, editable, analysis.result, {
      analyzerMode: "phase4-v1",
      occurredAt: new Date().toISOString(),
    });
    void appendLabelCorrectionLogs(events)
      .catch(() => setToast(copy.capture.feedbackSaveFailed, "error"));
  }

  function appendExisting(
    candidate: ProgressionBlockCandidate,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    ideaId: string,
    userVerified: boolean,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
    userEditedOverride?: boolean,
    sourceBassline?: SourceBasslineSnapshotV1,
  ): boolean {
    setPersistenceError(undefined);
    if (!ideaId) {
      setToast(copy.capture.chooseIdeaFirst);
      return false;
    }

    const appended = appendBlockToIdea(ideaId, candidate, analysis.result, {
      sourcePath,
      userEdited: userEditedOverride ?? hasProgressionEdits(editable),
      userVerified,
      onPersistenceError: announcePersistenceError,
      ...(sourceBassline ? { sourceBassline, confirmSourceBasslineOmission: confirmAggregateSourceBasslineOmission } : {}),
    });
    if (appended) {
      const userEdited = userEditedOverride ?? hasProgressionEdits(editable);
      persistCorrectionEvents([
        ...correctionEvents(original, candidate, editable),
        ...propagationEvents,
        ...progressionSaveFeedback(
          original,
          candidate,
          editable,
          userEdited,
          userVerified,
        ),
      ]);
      persistLabelCorrectionLogs(original, editable);
      setToast(copy.toast.blockSaved, "success");
      return true;
    }
    setToast(copy.capture.appendFailed, "error");
    return false;
  }

  return { persistenceError, saveNew, appendExisting };
}
