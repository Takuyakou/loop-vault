import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  open as openFileDialog,
} from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  applyEditableProgression,
  canRedoProgressionEdit,
  canMergeEditableChords,
  canSplitEditableChord,
  canUndoProgressionEdit,
  createEditableProgression,
  deleteEditableChord,
  hasProgressionEdits,
  progressionEditSummary,
  mergeEditableChords,
  redoProgressionEdit,
  replaceEditableChord,
  resetAllEditableChords,
  resetEditableChord,
  selectEditableSlot,
  splitEditableChord,
  undoProgressionEdit,
} from "../domain/progressionEditing";
import type { EditableProgression, ProgressionEditSummaryItem } from "../domain/progressionEditing";
import { buildCorrectionEvents } from "../domain/midi";
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
import { ChordInspector } from "../components/progression-editing/ChordInspector";
import { EditableProgressionGrid } from "../components/progression-editing/EditableProgressionGrid";
import { ProgressionEditorToolbar } from "../components/progression-editing/ProgressionEditorToolbar";
import { ProgressionEditSummary } from "../components/progression-editing/ProgressionEditSummary";

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
}

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

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
  } = props;
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string>();
  const [dirtyCandidateIds, setDirtyCandidateIds] = useState<Set<string>>(() => new Set());
  const [saveDraft, setSaveDraft] = useState<{
    candidate: ProgressionBlockCandidate;
    original: ProgressionBlockCandidate;
    editable: EditableProgression;
    title: string;
  }>();
  const [sourcePath, setSourcePath] = useState<string>();
  const [previewSound, setPreviewSound] = useState<PreviewSound>("piano");
  const result = analysis.result;

  const markCandidateDirty = useCallback((candidateId: string, dirty: boolean) => {
    setDirtyCandidateIds((current) => {
      if (current.has(candidateId) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }, []);

  function selectExpandedCandidate(candidateId: string | undefined) {
    if (
      expandedCandidateId
      && expandedCandidateId !== candidateId
      && dirtyCandidateIds.has(expandedCandidateId)
      && !window.confirm(copy.capture.unsavedCandidateConfirm)
    ) {
      return;
    }
    void stopPreviewAudio();
    setExpandedCandidateId(candidateId);
  }

  const analyzeMidiBytesWithToast = useCallback(
    (bytes: Uint8Array, fileName: string) => {
      const analyzed = analyzeMidiBytes(bytes, { fileName });
      setToast(analyzed ? copy.toast.midiAnalyzed : copy.toast.midiFailed);
    },
    [analyzeMidiBytes, copy.toast.midiAnalyzed, copy.toast.midiFailed, setToast],
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
      persistCorrectionEvents(corrections);
      setToast(language === "ja" ? "コード進行をVaultに保存しました。" : "Saved the progression to the Vault.");
      return true;
    }
    setToast(language === "ja" ? "Ideaを作成できませんでした。" : "Could not create the idea.");
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

  function persistCorrectionEvents(events: ReturnType<typeof buildCorrectionEvents>) {
    if (events.length === 0) {
      return;
    }
    void appendAnalysisFeedback(events)
      .catch((error) => setToast(error instanceof Error ? error.message : "Could not save analysis feedback."));
  }

  function appendExisting(
    candidate: ProgressionBlockCandidate,
    original: ProgressionBlockCandidate,
    editable: EditableProgression,
    ideaId: string,
    userVerified: boolean,
  ): boolean {
    if (!ideaId) {
      setToast(language === "ja" ? "追加先のIdeaを選んでください。" : "Choose an idea first.");
      return false;
    }

    const appended = appendBlockToIdea(ideaId, candidate, analysis.result, {
      sourcePath,
      userEdited: hasProgressionEdits(editable),
      userVerified,
    });
    if (appended) {
      persistCorrectionEvents(correctionEvents(original, candidate, editable));
      setToast(copy.toast.blockSaved);
      return true;
    }
    setToast(language === "ja" ? "コード進行を追加できませんでした。" : "Could not append the progression.");
    return false;
  }

  function copyMemo(candidate: ProgressionBlockCandidate, ideaId: string) {
    if (!ideaId) {
      setToast(language === "ja" ? "追加先のIdeaを選んでください。" : "Choose an idea first.");
      return;
    }

    updateIdea(ideaId, { chordMemo: candidate.summaryText });
    setToast(copy.toast.blockCopied);
  }

  async function copyProgression(candidate: ProgressionBlockCandidate) {
    try {
      await writeClipboardText(formatProgressionText(candidate.chords));
      setToast(language === "ja" ? "Chord Dripで使えるコード進行をコピーしました。" : "Copied progression text.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : (language === "ja" ? "コピーできませんでした。" : "Could not copy progression."));
    }
  }

  async function previewCandidate(candidate: ProgressionBlockCandidate) {
    try {
      await previewTimeline(candidate.chords, analysis.result?.bpm, previewSound);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function previewCandidateChord(candidate: ProgressionBlockCandidate, chordIndex: number) {
    try {
      const chord = candidate.chords[chordIndex]?.chord;
      if (chord) {
        await previewSingleChord(chord, previewSound);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function previewSongTimeline() {
    if (!analysis.result) {
      return;
    }

    try {
      await previewTimeline(analysis.result.fullTimeline, analysis.result.bpm, previewSound);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
      throw error;
    }
  }

  async function previewSongChord(chord: ChordSymbol) {
    try {
      await previewSingleChord(chord, previewSound);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
      throw error;
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
          language={language}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 py-5" {...dropHandlers}>
      {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
      <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lv-accent)]">
              {language === "ja" ? "コード採集" : "Progression capture"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{copy.capture.title}</h2>
            <p className="mt-2 text-sm text-teal-200">{result.fileName ?? "MIDI"}</p>
            <p className="mt-2 max-w-2xl text-sm text-[var(--lv-text-muted)]">
              {language === "ja"
                ? "候補を聴いて、使えそうなコード進行だけLoop Vaultへ保存してください。"
                : "Preview the candidates and save only the progressions worth keeping."}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void chooseMidi()}>
              {copy.capture.chooseAnother}
            </button>
            <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => { clearAnalysis(); setSourcePath(undefined); }}>
              {copy.capture.clear}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
          <Metric label={copy.capture.file} value={result.fileName ?? "MIDI"} />
          <Metric label={copy.capture.bars} value={result.totalBars.toString()} />
          <Metric label="BPM" value={result.bpm ? Math.round(result.bpm).toString() : "Unknown"} />
          <Metric label={copy.capture.timeSignature} value={result.timeSignature ?? (language === "ja" ? "不明" : "Unknown")} />
        </div>
      </section>

      <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{copy.capture.candidates}</h2>
            <p className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.capture.candidateHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PreviewSoundSelector
              value={previewSound}
              onChange={(sound) => {
                void stopPreviewAudio();
                setPreviewSound(sound);
              }}
              copy={copy}
            />
            <span className="rounded bg-[var(--lv-surface-raised)] px-3 py-1 text-sm text-teal-200">
              {language === "ja" ? `${result.blockCandidates.length}件` : `${result.blockCandidates.length} items`}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-3">
            {result.blockCandidates.length > 0 ? (
              result.blockCandidates.map((candidate, index) => (
                <ProgressionCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  candidateIndex={index}
                  bpm={result.bpm ?? 96}
                  detectedKey={result.detectedKey}
                  onCopyProgression={copyProgression}
                  onPreview={previewCandidate}
                  onPreviewChord={previewCandidateChord}
                  copy={copy}
                  language={language}
                  isExpanded={expandedCandidateId === candidate.id}
                  onSelect={() => selectExpandedCandidate(candidate.id)}
                  onCollapse={() => selectExpandedCandidate(undefined)}
                  onDirtyChange={markCandidateDirty}
                  onQuickSave={(editedCandidate, title, editable) => {
                    saveNew(
                      editedCandidate,
                      title,
                      defaultCaptureNextAction(language),
                      false,
                      candidate,
                      editable,
                    );
                  }}
                  onSave={(editedCandidate, title, editable) => {
                    setSaveDraft({ candidate: editedCandidate, original: candidate, editable, title });
                  }}
                  showRomanNumerals={showRomanNumerals}
                />
              ))
            ) : (
              <p className="text-sm text-[var(--lv-text-muted)]">{language === "ja" ? "使えそうな進行候補は見つかりませんでした。" : "No reusable progression candidates were found."}</p>
            )}
          </div>
          <aside className="h-fit border border-teal-400/30 bg-[var(--lv-surface)] p-4 xl:sticky xl:top-4">
            {saveDraft ? (
              <ProgressionSaveDialog
                candidate={saveDraft.candidate}
                title={saveDraft.title}
                editSummary={progressionEditSummary(saveDraft.editable)}
                ideas={ideas}
                onTitleChange={(title) => setSaveDraft((draft) => draft ? { ...draft, title } : draft)}
                onClose={() => setSaveDraft(undefined)}
                onCreate={(title, nextAction, userVerified) => {
                  if (saveNew(saveDraft.candidate, title, nextAction, userVerified, saveDraft.original, saveDraft.editable)) {
                    setSaveDraft(undefined);
                  }
                }}
                onAppend={(ideaId, userVerified) => {
                  if (appendExisting(saveDraft.candidate, saveDraft.original, saveDraft.editable, ideaId, userVerified)) {
                    setSaveDraft(undefined);
                  }
                }}
                onCopyMemo={(ideaId) => {
                  copyMemo(saveDraft.candidate, ideaId);
                  setSaveDraft(undefined);
                }}
                copy={copy}
                language={language}
              />
            ) : (
              <div>
                <h3 className="font-semibold">{language === "ja" ? "この進行を保存" : "Save this progression"}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--lv-text-muted)]">{language === "ja" ? "候補を選び、保存を押すとここで保存方法を選べます。" : "Select a candidate and choose Save to pick how to keep it."}</p>
              </div>
            )}
          </aside>
        </div>
      </section>

      <TimelineDetails
        result={result}
        copy={copy}
        language={language}
        previewSound={previewSound}
        onPreviewSoundChange={(sound) => {
          void stopPreviewAudio();
          setPreviewSound(sound);
        }}
        onPreview={previewSongTimeline}
        onPreviewChord={previewSongChord}
        onStop={stopPreviewAudio}
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
  language,
}: {
  status: AnalysisState["status"];
  error?: string;
  onChooseMidi: () => void;
  isDraggingMidi: boolean;
  copy: AppCopy;
  language: AppLanguage;
}) {
  return (
    <section className={`grid min-h-[32rem] place-items-center border p-6 text-center transition-colors ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent)]/10" : "border-[var(--lv-border)] bg-[var(--lv-bg)]/70"}`}>
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lv-accent)]">
          {language === "ja" ? "MIDI Capture" : "MIDI Capture"}
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
        <p className="mt-3 text-xs text-[var(--lv-text)]0">{language === "ja" ? ".mid / .midi に対応" : ".mid / .midi supported"}</p>
        {status === "analyzing" ? (
          <div className="mt-6 border border-cyan-500/30 bg-cyan-500/10 p-4 text-left text-sm text-cyan-100">
            <p className="font-semibold">{copy.capture.analyzing}</p>
            <p className="mt-2 text-cyan-100/80">{copy.capture.analyzingDetail}</p>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="mt-6 border border-red-500/30 bg-red-500/10 p-4 text-left text-sm text-red-100">
            <p className="font-semibold">{language === "ja" ? "読み込めませんでした" : "Could not load the MIDI"}</p>
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
  language,
  previewSound,
  onPreviewSoundChange,
  onPreview,
  onPreviewChord,
  onStop,
}: {
  result: MidiProgressionAnalysis;
  copy: AppCopy;
  language: AppLanguage;
  previewSound: PreviewSound;
  onPreviewSoundChange: (sound: PreviewSound) => void;
  onPreview: () => void | Promise<void>;
  onPreviewChord: (chord: ChordSymbol) => void | Promise<void>;
  onStop: () => void | Promise<void>;
}) {
  const [selectedChordIndex, setSelectedChordIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackTimer = useRef<number>();

  useEffect(() => () => {
    if (playbackTimer.current !== undefined) {
      window.clearTimeout(playbackTimer.current);
    }
    void onStop();
  }, [onStop]);

  function stopTimelinePreview() {
    if (playbackTimer.current !== undefined) {
      window.clearTimeout(playbackTimer.current);
      playbackTimer.current = undefined;
    }
    setIsPlaying(false);
    void onStop();
  }

  async function previewFullTimeline() {
    stopTimelinePreview();
    setIsPlaying(true);
    try {
      await onPreview();
    } catch {
      setIsPlaying(false);
      return;
    }

    const first = result.fullTimeline[0];
    const last = result.fullTimeline[result.fullTimeline.length - 1];
    if (!first || !last) {
      setIsPlaying(false);
      return;
    }

    const beatSeconds = 60 / (result.bpm || 96);
    const durationBeats = timelineStartBeat(last) - timelineStartBeat(first) + last.durationBeats;
    playbackTimer.current = window.setTimeout(() => {
      playbackTimer.current = undefined;
      setIsPlaying(false);
    }, durationBeats * beatSeconds * 1000 + 120);
  }

  async function previewTimelineChord(index: number) {
    stopTimelinePreview();
    setSelectedChordIndex(index);
    const chord = result.fullTimeline[index]?.chord;
    if (chord) {
      try {
        await onPreviewChord(chord);
      } catch {
        return;
      }
    }
  }

  return (
    <details className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5">
      <summary className="cursor-pointer text-lg font-semibold text-[var(--lv-text)]">
        {copy.capture.timeline}
      </summary>
      <p className="mt-3 text-sm text-[var(--lv-text-muted)]">{copy.capture.timelineDescription}</p>
      {result.fullTimeline.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="lv-button-primary inline-flex min-h-10 items-center gap-2 px-4"
            type="button"
            onClick={() => void previewFullTimeline()}
            aria-label={copy.capture.previewFullTimeline}
          >
            <span aria-hidden="true">▶</span>
            {copy.capture.previewFullTimeline}
          </button>
          <button
            className="lv-button-ghost grid h-10 w-10 place-items-center"
            type="button"
            onClick={stopTimelinePreview}
            aria-label={copy.common.stop}
            title={copy.common.stop}
            disabled={!isPlaying}
          >
            ■
          </button>
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
            currentBar={null}
            selectedChordIndex={selectedChordIndex}
            playingChordIndex={null}
            onChordSelect={(index) => void previewTimelineChord(index)}
          />
        ) : (
          <p className="text-sm text-[var(--lv-text-muted)]">{copy.capture.noTimeline}</p>
        )}
      </div>
      <p className="mt-4 text-xs text-[var(--lv-text)]0">
        {language === "ja" ? "候補ブロックに含まれない部分も確認できます。" : "This also shows chords outside the reusable candidate blocks."}
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
  detectedKey,
  onCopyProgression,
  onPreview,
  onPreviewChord,
  copy,
  language,
  isExpanded = false,
  onSelect,
  onCollapse,
  onDirtyChange,
  onQuickSave,
  onSave,
  showRomanNumerals = true,
}: {
  candidate: ProgressionBlockCandidate;
  candidateIndex: number;
  bpm: number;
  detectedKey?: string;
  ideas?: SongIdea[];
  onCreate?: (candidate: ProgressionBlockCandidate, title: string, nextAction: string) => void;
  onAppend?: (candidate: ProgressionBlockCandidate, ideaId: string) => void;
  onCopyMemo?: (candidate: ProgressionBlockCandidate, ideaId: string) => void;
  onCopyProgression: (candidate: ProgressionBlockCandidate) => void | Promise<void>;
  onPreview: (candidate: ProgressionBlockCandidate) => void | Promise<void>;
  onPreviewChord: (
    candidate: ProgressionBlockCandidate,
    chordIndex: number,
  ) => void | Promise<void>;
  copy: AppCopy;
  language: AppLanguage;
  isExpanded?: boolean;
  onSelect?: () => void;
  onCollapse?: () => void;
  onDirtyChange?: (candidateId: string, dirty: boolean) => void;
  onQuickSave?: (candidate: ProgressionBlockCandidate, title: string, editable: EditableProgression) => void;
  onSave?: (candidate: ProgressionBlockCandidate, title: string, editable: EditableProgression) => void;
  showRomanNumerals?: boolean;
}) {
  const editorCopy = progressionEditorCopy[language];
  const title = editorCopy.progressionTitle(candidate.labels.slice(0, 4));
  const [editable, setEditable] = useState(() => createEditableProgression(candidate));
  const [selectedChordIndex, setSelectedChordIndex] = useState(0);
  const [playingChordIndex, setPlayingChordIndex] = useState<number | null>(null);
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null);
  const [, forcePlaybackTick] = useState(0);
  const visualTimers = useRef<number[]>([]);
  const currentCandidate = applyEditableProgression(candidate, editable);
  const chords = currentCandidate.chords;
  const editedCandidate = {
    ...currentCandidate,
    summaryText: candidate.summaryText,
    chords,
    labels: [...new Set(chords.map((item) => item.chord.label))],
  };

  useEffect(() => {
    setEditable(createEditableProgression(candidate));
    setSelectedChordIndex(0);
    stopVisualPreview();
    return stopVisualPreview;
  }, [candidate, language]);

  useEffect(() => {
    if (previewStartedAt === null) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      forcePlaybackTick((value) => value + 1);
    }, 100);

    return () => window.clearInterval(interval);
  }, [previewStartedAt]);

  useEffect(() => {
    onDirtyChange?.(candidate.id, hasProgressionEdits(editable));
  }, [candidate.id, editable, onDirtyChange]);

  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing || isEditableKeyboardTarget(event.target)) {
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
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
      if (event.key === "Escape") {
        event.preventDefault();
        stopCandidatePreview();
        onCollapse?.();
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
  }, [editable.selectedSlotId, editable.slots, isExpanded, onCollapse, selectedChordIndex]);

  function stopVisualPreview() {
    for (const timer of visualTimers.current) {
      window.clearTimeout(timer);
    }
    visualTimers.current = [];
    setPlayingChordIndex(null);
    setPreviewStartedAt(null);
  }

  function stopCandidatePreview() {
    stopVisualPreview();
    void stopPreviewAudio();
  }

  async function previewWholeCandidate() {
    stopVisualPreview();
    const baseBeat = firstTimelineBeat(chords);
    const beatSeconds = 60 / bpm;
    setPreviewStartedAt(window.performance.now());

    for (const [index, chord] of chords.entries()) {
      const delayMs = Math.max(0, (timelineStartBeat(chord) - baseBeat) * beatSeconds * 1000);
      visualTimers.current.push(
        window.setTimeout(() => {
          setPlayingChordIndex(index);
          setSelectedChordIndex(index);
        }, delayMs),
      );
    }

    const last = chords[chords.length - 1];
    const totalMs = last
      ? (timelineStartBeat(last) - baseBeat + last.durationBeats) * beatSeconds * 1000
      : 0;
    visualTimers.current.push(window.setTimeout(stopVisualPreview, totalMs + 120));
    await onPreview(editedCandidate);
  }

  async function selectChord(index: number) {
    onSelect?.();
    setSelectedChordIndex(index);
    const slot = editable.slots[index];
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
    setEditable(next);
    const nextIndex = next.slots.findIndex((slot) => slot.id === next.selectedSlotId);
    setSelectedChordIndex(Math.max(0, nextIndex));
  }

  const playingChord = playingChordIndex === null ? undefined : chords[playingChordIndex];
  const elapsedSeconds =
    previewStartedAt === null ? 0 : (window.performance.now() - previewStartedAt) / 1000;
  const playingProgress =
    previewStartedAt === null || playingChord === undefined
      ? null
      : chordProgressFraction(
          {
            startBeat: timelineStartBeat(playingChord) - firstTimelineBeat(chords),
            durationBeats: playingChord.durationBeats,
          },
          bpm,
          elapsedSeconds,
        );
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
        <button className="min-w-0 text-left" onClick={onSelect} aria-expanded={isExpanded}>
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
          <button className="grid h-9 w-9 place-items-center rounded bg-cyan-400 text-sm font-semibold text-stone-950" onClick={() => void previewWholeCandidate()} aria-label={copy.common.preview} title={copy.common.preview}>
            ▶
          </button>
          {previewStartedAt !== null ? (
            <button className="grid h-9 w-9 place-items-center rounded border border-[var(--lv-border-strong)] text-sm" onClick={stopCandidatePreview} aria-label={copy.common.stop} title={copy.common.stop}>
              ■
            </button>
          ) : null}
          <button className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => { onSelect?.(); onQuickSave?.(editedCandidate, title, editable); }}>
            {editorCopy.saveToVault}
          </button>
          <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => { onSelect?.(); onSave?.(editedCandidate, title, editable); }}>
            {language === "ja" ? "保存方法" : "Save options"}
          </button>
          <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void onCopyProgression(editedCandidate)}>
            {copy.capture.copyProgression}
          </button>
        </div>
      </div>
      <span className="mt-3 inline-flex rounded bg-[var(--lv-surface-raised)] px-2 py-1 text-xs text-teal-200">{candidateLabelList(candidate.labels, language).join(" · ")}</span>
      {candidate.summaryText.trim() ? <p className="mt-3 text-sm text-[var(--lv-text-secondary)]">{candidate.summaryText}</p> : null}
      <div className={`mt-4 ${isExpanded ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <div>
          {isExpanded ? (
            <ProgressionEditorToolbar
              canUndo={canUndoProgressionEdit(editable)}
              canRedo={canRedoProgressionEdit(editable)}
              dirty={hasProgressionEdits(editable)}
              onUndo={() => setEditable((current) => undoProgressionEdit(current))}
              onRedo={() => setEditable((current) => redoProgressionEdit(current))}
              onResetAll={() => setEditable((current) => resetAllEditableChords(current))}
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
        {isExpanded ? (
          <ChordInspector
            slot={selectedSlot}
            language={language}
            onPreview={(chord) => void previewChord(chord)}
            onApply={(chord, source) => {
              const slotId = editable.selectedSlotId;
              if (slotId) {
                setEditable((current) => replaceEditableChord(current, slotId, chord, source));
              }
            }}
            onReset={() => {
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
          />
        ) : null}
      </div>
      {showRomanNumerals && selectedRomanHint ? (
        <p className="mt-2 text-xs text-[var(--lv-text)]0">{selectedRomanHint.label}{selectedRomanHint.detail ? ` · ${selectedRomanHint.detail}` : ""}{selectedRomanHint.confidence !== "high" ? (language === "ja" ? "（参考）" : " (reference)") : ""}</p>
      ) : null}
      {isExpanded && visibleWarnings.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleWarnings.map((warning) => (
            <span key={warning} className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
              {language === "ja" ? "要確認" : "Review"}: {warning}
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
              setSelectedChordIndex(index);
              setEditable((current) => selectEditableSlot(current, slotId));
            }
          }}
        />
      ) : null}

    </div>
  );
}

type SaveMode = "new" | "append" | "memo";

export function ProgressionSaveDialog({
  candidate,
  title,
  editSummary = [],
  ideas,
  onTitleChange,
  onClose,
  onCreate,
  onAppend,
  onCopyMemo,
  copy,
  language,
  initialMode = "new",
}: {
  candidate: ProgressionBlockCandidate;
  title: string;
  editSummary?: ProgressionEditSummaryItem[];
  ideas: SongIdea[];
  onTitleChange: (title: string) => void;
  onClose: () => void;
  onCreate: (title: string, nextAction: string, userVerified: boolean) => void;
  onAppend: (ideaId: string, userVerified: boolean) => void;
  onCopyMemo: (ideaId: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  initialMode?: SaveMode;
}) {
  const [mode, setMode] = useState<SaveMode>(initialMode);
  const [ideaId, setIdeaId] = useState("");
  const [nextAction, setNextAction] = useState(
    defaultCaptureNextAction(language),
  );
  const [userVerified, setUserVerified] = useState(false);
  const needsIdea = mode !== "new";
  const canSave = mode === "new" ? title.trim().length > 0 : ideaId.length > 0;
  const chordText = candidate.chords.map((item) => item.chord.label).join(" | ");

  function save() {
    if (!canSave) return;
    if (mode === "new") {
      onCreate(title.trim(), nextAction.trim(), userVerified);
      return;
    }
    if (mode === "append") {
      onAppend(ideaId, userVerified);
      return;
    }
    onCopyMemo(ideaId);
  }

  return (
    <div className="mt-4 border border-teal-400/40 bg-[var(--lv-surface)] p-4 shadow-[0_0_0_1px_rgba(45,212,191,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{language === "ja" ? "この進行を保存" : "Save this progression"}</h3>
          <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{chordText}</p>
        </div>
        <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={onClose}>
          {copy.common.close}
        </button>
      </div>
      <ProgressionEditSummary items={editSummary} language={language} />

      <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">{language === "ja" ? "保存方法" : "Save method"}</legend>
        <SaveModeOption
          checked={mode === "new"}
          label={copy.capture.createIdea}
          onChange={() => setMode("new")}
        />
        <SaveModeOption
          checked={mode === "append"}
          label={copy.capture.appendIdea}
          onChange={() => setMode("append")}
        />
        <SaveModeOption
          checked={mode === "memo"}
          label={copy.capture.copyMemo}
          onChange={() => setMode("memo")}
        />
      </fieldset>

      {mode === "new" ? (
        <div className="mt-4 grid gap-3">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lv-text)]0">
            {language === "ja" ? "タイトル" : "Title"}
            <input className={`${inputClass} mt-2`} value={title} onChange={(event) => onTitleChange(event.target.value)} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lv-text)]0">
            Next Action
            <input className={`${inputClass} mt-2`} value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
          </label>
        </div>
      ) : null}

      {needsIdea ? (
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lv-text)]0">
          {language === "ja" ? "追加先Idea" : "Destination idea"}
          <select className={`${inputClass} mt-2`} value={ideaId} onChange={(event) => setIdeaId(event.target.value)}>
            <option value="">{language === "ja" ? "既存Ideaを選ぶ" : "Choose an existing idea"}</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>{idea.title}</option>
            ))}
          </select>
        </label>
      ) : null}

      {mode !== "memo" ? (
        <label className="mt-4 flex cursor-pointer items-start gap-3 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3 text-sm">
          <input className="mt-1" type="checkbox" checked={userVerified} onChange={(event) => setUserVerified(event.target.checked)} />
          <span>
            <strong className="block text-[var(--lv-text-secondary)]">
              {language === "ja" ? "この進行を確認済みとして保存" : "Save as manually verified"}
            </strong>
            <span className="mt-1 block text-[var(--lv-text-muted)]">
              {language === "ja" ? "コード名を自分で確認した場合だけオンにしてください。" : "Enable only after you have checked the chord labels yourself."}
            </span>
          </span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={onClose}>
          {language === "ja" ? "キャンセル" : "Cancel"}
        </button>
        <button
          className="rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-[var(--lv-text-muted)]"
          disabled={!canSave}
          onClick={save}
        >
          {language === "ja" ? "保存" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SaveModeOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm ${checked ? "border-teal-400 bg-[var(--lv-accent)]/10 text-teal-100" : "border-[var(--lv-border)] bg-[var(--lv-bg)] text-[var(--lv-text-secondary)]"}`}>
      <input type="radio" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--lv-text)]0">{label}</p>
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

async function previewSingleChord(
  chord: ChordSymbol,
  sound?: PreviewSound,
): Promise<void> {
  const { previewChord } = await import("../audio/chordPreview");
  await previewChord(chord, sound);
}

async function previewTimeline(
  chords: readonly ChordTimelineItem[],
  bpm?: number,
  sound?: PreviewSound,
): Promise<void> {
  const { previewChordTimeline } = await import("../audio/chordPreview");
  await previewChordTimeline(chords, bpm, sound);
}

async function stopPreviewAudio(): Promise<void> {
  const { stopPreview } = await import("../audio/chordPreview");
  stopPreview();
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available.");
  }
  await navigator.clipboard.writeText(text);
}

function firstTimelineBeat(chords: readonly ChordTimelineItem[]): number {
  return chords.length === 0 ? 0 : Math.min(...chords.map(timelineStartBeat));
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

function defaultCaptureNextAction(language: AppLanguage): string {
  return language === "ja"
    ? "採集したコード進行からループを作る"
    : "Build a loop from the captured progression";
}
