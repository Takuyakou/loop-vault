import type { ToastFn } from "../components/notifications";
import { textPreviewNotes } from "../domain/textVoicingAvailability";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  beatsPerBar as beatsPerBarFor,
  buildRoleCorrectionLogEvents,
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
import {
  CaptureInputModeSelector,
  type CaptureInputMode,
} from "../components/capture/CaptureInputModeSelector";
import {
  TextProgressionCapturePanel,
  type TextProgressionConvertedDraft,
} from "../components/capture/TextProgressionCapturePanel";
import { textProgressionDraftSavePayload } from "../domain/textProgressionDraft";
import type { TasteBlock } from "../domain/nextChordSuggestions/tasteProfile";import { PreAnalysisWorkspace } from "../components/pre-analysis/PreAnalysisWorkspace";
import { useOptionalNotify } from "../components/notifications";
import { Button, StatusMessage } from "../components/ui";
import { useWorkspaceBassline } from "./capture/workspaceBassline";
import { useCaptureIntake } from "./capture/useCaptureIntake";
import { useCaptureSave } from "./capture/useCaptureSave";
import { CaptureEntry } from "./capture/CaptureEntry";
import { CorrectionWorkspace } from "../components/correction-workspace/CorrectionWorkspace";
import { buildCorrectionModel } from "../domain/correction/correctionModel";
import { restoreExcludedNotes } from "../domain/preAnalysisParts/restoreExcluded";
import {
  buildSplitAnalysisRequest,
  deriveSplitSession,
  restorePartNames,
  type ExcludedPart,
  type PartMap,
  type PartSplits,
} from "../domain/preAnalysisParts/splitSession";
import { partNames } from "../components/pre-analysis/sessionView";
import { analysisSessionVoiceContributionPreset } from "../domain/midi/preAnalysis";
import { memoryEntryFor, rememberPreAnalysis } from "../storage/preAnalysisMemory";
import { reviewThresholds } from "../domain/correction/reviewThresholds";
import {
  captureAnalysisIdentity,
  captureFullTimelineSource,
  stopCapturePlayback,
  type CaptureAnalysisProgressStage,
} from "./capture/captureRuntime";

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
  openSavedTextProgressionPractice?: (target: SavedTextProgressionTarget) => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => boolean | "pending";
  setToast: ToastFn;
  copy: AppCopy;
  showRomanNumerals: boolean;
  controller?: PlaybackController;
  analysisInput?: AnalysisInput;
  /** P23-11: opens Live MIDI from the first screen. Left out where it cannot be opened. */
  onOpenLiveMidi?: () => void;
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
  /** A line split a part: said in the heading, since the notes above it were not analysed. */
  withLines = false,
): string | undefined {
  const label = voices?.filter((voice) =>
    voice.included
    && !voice.isDrum
    && !voice.duplicateOf
    && voice.assignedRole !== "exclude")
    .map((voice) => voice.displayName)
    .join(" / ");
  return label !== undefined && withLines ? `${label}（線で分けたパートあり）` : label;
}

/** What the analysis left out of a split part, kept after the analysis to put the notes back for display. */
interface AnalysisSplitState {
  /** The analysis it belongs to: the result's `sourceFingerprint` is the request's `analysisFingerprint`. */
  fingerprint: string | undefined;
  excluded: readonly ExcludedPart[];
  map: PartMap;
  names: ReadonlyMap<string, string>;
  channels: ReadonlyMap<string, number>;
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

/** P25 V23 Stage 2: the Vault blocks the next-chord palette may learn from (the taste profile's input). */
function tasteBlocksOf(ideas: readonly SongIdea[]): TasteBlock[] {
  return ideas.flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => {
    const key = block.detectedKey ?? idea.key;
    return {
      chords: block.chords.map((item) => item.chord),
      ...(key === undefined ? {} : { key }),
      ...(block.pinned ? { pinned: true } : {}),
      ...(block.userVerified ? { userVerified: true } : {}),
      ...(block.userEdited ? { userEdited: true } : {}),
      ...(block.confidence === undefined ? {} : { confidence: block.confidence }),
      ...(block.textSource !== undefined || block.analyzerVersion === "text-progression-v1" ? { text: true } : {}),
    };
  }));
}

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
    openSavedTextProgressionPractice,
    updateIdea,
    setToast,
    copy,
    showRomanNumerals,
    controller = playbackController,
    analysisInput,
  } = props;
  const { sound: previewSound } = usePreviewSound();
  const [captureInputMode, setCaptureInputMode] = useState<CaptureInputMode>(initialInputMode);
  const notify = useOptionalNotify();
  // 「線で分ける」 (P15-02): the lines (session-only), and what the last analysis left out of split parts.
  const [partSplits, setPartSplits] = useState<PartSplits>({});
  const [analysisSplit, setAnalysisSplit] = useState<AnalysisSplitState>();
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
    // P25-03 C12: the text draft screen is gone, so a new analysis has nothing of it to drop.
    onAnalysisReset: () => undefined,
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
  // 「線で分ける」: the session the analysis was built from (the original when no line is in effect).
  const analysisSession = useMemo(
    () => (preAnalysisSession ? deriveSplitSession(preAnalysisSession, partSplits).session : undefined),
    [preAnalysisSession, partSplits],
  );
  const workspaceBassline = useWorkspaceBassline(analysisSession, result?.sourceFingerprint, beatsPerBarFor(result?.timeSignature));
  const workspaceDatasetKey = result ? `${captureAnalysisIdentity(result)}:${analysisRunGeneration}` : undefined;
  const correctionModel = useMemo(() => {
    if (!result || !analysis.sourceData || !analysis.sourceVoices) return undefined;
    // A line was used: the notes above it were not analysed. They come back here, unused, as melody.
    const split = analysisSplit && analysisSplit.fingerprint !== undefined
      && analysisSplit.fingerprint === result.sourceFingerprint ? analysisSplit : undefined;
    if (split) {
      const nameOf = (partId: string) => split.names.get(partId);
      const restored = restoreExcludedNotes({
        sourceData: analysis.sourceData,
        ...(analysisInput?.roleOverrides ? { roleOverrides: analysisInput.roleOverrides } : {}),
        excluded: split.excluded,
        nameOf,
        channelOf: (partId) => split.channels.get(partId) ?? 0,
      });
      const named = restorePartNames(analysis.sourceVoices, split.map, nameOf);
      const restoredVoices = restored.restoredVoiceIds.length
        ? restored.sourceVoices.map((voice) => named.find((entry) => entry.id === voice.id) ?? voice)
        : named;
      return buildCorrectionModel({
        result,
        sourceData: restored.sourceData,
        sourceVoices: restoredVoices,
        roleOverrides: restored.roleOverrides,
      }, reviewThresholds);
    }
    return buildCorrectionModel({
      result,
      sourceData: analysis.sourceData,
      sourceVoices: analysis.sourceVoices,
      ...(analysisInput?.roleOverrides ? { roleOverrides: analysisInput.roleOverrides } : {}),
    }, reviewThresholds);
  }, [analysis.sourceData, analysis.sourceVoices, analysisInput?.roleOverrides, analysisSplit, result]);
  // Lines belong to the files that are open: a new set of files starts without any.
  const hasPreAnalysisSession = preAnalysisSession !== undefined;
  useEffect(() => {
    if (!hasPreAnalysisSession) {
      setPartSplits((current) => (Object.keys(current).length ? {} : current));
      setAnalysisSplit(undefined);
    }
  }, [hasPreAnalysisSession]);
  const analysisTargetLabel = useMemo(
    () => captureAnalysisTargetLabel(
      preAnalysisSession?.voices,
      analysisSplit !== undefined && analysisSplit.fingerprint !== undefined
        && analysisSplit.fingerprint === result?.sourceFingerprint,
    ),
    [analysisSplit, preAnalysisSession, result?.sourceFingerprint],
  );
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
    if (nextMode === captureInputMode) return;
    stopTextPlayback();
    setCaptureInputMode(nextMode);
  }

  function saveExtendedTextProgression(
    result: ExtendedTextResult,
    title: string,
    resolvedKey?: string,
    voicings?: import("../domain/extendedTextSave").TextSaveVoicings,
  ): boolean {
    if (!result.canConvert || !createIdeaFromTextProgression) return false;
    // P23-33: the effective key is carried beside the confirmed key; the original-text validation still
    // compares only `confirmedKey` with the source metadata.
    const data = { ...extendedTextSaveData(result, voicings), title, ...(resolvedKey === undefined ? {} : { resolvedKey }) };
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
    announceSavedText(saved, evaluateExtendedTextPractice(result, result.metadata.bpm ?? 120));
    return true;
  }

  function saveStandardTextProgression(converted: TextProgressionConvertedDraft, title: string): boolean {
    if (!createIdeaFromTextProgression) return false;
    const payload = textProgressionDraftSavePayload(converted.draft, {
      title, nextAction: copy.capture.defaultNextAction, userVerified: true,
      ...(converted.bpm === undefined ? {} : { bpm: converted.bpm }),
      ...(converted.confirmedKey === undefined ? {} : { confirmedKey: converted.confirmedKey }),
      ...(converted.resolvedKey === undefined ? {} : { resolvedKey: converted.resolvedKey }),
    });
    const saved = createIdeaFromTextProgression(payload);
    if (!saved) { setToast(copy.capture.createFailed, "error"); return false; }
    announceSavedText(saved, undefined);
    return true;
  }

  /** P25 V27: one bottom-right notice after a save (the old panel under the preview is gone). */
  function announceSavedText(saved: unknown, status: ExtendedTextPracticeStatus | undefined) {
    const target = typeof saved === "object" && saved !== null ? saved as SavedTextProgressionTarget : undefined;
    const practice = target !== undefined ? openSavedTextProgressionPractice : undefined;
    if (status?.ready === false) {
      if (notify) notify({ tone: "info", message: "進行をVaultに保存しました。この進行は Voicing Loop では練習できません。", durationMs: 10000 });
      else setToast("進行をVaultに保存しました。この進行は Voicing Loop では練習できません。", "info");
      return;
    }
    if (notify) {
      if (practice !== undefined && target !== undefined) {
        notify({ tone: "success", message: copy.capture.savedToVault, durationMs: 10000,
          action: { label: "Voicing Loopで練習", onClick: () => practice(target) } });
      } else {
        notify({ tone: "success", message: copy.capture.savedToVault, durationMs: 10000 });
      }
    } else {
      setToast(copy.capture.savedToVault, "success");
    }
  }

  async function previewTextProgressionEvent(
    event: TextProgressionEvent,
    memory: ChordVoicingMemory | undefined,
    bpm: number,
  ) {
    try {
      const eventId = `text-card:${event.bar}:${event.startBeat}:${event.durationBeats}:${event.canonical}`;
      // P25-03: the same sound the card plays (its own notes, else the K ① シェル).
      const notes = [...textPreviewNotes(event.chord, memory)];
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

  if (captureInputMode === "text") {
    return (
      <CaptureModeFrame stage="text" value={captureInputMode}
        disabled={false} onChange={changeCaptureInputMode}>
        <div className="lv-capture-content lv-capture-text-content grid gap-5">
          <TextProgressionCapturePanel
            showRomanNumerals={showRomanNumerals}
            vaultTasteBlocks={tasteBlocksOf(ideas)}
            onSaveStandard={saveStandardTextProgression}
            onSaveExtended={saveExtendedTextProgression}
            controller={controller}
            previewSound={previewSound}
            onPreview={(event, memory, bpm) => void previewTextProgressionEvent(event, memory, bpm)}
            onStop={stopTextPlayback}
          />
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
          disabled={false} onChange={changeCaptureInputMode}>
          <div data-capture-midi-drop-zone {...dropHandlers}>
          {isDraggingMidi ? <DropOverlay copy={copy} /> : null}
          <PreAnalysisWorkspace
            session={preAnalysisSession}
            busy={analysisProgress !== undefined}
            requiresReanalysis={completedAnalysisSummary !== undefined}
            splits={partSplits}
            onSplitsChange={setPartSplits}
            onSessionChange={setPreAnalysisSession}
            onAddMidi={() => void chooseMidi(true)}
            onRemoveSource={(sourceId) => {
              const next = removeMidiSource(preAnalysisSession, sourceId);
              if (next) setPreAnalysisSession(next);
            }}
            onAnalyze={() => {
              if (!master) return;
              try {
                const split = buildSplitAnalysisRequest(preAnalysisSession, partSplits);
                const request = split.request;
                const runSummary = captureAnalysisRunSummary(request);
                const lineParts = split.excluded;
                const names = partNames(preAnalysisSession);
                const channels = new Map(preAnalysisSession.voices.map((voice) => [voice.id, voice.channel]));
                // Set before the analysis: the workspace takes its model once, when the result appears.
                setAnalysisSplit(lineParts.length
                  ? { fingerprint: request.options.analysisFingerprint, excluded: lineParts, map: split.map, names, channels }
                  : undefined);
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
                  // 「前回と同じ設定」: only the shape of the parts and what was chosen (never names or notes).
                  rememberPreAnalysis(memoryEntryFor(
                    preAnalysisSession,
                    Object.fromEntries(lineParts.map((part) => [part.partId, part.melodyFrom])),
                    analysisSessionVoiceContributionPreset(preAnalysisSession),
                  ));
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
        disabled={false} onChange={changeCaptureInputMode}>
        <div data-capture-midi-drop-zone {...dropHandlers}>
        <CaptureEntry
          state={isDraggingMidi
            ? "over"
            : analysis.status === "analyzing" || analysisProgress
              ? "loading"
              : intakeError || analysis.status === "error" ? "error" : "idle"}
          error={intakeError ?? analysis.error}
          progressStage={analysisProgress}
          textDisabled={false}
          onChooseMidi={() => void chooseMidi(false)}
          onOpenText={() => changeCaptureInputMode("text")}
          onOpenLiveMidi={props.onOpenLiveMidi}
        />
        </div>
      </CaptureModeFrame>
    );
  }

  if (correctionModel) {
    return (
      <CaptureModeFrame stage="result" value={captureInputMode}
        disabled={false} onChange={changeCaptureInputMode}>
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
            harmonyKey={result.detectedKey}
            showDegrees={showRomanNumerals}
            tempoMissing={result.tempoDiagnostics?.provenance === "SMF_DEFAULT" || !result.bpm}
            {...(props.onWorkspaceDirtyChange ? { onDirtyChange: props.onWorkspaceDirtyChange } : {})}
            save={{
              ideas,
              defaultNextAction: copy.capture.defaultNextAction,
              copy,
              titleFor: (candidate) => captureSaveTitle(candidate, result.fileName, result.detectedKey, copy),
              onCreate: (ready, title, nextAction, userVerified, extra) => {
                const sourceBassline = workspaceBassline.forSave(ready.candidate, ready.crossesCut ? null : ready.sourceBars);
                if (sourceBassline === null) return undefined;
                return saveNew(ready.candidate, title, nextAction, userVerified, ready.original, ready.editable, [], ready.userEdited, sourceBassline, { stayOnCapture: true, ...(ready.bpm !== undefined ? { bpm: ready.bpm } : {}), ...(extra?.memoNote ? { memoNote: extra.memoNote } : {}), ...(ready.removedBars.length ? { removedBars: ready.removedBars } : {}) });
              },
              onAppend: (ready, ideaId, userVerified, extra) => {
                const sourceBassline = workspaceBassline.forSave(ready.candidate, ready.crossesCut ? null : ready.sourceBars);
                if (sourceBassline === null) return false;
                const options = { ...(ready.bpm !== undefined ? { bpm: ready.bpm } : {}), ...(extra?.memoNote ? { memoNote: extra.memoNote } : {}), ...(ready.removedBars.length ? { removedBars: ready.removedBars } : {}) };
                return appendExisting(ready.candidate, ready.original, ready.editable, ideaId, userVerified, [], ready.userEdited, sourceBassline, Object.keys(options).length ? options : undefined);
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
          title="この解析結果は進行エディタで開けません"
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

export function CaptureAnalysisProgress({
  stage,
  copy,
}: {
  stage: CaptureAnalysisProgressStage;
  copy: AppCopy;
}) {
  return (
    <div
      className="lv-analysis-progress z-50 w-[min(24rem,calc(100vw-3rem))] border border-cyan-400/40 bg-[var(--lv-surface)] p-4 shadow-2xl"
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
