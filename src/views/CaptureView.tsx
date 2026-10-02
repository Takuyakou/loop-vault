import type { ToastFn } from "../components/notifications";
import { voiceTextChordForAudition } from "../domain/textChordTones";
import { resolveVoicingForUse } from "../domain/voicing";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  beatsPerBar as beatsPerBarFor,
  buildRoleCorrectionLogEvents,
  buildSessionAnalysisRequest,
  removeMidiSource,
  type AnalysisSession,
  type SessionAnalysisRequest,
} from "../domain/midi";
import type { AnalysisInput, AnalyzeMidiOptions } from "../domain/midi/types";
import { formatProgressionText } from "../domain/progressionText";
import type {
  ChordVoicingMemory,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
  SongIdea,
  Status,
} from "../domain/types";
import type { AnalysisState, ProgressionSaveMetadata, TextProgressionIdeaDraft } from "../store/vaultStore";
import type { TextProgressionEvent } from "../domain/textProgression";
import type { ExtendedTextResult } from "../domain/extendedTextProgression";
import { extendedTextSaveData } from "../domain/extendedTextSave";
import { evaluateExtendedTextPractice, type ExtendedTextPracticeStatus } from "../domain/extendedTextPractice";
import { type AppCopy } from "../i18n";
import { appendRoleCorrectionLog } from "../storage/roleCorrectionLogStorage";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { ManualCandidateEditor } from "../components/ManualCandidateEditor";
import {
  CaptureInputModeSelector,
  type CaptureInputMode,
} from "../components/capture/CaptureInputModeSelector";
import {
  TextProgressionCapturePanel,
  type TextProgressionConvertedDraft,
} from "../components/capture/TextProgressionCapturePanel";
import {
  textProgressionDraftEditable,
  textProgressionDraftSavePayload,
  textProgressionDraftTimeline,
} from "../domain/textProgressionDraft";
import { type ManualCandidateDraft } from "../domain/midi/manualDraft";
import { PreAnalysisWorkspace } from "../components/pre-analysis/PreAnalysisWorkspace";
import { Dumbbell, ExternalLink, FileMusic } from "lucide-react";
import { Button, StatusMessage } from "../components/ui";
import { useWorkspaceBassline } from "./capture/workspaceBassline";
import { useCaptureIntake } from "./capture/useCaptureIntake";
import { useCaptureSave } from "./capture/useCaptureSave";
import { CorrectionWorkspace } from "../components/correction-workspace/CorrectionWorkspace";
import { buildCorrectionModel } from "../domain/correction/correctionModel";
import { reviewThresholds } from "../domain/correction/reviewThresholds";
import {
  captureAnalysisIdentity,
  captureFullTimelineSource,
  stopCapturePlayback,
  type CaptureAnalysisProgressStage,
} from "./capture/captureRuntime";

interface TextDraftContext {
  readonly initialTitle: string;
  readonly bpm?: number;
  readonly confirmedKey?: string;
}

interface CaptureViewProps {
  initialInputMode?: CaptureInputMode;
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
  }, options?: { stayOnCapture?: boolean }) => string | undefined;
  /** P10.0-06/07: operations in the correction workspace not saved yet (App's leave guard). */
  onWorkspaceDirtyChange?: (unsavedCount: number) => void;
  appendBlockToIdea: (
    ideaId: string,
    block: ProgressionBlockCandidate,
    analysis?: MidiProgressionAnalysis,
    metadata?: ProgressionSaveMetadata,
  ) => boolean;
  createIdeaFromTextProgression?: (
    draft: TextProgressionIdeaDraft,
  ) => string | SavedTextProgressionTarget | undefined;
  appendTextProgressionToIdea?: (
    ideaId: string,
    draft: TextProgressionIdeaDraft,
  ) => boolean | SavedTextProgressionTarget;
  openSavedTextProgression?: (target: SavedTextProgressionTarget) => void;
  openSavedTextProgressionPractice?: (target: SavedTextProgressionTarget) => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => boolean | "pending";
  setToast: ToastFn;
  copy: AppCopy;
  showRomanNumerals: boolean;
  controller?: PlaybackController;
  analysisInput?: AnalysisInput;
}

export interface SavedTextProgressionTarget {
  readonly ideaId: string;
  readonly blockId: string;
}

type CaptureAnalysisTargetVoice = Pick<
  AnalysisSession["voices"][number],
  "assignedRole" | "displayName" | "duplicateOf" | "included" | "isDrum"
>;

export function captureAnalysisTargetLabel(
  voices: readonly CaptureAnalysisTargetVoice[] | undefined,
): string | undefined {
  return voices?.filter((voice) =>
    voice.included
    && !voice.isDrum
    && !voice.duplicateOf
    && voice.assignedRole !== "exclude")
    .map((voice) => voice.displayName)
    .join(" / ");
}
export interface CaptureAnalysisRunSummary {
  preset: "standard" | "harmonic-core";
  amplifiedVoiceCount: number;
  reducedVoiceCount: number;
  excludedVoiceCount: number;
}

export function captureAnalysisRunSummary(
  request: Pick<SessionAnalysisRequest, "options">,
): CaptureAnalysisRunSummary {
  const voices = request.options.analysisInput?.voices ?? [];
  const roles = voices.map((voice) => voice.inferredRole);
  return {
    preset: request.options.analysisInput?.voiceContributionPreset === "harmonic-core"
      ? "harmonic-core"
      : "standard",
    amplifiedVoiceCount: roles.filter((role) =>
      role === "harmony" || role === "pad").length,
    reducedVoiceCount: roles.filter((role) =>
      role === "melody" || role === "mixed").length,
    excludedVoiceCount: roles.filter((role) =>
      role === "bass" || role === "percussion").length,
  };
}

function captureAnalysisRunCopy(
  summary: CaptureAnalysisRunSummary,
): { title: string; description: string } {
  if (summary.preset === "standard") {
    return {
        title: "標準モードで解析済み",
        description: "この結果には標準のVoice重み付けが適用されています。",
      };
  }
  return {
      title: "和声コアで解析済み",
      description: [
        `和声を強調 ${summary.amplifiedVoiceCount} Voice`,
        `メロディ系を抑制 ${summary.reducedVoiceCount} Voice`,
        `ベース／ドラムを除外 ${summary.excludedVoiceCount} Voice`,
        "候補が同じでも内部の重み付けには反映されています。",
      ].join("・"),
    };
}

export { captureAnalysisIdentity, isMidiFileName, stopCapturePlayback } from "./capture/captureRuntime";

export function CaptureView(props: CaptureViewProps) {
  const {
    ideas,
    initialInputMode = "midi",
    analysis,
    analyzeMidiBytes,
    clearAnalysis,
    createIdeaFromDraft,
    appendBlockToIdea,
    createIdeaFromTextProgression,
    appendTextProgressionToIdea,
    openSavedTextProgression,
    openSavedTextProgressionPractice,
    updateIdea,
    setToast,
    copy,
    showRomanNumerals,
    controller = playbackController,
    analysisInput,
  } = props;
  // The text-progression draft (text capture); MIDI results open in the correction workspace.
  const [activeDraft, setActiveDraft] = useState<ManualCandidateDraft | null>(null);
  const { sound: previewSound } = usePreviewSound();
  const [captureInputMode, setCaptureInputMode] = useState<CaptureInputMode>(initialInputMode);
  const [textDraftContext, setTextDraftContext] = useState<TextDraftContext>();
  const [savedTextProgressionTarget, setSavedTextProgressionTarget] = useState<SavedTextProgressionTarget>();
  const [savedTextPracticeStatus, setSavedTextPracticeStatus] = useState<ExtendedTextPracticeStatus>();
  const captureViewMountedRef = useRef(true);
  useEffect(() => {
    captureViewMountedRef.current = true;
    return () => {
      captureViewMountedRef.current = false;
    };
  }, []);
  const {
    isDraggingMidi,
    sourcePath,
    preAnalysisSession,
    setPreAnalysisSession,
    preAnalysisDetailsExpanded,
    setPreAnalysisDetailsExpanded,
    completedAnalysisSummary,
    setCompletedAnalysisSummary,
    intakeError,
    analysisProgress,
    analysisRunGeneration,
    analyzeMidiBytesWithToast,
    chooseMidi,
    dropHandlers,
  } = useCaptureIntake({
    controller,
    analyzeMidiBytes,
    clearAnalysis,
    setToast,
    copy,
    mountedRef: captureViewMountedRef,
    onAnalysisReset: resetSelectionForNewAnalysis,
  });
  const { persistenceError, saveNew, appendExisting } = useCaptureSave({
    analysis,
    createIdeaFromDraft,
    appendBlockToIdea,
    sourcePath,
    setToast,
    copy,
    mountedRef: captureViewMountedRef,
  });
  const result = analysis.result;
  const workspaceBassline = useWorkspaceBassline(preAnalysisSession, result?.sourceFingerprint, beatsPerBarFor(result?.timeSignature));
  const workspaceDatasetKey = result ? `${captureAnalysisIdentity(result)}:${analysisRunGeneration}` : undefined;
  const correctionModel = useMemo(() => (
    result && analysis.sourceData && analysis.sourceVoices
      ? buildCorrectionModel({
          result,
          sourceData: analysis.sourceData,
          sourceVoices: analysis.sourceVoices,
          ...(analysisInput?.roleOverrides ? { roleOverrides: analysisInput.roleOverrides } : {}),
        }, reviewThresholds)
      : undefined
  ), [analysis.sourceData, analysis.sourceVoices, analysisInput?.roleOverrides, result]);
  const analysisTargetLabel = useMemo(
    () => captureAnalysisTargetLabel(preAnalysisSession?.voices),
    [preAnalysisSession],
  );
  /** A new file or a new analysis drops the text draft (was inline in the intake code). */
  function resetSelectionForNewAnalysis() {
    setActiveDraft(null);
  }

  // A/B keys for the text-progression draft (B plays it, Escape stops).
  useEffect(() => {
    if (!activeDraft || activeDraft.source.type !== "text-progression") return undefined;
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
      } else if (key === "b") {
        event.preventDefault();
        void previewTextProgressionDraft(keyboardDraft);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeDraft, controller, previewSound, textDraftContext?.bpm]);

  function copyMemo(candidate: ProgressionBlockCandidate, ideaId: string): boolean {
    const idea = ideas.find((entry) => entry.id === ideaId);
    if (!idea) {
      setToast(copy.capture.chooseIdeaFirst);
      return false;
    }

    return persistCopiedProgressionMemo(
      idea,
      candidate,
      updateIdea,
      () => setToast(copy.toast.blockCopied),
    );
  }

  const stopTextPlayback = useCallback(() => {
    stopCapturePlayback(controller);
  }, [controller]);

  function changeCaptureInputMode(nextMode: CaptureInputMode) {
    if (nextMode === captureInputMode || activeDraft !== null) return;
    stopTextPlayback();
    setCaptureInputMode(nextMode);
  }

  function saveExtendedTextProgression(result: ExtendedTextResult, title: string): boolean {
    if (!result.canConvert || !createIdeaFromTextProgression) return false;
    const data = { ...extendedTextSaveData(result), title };
    const saved = createIdeaFromTextProgression({
      ...data,
      nextAction: copy.capture.defaultNextAction,
      userEdited: false,
      userVerified: true,
    });
    if (!saved) {
      setToast(copy.capture.createFailed, "error");
      return false;
    }
    if (typeof saved === "object") setSavedTextProgressionTarget(saved);
    setSavedTextPracticeStatus(evaluateExtendedTextPractice(result, result.metadata.bpm ?? 120));
    setToast(copy.capture.savedToVault, "success");
    return true;
  }

  function saveStandardTextProgression(converted: TextProgressionConvertedDraft, title: string): boolean {
    if (!createIdeaFromTextProgression) return false;
    const payload = textProgressionDraftSavePayload(converted.draft, {
      title, nextAction: copy.capture.defaultNextAction, userVerified: true,
      ...(converted.bpm === undefined ? {} : { bpm: converted.bpm }),
      ...(converted.confirmedKey === undefined ? {} : { confirmedKey: converted.confirmedKey }),
    });
    const saved = createIdeaFromTextProgression(payload);
    if (!saved) { setToast(copy.capture.createFailed, "error"); return false; }
    if (typeof saved === "object") setSavedTextProgressionTarget(saved);
    setSavedTextPracticeStatus(undefined);
    setToast(copy.capture.savedToVault, "success");
    return true;
  }

  function openTextProgressionDraft(converted: TextProgressionConvertedDraft) {
    stopTextPlayback();
    setSavedTextProgressionTarget(undefined);
    setSavedTextPracticeStatus(undefined);
    setActiveDraft(converted.draft);
    setTextDraftContext({
      initialTitle: converted.title,
      ...(converted.bpm === undefined ? {} : { bpm: converted.bpm }),
      ...(converted.confirmedKey === undefined ? {} : { confirmedKey: converted.confirmedKey }),
    });
  }

  function textDraftSavePayload(
    draft: ManualCandidateDraft,
    title: string,
    nextAction: string,
    userVerified: boolean,
  ): TextProgressionIdeaDraft | undefined {
    if (draft.source.type !== "text-progression" || !textDraftContext) return undefined;
    return textProgressionDraftSavePayload(draft, {
      title,
      nextAction,
      userVerified,
      ...(textDraftContext.bpm === undefined ? {} : { bpm: textDraftContext.bpm }),
      ...(textDraftContext.confirmedKey === undefined ? {} : { confirmedKey: textDraftContext.confirmedKey }),
    });
  }

  function saveTextProgressionDraft(
    draft: ManualCandidateDraft,
    title: string,
    nextAction: string,
    userVerified: boolean,
  ): boolean {
    const payload = textDraftSavePayload(draft, title, nextAction, userVerified);
    if (!payload || !createIdeaFromTextProgression) {
      setToast(copy.capture.createFailed, "error");
      return false;
    }
    const saved = createIdeaFromTextProgression(payload);
    if (!saved) {
      setToast(copy.capture.createFailed, "error");
      return false;
    }
    if (typeof saved === "object") setSavedTextProgressionTarget(saved);
    setSavedTextPracticeStatus(undefined);
    setToast(copy.capture.savedToVault, "success");
    return true;
  }

  function appendTextProgressionDraft(
    draft: ManualCandidateDraft,
    ideaId: string,
    userVerified: boolean,
  ): boolean {
    const payload = textDraftSavePayload(
      draft,
      textDraftContext?.initialTitle ?? "Text progression",
      copy.capture.defaultNextAction,
      userVerified,
    );
    if (!payload || !ideaId || !appendTextProgressionToIdea) {
      setToast(ideaId ? copy.capture.appendFailed : copy.capture.chooseIdeaFirst, ideaId ? "error" : "info");
      return false;
    }
    const appended = appendTextProgressionToIdea(ideaId, payload);
    if (typeof appended === "object") setSavedTextProgressionTarget(appended);
    setSavedTextPracticeStatus(undefined);
    setToast(appended ? copy.toast.blockSaved : copy.capture.appendFailed, appended ? "success" : "error");
    return Boolean(appended);
  }

  async function previewTextProgressionEvent(
    event: TextProgressionEvent,
    memory: ChordVoicingMemory | undefined,
    bpm: number,
  ) {
    try {
      const eventId = `text-card:${event.bar}:${event.startBeat}:${event.durationBeats}:${event.canonical}`;
      const notes = resolveVoicingForUse(
        event.chord,
        memory,
        [...voiceTextChordForAudition(event.chord)],
      ).midiNotes;
      // A card audition is a one-event detached timeline. This makes the
      // explicit text BPM and 4/4 meter part of the controller request rather
      // than merely UI metadata, and avoids waiting through earlier text bars.
      await controller.toggle(
        { kind: "capture", id: `capture-${eventId}` },
        {
          type: "timeline",
          timeline: [{
            bar: 1,
            beat: 1,
            durationBeats: event.durationBeats,
            chord: event.chord,
            confidence: 0,
            alternatives: [],
            warnings: [],
            eventId,
          }],
          bpm,
          sound: previewSound,
          beatsPerBar: 4,
          explicitMidiNotesByEventId: { [eventId]: notes },
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  async function previewTextProgressionDraft(draft: ManualCandidateDraft) {
    if (draft.source.type !== "text-progression") return;
    if (textDraftContext?.bpm === undefined) {
      setToast("\u30c6\u30ad\u30b9\u30c8\u9032\u884c\u306e\u518d\u751f\u306b\u306f30\u301c240 BPM\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002", "error");
      return;
    }
    try {
      const timeline = textProgressionDraftTimeline(draft).map((item, index) => ({
        ...item,
        eventId: `text-draft:${draft.draftId}:${index}`,
      }));
      const explicitMidiNotesByEventId = Object.fromEntries(timeline.map((item) => [
        item.eventId!,
        resolveVoicingForUse(
          item.chord,
          item.voicingMemory,
          [...voiceTextChordForAudition(item.chord)],
        ).midiNotes,
      ]));
      await controller.toggle(
        { kind: "capture", id: `capture-text-draft:${draft.draftId}` },
        {
          type: "timeline",
          timeline,
          bpm: textDraftContext.bpm,
          sound: previewSound,
          beatsPerBar: 4,
          explicitMidiNotesByEventId,
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  if (captureInputMode === "text") {
    const textDraft = activeDraft?.source.type === "text-progression" ? activeDraft : null;
    return (
      <CaptureModeFrame stage="text" value={captureInputMode}
        disabled={textDraft !== null} onChange={changeCaptureInputMode}>
        <div className="lv-capture-content lv-capture-text-content grid gap-5">
          <TextProgressionCapturePanel
            showRomanNumerals={showRomanNumerals}
            draftActive={textDraft !== null}
            onConvert={openTextProgressionDraft}
            onSaveStandard={saveStandardTextProgression}
            onSaveExtended={saveExtendedTextProgression}
            controller={controller}
            previewSound={previewSound}
            onPreview={(event, memory, bpm) => void previewTextProgressionEvent(event, memory, bpm)}
            onStop={stopTextPlayback}
          />
          {!textDraft && savedTextProgressionTarget ? (
            <StatusMessage
              title={savedTextPracticeStatus?.ready === false
                ? ("保存しました。Voicing Loopには対応していません")
                : ("保存した進行を練習できます")}
              tone="success"
              action={(
                <div className="flex min-w-0 flex-wrap gap-2">
                  {openSavedTextProgressionPractice ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => openSavedTextProgressionPractice(savedTextProgressionTarget)}
                      disabled={savedTextPracticeStatus?.ready === false}
                      title={savedTextPracticeStatus?.reason}
                    >
                      <Dumbbell aria-hidden="true" size={16} />
                      {savedTextPracticeStatus
                        ? ("Voicing Loopで練習")
                        : "Voicing Loop"}
                    </Button>
                  ) : null}
                  {openSavedTextProgression ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openSavedTextProgression(savedTextProgressionTarget)}
                    >
                      <ExternalLink aria-hidden="true" size={16} />
                      {savedTextPracticeStatus
                        ? ("進行を開く")
                        : "保存した進行を見る"}
                    </Button>
                  ) : null}
                </div>
              )}
            >
              {savedTextPracticeStatus?.ready === false
                ? ("練習制限: ") + savedTextPracticeStatus.reason
                : "Vaultへ保存した内容から安全な練習用snapshotを作成します。"}
            </StatusMessage>
          ) : null}
          {textDraft ? (
            <ManualCandidateEditor
              key={textDraft.draftId}
              draft={textDraft}
              timeline={textProgressionDraftTimeline(textDraft)}
              totalBars={textDraft.lengthBars}
              copy={copy}
              {...(textDraftContext?.confirmedKey ? { keySignature: textDraftContext.confirmedKey } : {})}
              allowRangeAdjustment={false}
              allowStructuralEdits={false}
              showConfidenceReview={false}
              createEditable={textProgressionDraftEditable}
              save={{
                initialTitle: textDraftContext?.initialTitle ?? "Text progression",
                ideas,
                defaultNextAction: copy.capture.defaultNextAction,
                onCreate: saveTextProgressionDraft,
                onAppend: appendTextProgressionDraft,
              }}
              onPreview={(draft) => void previewTextProgressionDraft(draft)}
              onChange={setActiveDraft}
              onSave={() => {
                stopTextPlayback();
                setActiveDraft(null);
                setTextDraftContext(undefined);
              }}
              onDiscard={() => {
                stopTextPlayback();
                setActiveDraft(null);
                setTextDraftContext(undefined);
              }}
              onReselect={() => {
                stopTextPlayback();
                setActiveDraft(null);
                setTextDraftContext(undefined);
              }}
            />
          ) : null}
        </div>
      </CaptureModeFrame>
    );
  }
  if (!result) {
    if (preAnalysisSession) {
      const master = preAnalysisSession.sources.find((source) =>
        source.id === preAnalysisSession.masterSourceId)
        ?? preAnalysisSession.sources[0];
      return (
        <CaptureModeFrame stage="pre-analysis" value={captureInputMode}
          disabled={activeDraft !== null} onChange={changeCaptureInputMode}>
          <div data-capture-midi-drop-zone {...dropHandlers}>
          {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
          <PreAnalysisWorkspace
            session={preAnalysisSession}
            busy={analysisProgress !== undefined}
            requiresReanalysis={completedAnalysisSummary !== undefined}
            defaultDetailsExpanded={preAnalysisDetailsExpanded}
            onSessionChange={setPreAnalysisSession}
            onDetailsExpandedChange={setPreAnalysisDetailsExpanded}
            onAddMidi={() => void chooseMidi(true)}
            onRemoveSource={(sourceId) => {
              const next = removeMidiSource(preAnalysisSession, sourceId);
              if (next) setPreAnalysisSession(next);
            }}
            onAnalyze={() => {
              if (!master) return;
              try {
                const request = buildSessionAnalysisRequest(preAnalysisSession);
                const runSummary = captureAnalysisRunSummary(request);
                const roleEvents = buildRoleCorrectionLogEvents(
                  preAnalysisSession,
                  new Date().toISOString(),
                );
                void analyzeMidiBytesWithToast(
                  request.bytes,
                  request.fileName,
                  request.options,
                ).then((analyzed) => {
                  if (!analyzed || !captureViewMountedRef.current) return;
                  setCompletedAnalysisSummary(runSummary);
                  void appendRoleCorrectionLog(roleEvents)
                    .catch(() => undefined);
                });
              } catch (error) {
                setToast(error instanceof Error
                  ? error.message
                  : copy.toast.midiFailed, "error");
              }
            }}
          />
          </div>
        </CaptureModeFrame>
      );
    }
    return (
      <CaptureModeFrame stage="empty" value={captureInputMode}
        disabled={activeDraft !== null} onChange={changeCaptureInputMode}>
        <div data-capture-midi-drop-zone {...dropHandlers}>
        <CaptureEmptyState
          status={intakeError ? "error" : analysis.status}
          error={intakeError ?? analysis.error}
          onChooseMidi={() => void chooseMidi(false)}
          isDraggingMidi={isDraggingMidi}
          copy={copy}
          progressStage={analysisProgress}
        />
        </div>
      </CaptureModeFrame>
    );
  }

  if (correctionModel) {
    return (
      <CaptureModeFrame stage="result" value={captureInputMode}
        disabled={activeDraft !== null} onChange={changeCaptureInputMode}>
        {persistenceError ? (
          <p className="mb-4 border border-red-400/60 bg-red-950/20 p-3 text-sm text-red-100" role="alert">
            {persistenceError}
          </p>
        ) : null}
        {analysisProgress ? (
          <CaptureAnalysisProgress stage={analysisProgress} copy={copy} />
        ) : null}
        <div className="lv-capture-content grid gap-5" data-capture-midi-drop-zone {...dropHandlers}>
          {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
          <CorrectionWorkspace
            key={workspaceDatasetKey}
            model={correctionModel}
            timeline={result.fullTimeline}
            fileName={result.fileName ?? "MIDI"}
            {...(analysisTargetLabel ? { analysisTargetLabel } : {})}
            {...(completedAnalysisSummary ? { analysisModeLabel: captureAnalysisRunCopy(completedAnalysisSummary).title } : {})}
            previewSound={previewSound}
            controller={controller}
            fullSource={captureFullTimelineSource(result)}
            onPlaybackError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error")}
            onChooseAnotherMidi={() => void chooseMidi(false)}
            blockCandidates={result.blockCandidates}
            tempoMissing={result.tempoDiagnostics?.provenance === "SMF_DEFAULT" || !result.bpm}
            {...(props.onWorkspaceDirtyChange ? { onDirtyChange: props.onWorkspaceDirtyChange } : {})}
            save={{
              ideas,
              defaultNextAction: copy.capture.defaultNextAction,
              copy,
              titleFor: (candidate) => captureSaveTitle(candidate, result.fileName, result.detectedKey, copy),
              onCreate: (ready, title, nextAction, userVerified) => {
                const sourceBassline = workspaceBassline.forSave(ready.candidate);
                if (sourceBassline === null) return undefined;
                return saveNew(ready.candidate, title, nextAction, userVerified, ready.original, ready.editable, [], ready.userEdited, sourceBassline, { stayOnCapture: true, ...(ready.bpm !== undefined ? { bpm: ready.bpm } : {}) });
              },
              onAppend: (ready, ideaId, userVerified) => {
                const sourceBassline = workspaceBassline.forSave(ready.candidate);
                if (sourceBassline === null) return false;
                return appendExisting(ready.candidate, ready.original, ready.editable, ideaId, userVerified, [], ready.userEdited, sourceBassline, ready.bpm !== undefined ? { bpm: ready.bpm } : undefined);
              },
              onCopyMemo: copyMemo,
              renderBassline: (ready) => workspaceBassline.panel(ready.candidate),
            }}
            {...(preAnalysisSession ? {
              onPartSettings: () => {
                stopCapturePlayback(controller);
                clearAnalysis();
              },
            } : {})}
          />
        </div>
      </CaptureModeFrame>
    );
  }

  // P10.0-07: the old result screen is gone. A result without its source notes (not
  // produced by the current intake) cannot open in the workspace; analyse the file again.
  return (
    <CaptureModeFrame stage="result" value={captureInputMode}
      disabled={false} onChange={changeCaptureInputMode}>
      <div className="lv-capture-content grid gap-5" data-capture-midi-drop-zone {...dropHandlers}>
        {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
        <StatusMessage
          title="この解析結果は修正作業場で開けません"
          tone="warning"
          action={<Button type="button" variant="primary" size="sm" onClick={() => void chooseMidi(false)}>MIDI を選び直す</Button>}
        >
          元の MIDI の音が残っていません。もう一度取り込んでください。
        </StatusMessage>
      </div>
    </CaptureModeFrame>
  );
}

function CaptureModeFrame({ stage, value, disabled, onChange, children }: {
  stage: string;
  value: CaptureInputMode;
  disabled: boolean;
  onChange: (mode: CaptureInputMode) => void;
  children: ReactNode;
}) {
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHeaderHost(document.getElementById("capture-mode-tabs-host")); }, []);
  const selector = <CaptureInputModeSelector value={value}
    disabled={disabled} onChange={onChange} />;
  return <div className="lv-capture-mode-content" data-capture-view-root data-capture-stage={stage}>
    {headerHost ? createPortal(selector, headerHost) : <div data-testid="capture-mode-tabs-fallback">{selector}</div>}
    {children}
  </div>;
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
      className={`lv-surface lv-surface-primary grid min-h-[28rem] place-items-center p-5 text-center transition-colors sm:p-7 ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent-soft)]" : ""}`}
      aria-labelledby="capture-empty-title"
      data-drop-target-state={isDraggingMidi ? "active" : "idle"}
    >
      <div className="w-full max-w-3xl">
        <p className="lv-section-kicker">
          {copy.capture.eyebrow}
        </p>
        <h2 id="capture-empty-title" className="mt-2 text-2xl font-bold sm:text-3xl">{copy.capture.title}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--lv-text-secondary)]">{copy.capture.emptyDescription}</p>
        <div
          className={`mx-auto mt-6 rounded-[var(--lv-radius-lg)] border-2 border-dashed px-5 py-8 ${isDraggingMidi ? "border-teal-300 bg-[var(--lv-accent-soft)] text-[var(--lv-text)]" : "border-[var(--lv-border-strong)] bg-[var(--lv-bg-subtle)] text-[var(--lv-text-secondary)]"}`}
          role="status"
          aria-live="polite"
        >
          <FileMusic aria-hidden="true" className="mx-auto mb-3 text-[var(--lv-accent)]" size={20} />
          <p className="text-lg font-bold">
            {isDraggingMidi ? copy.capture.dropActive : copy.capture.dropMidi}
          </p>
          <p className="mt-2 text-sm text-[var(--lv-text-muted)]">{copy.capture.dropHelp}</p>
          <Button
            variant="primary"
            className="mt-5 min-h-11 px-5"
            data-testid="capture-choose-midi"
            onClick={onChooseMidi}
          >
            {copy.capture.loadMidi}
          </Button>
          <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{copy.capture.supportedFormats}</p>
        </div>
        <div className="mt-5 flex flex-col justify-center gap-2 text-left sm:flex-row sm:gap-4">
          <StepCard index="1" text={copy.capture.emptyStepTimeline} />
          <StepCard index="2" text={copy.capture.emptyStepCandidates} />
          <StepCard index="3" text={copy.capture.emptyStepSave} />
        </div>
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
    <div className="flex min-w-0 items-center gap-2 rounded-[var(--lv-radius-sm)] px-2 py-1.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--lv-accent)] text-[11px] font-bold text-[var(--lv-accent)]">
        {index}
      </span>
      <p className="min-w-0 text-xs text-[var(--lv-text-secondary)]">{text}</p>
    </div>
  );
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
): string {
  const range = copy.capture.barRange(candidate.startBar, candidate.endBar);
  const fileName = sourceFileName?.trim();
  if (fileName) return `${fileName} · ${range}`;

  const key = detectedKey?.trim();
  if (key) return `${key} · ${range}`;

  const summary = candidate.summaryText.trim();
  return summary || copy.capture.savedProgression;
}

export function persistCopiedProgressionMemo(
  idea: SongIdea,
  candidate: ProgressionBlockCandidate,
  updateIdea: (id: string, changes: Partial<SongIdea>) => boolean | "pending",
  onCopied: () => void,
): boolean {
  const updated = updateIdea(idea.id, {
    chordMemo: appendProgressionMemo(idea.chordMemo, formatProgressionText(candidate.chords)),
  });
  if (updated !== true) return false;
  onCopied();
  return true;
}

export function appendProgressionMemo(existingMemo: string, progressionText: string): string {
  if (!existingMemo) return progressionText;
  return `${existingMemo}${existingMemo.endsWith("\n") ? "" : "\n"}${progressionText}`;
}
