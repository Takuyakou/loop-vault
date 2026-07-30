import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  open as openFileDialog,
} from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { OccurrenceList } from "../components/OccurrenceList";
import {
  buildCatalogView, catalogPageSize, laneCandidate, laneRenderPlan, type CatalogLaneKind,
} from "../domain/midi/catalogView";
import type { CandidateOccurrence, CandidatePattern } from "../domain/midi/occurrence";
import type { Section } from "../domain/midi/sections";
import {
  resolveVoicingForUse,
  timelineVoicingSourceStatus,
} from "../domain/voicing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  applyEditableProgression,
  canRedoProgressionEdit,
  canMergeEditableChords,
  canSplitEditableChord,
  canUndoProgressionEdit,
  buildSimilarityContext,
  buildAuthorReferenceIndex,
  chordsEqual,
  createEditableProgression,
  deleteEditableChordWithMode,
  deleteEditableChord,
  findSimilarSegments,
  hasProgressionEdits,
  progressionEditSummary,
  quickCandidatesForSlot,
  mergeEditableChords,
  redoProgressionEdit,
  replaceEditableChord,
  replaceEditableChords,
  resetAllEditableChords,
  resetEditableChord,
  selectedEditableSlotIndex,
  selectEditableSlot,
  splitEditableChord,
  undoProgressionEdit,
  SIMILAR_SEGMENT_THRESHOLD,
} from "../domain/progressionEditing";
import type {
  ChordContextAction,
  EditableChordSlot,
  EditableProgression,
  AuthorReferenceIndex,
  SimilarSegmentCandidate,
  SimilarityContext,
  SimilarityVoiceContext,
} from "../domain/progressionEditing";
import {
  addMidiSources,
  beatsPerBar as beatsPerBarFor,
  buildRoleCorrectionLogEvents,
  buildSessionAnalysisRequest,
  buildCorrectionEvents,
  createAnalysisSession,
  removeMidiSource,
  type AnalysisSession,
  type MidiSourceInput,
} from "../domain/midi";
import { buildLabelCorrectionLogs } from "../domain/midi/labelCorrectionLog";
import type { AnalysisInput, AnalyzeMidiOptions } from "../domain/midi/types";
import {
  buildProgressionSaveFeedbackEvent,
  type CorrectionPropagationFeedbackEvent,
  type PersistedAnalysisFeedbackEvent,
} from "../domain/midi/analysisFeedback";
import { candidateLabelList } from "../domain/displayLabels";
import { romanNumeralHint } from "../domain/harmony/romanNumerals";
import { formatProgressionText } from "../domain/progressionText";
import type {
  ChordSymbol,
  ChordTimelineItem,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
  SongIdea,
  Status,
} from "../domain/types";
import type { AnalysisState, ProgressionSaveMetadata } from "../store/vaultStore";
import { progressionEditorCopy, type AppCopy, type AppLanguage } from "../i18n";
import { ProgressionGrid, timelineStartBeat } from "../ui/ProgressionGrid";
import { chordProgressFraction } from "../ui/playbackProgress";
import { confidenceLabel, shouldShowConfidence, warningLabel } from "./captureLabels";
import { appendAnalysisFeedback } from "../storage/analysisFeedbackStorage";
import { appendLabelCorrectionLogs } from "../storage/labelCorrectionLogStorage";
import { appendRoleCorrectionLog } from "../storage/roleCorrectionLogStorage";
import {
  getAnalysisProfileAnalyzeOptions,
  getAnalysisProfileSettings,
} from "../storage/accuracyFirstSettings";
import {
  getPreAnalysisSourceSelectionSettings,
  shouldOpenPreAnalysis,
} from "../storage/preAnalysisSettings";
import type { PreviewSound } from "../audio/chordPreview";
import {
  playbackController,
  samePlaybackSource,
  type PlaybackController,
  type PlayingSource,
} from "../audio/playbackController";
import { ChordInspector } from "../components/progression-editing/ChordInspector";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PlayToggle } from "../components/PlayToggle";
import { PreviewSoundSelector } from "../components/PreviewSoundSelector";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { SaveProgressionPopover } from "../components/SaveProgressionPopover";
import { VoicingSourceChip } from "../components/voicing/VoicingSourceChip";
import { SongMiniMap } from "../components/SongMiniMap";
import { EditableProgressionGrid } from "../components/progression-editing/EditableProgressionGrid";
import { TimelineRangeSelector } from "../components/TimelineRangeSelector";
import { ManualCandidateEditor, type ManualDraftSaveTarget } from "../components/ManualCandidateEditor";
import {
  applyEditableToDraft,
  draftEditable,
  draftToCandidate,
} from "../domain/midi/manualDraftEditing";
import {
  draftHasMidiSourcePreview,
  draftPreviewTimeline,
  draftSourcePreviewTimeline,
} from "../domain/midi/manualDraftPlayback";
import {
  createManualDraft,
  createDraftFromCandidate,
  draftHasMusicEdits,
  fingerprintTimeline,
  type ManualCandidateDraft,
} from "../domain/midi/manualDraft";
import type { TimelineRange } from "../domain/midi/manualRange";
import {
  canRedoCaptureDraft,
  canUndoCaptureDraft,
  jumpCaptureDraftHistory,
  redoCaptureDraft,
  undoCaptureDraft,
} from "../domain/midi/captureEditHistory";
import { CaptureEditHistoryPanel } from "../components/CaptureEditHistoryPanel";
import { DraftBoundaryHandles } from "../components/DraftBoundaryHandles";
import { CaptureDraftSessionBar } from "../components/CaptureDraftSessionBar";
import { PreAnalysisWorkspace } from "../components/pre-analysis/PreAnalysisWorkspace";
import { preferredScrollBehavior } from "../ui/motion";
import { cutDraftRangeAtEvent } from "../domain/midi/draftRangeEditing";
import { ProgressionEditorToolbar } from "../components/progression-editing/ProgressionEditorToolbar";
import { ProgressionEditSummary } from "../components/progression-editing/ProgressionEditSummary";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { Copy, FileMusic } from "lucide-react";
import { Button, StatusMessage } from "../components/ui";

interface CaptureViewProps {
  ideas: SongIdea[];
  analysis: AnalysisState;
  analyzeMidiBytes: (
    bytes: Uint8Array,
    options?: AnalyzeMidiOptions,
  ) => MidiProgressionAnalysis | undefined;
  clearAnalysis: () => void;
  createIdeaFromDraft: (draft: {
    title: string;
    status?: Status;
    bpm?: number;
    key?: string;
    chordMemo?: string;
    nextAction?: string;
    progressionBlock?: ProgressionBlockCandidate;
    progressionAnalysis?: MidiProgressionAnalysis;
    progressionMetadata?: ProgressionSaveMetadata;
  }) => string | undefined;
  appendBlockToIdea: (
    ideaId: string,
    block: ProgressionBlockCandidate,
    analysis?: MidiProgressionAnalysis,
    metadata?: ProgressionSaveMetadata,
  ) => boolean;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
  controller?: PlaybackController;
  analysisInput?: AnalysisInput;
}

export function CaptureView(props: CaptureViewProps) {
  const {
    ideas,
    analysis,
    analyzeMidiBytes,
    clearAnalysis,
    createIdeaFromDraft,
    appendBlockToIdea,
    updateIdea,
    setToast,
    copy,
    language,
    showRomanNumerals,
    controller = playbackController,
    analysisInput,
  } = props;
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string>();
  /**
   * How many cards each lane has rendered, and which collapsed lanes are open.
   *
   * The catalog holds everything; these decide how much of it is in the DOM right
   * now. Keeping them separate from the catalog is what stops a rendering limit
   * becoming a data limit — a 1777-pattern file renders 25 cards and can reach
   * all 1777.
   */
  const [laneLimits, setLaneLimits] = useState<Record<string, number>>({});
  const [openLanes, setOpenLanes] = useState<Record<string, boolean>>({});
  const [isInspectorExpanded, setInspectorExpanded] = useState(false);
  const [inspectorHost, setInspectorHost] = useState<HTMLDivElement | null>(null);
  const [dirtyCandidateIds, setDirtyCandidateIds] = useState<Set<string>>(() => new Set());
  const [pendingCandidateSelection, setPendingCandidateSelection] = useState<{
    candidateId: string | undefined;
    revealTimeline?: boolean;
    focusCandidate?: boolean;
    closeDraft?: boolean;
    manualRange?: TimelineRange;
  }>();
  const [isTimelineOpen, setTimelineOpen] = useState(false);
  const [timelineScrollBar, setTimelineScrollBar] = useState<number>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [preAnalysisSession, setPreAnalysisSession] = useState<AnalysisSession>();
  const [intakeError, setIntakeError] = useState<string>();
  const { sound: previewSound, setSound: setPreviewSound } = usePreviewSound();
  const [activeDraft, setActiveDraft] = useState<ManualCandidateDraft | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<CaptureAnalysisProgressStage>();
  const [rangeSelectorRequest, setRangeSelectorRequest] = useState(0);
  const candidateHeaderFocusIdRef = useRef<string>();
  const result = analysis.result;
  const capturePlayback = usePlaybackState(controller);
  const authorReferenceIndex = useMemo(() => buildAuthorReferenceIndex(ideas), [ideas]);
  const analysisTargetLabel = useMemo(() => preAnalysisSession?.voices
    .filter((voice) =>
      voice.included
      && !voice.duplicateOf
      && voice.assignedRole !== "exclude")
    .map((voice) => voice.displayName)
    .join(" / "), [preAnalysisSession]);

  useStickyInspectorHeight(inspectorHost, Boolean(expandedCandidateId));

  useEffect(() => {
    const candidateId = candidateHeaderFocusIdRef.current;
    if (expandedCandidateId || !candidateId) return;
    const header = [...document.querySelectorAll<HTMLButtonElement>("[data-candidate-toggle]")]
      .find((button) => button.dataset.candidateId === candidateId);
    header?.focus();
    candidateHeaderFocusIdRef.current = undefined;
  }, [expandedCandidateId]);

  const markCandidateDirty = useCallback((candidateId: string, dirty: boolean) => {
    setDirtyCandidateIds((current) => {
      if (current.has(candidateId) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }, []);

  function selectExpandedCandidate(
    candidateId: string | undefined,
    options?: { revealTimeline?: boolean; focusCandidate?: boolean },
  ): boolean {
    const changingDraft = activeDraft !== null
      && draftHasMusicEdits(activeDraft)
      && (
        activeDraft.source.type === "manual-range"
        || activeDraft.source.candidateId !== candidateId
      );
    const rangeOnlyDraftOwnsExpandedCandidate = activeDraft?.source.type === "automatic-candidate"
      && activeDraft.source.candidateId === expandedCandidateId
      && !draftHasMusicEdits(activeDraft);
    if (
      changingDraft
      || (
        expandedCandidateId
        && expandedCandidateId !== candidateId
        && dirtyCandidateIds.has(expandedCandidateId)
        && !rangeOnlyDraftOwnsExpandedCandidate
      )
    ) {
      setPendingCandidateSelection({
        candidateId,
        revealTimeline: options?.revealTimeline,
        focusCandidate: options?.focusCandidate,
      });
      return false;
    }
    applyCandidateSelection(candidateId);
    if (candidateId && options?.revealTimeline) {
      revealCandidateInTimeline(candidateId);
    }
    if (candidateId && options?.focusCandidate) {
      focusCandidateCard(candidateId);
    }
    return true;
  }

  function revealCandidateInTimeline(candidateId: string) {
    const candidate = result?.blockCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    setTimelineOpen(true);
    setTimelineScrollBar(candidate.startBar);
  }

  function focusCandidateCard(candidateId: string) {
    const target = [...document.querySelectorAll<HTMLButtonElement>("[data-candidate-toggle]")]
      .find((button) => button.dataset.candidateId === candidateId);
    target?.scrollIntoView?.({ behavior: preferredScrollBehavior(), block: "start" });
    target?.focus();
  }

  function applyCandidateSelection(candidateId: string | undefined) {
    stopCapturePlayback(controller);
    if (!candidateId && expandedCandidateId) {
      candidateHeaderFocusIdRef.current = expandedCandidateId;
    }
    if (candidateId !== expandedCandidateId) {
      setInspectorExpanded(false);
    }
    setExpandedCandidateId(candidateId);
  }

  const analyzeMidiBytesWithToast = useCallback(
    async (
      bytes: Uint8Array,
      fileName: string,
      optionOverrides: AnalyzeMidiOptions = {},
    ) => {
      stopCapturePlayback(controller);
      setAnalysisProgress("analyzing");
      await waitForNextPaint();
      const analyzed = analyzeMidiBytes(bytes, {
        fileName,
        ...getAnalysisProfileAnalyzeOptions(),
        ...optionOverrides,
      });
      setAnalysisProgress("finalizing");
      await waitForNextPaint();
      setActiveDraft(null);
      setExpandedCandidateId(undefined);
      setToast(analyzed ? copy.toast.midiAnalyzed : copy.toast.midiFailed);
      await waitForStatusFeedback();
      setAnalysisProgress(undefined);
      return Boolean(analyzed);
    },
    [analyzeMidiBytes, controller, copy.toast.midiAnalyzed, copy.toast.midiFailed, setToast],
  );

  const prepareMidiInputs = useCallback(
    async (
      inputs: readonly MidiSourceInput[],
      options: { append?: boolean; sourcePath?: string } = {},
    ) => {
      stopCapturePlayback(controller);
      setAnalysisProgress("reading");
      await waitForNextPaint();
      const intake = options.append && preAnalysisSession
        ? addMidiSources(preAnalysisSession, inputs)
        : createAnalysisSession(inputs);
      if (!intake.session) {
        setAnalysisProgress(undefined);
        const issue = intake.issues[0];
        const message = issue?.message ?? copy.toast.midiReadFailed;
        setIntakeError(message);
        setToast(message);
        return;
      }
      setIntakeError(undefined);
      if (
        !options.append
        && !shouldOpenPreAnalysis(
          getAnalysisProfileSettings().profile,
          getPreAnalysisSourceSelectionSettings(),
          intake.session,
        )
      ) {
        setPreAnalysisSession(undefined);
        setSourcePath(options.sourcePath);
        setAnalysisProgress(undefined);
        await analyzeMidiBytesWithToast(
          inputs[0].bytes,
          inputs[0].displayName,
        );
        return;
      }
      clearAnalysis();
      setPreAnalysisSession(intake.session);
      if (!options.append) {
        setSourcePath(options.sourcePath);
      }
      setActiveDraft(null);
      setExpandedCandidateId(undefined);
      setAnalysisProgress(undefined);
      if (intake.issues.length) {
        setToast(intake.issues[0].message);
      }
    },
    [
      clearAnalysis,
      controller,
      copy.toast.midiReadFailed,
      analyzeMidiBytesWithToast,
      preAnalysisSession,
      setToast,
    ],
  );

  const analyzeMidiPath = useCallback(
    async (paths: readonly string[], append = false) => {
      const midiPaths = paths.filter(isMidiFileName);
      if (!midiPaths.length) {
        setToast(copy.toast.midiDropInvalid);
        return;
      }

      try {
        setAnalysisProgress("reading");
        await waitForNextPaint();
        const inputs = await Promise.all(midiPaths.map(async (path): Promise<MidiSourceInput> => ({
          bytes: await readFile(path),
          displayName: fileNameFromPath(path),
        })));
        await prepareMidiInputs(inputs, {
          append,
          sourcePath: append ? undefined : midiPaths[0],
        });
      } catch (error) {
        setAnalysisProgress(undefined);
        const message = error instanceof Error ? error.message : copy.toast.midiReadFailed;
        setIntakeError(message);
        setToast(message);
      }
    },
    [copy.toast.midiDropInvalid, copy.toast.midiReadFailed, prepareMidiInputs, setToast],
  );

  const analyzeDroppedFile = useCallback(
    async (files: readonly File[], append = false) => {
      const midiFiles = files.filter((file) => isMidiFileName(file.name));
      if (!midiFiles.length) {
        setToast(copy.toast.midiDropInvalid);
        return;
      }

      try {
        setAnalysisProgress("reading");
        await waitForNextPaint();
        const inputs = await Promise.all(midiFiles.map(async (file): Promise<MidiSourceInput> => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          displayName: file.name,
        })));
        await prepareMidiInputs(inputs, { append });
      } catch (error) {
        setAnalysisProgress(undefined);
        const message = error instanceof Error ? error.message : copy.toast.midiReadFailed;
        setIntakeError(message);
        setToast(message);
      }
    },
    [copy.toast.midiDropInvalid, copy.toast.midiReadFailed, prepareMidiInputs, setToast],
  );

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return undefined;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDraggingMidi(true);
          return;
        }

        if (event.payload.type === "leave") {
          setIsDraggingMidi(false);
          return;
        }

        setIsDraggingMidi(false);
        const paths = event.payload.paths.filter(isMidiFileName);
        if (!paths.length) {
          setToast(copy.toast.midiDropInvalid);
          return;
        }

        void analyzeMidiPath(paths, Boolean(preAnalysisSession));
      })
      .then((listener) => {
        if (disposed) {
          listener();
          return;
        }

        unlisten = listener;
      })
      .catch(() => {
        setIsDraggingMidi(false);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [analyzeMidiPath, copy.toast.midiDropInvalid, preAnalysisSession, setToast]);

  async function chooseMidi(append = false) {
    stopCapturePlayback(controller);
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.desktopMidiOnly);
      return;
    }

    const path = await openFileDialog({
      multiple: append
        || getPreAnalysisSourceSelectionSettings()
          .enablePreAnalysisSourceSelection,
      filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
    });
    if (!path) {
      return;
    }

    await analyzeMidiPath(
      typeof path === "string" ? [path] : path,
      append,
    );
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasDroppedFiles(event)) {
      return;
    }

    event.preventDefault();
    setIsDraggingMidi(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasDroppedFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingMidi(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDraggingMidi(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasDroppedFiles(event)) {
      return;
    }

    event.preventDefault();
    setIsDraggingMidi(false);
    const files = Array.from(event.dataTransfer.files).filter((item) =>
      isMidiFileName(item.name));
    if (!files.length) {
      setToast(copy.toast.midiDropInvalid);
      return;
    }

    void analyzeDroppedFile(files, Boolean(preAnalysisSession));
  }

  const dropHandlers = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  useEffect(() => {
    if (!activeDraft) return undefined;
    const keyboardDraft: ManualCandidateDraft = activeDraft;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isEditableKeyboardTarget(event.target)
      ) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (controller.getState().source?.kind !== "capture") return;
        event.preventDefault();
        stopCapturePlayback(controller);
      } else if (key === "a" && draftHasMidiSourcePreview(keyboardDraft)) {
        event.preventDefault();
        void previewSourceDraft(keyboardDraft);
      } else if (key === "b") {
        event.preventDefault();
        void previewManualDraft(keyboardDraft);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeDraft, controller, previewSound, result?.bpm, result?.timeSignature]);

  function saveNew(
    candidate: ProgressionBlockCandidate,
    title: string,
    nextAction: string,
    userVerified: boolean,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
    userEditedOverride?: boolean,
  ): boolean {
    const corrections = correctionEvents(original, candidate, editable);
    const userEdited = userEditedOverride ?? hasProgressionEdits(editable);
    const id = createIdeaFromDraft({
      title,
      status: "idea",
      bpm: analysis.result?.bpm,
      key: analysis.result?.detectedKey,
      chordMemo: candidate.summaryText,
      nextAction,
      progressionBlock: candidate,
      progressionAnalysis: analysis.result,
      progressionMetadata: { sourcePath, userEdited, userVerified },
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
      setToast(copy.capture.savedToVault);
      return true;
    }
    setToast(copy.capture.createFailed);
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
      .catch((error) => setToast(error instanceof Error ? error.message : copy.capture.feedbackSaveFailed));
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
      .catch(() => setToast(copy.capture.feedbackSaveFailed));
  }

  function appendExisting(
    candidate: ProgressionBlockCandidate,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    ideaId: string,
    userVerified: boolean,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
    userEditedOverride?: boolean,
  ): boolean {
    if (!ideaId) {
      setToast(copy.capture.chooseIdeaFirst);
      return false;
    }

    const appended = appendBlockToIdea(ideaId, candidate, analysis.result, {
      sourcePath,
      userEdited: userEditedOverride ?? hasProgressionEdits(editable),
      userVerified,
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
      setToast(copy.toast.blockSaved);
      return true;
    }
    setToast(copy.capture.appendFailed);
    return false;
  }

  function copyMemo(candidate: ProgressionBlockCandidate, ideaId: string): boolean {
    const idea = ideas.find((entry) => entry.id === ideaId);
    if (!idea) {
      setToast(copy.capture.chooseIdeaFirst);
      return false;
    }

    updateIdea(ideaId, {
      chordMemo: appendProgressionMemo(idea.chordMemo, formatProgressionText(candidate.chords)),
    });
    setToast(copy.toast.blockCopied);
    return true;
  }

  async function copyProgression(candidate: ProgressionBlockCandidate) {
    try {
      await writeClipboardText(formatProgressionText(candidate.chords));
      setToast(copy.capture.copiedProgression);
    } catch {
      setToast(copy.capture.copyFailed);
    }
  }

  /**
   * Auditions a manual draft.
   *
   * Plays the same event list the save path stores, so what the user hears
   * before saving is what they get afterwards. Voicings resolve by the product's
   * existing rule: the captured one where it still fits the chord, a generated
   * one where an edit made it no longer fit.
   */
  async function previewManualDraft(draft: ManualCandidateDraft) {
    try {
      await controller.toggle(
        { kind: "capture", id: `capture-manual-draft:${draft.draftId}` },
        {
          type: "timeline",
          timeline: draftPreviewTimeline(draft),
          bpm: result?.bpm ?? 96,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function previewCandidate(candidate: ProgressionBlockCandidate) {
    try {
      await controller.toggle(
        captureCandidateSource(result, candidate.id),
        {
          type: "timeline",
          timeline: candidate.chords,
          bpm: result?.bpm,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  /**
   * Auditions one appearance of a progression.
   *
   * Plays that occurrence's own events, so the second chorus sounds like the
   * second chorus rather than replaying the one the card happens to show.
   */
  async function previewOccurrence(occurrence: CandidateOccurrence) {
    try {
      await controller.toggle(
        { kind: "capture", id: `capture-occurrence:${occurrence.id}` },
        {
          type: "timeline",
          timeline: occurrence.events.map((event) => event.source),
          bpm: result?.bpm ?? 96,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function previewCandidateChord(candidate: ProgressionBlockCandidate, chordIndex: number) {
    try {
      const event = candidate.chords[chordIndex];
      const chord = event?.chord;
      if (chord) {
        await controller.toggle(
          {
            kind: "capture",
            id: `${captureCandidateSource(result, candidate.id).id}:chord:${chordIndex}:${chord.label}`,
          },
          {
            type: "chord",
            chord,
            sound: previewSound,
            explicitMidiNotes: singleChordVoicing(event),
          },
        );
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  if (!result) {
    if (preAnalysisSession) {
      const master = preAnalysisSession.sources.find((source) =>
        source.id === preAnalysisSession.masterSourceId)
        ?? preAnalysisSession.sources[0];
      return (
        <div
          data-capture-stage="pre-analysis"
          data-capture-midi-drop-zone
          {...dropHandlers}
        >
          {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
          <PreAnalysisWorkspace
            session={preAnalysisSession}
            language={language}
            busy={analysisProgress !== undefined}
            onSessionChange={setPreAnalysisSession}
            onAddMidi={() => void chooseMidi(true)}
            onRemoveSource={(sourceId) => {
              const next = removeMidiSource(preAnalysisSession, sourceId);
              if (next) setPreAnalysisSession(next);
            }}
            onAnalyze={() => {
              if (!master) return;
              try {
                const request = buildSessionAnalysisRequest(preAnalysisSession);
                const roleEvents = buildRoleCorrectionLogEvents(
                  preAnalysisSession,
                  new Date().toISOString(),
                );
                void analyzeMidiBytesWithToast(
                  request.bytes,
                  request.fileName,
                  request.options,
                ).then((analyzed) => {
                  if (!analyzed) return;
                  void appendRoleCorrectionLog(roleEvents)
                    .catch(() => undefined);
                });
              } catch (error) {
                setToast(error instanceof Error
                  ? error.message
                  : copy.toast.midiFailed);
              }
            }}
          />
        </div>
      );
    }
    return (
      <div
        className="py-5"
        data-capture-stage="empty"
        data-capture-midi-drop-zone
        {...dropHandlers}
      >
        <CaptureEmptyState
          status={intakeError ? "error" : analysis.status}
          error={intakeError ?? analysis.error}
          onChooseMidi={() => void chooseMidi(false)}
          isDraggingMidi={isDraggingMidi}
          copy={copy}
          progressStage={analysisProgress}
        />
      </div>
    );
  }

  const laneMeter = beatsPerBarFor(result.timeSignature);
  const catalogView = result.candidateCatalog !== undefined
    && result.candidateRecommendation !== undefined
    ? buildCatalogView(result.candidateCatalog, result.candidateRecommendation)
    : undefined;

  const laneHeading = (kind: CatalogLaneKind): string => {
    if (kind === "recommended") return copy.capture.lanes.recommended;
    if (kind === "progression") return copy.capture.lanes.allProgressions;
    if (kind === "vamp") return copy.capture.lanes.vamp;
    if (kind === "fragment") return copy.capture.lanes.fragment;
    return copy.capture.lanes.uncertain;
  };
  const laneNote = (kind: CatalogLaneKind): string | null => {
    if (kind === "vamp") return copy.capture.lanes.vampNote;
    if (kind === "fragment") return copy.capture.lanes.fragmentNote;
    if (kind === "uncertain") return copy.capture.lanes.uncertainNote;
    return null;
  };

  const toggleLane = (key: string) => setOpenLanes(
    (open) => ({ ...open, [key]: !(open[key] ?? false) }),
  );
  const showMoreInLane = (key: string) => setLaneLimits((limits) => ({
    ...limits,
    [key]: (limits[key] ?? catalogPageSize) + catalogPageSize,
  }));

  /**
   * The lanes as rendered.
   *
   * When the analyzer produced a catalog the lanes come from it; otherwise the
   * old shortlist path is used unchanged, so a mode without a catalog behaves
   * exactly as before.
   */
  const displayLanes = catalogView !== undefined
    ? catalogView.lanes.map((lane, laneIndex) => {
      const key = `${lane.kind}-${laneIndex}`;
      const open = openLanes[key] ?? !lane.initiallyCollapsed;
      const limit = laneLimits[key] ?? catalogView.pageSize;
      const plan = laneRenderPlan(lane, { open, limit });
      let offset = 0;
      for (const earlier of catalogView.lanes.slice(0, laneIndex)) offset += earlier.entries.length;
      return {
        key,
        kind: lane.kind,
        heading: catalogView.mode === "unified"
          ? copy.capture.lanes.unified(lane.totalCount)
          : laneHeading(lane.kind),
        note: catalogView.mode === "unified" ? null : laneNote(lane.kind),
        totalCount: lane.totalCount,
        recommendedElsewhere: lane.recommendedElsewhere,
        collapsible: lane.initiallyCollapsed,
        open,
        remaining: plan.remaining,
        visible: plan.visible.map((entry, index) => ({
          candidate: laneCandidate(entry, laneMeter),
          index: offset + index,
        })),
      };
    })
    : candidateLanes(result.blockCandidates).map((lane, laneIndex) => ({
      key: `${lane.kind}-${laneIndex}`,
      kind: lane.kind as CatalogLaneKind,
      heading: lane.heading === null ? null : copy.capture.lanes[lane.kind],
      note: lane.kind === "progression" ? null : laneNote(lane.kind),
      totalCount: lane.candidates.length,
      recommendedElsewhere: 0,
      collapsible: false,
      open: true,
      remaining: 0,
      visible: lane.candidates,
    }));

  function openCandidateDraft(candidate: ProgressionBlockCandidate) {
    if (!result) return;
    if (
      activeDraft?.source.type === "automatic-candidate"
      && activeDraft.source.candidateId === candidate.id
    ) {
      applyCandidateSelection(candidate.id);
      return;
    }
    const pattern = result.candidatePatterns?.find((entry) => entry.occurrences.some(
      (occurrence) => occurrence.id === candidate.id
        || occurrence.sourceCandidateId === candidate.id,
    ));
    const occurrence = pattern?.occurrences.find(
      (entry) => entry.id === candidate.id || entry.sourceCandidateId === candidate.id,
    );
    stopCapturePlayback(controller);
    setActiveDraft(createDraftFromCandidate({
      candidate,
      timelineFingerprint: fingerprintTimeline(result.fullTimeline, laneMeter),
      beatsPerBar: laneMeter,
      ...(pattern === undefined ? {} : { patternId: pattern.patternId }),
      ...(occurrence === undefined ? {} : { occurrenceId: occurrence.id }),
    }));
    applyCandidateSelection(candidate.id);
  }

  function openManualRangeDraft(range: TimelineRange) {
    if (!result) return;
    try {
      stopCapturePlayback(controller);
      setActiveDraft(createManualDraft({
        timeline: result.fullTimeline,
        range,
        beatsPerBar: laneMeter,
      }));
      applyCandidateSelection(undefined);
    } catch {
      setToast(language === "ja"
        ? "この範囲から採集候補を作成できませんでした。"
        : "A capture draft could not be created from this range.");
    }
  }

  function requestManualRangeDraft(range: TimelineRange) {
    if (activeDraft?.isDirty) {
      setPendingCandidateSelection({
        candidateId: undefined,
        manualRange: range,
      });
      return;
    }
    openManualRangeDraft(range);
  }

  function focusActiveDraftEditor() {
    const candidateId = activeDraft?.source.type === "automatic-candidate"
      ? activeDraft.source.candidateId
      : undefined;
    const target = candidateId === undefined
      ? document.querySelector<HTMLElement>("[data-testid='manual-candidate-editor']")
      : [...document.querySelectorAll<HTMLElement>("[data-candidate-toggle]")]
        .find((element) => element.dataset.candidateId === candidateId);
    target?.scrollIntoView?.({ behavior: preferredScrollBehavior(), block: "start" });
    target?.focus();
  }

  async function previewSourceDraft(draft: ManualCandidateDraft) {
    if (!draftHasMidiSourcePreview(draft)) return;
    try {
      await controller.toggle(
        { kind: "capture", id: `capture-draft-source:${draft.draftId}` },
        {
          type: "timeline",
          timeline: draftSourcePreviewTimeline(draft),
          bpm: result?.bpm ?? 96,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  function applyPendingDraftSelection() {
    if (!pendingCandidateSelection) return;
    const manualRange = pendingCandidateSelection.manualRange;
    if (manualRange) {
      openManualRangeDraft(manualRange);
      setPendingCandidateSelection(undefined);
      return;
    }
    const candidateId = pendingCandidateSelection.candidateId;
    if (pendingCandidateSelection.closeDraft) {
      stopCapturePlayback(controller);
      setActiveDraft(null);
      applyCandidateSelection(undefined);
      setPendingCandidateSelection(undefined);
      return;
    }
    const candidate = candidateId === undefined
      ? undefined
      : displayLanes.flatMap((lane) => lane.visible)
        .find((entry) => entry.candidate.id === candidateId)?.candidate
        ?? result?.blockCandidates.find((entry) => entry.id === candidateId);
    if (candidate) openCandidateDraft(candidate);
    else applyCandidateSelection(candidateId);
    if (candidateId && pendingCandidateSelection.revealTimeline) {
      revealCandidateInTimeline(candidateId);
    }
    if (candidateId && pendingCandidateSelection.focusCandidate) {
      focusCandidateCard(candidateId);
    }
    setPendingCandidateSelection(undefined);
  }

  function saveActiveDraftForSwitch(): boolean {
    if (!activeDraft || !result) return false;
    const candidate = draftToCandidate(activeDraft);
    return saveNew(
      candidate,
      captureSaveTitle(candidate, result.fileName, result.detectedKey, copy, language),
      copy.capture.defaultNextAction,
      false,
      activeDraft.sourceCandidateSnapshot ?? candidate,
      draftEditable(activeDraft),
      [],
      activeDraft.isDirty,
    );
  }

  return (
    <div data-capture-view-root data-capture-stage="result">
      {analysisProgress ? (
        <CaptureAnalysisProgress stage={analysisProgress} copy={copy} />
      ) : null}
      <div
        className="lv-capture-content grid gap-5 py-5"
        data-capture-midi-drop-zone
        {...dropHandlers}
      >
      {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
      <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lv-accent)]">
              {copy.capture.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{copy.capture.title}</h2>
            <p className="mt-2 text-sm text-teal-200">{result.fileName ?? "MIDI"}</p>
            {analysisTargetLabel ? (
              <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
                {language === "ja" ? "解析対象" : "Analyzed parts"}: {analysisTargetLabel}
              </p>
            ) : null}
            <p className="mt-2 max-w-2xl text-sm text-[var(--lv-text-muted)]">
              {copy.capture.resultDescription}
            </p>
          </div>
          <div className="flex gap-2">
            {preAnalysisSession ? (
              <Button
                variant="secondary"
                onClick={() => {
                  stopCapturePlayback(controller);
                  clearAnalysis();
                }}
              >
                {language === "ja" ? "パート選択を変更" : "Change part selection"}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void chooseMidi(false)}>
              {copy.capture.chooseAnother}
            </Button>
            <Button variant="ghost" onClick={() => { stopCapturePlayback(controller); clearAnalysis(); setPreAnalysisSession(undefined); setSourcePath(undefined); }}>
              {copy.capture.clear}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
          <Metric label={copy.capture.file} value={result.fileName ?? "MIDI"} />
          <Metric label={copy.capture.bars} value={result.totalBars.toString()} />
          <Metric label="BPM" value={result.bpm ? Math.round(result.bpm).toString() : copy.capture.unknown} />
          <Metric label={copy.capture.timeSignature} value={result.timeSignature ?? copy.capture.unknown} />
        </div>
      </section>

      <SongMiniMap
        totalBars={result.totalBars}
        beatsPerBar={laneMeter}
        timeline={result.fullTimeline}
        candidates={result.blockCandidates}
        {...(activeDraft === null ? {} : { draft: activeDraft })}
        activeCandidateId={activeDraft?.source.type === "automatic-candidate"
          ? activeDraft.source.candidateId
          : undefined}
        language={language}
        copy={{
          title: copy.capture.songMiniMap,
          description: copy.capture.songMiniMapDescription,
          empty: copy.capture.songMiniMapEmpty,
          candidateLabel: copy.capture.songMiniMapCandidate,
        }}
        onCandidateSelect={(candidateId) => {
          const candidate = result.blockCandidates.find((entry) => entry.id === candidateId);
          if (candidate && selectExpandedCandidate(candidateId)) {
            openCandidateDraft(candidate);
          }
        }}
        onCandidateDoubleClick={(candidateId) => {
          const candidate = result.blockCandidates.find((entry) => entry.id === candidateId);
          if (
            candidate
            && selectExpandedCandidate(candidateId, { focusCandidate: true })
          ) {
            openCandidateDraft(candidate);
          }
        }}
        onDraftChange={setActiveDraft}
        onManualRangeCreate={requestManualRangeDraft}
        onPreviewSelection={() => {
          if (activeDraft) void previewManualDraft(activeDraft);
        }}
        onUndo={() => {
          if (activeDraft) setActiveDraft(undoCaptureDraft(activeDraft));
        }}
        onRedo={() => {
          if (activeDraft) setActiveDraft(redoCaptureDraft(activeDraft));
        }}
        onEnterSelection={focusActiveDraftEditor}
      />

      <div className={`grid gap-5 ${expandedCandidateId ? "xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start" : ""}`}>
      <section className="min-w-0 border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{copy.capture.candidates}</h2>
            <p className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.capture.candidateHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PreviewSoundSelector
              value={previewSound}
              onChange={(sound) => {
                stopCapturePlayback(controller);
                setPreviewSound(sound);
              }}
              copy={copy}
            />
            <span className="rounded bg-[var(--lv-surface-raised)] px-3 py-1 text-sm text-teal-200">
              {copy.capture.itemCount(result.blockCandidates.length)}
            </span>
          </div>
        </div>

        <div className="mt-5">
          <div className="space-y-3">
            {displayLanes.length > 0 ? (
              displayLanes.flatMap((lane) => [
                lane.heading === null ? null : (
                  <div key={`lane-${lane.key}`} className="pt-2" data-candidate-lane={lane.kind}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-muted)]">
                        {lane.heading}
                      </h4>
                      <span className="text-xs text-[var(--lv-muted)]">
                        {copy.capture.lanes.laneCount(lane.totalCount)}
                      </span>
                      {lane.recommendedElsewhere > 0 ? (
                        <span className="text-xs text-[var(--lv-muted)]">
                          {copy.capture.lanes.recommendedElsewhere(lane.recommendedElsewhere)}
                        </span>
                      ) : null}
                      {lane.collapsible ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-[var(--lv-accent)] underline underline-offset-2"
                          onClick={() => toggleLane(lane.key)}
                          aria-expanded={lane.open}
                          aria-controls={`lane-body-${lane.key}`}
                          data-lane-toggle={lane.key}
                        >
                          {lane.open ? copy.capture.lanes.collapseLane : copy.capture.lanes.expandLane}
                        </button>
                      ) : null}
                    </div>
                    {lane.note === null ? null : (
                      <p className="mt-1 text-xs text-[var(--lv-muted)]">{lane.note}</p>
                    )}
                  </div>
                ),
                ...lane.visible.map(({ candidate, index }) => (
                <ProgressionCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  candidateIndex={index}
                  bpm={result.bpm ?? 96}
                  beatsPerBar={beatsPerBarFor(result.timeSignature)}
                  detectedKey={result.detectedKey}
                  sourceFingerprint={result.sourceFingerprint}
                  analyzerVersion={result.analyzerVersion}
                  analysisInput={analysisInput}
                  sourceFileName={result.fileName}
                  ideas={ideas}
                  authorReferenceIndex={authorReferenceIndex}
                  patterns={result.candidatePatterns}
                  sections={result.sections}
                  onCopyProgression={copyProgression}
                  onPreview={previewCandidate}
                  onPreviewChord={previewCandidateChord}
                  onPreviewOccurrence={previewOccurrence}
                  playbackSource={captureCandidateSource(result, candidate.id)}
                  previewSound={previewSound}
                  controller={controller}
                  onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
                  copy={copy}
                  language={language}
                  isExpanded={expandedCandidateId === candidate.id}
                  draft={activeDraft?.source.type === "automatic-candidate"
                    && activeDraft.source.candidateId === candidate.id
                    ? activeDraft
                    : undefined}
                  inspectorExpanded={isInspectorExpanded}
                  inspectorHost={inspectorHost}
                  onSelect={() => {
                    if (!selectExpandedCandidate(candidate.id)) return false;
                    openCandidateDraft(candidate);
                    return true;
                  }}
                  onCollapse={() => selectExpandedCandidate(undefined)}
                  onInspectorExpandedChange={setInspectorExpanded}
                  onDirtyChange={markCandidateDirty}
                  onDraftChange={setActiveDraft}
                  onDraftSaved={() => {
                    setActiveDraft(null);
                    markCandidateDirty(candidate.id, false);
                  }}
                  onCreate={(editedCandidate, title, nextAction, userVerified, editable, propagationEvents) => {
                    const currentDraft = activeDraft?.source.type === "automatic-candidate"
                      && activeDraft.source.candidateId === candidate.id
                      ? activeDraft
                      : undefined;
                    const savingCandidate = currentDraft === undefined
                      ? editedCandidate
                      : draftToCandidate(currentDraft);
                    return saveNew(
                      savingCandidate,
                      title,
                      nextAction,
                      userVerified,
                      currentDraft?.sourceCandidateSnapshot ?? candidate,
                      editable,
                      propagationEvents,
                      currentDraft?.isDirty,
                    );
                  }}
                  onAppend={(editedCandidate, ideaId, userVerified, editable, propagationEvents) => {
                    const currentDraft = activeDraft?.source.type === "automatic-candidate"
                      && activeDraft.source.candidateId === candidate.id
                      ? activeDraft
                      : undefined;
                    const savingCandidate = currentDraft === undefined
                      ? editedCandidate
                      : draftToCandidate(currentDraft);
                    return appendExisting(
                      savingCandidate,
                      currentDraft?.sourceCandidateSnapshot ?? candidate,
                      editable,
                      ideaId,
                      userVerified,
                      propagationEvents,
                      currentDraft?.isDirty,
                    );
                  }}
                  onCopyMemo={(editedCandidate, ideaId) => {
                    return copyMemo(editedCandidate, ideaId);
                  }}
                  showRomanNumerals={showRomanNumerals}
                />
                )),
                lane.remaining > 0 ? (
                  <button
                    key={`more-${lane.key}`}
                    type="button"
                    className="w-full border border-[var(--lv-border)] px-3 py-2 text-sm text-[var(--lv-accent)]"
                    onClick={() => showMoreInLane(lane.key)}
                    data-lane-show-more={lane.key}
                  >
                    {copy.capture.lanes.showMore(lane.remaining)}
                  </button>
                ) : null,
              ])
            ) : (
              <p className="text-sm text-[var(--lv-text-muted)]">{copy.capture.noCandidates}</p>
            )}
          </div>
        </div>
      </section>

      <div
        ref={setInspectorHost}
        data-responsive-inspector-host
        data-active={Boolean(expandedCandidateId)}
        className="lv-responsive-inspector-host"
      />
      </div>

      {activeDraft === null || activeDraft.source.type === "automatic-candidate" ? null : (
        <ManualCandidateEditor
          key={activeDraft.draftId}
          draft={activeDraft}
          timeline={result.fullTimeline}
          totalBars={result.totalBars}
          copy={copy}
          language={language}
          {...(result.detectedKey ? { keySignature: result.detectedKey } : {})}
          save={{
            initialTitle: copy.capture.manualDraft.defaultTitle,
            ideas,
            defaultNextAction: copy.capture.defaultNextAction,
            onCreate: (draft, title, nextAction, userVerified) => {
              const candidate = draftToCandidate(draft);
              const original = draft.sourceCandidateSnapshot ?? candidate;
              return saveNew(
                candidate,
                title,
                nextAction,
                userVerified,
                original,
                draftEditable(draft),
                [],
                draft.isDirty,
              );
            },
            onAppend: (draft, ideaId, userVerified) => {
              const candidate = draftToCandidate(draft);
              const original = draft.sourceCandidateSnapshot ?? candidate;
              return appendExisting(
                candidate,
                original,
                draftEditable(draft),
                ideaId,
                userVerified,
                [],
                draft.isDirty,
              );
            },
          }}
          onPreview={(draft) => void previewManualDraft(draft)}
          onChange={setActiveDraft}
          onSave={() => {
            setActiveDraft(null);
            applyCandidateSelection(undefined);
          }}
          onDiscard={() => {
            setActiveDraft(null);
            applyCandidateSelection(undefined);
          }}
          onReselect={() => {
            setActiveDraft(null);
            applyCandidateSelection(undefined);
            setTimelineOpen(true);
            setRangeSelectorRequest((request) => request + 1);
          }}
        />
      )}

      <TimelineDetails
        result={result}
        copy={copy}
        previewSound={previewSound}
        onPreviewSoundChange={(sound) => {
          stopCapturePlayback(controller);
          setPreviewSound(sound);
        }}
        onPlaybackError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
        controller={controller}
        open={isTimelineOpen}
        onOpenChange={setTimelineOpen}
        scrollToBar={timelineScrollBar}
        openRangeSelectorRequest={rangeSelectorRequest}
        renderDraftEditor={false}
        language={language}
        onManualDraftCreated={(draft) => {
          setActiveDraft(draft);
          applyCandidateSelection(undefined);
        }}
        onPreviewManualDraft={(draft) => void previewManualDraft(draft)}
      />

      {activeDraft ? (
        <CaptureDraftSessionBar
          language={language}
          dirty={activeDraft.isDirty}
          sourceAvailable={draftHasMidiSourcePreview(activeDraft)}
          playing={capturePlayback.status === "idle"
            ? null
            : capturePlayback.source?.id === `capture-draft-source:${activeDraft.draftId}`
              ? "source"
              : capturePlayback.source?.id === `capture-manual-draft:${activeDraft.draftId}`
                ? "edited"
                : null}
          onPreviewSource={() => void previewSourceDraft(activeDraft)}
          onPreviewEdited={() => void previewManualDraft(activeDraft)}
          onStop={() => stopCapturePlayback(controller)}
          onRequestDiscard={() => {
            if (activeDraft.isDirty) {
              setPendingCandidateSelection({
                candidateId: undefined,
                closeDraft: true,
              });
            } else {
              stopCapturePlayback(controller);
              setActiveDraft(null);
              applyCandidateSelection(undefined);
            }
          }}
        />
      ) : null}
      </div>
      <ConfirmDialog
        open={Boolean(pendingCandidateSelection)}
        title={copy.capture.closeUnsavedTitle}
        description={copy.capture.unsavedCandidateConfirm}
        confirmLabel={copy.common.close}
        cancelLabel={copy.common.cancel}
        secondaryLabel={language === "ja" ? "Vaultへ保存して続ける" : "Save to Vault and continue"}
        onCancel={() => setPendingCandidateSelection(undefined)}
        onSecondary={() => {
          if (saveActiveDraftForSwitch()) applyPendingDraftSelection();
        }}
        onConfirm={applyPendingDraftSelection}
        tone="danger"
      />
    </div>
  );
}

function CaptureEmptyState({
  status,
  error,
  onChooseMidi,
  isDraggingMidi,
  copy,
  progressStage,
}: {
  status: AnalysisState["status"];
  error?: string;
  onChooseMidi: () => void;
  isDraggingMidi: boolean;
  copy: AppCopy;
  progressStage?: CaptureAnalysisProgressStage;
}) {
  return (
    <section
      className={`grid min-h-[32rem] place-items-center border p-6 text-center transition-colors ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent)]/10" : "border-[var(--lv-border)] bg-[var(--lv-bg)]/70"}`}
      aria-labelledby="capture-empty-title"
      data-drop-target-state={isDraggingMidi ? "active" : "idle"}
    >
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lv-accent)]">
          {copy.capture.eyebrow}
        </p>
        <h2 id="capture-empty-title" className="mt-3 text-3xl font-semibold">{copy.capture.title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--lv-text-muted)]">{copy.capture.emptyDescription}</p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <StepCard index="1" text={copy.capture.emptyStepTimeline} />
          <StepCard index="2" text={copy.capture.emptyStepCandidates} />
          <StepCard index="3" text={copy.capture.emptyStepSave} />
        </div>
        <div
          className={`mt-7 border border-dashed p-5 ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent)]/10 text-teal-50" : "border-[var(--lv-border-strong)] bg-[var(--lv-bg)] text-[var(--lv-text-secondary)]"}`}
          role="status"
          aria-live="polite"
        >
          <FileMusic aria-hidden="true" className="mx-auto mb-3 text-[var(--lv-accent)]" size={20} />
          <p className="text-lg font-semibold">
            {isDraggingMidi ? copy.capture.dropActive : copy.capture.dropMidi}
          </p>
          <p className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.capture.dropHelp}</p>
        </div>
        <Button
          variant="primary"
          className="mt-7 min-h-11 px-5"
          data-testid="capture-choose-midi"
          onClick={onChooseMidi}
        >
          {copy.capture.loadMidi}
        </Button>
        <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{copy.capture.supportedFormats}</p>
        {status === "analyzing" || progressStage ? (
          <div className="mt-6 border border-cyan-500/30 bg-cyan-500/10 p-4 text-left text-sm text-cyan-100">
            <p className="font-semibold">
              {progressStage ? analysisProgressLabel(progressStage, copy) : copy.capture.analyzing}
            </p>
            <p className="mt-2 text-cyan-100/80">{copy.capture.analyzingDetail}</p>
            <div className="mt-3 h-1.5 overflow-hidden bg-cyan-950" role="progressbar" aria-label={copy.capture.analysisProgress}>
              <div className="h-full w-1/2 animate-pulse bg-cyan-300" />
            </div>
          </div>
        ) : null}
        {status === "error" ? (
          <StatusMessage
            className="mt-6 text-left"
            tone="error"
            title={copy.capture.loadFailed}
            action={(
              <Button
                variant="secondary"
                size="sm"
                data-testid="capture-retry-midi"
                onClick={onChooseMidi}
              >
                {copy.capture.loadMidi}
              </Button>
            )}
          >
            {error}
          </StatusMessage>
        ) : null}
      </div>
    </section>
  );
}

type CaptureAnalysisProgressStage = "reading" | "analyzing" | "finalizing";

export function CaptureAnalysisProgress({
  stage,
  copy,
}: {
  stage: CaptureAnalysisProgressStage;
  copy: AppCopy;
}) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[min(24rem,calc(100vw-3rem))] border border-cyan-400/40 bg-[var(--lv-surface)] p-4 shadow-2xl"
      role="status"
      aria-live="polite"
      data-analysis-progress={stage}
      data-testid="capture-analysis-progress"
    >
      <p className="text-sm font-semibold text-cyan-100">{analysisProgressLabel(stage, copy)}</p>
      <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{copy.capture.analyzingDetail}</p>
      <div className="mt-3 h-1.5 overflow-hidden bg-cyan-950" role="progressbar" aria-label={copy.capture.analysisProgress}>
        <div className="h-full w-1/2 animate-pulse bg-cyan-300" />
      </div>
    </div>
  );
}

function analysisProgressLabel(stage: CaptureAnalysisProgressStage, copy: AppCopy): string {
  if (stage === "reading") return copy.capture.readingMidi;
  if (stage === "finalizing") return copy.capture.finalizingAnalysis;
  return copy.capture.analyzing;
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function waitForStatusFeedback(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 300);
  });
}

function DropOverlay({ copy }: { copy: AppCopy }) {
  return (
    <div className="pointer-events-none fixed inset-6 z-50 grid place-items-center border-2 border-dashed border-teal-300 bg-[var(--lv-bg)]/90 p-8 text-center text-teal-50 shadow-2xl">
      <div>
        <p className="text-2xl font-semibold">{copy.capture.dropActive}</p>
        <p className="mt-2 text-sm text-[var(--lv-text-secondary)]">{copy.capture.dropHelp}</p>
      </div>
    </div>
  );
}

function StepCard({ index, text }: { index: string; text: string }) {
  return (
    <div className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
      <p className="text-xs font-semibold text-[var(--lv-accent)]">{index}</p>
      <p className="mt-2 text-sm text-[var(--lv-text-secondary)]">{text}</p>
    </div>
  );
}

export function TimelineDetails({
  result,
  copy,
  language,
  previewSound,
  onPreviewSoundChange,
  onPlaybackError,
  controller = playbackController,
  open,
  onOpenChange,
  scrollToBar,
  openRangeSelectorRequest,
  renderDraftEditor = true,
  onManualDraftCreated,
  manualDraftSave,
  onPreviewManualDraft,
}: {
  result: MidiProgressionAnalysis;
  copy: AppCopy;
  language?: AppLanguage;
  previewSound: PreviewSound;
  onPreviewSoundChange: (sound: PreviewSound) => void;
  onPlaybackError?: (error: unknown) => void;
  controller?: PlaybackController;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  scrollToBar?: number;
  openRangeSelectorRequest?: number;
  renderDraftEditor?: boolean;
  onManualDraftCreated?: (draft: ManualCandidateDraft) => void;
  manualDraftSave?: ManualDraftSaveTarget;
  onPreviewManualDraft?: (draft: ManualCandidateDraft) => void;
}) {
  const [selectedChordIndex, setSelectedChordIndex] = useState<number>();
  const [rangeSelectorOpen, setRangeSelectorOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualCandidateDraft | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const playback = usePlaybackState(controller);
  const source = captureFullTimelineSource(result);
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  const [, forcePlaybackTick] = useState(0);

  useEffect(() => {
    if (!playing || playback.status !== "playing") return undefined;
    const interval = window.setInterval(() => forcePlaybackTick((value) => value + 1), 100);
    return () => window.clearInterval(interval);
  }, [playback.status, playing]);

  useEffect(() => {
    if (!open || scrollToBar === undefined) return;
    const target = detailsRef.current?.querySelector<HTMLElement>(
      `[data-progression-bar="${scrollToBar}"]`,
    );
    target?.scrollIntoView?.({ behavior: preferredScrollBehavior(), block: "center" });
    const chordIndex = result.fullTimeline.findIndex((chord) => chord.bar >= scrollToBar);
    if (chordIndex >= 0) setSelectedChordIndex(chordIndex);
  }, [open, result.fullTimeline, scrollToBar]);

  useEffect(() => {
    if (openRangeSelectorRequest === undefined || openRangeSelectorRequest <= 0) return;
    setRangeSelectorOpen(true);
  }, [openRangeSelectorRequest]);

  async function previewTimelineChord(index: number) {
    setSelectedChordIndex(index);
    const event = result.fullTimeline[index];
    const chord = event?.chord;
    if (chord) {
      try {
        await controller.toggle(
          { kind: "capture", id: `${source.id}:chord:${index}:${chord.label}` },
          {
            type: "chord",
            chord,
            sound: previewSound,
            explicitMidiNotes: singleChordVoicing(event),
          },
        );
      } catch (error) {
        onPlaybackError?.(error);
      }
    }
  }

  const position = playing && playback.status === "playing"
    ? timelinePlaybackPosition(
        result.fullTimeline,
        result.bpm ?? 96,
        playback.startedAt,
        undefined,
        beatsPerBarFor(result.timeSignature),
      )
    : undefined;

  return (
    <details
      ref={detailsRef}
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
      className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5"
    >
      <summary className="cursor-pointer text-lg font-semibold text-[var(--lv-text)]">
        {copy.capture.timeline}
      </summary>
      <p className="mt-3 text-sm text-[var(--lv-text-muted)]">{copy.capture.timelineDescription}</p>
      {result.fullTimeline.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PlayToggle
            source={source}
            request={{
              type: "timeline",
              timeline: result.fullTimeline,
              bpm: result.bpm,
              sound: previewSound,
              beatsPerBar: beatsPerBarFor(result.timeSignature),
            }}
            playLabel={copy.capture.previewFullTimeline}
            stopLabel={copy.common.stop}
            className="lv-button-primary inline-flex min-h-10 items-center gap-2 px-4"
            onError={onPlaybackError}
            controller={controller}
          />
          <PreviewSoundSelector
            value={previewSound}
            onChange={onPreviewSoundChange}
            copy={copy}
          />
        </div>
      ) : null}
      <div className="mt-5">
        {result.fullTimeline.length > 0 ? (
          <ProgressionGrid
            chords={result.fullTimeline}
            beatsPerBar={beatsPerBarFor(result.timeSignature)}
            currentBar={null}
            selectedChordIndex={selectedChordIndex}
            playingChordIndex={position?.index ?? null}
            playingProgress={position?.progress ?? null}
            onChordSelect={(index) => void previewTimelineChord(index)}
          />
        ) : (
          <p className="text-sm text-[var(--lv-text-muted)]">{copy.capture.noTimeline}</p>
        )}
      </div>
      <p className="mt-4 text-xs text-[var(--lv-text-muted)]">
        {copy.capture.outsideCandidates}
      </p>
      {result.fullTimeline.length > 0 ? (
        <>
          <button
            type="button"
            className="mt-3 inline-flex min-h-10 items-center border border-[var(--lv-border)] px-4 text-sm text-[var(--lv-text)]"
            aria-expanded={rangeSelectorOpen}
            onClick={() => setRangeSelectorOpen((value) => !value)}
          >
            {rangeSelectorOpen
              ? copy.capture.manualRange.close
              : copy.capture.manualRange.open}
          </button>
          {rangeSelectorOpen ? (
            <TimelineRangeSelector
              timeline={result.fullTimeline}
              totalBars={result.totalBars}
              beatsPerBar={beatsPerBarFor(result.timeSignature)}
              copy={copy}
              onCreate={(draft) => {
                if (renderDraftEditor) setManualDraft(draft);
                setRangeSelectorOpen(false);
                onManualDraftCreated?.(draft);
              }}
            />
          ) : null}
          {!renderDraftEditor || manualDraft === null ? null : (
            <ManualCandidateEditor
              draft={manualDraft}
              timeline={result.fullTimeline}
              totalBars={result.totalBars}
              copy={copy}
              language={language ?? "ja"}
              {...(result.detectedKey ? { keySignature: result.detectedKey } : {})}
              {...(manualDraftSave ? { save: manualDraftSave } : {})}
              {...(onPreviewManualDraft ? { onPreview: onPreviewManualDraft } : {})}
              onChange={setManualDraft}
              onSave={() => setManualDraft(null)}
              onDiscard={() => setManualDraft(null)}
              onReselect={() => {
                setManualDraft(null);
                setRangeSelectorOpen(true);
              }}
            />
          )}
        </>
      ) : null}
    </details>
  );
}

export function ProgressionCandidateCard({
  candidate,
  candidateIndex,
  patterns,
  sections,
  bpm,
  beatsPerBar = 4,
  detectedKey,
  sourceFingerprint,
  analyzerVersion = "unknown",
  analysisInput,
  sourceFileName,
  ideas = [],
  authorReferenceIndex: providedAuthorReferenceIndex,
  onCopyProgression,
  onPreviewChord,
  playbackSource,
  previewSound = "piano",
  onPreviewError,
  controller = playbackController,
  copy,
  language,
  isExpanded = false,
  inspectorExpanded = true,
  inspectorHost,
  onSelect,
  onCollapse,
  onInspectorExpandedChange,
  onDirtyChange,
  draft,
  onDraftChange,
  onDraftSaved,
  onCreate,
  onAppend,
  onCopyMemo,
  onPreviewOccurrence,
  onSaveOccurrence,
  showRomanNumerals = true,
}: {
  candidate: ProgressionBlockCandidate;
  candidateIndex: number;
  /** Other appearances of this progression, so none of them is unreachable. */
  patterns?: readonly CandidatePattern[];
  sections?: readonly Section[];
  bpm: number;
  beatsPerBar?: number;
  detectedKey?: string;
  sourceFingerprint?: string;
  analyzerVersion?: string;
  analysisInput?: AnalysisInput;
  sourceFileName?: string;
  ideas?: SongIdea[];
  authorReferenceIndex?: AuthorReferenceIndex;
  onCreate?: (
    candidate: ProgressionBlockCandidate,
    title: string,
    nextAction: string,
    userVerified: boolean,
    editable: EditableProgression,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
  ) => boolean;
  onAppend?: (
    candidate: ProgressionBlockCandidate,
    ideaId: string,
    userVerified: boolean,
    editable: EditableProgression,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
  ) => boolean;
  onCopyMemo?: (
    candidate: ProgressionBlockCandidate,
    ideaId: string,
    editable: EditableProgression,
  ) => boolean;
  onPreviewOccurrence?: (occurrence: CandidateOccurrence) => void | Promise<void>;
  onSaveOccurrence?: (occurrence: CandidateOccurrence) => void;
  onCopyProgression: (candidate: ProgressionBlockCandidate) => void | Promise<void>;
  onPreview?: (candidate: ProgressionBlockCandidate) => void | Promise<void>;
  onPreviewChord: (
    candidate: ProgressionBlockCandidate,
    chordIndex: number,
  ) => void | Promise<void>;
  playbackSource?: PlayingSource;
  previewSound?: PreviewSound;
  onPreviewError?: (error: unknown) => void;
  controller?: PlaybackController;
  copy: AppCopy;
  language: AppLanguage;
  isExpanded?: boolean;
  inspectorExpanded?: boolean;
  inspectorHost?: HTMLElement | null;
  onSelect?: () => boolean | void;
  onCollapse?: () => void;
  onInspectorExpandedChange?: (expanded: boolean) => void;
  onDirtyChange?: (candidateId: string, dirty: boolean) => void;
  draft?: ManualCandidateDraft;
  onDraftChange?: (draft: ManualCandidateDraft) => void;
  onDraftSaved?: () => void;
  showRomanNumerals?: boolean;
}) {
  const editorCopy = progressionEditorCopy[language];
  const captureDraft = draft?.source.type === "automatic-candidate"
    && draft.source.candidateId === candidate.id
    ? draft
    : undefined;
  const captureDraftCandidate = captureDraft === undefined
    ? undefined
    : draftToCandidate(captureDraft);
  const baseCandidate = captureDraftCandidate ?? candidate;
  const skipEditableToDraftRef = useRef(false);
  const candidateRef = useRef(candidate);
  const captureDraftRef = useRef(captureDraft);
  candidateRef.current = candidate;
  captureDraftRef.current = captureDraft;
  const [occurrencesExpanded, setOccurrencesExpanded] = useState(false);
  const [editable, setEditable] = useState(
    () => createEditableProgression(baseCandidate, beatsPerBar),
  );
  const [savedSignature, setSavedSignature] = useState(() => progressionSignature(candidate.chords));
  const [propagationProposal, setPropagationProposal] = useState<PropagationProposal>();
  const [propagationFeedback, setPropagationFeedback] = useState<PendingPropagationFeedback[]>([]);
  const [, forcePlaybackTick] = useState(0);
  const currentCandidate = applyEditableProgression(baseCandidate, editable);
  const chords = currentCandidate.chords;
  const selectedSlotIndex = selectedEditableSlotIndex(editable);
  const selectedChordIndex = selectedSlotIndex ?? 0;
  const editedCandidate = {
    ...currentCandidate,
    summaryText: formatProgressionText(chords),
    chords,
    labels: [...new Set(chords.map((item) => item.chord.label))],
  };
  const currentSignature = progressionSignature(chords);
  const source = playbackSource ?? { kind: "capture", id: `candidate:${candidate.id}` };
  const playback = usePlaybackState(controller);
  const candidatePlaying = playback.status !== "idle"
    && samePlaybackSource(playback.source, source);
  const canUndoCurrent = captureDraft === undefined
    ? canUndoProgressionEdit(editable)
    : canUndoCaptureDraft(captureDraft);
  const canRedoCurrent = captureDraft === undefined
    ? canRedoProgressionEdit(editable)
    : canRedoCaptureDraft(captureDraft);

  useEffect(() => {
    const incomingDraft = captureDraftRef.current;
    const incomingCandidate = candidateRef.current;
    skipEditableToDraftRef.current = incomingDraft !== undefined;
    setEditable(
      incomingDraft !== undefined
        ? draftEditable(incomingDraft)
        : createEditableProgression(incomingCandidate, beatsPerBar),
    );
  }, [
    beatsPerBar,
    candidate.id,
    captureDraft?.draftId,
    captureDraft?.selectedRange.startBar,
    captureDraft?.selectedRange.startBeat,
    captureDraft?.selectedRange.endBar,
    captureDraft?.selectedRange.endBeat,
  ]);

  useEffect(() => {
    const incomingCandidate = candidateRef.current;
    setSavedSignature(progressionSignature(incomingCandidate.chords));
    setPropagationProposal(undefined);
    setPropagationFeedback([]);
  }, [
    beatsPerBar,
    candidate.id,
    captureDraft?.draftId,
  ]);

  useEffect(() => {
    if (!isExpanded) {
      setPropagationProposal(undefined);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!candidatePlaying || playback.status !== "playing") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      forcePlaybackTick((value) => value + 1);
    }, 100);

    return () => window.clearInterval(interval);
  }, [candidatePlaying, playback.status]);

  useEffect(() => {
    onDirtyChange?.(candidate.id, currentSignature !== savedSignature);
  }, [candidate.id, currentSignature, onDirtyChange, savedSignature]);

  useEffect(() => {
    if (skipEditableToDraftRef.current) {
      skipEditableToDraftRef.current = false;
      return;
    }
    if (
      draft?.source.type !== "automatic-candidate"
      || draft.source.candidateId !== candidate.id
      || onDraftChange === undefined
    ) {
      return;
    }
    const draftSignature = progressionSignature(draftToCandidate(draft).chords);
    if (draftSignature === currentSignature) return;
    const next = applyEditableToDraft(draft, editable);
    const originalSignature = draft.sourceCandidateSnapshot === undefined
      ? undefined
      : progressionSignature(draft.sourceCandidateSnapshot.chords);
    onDraftChange({
      ...next,
      isDirty: originalSignature === undefined || currentSignature !== originalSignature,
    });
  }, [candidate.id, currentSignature, draft, editable, onDraftChange]);

  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        stopCandidatePreview();
        if (inspectorExpanded && onInspectorExpandedChange) {
          onInspectorExpandedChange(false);
        } else {
          onCollapse?.();
        }
        return;
      }
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        stopCandidatePreview();
        if (event.shiftKey) redoCurrentEdit();
        else undoCurrentEdit();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(editable.slots.length - 1, selectedChordIndex + direction));
        const nextSlot = editable.slots[nextIndex];
        if (nextSlot) {
          setEditable((current) => selectEditableSlot(current, nextSlot.id));
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const slotId = editable.selectedSlotId;
        if (slotId) {
          document.getElementById(`chord-label-${slotId}`)?.focus();
        }
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        void selectChord(selectedChordIndex);
        return;
      }
      if (event.key === "Delete") {
        const slot = editable.slots[selectedChordIndex];
        if (slot && editable.slots.length > 1) {
          event.preventDefault();
          commitStructuralChange(deleteEditableChord(editable, slot.id));
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller, editable.selectedSlotId, editable.slots, inspectorExpanded, isExpanded, onCollapse, onInspectorExpandedChange, selectedChordIndex, source]);

  function stopCandidatePreview() {
    const activeSource = controller.getState().source;
    if (
      activeSource?.kind === source.kind
      && (activeSource.id === source.id || activeSource.id.startsWith(`${source.id}:`))
    ) {
      controller.stop();
    }
  }

  function applyCaptureHistory(next: ManualCandidateDraft) {
    setEditable(draftEditable(next));
    onDraftChange?.(next);
  }

  function undoCurrentEdit() {
    if (captureDraft === undefined) {
      setEditable((current) => undoProgressionEdit(current));
      return;
    }
    const next = undoCaptureDraft(captureDraft);
    setEditable((current) => canUndoProgressionEdit(current)
      ? undoProgressionEdit(current)
      : draftEditable(next));
    onDraftChange?.(next);
  }

  function redoCurrentEdit() {
    if (captureDraft === undefined) {
      setEditable((current) => redoProgressionEdit(current));
      return;
    }
    const next = redoCaptureDraft(captureDraft);
    setEditable((current) => canRedoProgressionEdit(current)
      ? redoProgressionEdit(current)
      : draftEditable(next));
    onDraftChange?.(next);
  }

  async function selectChord(index: number) {
    onSelect?.();
    const slot = selectSlot(index);
    await onPreviewChord(editedCandidate, index);
    return slot;
  }

  function selectSlot(index: number) {
    const slot = editable.slots[index];
    if (slot?.id !== propagationProposal?.sourceSlotId) {
      setPropagationProposal(undefined);
    }
    if (slot) {
      setEditable((current) => selectEditableSlot(current, slot.id));
    }
    return slot;
  }

  async function previewChord(chord: ChordSymbol) {
    const previewChords = chords.map((item, index) =>
      index === selectedChordIndex ? { ...item, chord } : item,
    );
    await onPreviewChord({ ...editedCandidate, chords: previewChords }, selectedChordIndex);
  }

  async function previewQuickChord(slotId: string, chord: ChordSymbol) {
    const index = editable.slots.findIndex((slot) => slot.id === slotId);
    if (index < 0) return;
    const previewChords = chords.map((item, chordIndex) => (
      chordIndex === index ? { ...item, chord } : item
    ));
    await onPreviewChord({ ...editedCandidate, chords: previewChords }, index);
  }

  function commitStructuralChange(next: EditableProgression) {
    if (next === editable) {
      return;
    }
    stopCandidatePreview();
    setPropagationProposal(undefined);
    setEditable(next);
  }

  function runContextAction(slotId: string, action: ChordContextAction): boolean {
    if (action === "cut-range-here") {
      if (!captureDraft || !onDraftChange) return false;
      const nextDraft = cutDraftRangeAtEvent(captureDraft, slotId);
      if (nextDraft === captureDraft) return false;
      applyCaptureHistory(nextDraft);
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
    stopCandidatePreview();
    setPropagationProposal(undefined);
    setEditable(next);
    if (captureDraft && onDraftChange) {
      onDraftChange(applyEditableToDraft(captureDraft, next, operations));
    }
    return true;
  }

  const playbackPosition = candidatePlaying && playback.status === "playing"
    ? timelinePlaybackPosition(chords, bpm, playback.startedAt, undefined, beatsPerBar)
    : undefined;
  const playingChordIndex = playbackPosition?.index ?? null;
  const playingProgress = playbackPosition?.progress ?? null;
  const selectedChord = chords[selectedChordIndex] ?? chords[0];
  const selectedSlot = selectedSlotIndex === undefined ? undefined : editable.slots[selectedSlotIndex];
  const authorReferenceIndex = useMemo(
    () => providedAuthorReferenceIndex ?? buildAuthorReferenceIndex(ideas),
    [ideas, providedAuthorReferenceIndex],
  );
  const selectedQuickCandidates = selectedSlot
    ? quickCandidatesForSlot({
        editable,
        slotId: selectedSlot.id,
        keySignature: detectedKey,
        authorReferenceIndex,
      })
    : [];
  const previousSlot = selectedSlotIndex !== undefined && selectedSlotIndex > 0
    ? editable.slots[selectedSlotIndex - 1]
    : undefined;
  const nextSlot = selectedSlotIndex === undefined ? undefined : editable.slots[selectedSlotIndex + 1];
  const selectedRomanHint = selectedChord
    ? romanNumeralHint(selectedChord.chord, detectedKey)
    : undefined;
  const visibleWarnings = candidate.warnings.map((warning) => warningLabel(warning, language));
  const shouldDisplayConfidence = shouldShowConfidence(candidate.confidence);
  const candidateVoicingSource = useMemo(
    () => timelineVoicingSourceStatus(editedCandidate.chords),
    [editedCandidate.chords],
  );

  return (
    <div
      className={`border bg-[var(--lv-bg)] p-4 transition-colors ${
        isExpanded
          ? "border-teal-400/60 border-l-4 border-l-[var(--lv-accent)]"
          : "border-[var(--lv-border)] hover:border-[var(--lv-border-strong)]"
      }`}
      data-candidate-state={isExpanded ? "selected" : "idle"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button data-candidate-toggle data-candidate-id={candidate.id} className="min-w-0 flex-1 text-left" onClick={onSelect} aria-expanded={isExpanded}>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
              {editorCopy.candidate(candidateIndex + 1)}
            </span>
            {isExpanded ? (
              <span className="border border-[var(--lv-accent)] px-2 py-0.5 text-xs font-semibold text-[var(--lv-accent)]">
                {language === "ja" ? "選択中・編集対象" : "Selected for editing"}
              </span>
            ) : null}
          </span>
          <p className="mt-2 font-semibold">
            {editorCopy.candidateBars(
              editedCandidate.startBar,
              editedCandidate.endBar,
              editedCandidate.stats?.uniqueChordCount ?? editedCandidate.chords.length,
            )}
          </p>
          {shouldDisplayConfidence ? (
            <p className="mt-1 text-sm text-amber-200">
              {editorCopy.confidence}: {confidenceLabel(candidate.confidence, language)}
            </p>
          ) : null}
        </button>
        <OccurrenceList
          pattern={patterns?.find((entry) => entry.occurrences.some(
            (occurrence) => occurrence.id === candidate.id,
          ))}
          selectedOccurrenceId={candidate.id}
          sections={sections}
          text={editorCopy.occurrence}
          expanded={occurrencesExpanded}
          onToggleExpanded={() => setOccurrencesExpanded((open) => !open)}
          onPreview={(occurrence) => void onPreviewOccurrence?.(occurrence)}
          onSave={(occurrence) => onSaveOccurrence?.(occurrence)}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PlayToggle
            source={source}
            request={{ type: "timeline", timeline: editedCandidate.chords, bpm, sound: previewSound, beatsPerBar }}
            playLabel={copy.common.preview}
            stopLabel={copy.common.stop}
            className="grid h-9 w-9 place-items-center rounded bg-cyan-400 text-sm font-semibold text-stone-950"
            showLabel={false}
            onError={onPreviewError}
            controller={controller}
          />
          <SaveProgressionPopover
            initialTitle={captureSaveTitle(editedCandidate, sourceFileName, detectedKey, copy, language)}
            ideas={ideas}
            defaultNextAction={copy.capture.defaultNextAction}
            copy={copy}
            requestOpen={() => onSelect?.() !== false}
            onCreate={(title, nextAction, userVerified) => (
              onCreate?.(
                editedCandidate,
                title,
                nextAction,
                userVerified,
                editable,
                activePropagationEvents(editable, propagationFeedback),
              ) ?? false
            )}
            onAppend={(ideaId, userVerified) => (
              onAppend?.(
                editedCandidate,
                ideaId,
                userVerified,
                editable,
                activePropagationEvents(editable, propagationFeedback),
              ) ?? false
            )}
            onCopyMemo={(ideaId) => onCopyMemo?.(editedCandidate, ideaId, editable) ?? false}
            onSaved={() => {
              setSavedSignature(currentSignature);
              setPropagationProposal(undefined);
              setPropagationFeedback([]);
              if (captureDraft !== undefined && onDraftSaved !== undefined) {
                onDraftSaved();
              } else if (draft !== undefined && onDraftChange !== undefined) {
                onDraftChange({ ...draft, isDirty: false });
              }
            }}
          />
          <Button variant="secondary" size="sm" className="min-h-10" onClick={() => void onCopyProgression(editedCandidate)}>
            <Copy aria-hidden="true" size={16} />
            {copy.capture.copyProgression}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded bg-[var(--lv-surface-raised)] px-2 py-1 text-xs text-teal-200">
          {candidateLabelList(candidate.labels, language).join(" · ")}
        </span>
        <VoicingSourceChip
          status={candidateVoicingSource.status}
          reason={candidateVoicingSource.reason}
          language={language}
          testId="candidate-voicing-source-chip"
        />
      </div>
      {draft?.source.type === "automatic-candidate"
        && draft.source.candidateId === candidate.id ? (
          <p className="mt-2 text-xs text-[var(--lv-text-muted)]" data-testid="draft-source">
            {language === "ja"
              ? `自動候補から作成${draft.isDirty ? "・編集中" : ""}`
              : `Created from automatic candidate${draft.isDirty ? " · Editing" : ""}`}
          </p>
        ) : null}
      {candidate.summaryText.trim() ? <p className="mt-3 text-sm text-[var(--lv-text-secondary)]">{candidate.summaryText}</p> : null}
      <div className="mt-4">
        <div>
          {isExpanded ? (
            <ProgressionEditorToolbar
              canUndo={canUndoCurrent}
              canRedo={canRedoCurrent}
              dirty={hasProgressionEdits(editable)}
              onUndo={() => { stopCandidatePreview(); setPropagationProposal(undefined); undoCurrentEdit(); }}
              onRedo={() => { stopCandidatePreview(); setPropagationProposal(undefined); redoCurrentEdit(); }}
              onResetAll={() => { stopCandidatePreview(); setPropagationProposal(undefined); setEditable((current) => resetAllEditableChords(current)); }}
              language={language}
            />
          ) : null}
          <EditableProgressionGrid
            editable={editable}
            playingSlotId={playingChordIndex === null ? undefined : editable.slots[playingChordIndex]?.id}
            playingProgress={playingProgress}
            onSelect={(_slotId, index) => void selectChord(index)}
            onNavigate={(_slotId, index) => { selectSlot(index); }}
            onPreviewSlot={(_slotId, _chord, index) => void selectChord(index)}
            keySignature={detectedKey}
            authorReferenceIndex={authorReferenceIndex}
            language={language}
            contextActions={{
              canCutRange: (slotId) => {
                const index = editable.slots.findIndex((slot) => slot.id === slotId);
                return captureDraft !== undefined
                  && index >= 0
                  && index < editable.slots.length - 1;
              },
              onAction: runContextAction,
            }}
            quickEditor={{
              onOpen: (slotId, _index) => {
                setEditable((current) => selectEditableSlot(current, slotId));
              },
              onPreview: (slotId, chord) => void previewQuickChord(slotId, chord),
              onApply: (slotId, chord, source, selection) => {
                stopCandidatePreview();
                const selected = selectEditableSlot(editable, slotId);
                const next = replaceEditableChord(selected, slotId, chord, source, selection);
                setEditable(next);
                setPropagationProposal(proposalFor(
                  next,
                  slotId,
                  chord,
                  captureSimilarityContext(next, detectedKey, analysisInput),
                ));
              },
              onReset: (slotId) => {
                stopCandidatePreview();
                setPropagationProposal(undefined);
                setEditable((current) => resetEditableChord(current, slotId));
              },
              onOpenInspector: (slotId, _index) => {
                setEditable((current) => selectEditableSlot(current, slotId));
                onInspectorExpandedChange?.(true);
              },
            }}
          />
          {captureDraft === undefined ? null : (
            <DraftBoundaryHandles
              draft={captureDraft}
              language={language}
              onChange={applyCaptureHistory}
            />
          )}
        </div>
        {isExpanded ? renderInspector(
          <ChordInspector
            slot={selectedSlot}
            quickCandidates={selectedQuickCandidates}
            language={language}
            expanded={inspectorExpanded}
            onExpandedChange={onInspectorExpandedChange}
            onPreview={(chord) => void previewChord(chord)}
            playbackSource={source}
            previewSound={previewSound}
            stopLabel={copy.common.stop}
            onPreviewError={onPreviewError}
            controller={controller}
            keySignature={detectedKey}
            previousChord={previousSlot?.currentChord}
            onApply={(chord, source, selection) => {
              stopCandidatePreview();
              const slotId = editable.selectedSlotId;
              if (slotId) {
                const next = replaceEditableChord(editable, slotId, chord, source, selection);
                setEditable(next);
                setPropagationProposal(proposalFor(
                  next,
                  slotId,
                  chord,
                  captureSimilarityContext(next, detectedKey, analysisInput),
                ));
              }
            }}
            onReset={() => {
              stopCandidatePreview();
              setPropagationProposal(undefined);
              const slotId = editable.selectedSlotId;
              if (slotId) {
                setEditable((current) => resetEditableChord(current, slotId));
              }
            }}
            canSplit={Boolean(selectedSlot && canSplitEditableChord(editable, selectedSlot.id))}
            canMergePrevious={Boolean(previousSlot && selectedSlot && canMergeEditableChords(editable, previousSlot.id, selectedSlot.id))}
            canMergeNext={Boolean(selectedSlot && nextSlot && canMergeEditableChords(editable, selectedSlot.id, nextSlot.id))}
            canDelete={editable.slots.length > 1}
            onSplit={() => selectedSlot && commitStructuralChange(splitEditableChord(editable, selectedSlot.id))}
            onMergePrevious={() => previousSlot && selectedSlot && commitStructuralChange(mergeEditableChords(editable, previousSlot.id, selectedSlot.id, "second"))}
            onMergeNext={() => selectedSlot && nextSlot && commitStructuralChange(mergeEditableChords(editable, selectedSlot.id, nextSlot.id, "first"))}
            onDelete={() => selectedSlot && commitStructuralChange(deleteEditableChord(editable, selectedSlot.id))}
            onEditStart={stopCandidatePreview}
            propagation={propagationProposal && propagationProposal.sourceSlotId === selectedSlot?.id
              ? { ...propagationProposal, slots: editable.slots }
              : undefined}
            onApplyPropagation={(segmentIds) => {
              if (!propagationProposal || segmentIds.length === 0) return;
              stopCandidatePreview();
              const next = replaceEditableChords(
                editable,
                segmentIds,
                propagationProposal.chord,
                "propagation",
              );
              if (next === editable) return;
              setEditable(next);
              const feedback = buildPropagationFeedbackEvent({
                sourceFingerprint,
                analyzerVersion,
                sourceSlot: next.slots.find((slot) => slot.id === propagationProposal.sourceSlotId),
                shownCandidates: propagationProposal.candidates,
                acceptedSegmentIds: segmentIds,
                beatsPerBar,
              });
              if (feedback) {
                setPropagationFeedback((current) => [
                  ...current,
                  {
                    event: feedback,
                    historyIndex: next.historyIndex,
                    chord: propagationProposal.chord,
                  },
                ]);
              }
              setPropagationProposal(proposalFor(
                next,
                propagationProposal.sourceSlotId,
                propagationProposal.chord,
                captureSimilarityContext(next, detectedKey, analysisInput),
              ));
            }}
          />,
          inspectorHost,
        ) : null}
      </div>
      {showRomanNumerals && selectedRomanHint ? (
        <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{selectedRomanHint.label}{selectedRomanHint.detail ? ` · ${selectedRomanHint.detail}` : ""}{selectedRomanHint.confidence !== "high" ? copy.capture.reference : ""}</p>
      ) : null}
      {isExpanded && visibleWarnings.length > 0 ? (
        <StatusMessage className="mt-3" tone="warning" title={copy.capture.reviewPrefix}>
          <ul className="grid gap-1">
            {visibleWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </StatusMessage>
      ) : null}

      {isExpanded ? (
        <ProgressionEditSummary
          items={progressionEditSummary(editable)}
          language={language}
          onSelect={(slotId) => {
            const index = editable.slots.findIndex((slot) => slot.id === slotId);
            if (index >= 0) {
              if (slotId !== propagationProposal?.sourceSlotId) {
                setPropagationProposal(undefined);
              }
              setEditable((current) => selectEditableSlot(current, slotId));
            }
          }}
        />
      ) : null}

      {isExpanded && captureDraft !== undefined ? (
        <CaptureEditHistoryPanel
          draft={captureDraft}
          language={language}
          onJump={(historyIndex) => applyCaptureHistory(
            jumpCaptureDraftHistory(captureDraft, historyIndex),
          )}
        />
      ) : null}

    </div>
  );
}

interface PropagationProposal {
  sourceSlotId: string;
  chord: ChordSymbol;
  candidates: SimilarSegmentCandidate[];
}

interface PendingPropagationFeedback {
  event: CorrectionPropagationFeedbackEvent;
  historyIndex: number;
  chord: ChordSymbol;
}

function proposalFor(
  editable: EditableProgression,
  sourceSlotId: string,
  chord: ChordSymbol,
  context: SimilarityContext,
): PropagationProposal | undefined {
  const sourceSlot = editable.slots.find((slot) => slot.id === sourceSlotId);
  if (!sourceSlot) return undefined;
  const candidates = findSimilarSegments(editable.slots, sourceSlot, context);
  return candidates.length > 0 ? { sourceSlotId, chord, candidates } : undefined;
}

export function captureSimilarityContext(
  editable: EditableProgression,
  detectedKey?: string,
  analysisInput?: AnalysisInput,
): SimilarityContext {
  const voiceContext = analysisInput
    ? similarityVoiceContext(analysisInput)
    : undefined;
  return buildSimilarityContext(editable.slots, {
    ...(detectedKey !== undefined ? { key: detectedKey } : {}),
    ...(voiceContext ? { voiceContext } : {}),
  });
}

function similarityVoiceContext(analysisInput: AnalysisInput): SimilarityVoiceContext {
  const enabledVoiceIds = [...new Set(analysisInput.enabledVoiceIds)].sort(asciiCompare);
  const voices = new Map(analysisInput.voices.map((voice) => [voice.id, voice]));
  const roleProfiles = Object.fromEntries(enabledVoiceIds.map((voiceId) => {
    const voice = voices.get(voiceId);
    const override = analysisInput.roleOverrides[voiceId];
    return [voiceId, {
      role: override ?? voice?.inferredRole ?? "mixed",
      confidence: override ? 1 : voice?.roleConfidence ?? 0,
    }];
  }));
  return { enabledVoiceIds, roleProfiles };
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function activePropagationEvents(
  editable: EditableProgression,
  pending: readonly PendingPropagationFeedback[],
): CorrectionPropagationFeedbackEvent[] {
  return pending.flatMap((entry) => {
    if (entry.historyIndex > editable.historyIndex) return [];
    const operation = editable.history[entry.historyIndex - 1];
    if (operation?.type !== "replace" || operation.editSource !== "propagation") return [];
    const accepted = entry.event.acceptedSegmentIds;
    const acceptedSet = new Set(accepted);
    if (
      operation.slotIds.length !== accepted.length
      || operation.slotIds.some((id) => !acceptedSet.has(id))
      || accepted.some((id) => {
        const slot = editable.slots.find((candidate) => candidate.id === id);
        return !slot || !chordsEqual(slot.currentChord, entry.chord);
      })
    ) {
      return [];
    }
    return [entry.event];
  });
}

export function buildPropagationFeedbackEvent({
  sourceFingerprint,
  analyzerVersion,
  sourceSlot,
  shownCandidates,
  acceptedSegmentIds,
  beatsPerBar,
}: {
  sourceFingerprint?: string;
  analyzerVersion: string;
  sourceSlot?: EditableChordSlot;
  shownCandidates: readonly SimilarSegmentCandidate[];
  acceptedSegmentIds: readonly string[];
  beatsPerBar: number;
}): CorrectionPropagationFeedbackEvent | undefined {
  if (!sourceFingerprint || !sourceSlot || shownCandidates.length === 0) return undefined;
  const shownSegmentIds = shownCandidates.map((candidate) => candidate.segmentId);
  const shownSet = new Set(shownSegmentIds);
  const acceptedSet = new Set(acceptedSegmentIds.filter((id) => shownSet.has(id)));
  if (acceptedSet.size === 0) return undefined;
  const startBeat = (sourceSlot.position.bar - 1) * beatsPerBar
    + sourceSlot.position.beat - 1;

  return {
    schemaVersion: 1,
    eventType: "correction-propagation",
    sourceFingerprint,
    analyzerVersion,
    sourceSegment: {
      id: sourceSlot.id,
      startBeat,
      endBeat: startBeat + sourceSlot.position.durationBeats,
    },
    shownSegmentIds,
    acceptedSegmentIds: shownSegmentIds.filter((id) => acceptedSet.has(id)),
    rejectedSegmentIds: shownSegmentIds.filter((id) => !acceptedSet.has(id)),
    threshold: SIMILAR_SEGMENT_THRESHOLD,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--lv-text-muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--lv-text)]">{value}</p>
    </div>
  );
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

export function isMidiFileName(fileName: string): boolean {
  return /\.(mid|midi)$/i.test(fileName);
}

function hasDroppedFiles(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("clipboard-unavailable");
  }
  await navigator.clipboard.writeText(text);
}

function renderInspector(inspector: ReactNode, host: HTMLElement | null | undefined) {
  if (host === null) return null;
  return host === undefined ? inspector : createPortal(inspector, host);
}

export function useStickyInspectorHeight(
  host: HTMLElement | null,
  active: boolean,
): void {
  useEffect(() => {
    const property = "--lv-sticky-inspector-height";
    const root = document.documentElement;
    if (!host || !active) {
      root.style.removeProperty(property);
      return undefined;
    }

    const desktopQuery = window.matchMedia?.("(min-width: 1280px)");
    const updateHeight = () => {
      const desktop = desktopQuery?.matches ?? window.innerWidth >= 1280;
      if (desktop) {
        root.style.removeProperty(property);
        return;
      }
      root.style.setProperty(property, `${Math.ceil(host.getBoundingClientRect().height)}px`);
    };

    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updateHeight);
    observer?.observe(host);
    window.addEventListener("resize", updateHeight);
    desktopQuery?.addEventListener?.("change", updateHeight);
    updateHeight();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      desktopQuery?.removeEventListener?.("change", updateHeight);
      root.style.removeProperty(property);
    };
  }, [active, host]);
}

export function stopCapturePlayback(controller: PlaybackController = playbackController): void {
  if (controller.getState().source?.kind === "capture") {
    controller.stop();
  }
}

export function captureAnalysisIdentity(result: MidiProgressionAnalysis | undefined): string {
  if (!result) return "analysis";
  if (result.sourceFingerprint) return `fingerprint:${encodeURIComponent(result.sourceFingerprint)}`;

  return [
    result.sourceAssetId ? `asset:${encodeURIComponent(result.sourceAssetId)}` : undefined,
    result.fileName ? `file:${encodeURIComponent(result.fileName)}` : undefined,
    `analyzed:${encodeURIComponent(result.analyzedAt)}`,
    `analyzer:${encodeURIComponent(result.analyzerVersion)}`,
  ].filter(Boolean).join("|");
}

/**
 * Notes for a single chord card click.
 *
 * Clicking one chord used to fall through to the generated preview voicing while
 * the same chord played its original MIDI voicing everywhere else, so a chord
 * auditioned in capture sounded different from the same chord in Progression
 * Detail and Chord Dojo. This resolves it the same way those screens do.
 *
 * `resolveVoicingForUse` checks the stored voicing against the chord, so an
 * edited chord falls back to a generated voicing instead of replaying the
 * voicing of the chord it replaced.
 */
function singleChordVoicing(event: ChordTimelineItem | undefined): readonly number[] | undefined {
  if (!event) return undefined;
  return resolveVoicingForUse(
    event.chord,
    event.voicingMemory,
    voiceChordForPreview(event.chord).notes,
  ).midiNotes;
}

type CandidateLaneKind = "progression" | "vamp" | "fragment";

interface CandidateLane {
  kind: CandidateLaneKind;
  /** Null when the lane needs no heading: a single lane is just the list. */
  heading: string | null;
  candidates: Array<{ candidate: ProgressionBlockCandidate; index: number }>;
}

/**
 * Splits the candidate list into its three lanes.
 *
 * A one-chord vamp is a musical shape, not a defective progression, so it keeps a
 * lane of its own rather than being scored down or hidden — that was the Phase 4.0
 * decision and it still holds. Fragments sit last and only appear when they exist.
 *
 * Headings are suppressed when only one lane has anything in it, so a song made
 * entirely of vamps reads as a list of candidates rather than as a list under a
 * warning about what it failed to be.
 */
export function candidateLanes(
  candidates: readonly ProgressionBlockCandidate[],
): CandidateLane[] {
  const order: CandidateLaneKind[] = ["progression", "vamp", "fragment"];
  const numbered = candidates.map((candidate, index) => ({ candidate, index }));
  const lanes = order
    .map((kind) => ({
      kind,
      heading: kind as string | null,
      candidates: numbered.filter(
        // An analyzer that predates the classification leaves `kind` unset; those
        // candidates stay in the main lane rather than vanishing.
        ({ candidate }) => (candidate.kind ?? "progression") === kind,
      ),
    }))
    .filter((lane) => lane.candidates.length > 0);

  return lanes.length <= 1
    ? lanes.map((lane) => ({ ...lane, heading: null }))
    : lanes;
}

function captureCandidateSource(
  result: MidiProgressionAnalysis | undefined,
  candidateId: string,
): PlayingSource {
  return {
    kind: "capture",
    id: `analysis:${captureAnalysisIdentity(result)}:candidate:${candidateId}`,
  };
}

function captureFullTimelineSource(result: MidiProgressionAnalysis): PlayingSource {
  return {
    kind: "capture",
    id: `analysis:${captureAnalysisIdentity(result)}:full-timeline`,
  };
}

export function timelinePlaybackPosition(
  chords: readonly ChordTimelineItem[],
  bpm: number,
  startedAt: number | undefined,
  now = globalThis.performance?.now() ?? Date.now(),
  beatsPerBar = 4,
): { index: number; progress: number } | undefined {
  if (startedAt === undefined || chords.length === 0 || bpm <= 0) return undefined;
  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
  const firstBeat = firstTimelineBeatFor(chords, beatsPerBar);

  for (const [index, chord] of chords.entries()) {
    const startBeat = timelineStartBeat(chord, beatsPerBar) - firstBeat;
    const startSeconds = startBeat * (60 / bpm);
    const endSeconds = (startBeat + chord.durationBeats) * (60 / bpm);
    if (elapsedSeconds >= startSeconds && elapsedSeconds < endSeconds) {
      return {
        index,
        progress: chordProgressFraction(
          { startBeat, durationBeats: chord.durationBeats },
          bpm,
          elapsedSeconds,
        ) ?? 0,
      };
    }
  }
  return undefined;
}

function firstTimelineBeatFor(chords: readonly ChordTimelineItem[], beatsPerBar: number): number {
  return chords.length === 0
    ? 0
    : Math.min(...chords.map((chord) => timelineStartBeat(chord, beatsPerBar)));
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }
  return element.isContentEditable
    || element.contentEditable === "true"
    || element.getAttribute("contenteditable") === "true"
    || element.tagName === "INPUT"
    || element.tagName === "TEXTAREA"
    || element.tagName === "SELECT";
}

export function captureSaveTitle(
  candidate: ProgressionBlockCandidate,
  sourceFileName: string | undefined,
  detectedKey: string | undefined,
  copy: AppCopy,
  _language: AppLanguage,
): string {
  const range = copy.capture.barRange(candidate.startBar, candidate.endBar);
  const fileName = sourceFileName?.trim();
  if (fileName) return `${fileName} · ${range}`;

  const key = detectedKey?.trim();
  if (key) return `${key} · ${range}`;

  const summary = candidate.summaryText.trim();
  return summary || copy.capture.savedProgression;
}

export function appendProgressionMemo(existingMemo: string, progressionText: string): string {
  if (!existingMemo) return progressionText;
  return `${existingMemo}${existingMemo.endsWith("\n") ? "" : "\n"}${progressionText}`;
}

function progressionSignature(chords: readonly ChordTimelineItem[]): string {
  return JSON.stringify(chords.map(({ eventId: _eventId, ...item }) => item));
}
