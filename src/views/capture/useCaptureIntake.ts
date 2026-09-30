import { useCallback, useEffect, useRef, useState, type DragEvent, type MutableRefObject } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import type { ToastFn } from "../../components/notifications";
import type { PlaybackController } from "../../audio/playbackController";
import {
  addMidiSources,
  createAnalysisSession,
  type AnalysisSession,
  type MidiSourceInput,
} from "../../domain/midi";
import type { AnalyzeMidiOptions } from "../../domain/midi/types";
import type { MidiProgressionAnalysis } from "../../domain/types";
import type { AppCopy } from "../../i18n";
import { assertMidiTotalBytes } from "../../security/intakeBudgets";
import { readBoundedMidiPaths } from "../../storage/boundedMidiReader";
import { getAnalysisProfileAnalyzeOptions, getAnalysisProfileSettings } from "../../storage/accuracyFirstSettings";
import { getPreAnalysisSourceSelectionSettings, shouldOpenPreAnalysis } from "../../storage/preAnalysisSettings";
import type { CaptureAnalysisRunSummary } from "../CaptureView";
import {
  fileNameFromPath,
  hasDroppedFiles,
  isMidiFileName,
  stopCapturePlayback,
  waitForNextPaint,
  waitForStatusFeedback,
  type CaptureAnalysisProgressStage,
} from "./captureRuntime";

/**
 * Capture intake: choosing, dropping and reading MIDI, the pre-analysis session,
 * starting the analysis and its progress and errors. Moved out of CaptureView
 * unchanged (P10.0-02); only the draft/candidate reset became a callback.
 */
export function useCaptureIntake({
  controller,
  analyzeMidiBytes,
  clearAnalysis,
  setToast,
  copy,
  mountedRef,
  onAnalysisReset,
}: {
  controller: PlaybackController;
  analyzeMidiBytes: (bytes: Uint8Array, options?: AnalyzeMidiOptions) => MidiProgressionAnalysis | undefined;
  clearAnalysis: () => void;
  setToast: ToastFn;
  copy: AppCopy;
  mountedRef: MutableRefObject<boolean>;
  /** Drops the active draft and the expanded candidate. Read through a ref, so it may change every render. */
  onAnalysisReset: () => void;
}) {
  const captureViewMountedRef = mountedRef;
  const onAnalysisResetRef = useRef(onAnalysisReset);
  onAnalysisResetRef.current = onAnalysisReset;
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);
  const [sourcePath, setSourcePath] = useState<string>();
  const [preAnalysisSession, setPreAnalysisSession] = useState<AnalysisSession>();
  const [preAnalysisDetailsExpanded, setPreAnalysisDetailsExpanded] = useState(false);
  const [completedAnalysisSummary, setCompletedAnalysisSummary] =
    useState<CaptureAnalysisRunSummary>();
  const [intakeError, setIntakeError] = useState<string>();
  const [analysisProgress, setAnalysisProgress] = useState<CaptureAnalysisProgressStage>();
  const [analysisRunGeneration, setAnalysisRunGeneration] = useState(0);

  const analyzeMidiBytesWithToast = useCallback(
    async (
      bytes: Uint8Array,
      fileName: string,
      optionOverrides: AnalyzeMidiOptions = {},
    ) => {
      stopCapturePlayback(controller);
      onAnalysisResetRef.current();
      setAnalysisProgress("analyzing");
      await waitForNextPaint();
      if (!captureViewMountedRef.current) return false;
      const analyzed = analyzeMidiBytes(bytes, {
        fileName,
        ...getAnalysisProfileAnalyzeOptions(),
        ...optionOverrides,
      });
      if (!captureViewMountedRef.current) return false;
      setAnalysisRunGeneration((current) => current + 1);
      setAnalysisProgress("finalizing");
      await waitForNextPaint();
      if (!captureViewMountedRef.current) return false;
      setToast(analyzed ? copy.toast.midiAnalyzed : copy.toast.midiFailed, analyzed ? "info" : "error");
      await waitForStatusFeedback();
      if (!captureViewMountedRef.current) return false;
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
      assertMidiTotalBytes(inputs.map(({ bytes }) => bytes.byteLength));
      stopCapturePlayback(controller);
      if (!options.append) {
        setCompletedAnalysisSummary(undefined);
      }
      setAnalysisProgress("reading");
      await waitForNextPaint();
      if (!captureViewMountedRef.current) return;
      const intake = options.append && preAnalysisSession
        ? addMidiSources(preAnalysisSession, inputs)
        : createAnalysisSession(inputs);
      if (!intake.session) {
        setAnalysisProgress(undefined);
        const issue = intake.issues[0];
        const message = issue?.message ?? copy.toast.midiReadFailed;
        setIntakeError(message);
        setToast(message, "error");
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
        if (!captureViewMountedRef.current) return;
        return;
      }
      clearAnalysis();
      setPreAnalysisSession(intake.session);
      if (!options.append) {
        setSourcePath(options.sourcePath);
      }
      onAnalysisResetRef.current();
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
        setToast(copy.toast.midiDropInvalid, "error");
        return;
      }

      try {
        setAnalysisProgress("reading");
        await waitForNextPaint();
        if (!captureViewMountedRef.current) return;
        const byteArrays = await readBoundedMidiPaths(midiPaths);
        if (!captureViewMountedRef.current) return;
        const inputs = midiPaths.map((path, index): MidiSourceInput => ({
          bytes: byteArrays[index],
          displayName: fileNameFromPath(path),
        }));
        await prepareMidiInputs(inputs, {
          append,
          sourcePath: append ? undefined : midiPaths[0],
        });
        if (!captureViewMountedRef.current) return;
      } catch (error) {
        if (!captureViewMountedRef.current) return;
        setAnalysisProgress(undefined);
        const message = error instanceof Error ? error.message : copy.toast.midiReadFailed;
        setIntakeError(message);
        setToast(message, "error");
      }
    },
    [copy.toast.midiDropInvalid, copy.toast.midiReadFailed, prepareMidiInputs, setToast],
  );

  const analyzeDroppedFile = useCallback(
    async (files: readonly File[], append = false) => {
      const midiFiles = files.filter((file) => isMidiFileName(file.name));
      if (!midiFiles.length) {
        setToast(copy.toast.midiDropInvalid, "error");
        return;
      }

      try {
        setAnalysisProgress("reading");
        await waitForNextPaint();
        if (!captureViewMountedRef.current) return;
        assertMidiTotalBytes(midiFiles.map(({ size }) => size));
        const inputs = await Promise.all(midiFiles.map(async (file): Promise<MidiSourceInput> => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          displayName: file.name,
        })));
        if (!captureViewMountedRef.current) return;
        assertMidiTotalBytes(inputs.map(({ bytes }) => bytes.byteLength));
        await prepareMidiInputs(inputs, { append });
        if (!captureViewMountedRef.current) return;
      } catch (error) {
        if (!captureViewMountedRef.current) return;
        setAnalysisProgress(undefined);
        const message = error instanceof Error ? error.message : copy.toast.midiReadFailed;
        setIntakeError(message);
        setToast(message, "error");
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
          setToast(copy.toast.midiDropInvalid, "error");
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
    if (!captureViewMountedRef.current || !path) {
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
      setToast(copy.toast.midiDropInvalid, "error");
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

  return {
    isDraggingMidi,
    sourcePath,
    setSourcePath,
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
  };
}
