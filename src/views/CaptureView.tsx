import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  open as openFileDialog,
} from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  applyEditableProgression,
  canRedoProgressionEdit,
  canMergeEditableChords,
  canSplitEditableChord,
  canUndoProgressionEdit,
  buildSimilarityContext,
  chordsEqual,
  createEditableProgression,
  deleteEditableChord,
  findSimilarSegments,
  hasProgressionEdits,
  progressionEditSummary,
  mergeEditableChords,
  redoProgressionEdit,
  replaceEditableChord,
  replaceEditableChords,
  resetAllEditableChords,
  resetEditableChord,
  selectEditableSlot,
  splitEditableChord,
  undoProgressionEdit,
  SIMILAR_SEGMENT_THRESHOLD,
} from "../domain/progressionEditing";
import type {
  EditableChordSlot,
  EditableProgression,
  SimilarSegmentCandidate,
  SimilarityContext,
  SimilarityVoiceContext,
} from "../domain/progressionEditing";
import { beatsPerBar as beatsPerBarFor, buildCorrectionEvents } from "../domain/midi";
import type { AnalysisInput } from "../domain/midi/types";
import type {
  CorrectionPropagationFeedbackEvent,
  PersistedAnalysisFeedbackEvent,
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
import { SaveProgressionPopover } from "../components/SaveProgressionPopover";
import { SongMiniMap } from "../components/SongMiniMap";
import { EditableProgressionGrid } from "../components/progression-editing/EditableProgressionGrid";
import { ProgressionEditorToolbar } from "../components/progression-editing/ProgressionEditorToolbar";
import { ProgressionEditSummary } from "../components/progression-editing/ProgressionEditSummary";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { Copy, TriangleAlert } from "lucide-react";

interface CaptureViewProps {
  ideas: SongIdea[];
  analysis: AnalysisState;
  analyzeMidiBytes: (
    bytes: Uint8Array,
    options?: { fileName?: string; sourceAssetId?: string },
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
  const [isInspectorExpanded, setInspectorExpanded] = useState(false);
  const [inspectorHost, setInspectorHost] = useState<HTMLDivElement | null>(null);
  const [dirtyCandidateIds, setDirtyCandidateIds] = useState<Set<string>>(() => new Set());
  const [pendingCandidateSelection, setPendingCandidateSelection] = useState<{
    candidateId: string | undefined;
    revealTimeline?: boolean;
  }>();
  const [isTimelineOpen, setTimelineOpen] = useState(false);
  const [timelineScrollBar, setTimelineScrollBar] = useState<number>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [previewSound, setPreviewSound] = useState<PreviewSound>("piano");
  const candidateHeaderFocusIdRef = useRef<string>();
  const result = analysis.result;

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
    options?: { revealTimeline?: boolean },
  ): boolean {
    if (
      expandedCandidateId
      && expandedCandidateId !== candidateId
      && dirtyCandidateIds.has(expandedCandidateId)
    ) {
      setPendingCandidateSelection({ candidateId, revealTimeline: options?.revealTimeline });
      return false;
    }
    applyCandidateSelection(candidateId);
    if (candidateId && options?.revealTimeline) {
      revealCandidateInTimeline(candidateId);
    }
    return true;
  }

  function revealCandidateInTimeline(candidateId: string) {
    const candidate = result?.blockCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    setTimelineOpen(true);
    setTimelineScrollBar(candidate.startBar);
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
    (bytes: Uint8Array, fileName: string) => {
      stopCapturePlayback(controller);
      const analyzed = analyzeMidiBytes(bytes, { fileName });
      setToast(analyzed ? copy.toast.midiAnalyzed : copy.toast.midiFailed);
    },
    [analyzeMidiBytes, controller, copy.toast.midiAnalyzed, copy.toast.midiFailed, setToast],
  );

  const analyzeMidiPath = useCallback(
    async (path: string) => {
      if (!isMidiFileName(path)) {
        setToast(copy.toast.midiDropInvalid);
        return;
      }

      try {
        const bytes = await readFile(path);
        setSourcePath(path);
        analyzeMidiBytesWithToast(bytes, fileNameFromPath(path));
      } catch (error) {
        setToast(error instanceof Error ? error.message : copy.toast.midiReadFailed);
      }
    },
    [analyzeMidiBytesWithToast, copy.toast.midiDropInvalid, copy.toast.midiReadFailed, setToast],
  );

  const analyzeDroppedFile = useCallback(
    async (file: File) => {
      if (!isMidiFileName(file.name)) {
        setToast(copy.toast.midiDropInvalid);
        return;
      }

      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setSourcePath(undefined);
        analyzeMidiBytesWithToast(bytes, file.name);
      } catch (error) {
        setToast(error instanceof Error ? error.message : copy.toast.midiReadFailed);
      }
    },
    [analyzeMidiBytesWithToast, copy.toast.midiDropInvalid, copy.toast.midiReadFailed, setToast],
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
        const path = event.payload.paths.find(isMidiFileName);
        if (!path) {
          setToast(copy.toast.midiDropInvalid);
          return;
        }

        void analyzeMidiPath(path);
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
  }, [analyzeMidiPath, copy.toast.midiDropInvalid, setToast]);

  async function chooseMidi() {
    stopCapturePlayback(controller);
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.desktopMidiOnly);
      return;
    }

    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
    });
    if (typeof path !== "string") {
      return;
    }

    await analyzeMidiPath(path);
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
    const file = Array.from(event.dataTransfer.files).find((item) => isMidiFileName(item.name));
    if (!file) {
      setToast(copy.toast.midiDropInvalid);
      return;
    }

    void analyzeDroppedFile(file);
  }

  const dropHandlers = {
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  function saveNew(
    candidate: ProgressionBlockCandidate,
    title: string,
    nextAction: string,
    userVerified: boolean,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
  ): boolean {
    const corrections = correctionEvents(original, candidate, editable);
    const userEdited = hasProgressionEdits(editable);
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
      persistCorrectionEvents([...corrections, ...propagationEvents]);
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
    );
  }

  function persistCorrectionEvents(events: readonly PersistedAnalysisFeedbackEvent[]) {
    if (events.length === 0) {
      return;
    }
    void appendAnalysisFeedback(events)
      .catch((error) => setToast(error instanceof Error ? error.message : copy.capture.feedbackSaveFailed));
  }

  function appendExisting(
    candidate: ProgressionBlockCandidate,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    ideaId: string,
    userVerified: boolean,
    propagationEvents: readonly CorrectionPropagationFeedbackEvent[],
  ): boolean {
    if (!ideaId) {
      setToast(copy.capture.chooseIdeaFirst);
      return false;
    }

    const appended = appendBlockToIdea(ideaId, candidate, analysis.result, {
      sourcePath,
      userEdited: hasProgressionEdits(editable),
      userVerified,
    });
    if (appended) {
      persistCorrectionEvents([
        ...correctionEvents(original, candidate, editable),
        ...propagationEvents,
      ]);
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

  async function previewCandidateChord(candidate: ProgressionBlockCandidate, chordIndex: number) {
    try {
      const chord = candidate.chords[chordIndex]?.chord;
      if (chord) {
        await controller.toggle(
          {
            kind: "capture",
            id: `${captureCandidateSource(result, candidate.id).id}:chord:${chordIndex}:${chord.label}`,
          },
          { type: "chord", chord, sound: previewSound },
        );
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  if (!result) {
    return (
      <div className="py-5" {...dropHandlers}>
        <CaptureEmptyState
          status={analysis.status}
          error={analysis.error}
          onChooseMidi={() => void chooseMidi()}
          isDraggingMidi={isDraggingMidi}
          copy={copy}
        />
      </div>
    );
  }

  return (
    <>
      <div className="lv-capture-content grid gap-5 py-5" {...dropHandlers}>
      {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
      <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lv-accent)]">
              {copy.capture.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{copy.capture.title}</h2>
            <p className="mt-2 text-sm text-teal-200">{result.fileName ?? "MIDI"}</p>
            <p className="mt-2 max-w-2xl text-sm text-[var(--lv-text-muted)]">
              {copy.capture.resultDescription}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void chooseMidi()}>
              {copy.capture.chooseAnother}
            </button>
            <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => { stopCapturePlayback(controller); clearAnalysis(); setSourcePath(undefined); }}>
              {copy.capture.clear}
            </button>
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
        candidates={result.blockCandidates}
        activeCandidateId={expandedCandidateId}
        copy={{
          title: copy.capture.songMiniMap,
          description: copy.capture.songMiniMapDescription,
          empty: copy.capture.songMiniMapEmpty,
          candidateLabel: copy.capture.songMiniMapCandidate,
        }}
        onCandidateSelect={(candidateId) => {
          selectExpandedCandidate(candidateId, { revealTimeline: true });
        }}
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
            {result.blockCandidates.length > 0 ? (
              result.blockCandidates.map((candidate, index) => (
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
                  onCopyProgression={copyProgression}
                  onPreview={previewCandidate}
                  onPreviewChord={previewCandidateChord}
                  playbackSource={captureCandidateSource(result, candidate.id)}
                  previewSound={previewSound}
                  controller={controller}
                  onPreviewError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
                  copy={copy}
                  language={language}
                  isExpanded={expandedCandidateId === candidate.id}
                  inspectorExpanded={isInspectorExpanded}
                  inspectorHost={inspectorHost}
                  onSelect={() => selectExpandedCandidate(candidate.id)}
                  onCollapse={() => selectExpandedCandidate(undefined)}
                  onInspectorExpandedChange={setInspectorExpanded}
                  onDirtyChange={markCandidateDirty}
                  onCreate={(editedCandidate, title, nextAction, userVerified, editable, propagationEvents) => (
                    saveNew(editedCandidate, title, nextAction, userVerified, candidate, editable, propagationEvents)
                  )}
                  onAppend={(editedCandidate, ideaId, userVerified, editable, propagationEvents) => (
                    appendExisting(editedCandidate, candidate, editable, ideaId, userVerified, propagationEvents)
                  )}
                  onCopyMemo={(editedCandidate, ideaId) => {
                    return copyMemo(editedCandidate, ideaId);
                  }}
                  showRomanNumerals={showRomanNumerals}
                />
              ))
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
      />
      </div>
      <ConfirmDialog
        open={Boolean(pendingCandidateSelection)}
        title={copy.capture.closeUnsavedTitle}
        description={copy.capture.unsavedCandidateConfirm}
        confirmLabel={copy.common.close}
        cancelLabel={copy.common.cancel}
        onCancel={() => setPendingCandidateSelection(undefined)}
        onConfirm={() => {
          if (!pendingCandidateSelection) return;
          applyCandidateSelection(pendingCandidateSelection.candidateId);
          if (pendingCandidateSelection.candidateId && pendingCandidateSelection.revealTimeline) {
            revealCandidateInTimeline(pendingCandidateSelection.candidateId);
          }
          setPendingCandidateSelection(undefined);
        }}
        tone="danger"
      />
    </>
  );
}

function CaptureEmptyState({
  status,
  error,
  onChooseMidi,
  isDraggingMidi,
  copy,
}: {
  status: AnalysisState["status"];
  error?: string;
  onChooseMidi: () => void;
  isDraggingMidi: boolean;
  copy: AppCopy;
}) {
  return (
    <section className={`grid min-h-[32rem] place-items-center border p-6 text-center transition-colors ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent)]/10" : "border-[var(--lv-border)] bg-[var(--lv-bg)]/70"}`}>
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lv-accent)]">
          {copy.capture.eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-semibold">{copy.capture.title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--lv-text-muted)]">{copy.capture.emptyDescription}</p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <StepCard index="1" text={copy.capture.emptyStepTimeline} />
          <StepCard index="2" text={copy.capture.emptyStepCandidates} />
          <StepCard index="3" text={copy.capture.emptyStepSave} />
        </div>
        <div className={`mt-7 border border-dashed p-5 ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent)]/10 text-teal-50" : "border-[var(--lv-border-strong)] bg-[var(--lv-bg)] text-[var(--lv-text-secondary)]"}`}>
          <p className="text-lg font-semibold">
            {isDraggingMidi ? copy.capture.dropActive : copy.capture.dropMidi}
          </p>
          <p className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.capture.dropHelp}</p>
        </div>
        <button className="mt-7 rounded bg-[var(--lv-accent)] px-5 py-3 text-sm font-semibold text-stone-950" onClick={onChooseMidi}>
          {copy.capture.loadMidi}
        </button>
        <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{copy.capture.supportedFormats}</p>
        {status === "analyzing" ? (
          <div className="mt-6 border border-cyan-500/30 bg-cyan-500/10 p-4 text-left text-sm text-cyan-100">
            <p className="font-semibold">{copy.capture.analyzing}</p>
            <p className="mt-2 text-cyan-100/80">{copy.capture.analyzingDetail}</p>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="mt-6 border border-red-500/30 bg-red-500/10 p-4 text-left text-sm text-red-100">
            <p className="font-semibold">{copy.capture.loadFailed}</p>
            <p className="mt-2 text-red-100/80">{error}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
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
  previewSound,
  onPreviewSoundChange,
  onPlaybackError,
  controller = playbackController,
  open,
  onOpenChange,
  scrollToBar,
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
}) {
  const [selectedChordIndex, setSelectedChordIndex] = useState<number>();
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
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    const chordIndex = result.fullTimeline.findIndex((chord) => chord.bar >= scrollToBar);
    if (chordIndex >= 0) setSelectedChordIndex(chordIndex);
  }, [open, result.fullTimeline, scrollToBar]);

  async function previewTimelineChord(index: number) {
    setSelectedChordIndex(index);
    const chord = result.fullTimeline[index]?.chord;
    if (chord) {
      try {
        await controller.toggle(
          { kind: "capture", id: `${source.id}:chord:${index}:${chord.label}` },
          { type: "chord", chord, sound: previewSound },
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
    </details>
  );
}

function PreviewSoundSelector({
  value,
  onChange,
  copy,
}: {
  value: PreviewSound;
  onChange: (sound: PreviewSound) => void;
  copy: AppCopy;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={copy.capture.previewSound}>
      <span className="mr-2 text-xs font-semibold text-[var(--lv-text-muted)]">
        {copy.capture.previewSound}
      </span>
      {(["piano", "electric-piano"] as const).map((sound) => (
        <button
          key={sound}
          type="button"
          className={`min-h-9 rounded px-3 text-sm ${value === sound ? "bg-[var(--lv-accent)] font-semibold text-stone-950" : "border border-[var(--lv-border-strong)] text-[var(--lv-text-secondary)]"}`}
          aria-pressed={value === sound}
          onClick={() => onChange(sound)}
        >
          {sound === "piano" ? copy.capture.piano : copy.capture.electricPiano}
        </button>
      ))}
    </div>
  );
}

export function ProgressionCandidateCard({
  candidate,
  candidateIndex,
  bpm,
  beatsPerBar = 4,
  detectedKey,
  sourceFingerprint,
  analyzerVersion = "unknown",
  analysisInput,
  sourceFileName,
  ideas = [],
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
  onCreate,
  onAppend,
  onCopyMemo,
  showRomanNumerals = true,
}: {
  candidate: ProgressionBlockCandidate;
  candidateIndex: number;
  bpm: number;
  beatsPerBar?: number;
  detectedKey?: string;
  sourceFingerprint?: string;
  analyzerVersion?: string;
  analysisInput?: AnalysisInput;
  sourceFileName?: string;
  ideas?: SongIdea[];
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
  showRomanNumerals?: boolean;
}) {
  const editorCopy = progressionEditorCopy[language];
  const [editable, setEditable] = useState(() => createEditableProgression(candidate, beatsPerBar));
  const [savedSignature, setSavedSignature] = useState(() => progressionSignature(candidate.chords));
  const [selectedChordIndex, setSelectedChordIndex] = useState(0);
  const [propagationProposal, setPropagationProposal] = useState<PropagationProposal>();
  const [propagationFeedback, setPropagationFeedback] = useState<PendingPropagationFeedback[]>([]);
  const [, forcePlaybackTick] = useState(0);
  const currentCandidate = applyEditableProgression(candidate, editable);
  const chords = currentCandidate.chords;
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

  useEffect(() => {
    setEditable(createEditableProgression(candidate, beatsPerBar));
    setSavedSignature(progressionSignature(candidate.chords));
    setSelectedChordIndex(0);
    setPropagationProposal(undefined);
    setPropagationFeedback([]);
  }, [beatsPerBar, candidate, language]);

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
        setEditable((current) => event.shiftKey
          ? redoProgressionEdit(current)
          : undoProgressionEdit(current));
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(editable.slots.length - 1, selectedChordIndex + direction));
        setSelectedChordIndex(nextIndex);
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

  async function selectChord(index: number) {
    onSelect?.();
    setSelectedChordIndex(index);
    const slot = editable.slots[index];
    if (slot?.id !== propagationProposal?.sourceSlotId) {
      setPropagationProposal(undefined);
    }
    if (slot) {
      setEditable((current) => selectEditableSlot(current, slot.id));
    }
    await onPreviewChord(editedCandidate, index);
  }

  async function previewChord(chord: ChordSymbol) {
    const previewChords = chords.map((item, index) =>
      index === selectedChordIndex ? { ...item, chord } : item,
    );
    await onPreviewChord({ ...editedCandidate, chords: previewChords }, selectedChordIndex);
  }

  function commitStructuralChange(next: EditableProgression) {
    if (next === editable) {
      return;
    }
    stopCandidatePreview();
    setPropagationProposal(undefined);
    setEditable(next);
    const nextIndex = next.slots.findIndex((slot) => slot.id === next.selectedSlotId);
    setSelectedChordIndex(Math.max(0, nextIndex));
  }

  const playbackPosition = candidatePlaying && playback.status === "playing"
    ? timelinePlaybackPosition(chords, bpm, playback.startedAt, undefined, beatsPerBar)
    : undefined;
  const playingChordIndex = playbackPosition?.index ?? null;
  const playingProgress = playbackPosition?.progress ?? null;
  const selectedChord = chords[selectedChordIndex] ?? chords[0];
  const selectedSlotIndex = editable.slots.findIndex((slot) => slot.id === editable.selectedSlotId);
  const selectedSlot = selectedSlotIndex >= 0 ? editable.slots[selectedSlotIndex] : undefined;
  const previousSlot = selectedSlotIndex > 0 ? editable.slots[selectedSlotIndex - 1] : undefined;
  const nextSlot = selectedSlotIndex >= 0 ? editable.slots[selectedSlotIndex + 1] : undefined;
  const selectedRomanHint = selectedChord
    ? romanNumeralHint(selectedChord.chord, detectedKey)
    : undefined;
  const visibleWarnings = candidate.warnings.map((warning) => warningLabel(warning, language));
  const shouldDisplayConfidence = shouldShowConfidence(candidate.confidence);

  return (
    <div className={`border bg-[var(--lv-bg)] p-4 transition-colors ${isExpanded ? "border-teal-400/50" : "border-[var(--lv-border)] hover:border-stone-600"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button data-candidate-toggle data-candidate-id={candidate.id} className="min-w-0 text-left" onClick={onSelect} aria-expanded={isExpanded}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
            {editorCopy.candidate(candidateIndex + 1)}
          </p>
          <p className="mt-2 font-semibold">
            {editorCopy.candidateBars(candidate.startBar, candidate.endBar, candidate.lengthBars)}
          </p>
          {shouldDisplayConfidence ? (
            <p className="mt-1 text-sm text-amber-200">
              {editorCopy.confidence}: {confidenceLabel(candidate.confidence, language)}
            </p>
          ) : null}
        </button>
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
            }}
          />
          <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void onCopyProgression(editedCandidate)}>
            <Copy aria-hidden="true" size={16} />
            {copy.capture.copyProgression}
          </button>
        </div>
      </div>
      <span className="mt-3 inline-flex rounded bg-[var(--lv-surface-raised)] px-2 py-1 text-xs text-teal-200">{candidateLabelList(candidate.labels, language).join(" · ")}</span>
      {candidate.summaryText.trim() ? <p className="mt-3 text-sm text-[var(--lv-text-secondary)]">{candidate.summaryText}</p> : null}
      <div className="mt-4">
        <div>
          {isExpanded ? (
            <ProgressionEditorToolbar
              canUndo={canUndoProgressionEdit(editable)}
              canRedo={canRedoProgressionEdit(editable)}
              dirty={hasProgressionEdits(editable)}
              onUndo={() => { stopCandidatePreview(); setPropagationProposal(undefined); setEditable((current) => undoProgressionEdit(current)); }}
              onRedo={() => { stopCandidatePreview(); setPropagationProposal(undefined); setEditable((current) => redoProgressionEdit(current)); }}
              onResetAll={() => { stopCandidatePreview(); setPropagationProposal(undefined); setEditable((current) => resetAllEditableChords(current)); }}
              language={language}
            />
          ) : null}
          <EditableProgressionGrid
            editable={editable}
            playingSlotId={playingChordIndex === null ? undefined : editable.slots[playingChordIndex]?.id}
            playingProgress={playingProgress}
            onSelect={(_slotId, index) => void selectChord(index)}
            language={language}
          />
        </div>
        {isExpanded ? renderInspector(
          <ChordInspector
            slot={selectedSlot}
            language={language}
            expanded={inspectorExpanded}
            onExpandedChange={onInspectorExpandedChange}
            onPreview={(chord) => void previewChord(chord)}
            playbackSource={source}
            previewSound={previewSound}
            stopLabel={copy.common.stop}
            onPreviewError={onPreviewError}
            controller={controller}
            onApply={(chord, source) => {
              stopCandidatePreview();
              const slotId = editable.selectedSlotId;
              if (slotId) {
                const next = replaceEditableChord(editable, slotId, chord, source);
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
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleWarnings.map((warning) => (
            <span key={warning} className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
              <TriangleAlert aria-hidden="true" size={16} />
              {copy.capture.reviewPrefix}: {warning}
            </span>
          ))}
        </div>
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
              setSelectedChordIndex(index);
              setEditable((current) => selectEditableSlot(current, slotId));
            }
          }}
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
  return JSON.stringify(chords);
}
