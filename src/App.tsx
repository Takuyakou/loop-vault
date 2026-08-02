import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  FormEvent,
  lazy,
  ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import {
  playbackController,
  type PlaybackController,
} from "./audio/playbackController";
import {
  applyMasterVolume,
  loadMasterVolume,
  normalizeMasterVolume,
  saveMasterVolume,
} from "./audio/masterVolume";
import { AppShell, type AppView } from "./components/AppShell";
import { CaptureRenderBoundary } from "./components/CaptureRenderBoundary";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Modal } from "./components/Modal";
import { DetailView } from "./views/DetailView";
import { HomeView } from "./views/HomeView";
import { SettingsDialog } from "./views/SettingsDialog";
import { HistoryView } from "./views/HistoryView";
import { VaultView } from "./views/VaultView";
import { ProgressionDetailView } from "./views/ProgressionDetailView";
import { PracticeView } from "./views/PracticeView";
import { isBassPracticeDegreeEchoEnabled } from "./features/bass-practice/application/featureFlag";
import {
  derivePracticeHistory,
  derivePracticeHomeSummary,
  createPracticeControllerIfEnabled,
  PracticeDataController,
  restoreClaimedExercise,
  type PracticeDataSnapshot,
} from "./features/bass-practice/application/practiceData";
import { createRuntimePracticeStorage } from "./features/bass-practice/infra/repository";
import { BassPracticeHomeCard } from "./features/bass-practice/ui/BassPracticeHomeCard";
import { PracticeRecoveryPanel } from "./features/bass-practice/ui/PracticeRecoveryPanel";
import {
  PracticeWorkspace,
  type PracticeWorkspaceMode,
} from "./features/bass-practice/ui/PracticeWorkspace";
import { Toast } from "./components/Toast";
import { LiveMidiMiniMode } from "./components/LiveMidiMiniMode";
import { PreviewSoundProvider } from "./components/PreviewSoundProvider";
import { LiveMidiImportDialog, type LiveMidiImportRequest } from "./components/LiveMidiImportDialog";
import { UndoToast } from "./components/UndoToast";
import { statusLabel } from "./domain/displayLabels";
import { parseMidi } from "./domain/midi";
import type { SavedProgressionBlock, SongIdea, Status } from "./domain/types";
import {
  applyPendingDeletions,
  createUndoSnapshot,
  ideaAnchor,
  progressionBlockAnchor,
  isPendingDeletion,
  type PendingDeletion,
  type PendingIdeaDeletion,
  type PendingProgressionBlockDeletion,
} from "./domain/undoDeletion";
import {
  appCopy,
  progressionDetailCopy,
  type AppCopy,
  type AppLanguage,
} from "./i18n";
import {
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
} from "./store/closeGuard";
import { defaultVaultStore } from "./store/defaultVaultStore";
import { CaptureView } from "./views/CaptureView";
import { useUndoQueue } from "./hooks/useUndoQueue";
import type { UndoRequest } from "./hooks/useUndoQueue";
import { defaultLiveMidiStore } from "./liveMidi/defaultLiveMidiStore";
import { createTauriMiniWindowAdapter, MiniWindowController } from "./liveMidi/miniWindowController";
import { loadLiveMidiPreferences, saveLiveMidiPreferences } from "./liveMidi/preferences";
import { historyToSavedProgressionBlock, type LiveChordHistoryEntry } from "./domain/liveMidi";
import {
  createLiveMidiWindowSnapshot,
  LIVE_MIDI_COMMAND_EVENT,
  sendLiveMidiSnapshot,
  type LiveMidiWindowCommand,
} from "./liveMidi/windowProtocol";

type View = AppView;
const pipeline: Status[] = ["idea", "loop", "arrange", "mix", "done"];
const DISABLED_PRACTICE_DATA: PracticeDataSnapshot = { status: "disabled", quarantine: [] };
const BassPracticeView = lazy(async () => {
  const module = await import("./features/bass-practice/ui/BassPracticeView");
  return { default: module.BassPracticeView };
});

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function newPracticeSessionId(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `practice-session:${id}`;
}

function App() {
  const loadStatus = useStore(defaultVaultStore, (state) => state.loadStatus);
  const ideas = useStore(defaultVaultStore, (state) => state.ideas);
  const settings = useStore(defaultVaultStore, (state) => state.settings);
  const quarantine = useStore(defaultVaultStore, (state) => state.quarantine);
  const recovery = useStore(defaultVaultStore, (state) => state.recovery);
  const readonly = useStore(defaultVaultStore, (state) => state.readonly);
  const unsaved = useStore(defaultVaultStore, (state) => state.unsaved);
  const saving = useStore(defaultVaultStore, (state) => state.saving);
  const error = useStore(defaultVaultStore, (state) => state.error);
  const vaultEpoch = useStore(defaultVaultStore, (state) => state.vaultEpoch);
  const analysis = useStore(defaultVaultStore, (state) => state.analysis);
  const initialize = useStore(defaultVaultStore, (state) => state.initialize);
  const restoreBackup = useStore(defaultVaultStore, (state) => state.restoreBackup);
  const backups = useStore(defaultVaultStore, (state) => state.backups);
  const setMonthlyGoal = useStore(defaultVaultStore, (state) => state.setMonthlyGoal);
  const setLanguage = useStore(defaultVaultStore, (state) => state.setLanguage);
  const setShowRomanNumerals = useStore(defaultVaultStore, (state) => state.setShowRomanNumerals);
  const refreshBackups = useStore(defaultVaultStore, (state) => state.refreshBackups);
  const exportVault = useStore(defaultVaultStore, (state) => state.exportVault);
  const importVault = useStore(defaultVaultStore, (state) => state.importVault);
  const createIdea = useStore(defaultVaultStore, (state) => state.createIdea);
  const createIdeaFromDraft = useStore(defaultVaultStore, (state) => state.createIdeaFromDraft);
  const updateIdea = useStore(defaultVaultStore, (state) => state.updateIdea);
  const deleteIdea = useStore(defaultVaultStore, (state) => state.deleteIdea);
  const appendBlockToIdea = useStore(defaultVaultStore, (state) => state.appendBlockToIdea);
  const updateProgressionBlock = useStore(defaultVaultStore, (state) => state.updateProgressionBlock);
  const duplicateProgressionBlock = useStore(defaultVaultStore, (state) => state.duplicateProgressionBlock);
  const removeProgressionBlock = useStore(defaultVaultStore, (state) => state.removeProgressionBlock);
  const removeReference = useStore(defaultVaultStore, (state) => state.removeReference);
  const unlinkAsset = useStore(defaultVaultStore, (state) => state.unlinkAsset);
  const transitionIdea = useStore(defaultVaultStore, (state) => state.transitionIdea);
  const updateNextAction = useStore(defaultVaultStore, (state) => state.updateNextAction);
  const analyzeMidiBytes = useStore(defaultVaultStore, (state) => state.analyzeMidiBytes);
  const clearAnalysis = useStore(defaultVaultStore, (state) => state.clearAnalysis);

  const [view, setView] = useState<View>("home");
  const [bassPracticeEnabled] = useState(isBassPracticeDegreeEchoEnabled);
  const practiceControllerRef = useRef<PracticeDataController>();
  const pendingPracticeSessionIdRef = useRef<string>();
  const [practiceSessionGeneration, setPracticeSessionGeneration] = useState(0);
  const [practiceData, setPracticeData] = useState<PracticeDataSnapshot>(DISABLED_PRACTICE_DATA);
  const [practiceMode, setPracticeMode] = useState<PracticeWorkspaceMode>("chord-dojo");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedProgression, setSelectedProgression] = useState<{ ideaId: string; blockId: string }>();
  const [practiceTarget, setPracticeTarget] = useState<{ ideaId: string; blockId: string }>();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [webLiveMidiPreviewOpen, setWebLiveMidiPreviewOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState(() => loadMasterVolume());
  const [pendingLiveMidiHistory, setPendingLiveMidiHistory] = useState<LiveChordHistoryEntry[]>();
  const [startupRestoreName, setStartupRestoreName] = useState<string>();
  const [progressionDetailDirty, setProgressionDetailDirty] = useState(false);
  const [pendingProgressionLeave, setPendingProgressionLeave] = useState<(() => void)>();
  const undoFallbackFocusRef = useRef<HTMLHeadingElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const previousViewRef = useRef(view);
  const miniWindowControllerRef = useRef<MiniWindowController | undefined>(undefined);
  const liveMidiClosingRef = useRef(false);
  const undoQueue = useUndoQueue();
  const undoEpochRef = useRef(vaultEpoch);
  const pendingDeletions = useMemo(
    () => undoQueue.actions
      .map((action) => action.payload)
      .filter(isPendingDeletion),
    [undoQueue.actions],
  );
  useEffect(() => {
    if (!bassPracticeEnabled) {
      practiceControllerRef.current = undefined;
      setPracticeData(DISABLED_PRACTICE_DATA);
      return;
    }
    const controller = createPracticeControllerIfEnabled(bassPracticeEnabled, createRuntimePracticeStorage)!;
    practiceControllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => setPracticeData(controller.getSnapshot()));
    void controller.initialize();
    return () => { unsubscribe(); if (practiceControllerRef.current === controller) practiceControllerRef.current = undefined; };
  }, [bassPracticeEnabled]);
  const practiceHomeSummary = useMemo(() => practiceData.file ? derivePracticeHomeSummary(practiceData.file, new Date()) : undefined, [practiceData]);
  const practiceHistory = useMemo(() => practiceData.file ? derivePracticeHistory(practiceData.file) : [], [practiceData]);
  const practiceSession = useMemo(() => {
    const file = practiceData.file;
    const active = file?.sessions.find((session) => !session.completedAt && !session.abandoned && session.completedCount < session.targetCount);
    if (active) pendingPracticeSessionIdRef.current = active.id;
    else if (!pendingPracticeSessionIdRef.current) pendingPracticeSessionIdRef.current = newPracticeSessionId();
    const selected = file?.sessions.find(({ id }) => id === pendingPracticeSessionIdRef.current);
    return { id: pendingPracticeSessionIdRef.current!, round: (selected?.completedCount ?? 0) + 1 };
  }, [practiceData.file, practiceSessionGeneration]);
  const practiceClaim = useMemo(
    () => practiceData.file ? restoreClaimedExercise(practiceData.file, practiceSession.id) : undefined,
    [practiceData.file, practiceSession.id],
  );
  useEffect(() => {
    if (bassPracticeEnabled && practiceData.status === "ready" && view === "practice" && practiceMode === "bass-practice") {
      void practiceControllerRef.current?.ensureSession(practiceSession.id, new Date());
    }
  }, [bassPracticeEnabled, practiceData.status, practiceMode, practiceSession.id, view]);
  const visibleIdeas = useMemo(
    () => applyPendingDeletions(ideas, pendingDeletions, vaultEpoch),
    [ideas, pendingDeletions, vaultEpoch],
  );

  const selectedIdea = visibleIdeas.find((idea) => idea.id === selectedId) ?? visibleIdeas[0];
  const storedSelectedIdea = ideas.find((idea) => idea.id === selectedIdea?.id);
  const progressionIdea = selectedProgression
    ? visibleIdeas.find((idea) => idea.id === selectedProgression.ideaId)
    : undefined;
  const progressionBlock = progressionIdea?.progressionBlocks?.find(
    (block) => block.id === selectedProgression?.blockId,
  );
  const language = settings.language;
  const copy = appCopy[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const progressionCopy = progressionDetailCopy[language];

  useEffect(() => {
    void initialize();
    const unlistenBrowser = registerBrowserCloseGuard(defaultVaultStore);
    let unlistenTauri: (() => void) | undefined;

    void registerTauriCloseGuard(defaultVaultStore).then((unlisten) => {
      unlistenTauri = unlisten;
    });

    return () => {
      unlistenBrowser();
      unlistenTauri?.();
    };
  }, [initialize]);

  useEffect(() => {
    applyMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    if (undoEpochRef.current !== vaultEpoch) undoQueue.clearAll();
    undoEpochRef.current = vaultEpoch;
  }, [undoQueue.clearAll, vaultEpoch]);

  useEffect(() => {
    if (view === "progression-detail" && (!progressionIdea || !progressionBlock)) {
      setView("library");
    }
  }, [progressionBlock, progressionIdea, view]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(undefined), 3200);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [toast]);

  useEffect(() => {
    if (previousViewRef.current === view) return undefined;
    previousViewRef.current = view;
    const frame = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: 0, left: 0 });
      mainContentRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => {
    if (!webLiveMidiPreviewOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void leaveLiveMidiMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [webLiveMidiPreviewOpen]);

  useEffect(() => {
    if (!isTauri()) return undefined;
    let disposed = false;
    let unlistenCommand: (() => void) | undefined;
    const sendSnapshot = () => {
      void sendLiveMidiSnapshot(
        createLiveMidiWindowSnapshot(defaultLiveMidiStore.getState(), language),
      ).catch(() => undefined);
    };
    const unsubscribeStore = defaultLiveMidiStore.subscribe(sendSnapshot);

    void (async () => {
      const stopCommands = await listen<LiveMidiWindowCommand>(
        LIVE_MIDI_COMMAND_EVENT,
        (event) => {
          if (disposed) return;
          const command = event.payload;
          if (command.type === "ready") {
            sendSnapshot();
          } else if (command.type === "show-main") {
            void miniWindowControllerRef.current?.showMain();
          } else if (command.type === "close") {
            void leaveLiveMidiMode();
          } else if (command.type === "refresh-devices") {
            void defaultLiveMidiStore.getState().refreshDevices();
          } else if (command.type === "select-device") {
            void defaultLiveMidiStore.getState().selectDevice(command.backendId);
          } else if (command.type === "set-show-history") {
            defaultLiveMidiStore.getState().setShowHistory(command.show);
          }
        },
      );
      if (disposed) {
        stopCommands();
        return;
      }
      unlistenCommand = stopCommands;
      sendSnapshot();
    })();

    return () => {
      disposed = true;
      unsubscribeStore();
      unlistenCommand?.();
    };
  }, [language]);

  function openDetail(id: string) {
    setSelectedProgression(undefined);
    setSelectedId(id);
    setView("detail");
  }

  function requestProgressionLeave(action: () => void) {
    if (view === "progression-detail" && progressionDetailDirty) {
      setPendingProgressionLeave(() => action);
      return;
    }
    action();
  }

  function navigateTo(nextView: View) {
    requestProgressionLeave(() => setView(nextView));
  }

  function changeMasterVolume(value: number) {
    const normalized = normalizeMasterVolume(value);
    setMasterVolume(normalized);
    saveMasterVolume(normalized);
  }

  function openProgression(ideaId: string, blockId: string) {
    setSelectedId(ideaId);
    setSelectedProgression({ ideaId, blockId });
    setView("progression-detail");
  }

  function openPractice(ideaId: string, blockId: string) {
    setPracticeTarget({ ideaId, blockId });
    setPracticeMode("chord-dojo");
    setView("practice");
  }

  function openBassPractice() {
    if (!bassPracticeEnabled) return;
    setPracticeTarget(undefined);
    setPracticeMode("bass-practice");
    setView("practice");
  }

  function handleCreate(title: string, status: Status) {
    requestProgressionLeave(() => {
      const id = createIdea(title, status);
      if (!id) {
        return;
      }

      setCreateOpen(false);
      openDetail(id);
    });
  }

async function analyzeMidiPath(path: string) {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.desktopMidiOnly);
      return;
    }

    try {
      const bytes = await readFile(path);
      const result = analyzeMidiBytes(bytes, { fileName: fileNameFromPath(path) });
      setView("capture");
      setToast(result ? copy.toast.midiAnalyzed : copy.toast.midiFailed);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.midiReadFailed);
    }
  }

  async function loadMidiSource(path: string) {
    return parseMidi(await readFile(path));
  }

  async function enterLiveMidiMode() {
    try {
      const preferences = loadLiveMidiPreferences();
      if (isTauri()) {
        const adapter = createTauriMiniWindowAdapter();
        if (!adapter) throw new Error(copy.liveMidi.miniModeFailed);
        const controller = miniWindowControllerRef.current ?? new MiniWindowController(adapter);
        miniWindowControllerRef.current = controller;
        await controller.open(preferences.miniBounds, preferences.alwaysOnTop ?? true);
      } else {
        setWebLiveMidiPreviewOpen(true);
      }
      await defaultLiveMidiStore.getState().activate();
      if (isTauri()) {
        await sendLiveMidiSnapshot(
          createLiveMidiWindowSnapshot(defaultLiveMidiStore.getState(), language),
        ).catch(() => undefined);
      }
    } catch (error) {
      await defaultLiveMidiStore.getState().deactivate().catch(() => undefined);
      await miniWindowControllerRef.current?.close().catch(() => undefined);
      setToast(errorMessage(error, copy.liveMidi.miniModeFailed));
      setWebLiveMidiPreviewOpen(false);
    }
  }

  async function leaveLiveMidiMode() {
    if (liveMidiClosingRef.current) return;
    liveMidiClosingRef.current = true;
    try {
      const history = [...defaultLiveMidiStore.getState().history];
      await defaultLiveMidiStore.getState().deactivate();
      const miniBounds = await miniWindowControllerRef.current?.close();
      if (miniBounds) {
        saveLiveMidiPreferences({ ...defaultLiveMidiStore.getState().preferences, miniBounds });
      }
      setWebLiveMidiPreviewOpen(false);
      if (history.length > 0) setPendingLiveMidiHistory(history);
    } finally {
      liveMidiClosingRef.current = false;
    }
  }

  function discardLiveMidiHistory() {
    setPendingLiveMidiHistory(undefined);
    defaultLiveMidiStore.getState().clearSession();
  }

  function importLiveMidiHistory(request: LiveMidiImportRequest) {
    if (!pendingLiveMidiHistory) return;
    const ideaId = request.ideaId ?? (request.newIdeaTitle
      ? createIdeaFromDraft({ title: request.newIdeaTitle, status: "idea" })
      : undefined);
    const block = historyToSavedProgressionBlock(
      pendingLiveMidiHistory,
      request.startIndex,
      request.endIndex,
      { id: crypto.randomUUID(), capturedAt: new Date().toISOString() },
    );
    if (!ideaId || !block || !appendBlockToIdea(ideaId, block, undefined, { userVerified: false })) {
      setToast(copy.liveMidi.importFailed);
      return;
    }
    discardLiveMidiHistory();
    setToast(copy.liveMidi.imported);
    openDetail(ideaId);
  }

  function requestDelete(idea: SongIdea) {
    const deleted = deleteIdeaForUndo({
      idea,
      ideas,
      vaultEpoch,
      label: copy.undo.ideaDeleted(idea.title),
      deleteIdea,
      enqueueUndo: undoQueue.enqueue,
    });
    if (!deleted) return;
    setSelectedId(undefined);
    setView("library");
  }

  function requestProgressionDelete(idea: SongIdea, block: SavedProgressionBlock) {
    stopIdeaPlayback(idea.id);
    const storedIdea = ideas.find((entry) => entry.id === idea.id);
    const blocks = storedIdea?.progressionBlocks ?? [];
    const snapshot = createUndoSnapshot(
      blocks,
      blocks.findIndex((entry) => entry.id === block.id),
      idea.id,
      progressionBlockAnchor,
    );
    if (!snapshot) return;
    const deletion: PendingProgressionBlockDeletion = {
      kind: "progressionBlock",
      vaultEpoch,
      snapshot,
    };
    undoQueue.enqueue({
      label: copy.undo.blockDeleted,
      payload: deletion,
      undo: () => true,
      commit: () => removeProgressionBlock(deletion),
    });
    setSelectedProgression(undefined);
    setView("library");
  }

  return (
    <PreviewSoundProvider>
      <a className="lv-skip-link" href="#main-content">
        {copy.common.skipToContent}
      </a>
      <AppShell
        view={view}
        setView={navigateTo}
        openCreate={() => setCreateOpen(true)}
        openLiveMidi={() => requestProgressionLeave(() => { void enterLiveMidiMode(); })}
        openSettings={() => {
          setSettingsOpen(true);
          void refreshBackups();
        }}
        settingsOpen={isSettingsOpen}
        copy={copy}
        saveStatus={saving ? "saving" : unsaved ? "unsaved" : "saved"}
        masterVolume={masterVolume}
        onMasterVolumeChange={changeMasterVolume}
        pageTitle={viewLabel(view, copy)}
        pageContext={viewContext(view, language)}
      >
        <h1 ref={undoFallbackFocusRef} tabIndex={-1} className="sr-only">
          Loop Vault
        </h1>
        <main
          id="main-content"
          ref={mainContentRef}
          tabIndex={-1}
          aria-label={viewLabel(view, copy)}
          className="min-w-0 flex-1 overflow-y-auto px-4 py-5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lv-accent)] lg:px-6"
        >
        <div className="mx-auto flex min-h-full w-full max-w-[1680px] min-w-0 flex-col">
        {loadStatus === "ready" ? (
          <>
            <QuarantineNotice count={quarantine.length} copy={copy} />
            {view === "home" ? (
              <HomeView
                bassPracticeCard={bassPracticeEnabled ? (
                  <BassPracticeHomeCard onOpen={openBassPractice} summary={practiceHomeSummary} />
                ) : undefined}
                ideas={visibleIdeas}
                monthlyGoal={settings.monthlyGoal}
                copy={copy}
                language={language}
                showRomanNumerals={settings.showRomanNumerals ?? true}
                openDetail={openDetail}
                openCapture={() => setView("capture")}
                openCreate={() => setCreateOpen(true)}
                openVault={() => setView("library")}
                updateNextAction={updateNextAction}
                transitionIdea={transitionIdea}
                setToast={setToast}
              />
            ) : null}
            {view === "library" ? (
              <VaultView
                ideas={visibleIdeas}
                storedIdeas={ideas}
                openDetail={openDetail}
                openProgression={openProgression}
                openCreate={() => setCreateOpen(true)}
                openCapture={() => setView("capture")}
                updateIdea={updateIdea}
                setToast={setToast}
                copy={copy}
                language={language}
                showRomanNumerals={settings.showRomanNumerals ?? true}
              />
            ) : null}
            {view === "capture" ? (
              <CaptureRenderBoundary
                language={language}
                resetKey={[
                  analysis.status,
                  analysis.result?.sourceFingerprint,
                  analysis.result?.fileName,
                ].filter(Boolean).join(":")}
                onReset={() => {
                  playbackController.stop();
                  clearAnalysis();
                }}
              >
                <CaptureView
                  ideas={visibleIdeas}
                  analysis={analysis}
                  analyzeMidiBytes={analyzeMidiBytes}
                  clearAnalysis={clearAnalysis}
                  createIdeaFromDraft={(draft) => {
                    const id = createIdeaFromDraft(draft);
                    if (id) {
                      openDetail(id);
                    }
                    return id;
                  }}
                  appendBlockToIdea={appendBlockToIdea}
                  updateIdea={updateIdea}
                  setToast={setToast}
                  copy={copy}
                  language={language}
                  showRomanNumerals={settings.showRomanNumerals ?? true}
                />
              </CaptureRenderBoundary>
            ) : null}
            {view === "detail" && selectedIdea ? (
              <DetailView
                idea={selectedIdea}
                storedIdea={storedSelectedIdea}
                updateIdea={updateIdea}
                updateNextAction={updateNextAction}
                removeProgressionBlock={removeProgressionBlock}
                openProgression={openProgression}
                removeReference={removeReference}
                unlinkAsset={unlinkAsset}
                enqueueUndo={undoQueue.enqueue}
                vaultEpoch={vaultEpoch}
                analyzeMidiPath={analyzeMidiPath}
                transitionIdea={transitionIdea}
                requestDelete={requestDelete}
                setToast={setToast}
                copy={copy}
                language={language}
              />
            ) : null}
            {view === "progression-detail" && progressionIdea && progressionBlock ? (
              <ProgressionDetailView
                key={`${progressionIdea.id}:${progressionBlock.id}`}
                idea={progressionIdea}
                ideas={ideas}
                block={progressionBlock}
                updateProgressionBlock={updateProgressionBlock}
                duplicateProgressionBlock={duplicateProgressionBlock}
                appendBlockToIdea={appendBlockToIdea}
                openProgression={openProgression}
                openIdea={openDetail}
                openVault={() => setView("library")}
                requestDelete={requestProgressionDelete}
                openPractice={() => openPractice(progressionIdea.id, progressionBlock.id)}
                requestLeave={requestProgressionLeave}
                onDirtyChange={setProgressionDetailDirty}
                setToast={setToast}
                copy={copy}
                language={language}
                loadMidiSource={loadMidiSource}
              />
            ) : null}
            {view === "practice" ? (
              bassPracticeEnabled ? (
                <PracticeWorkspace
                  mode={practiceMode}
                  onModeChange={setPracticeMode}
                  bassPractice={(
                    <Suspense fallback={<p role="status" className="py-8 text-sm text-[var(--lv-text-secondary)]">Degree Echoを読み込んでいます…</p>}>
                      {practiceData.status === "ready" ? <BassPracticeView
                        key={practiceSession.id}
                        initialClaim={practiceClaim}
                        initialRound={practiceSession.round}
                        initialSettings={practiceData.file?.settings}
                        notice={practiceData.error}
                        onAttemptCompleted={(attempt) => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.recordAttempt(attempt) : Promise.reject(new Error("Practice progress is not ready."));
                        }}
                        onSettingsChange={(next) => {
                          const controller = practiceControllerRef.current;
                          const current = practiceData.file?.settings;
                          return controller && current
                            ? controller.updateSettings({ ...current, ...next, version: 1 })
                            : Promise.reject(new Error("Practice settings are not ready."));
                        }}
                        onNextExercise={() => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.claimNextExercise(practiceSession.id, new Date()) : Promise.reject(new Error("Practice queue is not ready."));
                        }}
                        onSessionAbandoned={(id) => practiceControllerRef.current?.abandonSession(id, new Date()) ?? Promise.resolve()}
                        onSessionRestart={async () => {
                          const controller = practiceControllerRef.current;
                          if (!controller) throw new Error("Practice progress is not ready.");
                          const nextSessionId = newPracticeSessionId();
                          pendingPracticeSessionIdRef.current = nextSessionId;
                          setPracticeSessionGeneration((generation) => generation + 1);
                          await controller.ensureSession(nextSessionId, new Date());
                          await controller.claimNextExercise(nextSessionId, new Date());
                        }}
                        sessionId={practiceSession.id}
                        sessionTargetCount={practiceData.file?.settings.sessionTargetCount ?? 8}
                      /> : practiceData.status === "recovery-required" ? (
                        <PracticeRecoveryPanel
                          backups={practiceData.backups}
                          error={practiceData.error}
                          onRestore={(name) => practiceControllerRef.current?.restoreBackup(name) ?? Promise.reject(new Error("Practice recovery is not ready."))}
                          onRetry={() => practiceControllerRef.current?.retryLoad() ?? Promise.reject(new Error("Practice recovery is not ready."))}
                          onStartFresh={() => practiceControllerRef.current?.startFresh() ?? Promise.reject(new Error("Practice recovery is not ready."))}
                        />
                      ) : practiceData.status === "future-version" ? (
                        <PracticeRecoveryPanel
                          backups={[]}
                          error={practiceData.error}
                          onRetry={() => practiceControllerRef.current?.retryLoad() ?? Promise.reject(new Error("Practice read-only reload is not ready."))}
                          readOnly
                        />
                      ) : practiceData.status === "error" ? (
                        <PracticeRecoveryPanel
                          backups={[]}
                          error={practiceData.error}
                          onRetry={() => practiceControllerRef.current?.retryLoad() ?? Promise.reject(new Error("Practice recovery is not ready."))}
                        />
                      ) : <p role="status" className="py-8 text-sm text-[var(--lv-text-secondary)]">Practice progressを読み込んでいます…</p>}
                    </Suspense>
                  )}
                  chordDojo={(
                    <PracticeView
                      ideas={visibleIdeas}
                      initialTarget={practiceTarget}
                      language={language}
                      updateProgressionBlock={updateProgressionBlock}
                      openProgression={openProgression}
                      openSettings={() => {
                        setSettingsOpen(true);
                        void refreshBackups();
                      }}
                      setToast={setToast}
                    />
                  )}
                />
              ) : (
                <PracticeView
                  ideas={visibleIdeas}
                  initialTarget={practiceTarget}
                  language={language}
                  updateProgressionBlock={updateProgressionBlock}
                  openProgression={openProgression}
                  openSettings={() => {
                    setSettingsOpen(true);
                    void refreshBackups();
                  }}
                  setToast={setToast}
                />
              )
            ) : null}
            {view === "history" ? (
              <HistoryView
                ideas={visibleIdeas}
                language={language}
                practiceHistory={practiceHistory}
                practiceHistoryTotal={practiceData.file?.sessions.filter(({ completedCount }) => completedCount > 0).length ?? 0}
                openIdea={openDetail}
                openProgression={openProgression}
              />
            ) : null}
            {view === "detail" && !selectedIdea ? (
              <EmptyState openCreate={() => setCreateOpen(true)} copy={copy} />
            ) : null}
          </>
        ) : (
          <StartupState
            loadStatus={loadStatus}
            recovery={recovery}
            readonly={readonly}
            error={error}
            requestRestoreBackup={setStartupRestoreName}
            copy={copy}
          />
        )}
        </div>
        </main>
      {isCreateOpen ? (
        <CreateDialog
          onCreate={handleCreate}
          onClose={() => setCreateOpen(false)}
          copy={copy}
          language={language}
        />
      ) : null}
      {isSettingsOpen ? (
        <SettingsDialog
          ideas={visibleIdeas}
          monthlyGoal={settings.monthlyGoal}
          language={language}
          backups={backups}
          error={error}
          setMonthlyGoal={setMonthlyGoal}
          setLanguage={setLanguage}
          showRomanNumerals={settings.showRomanNumerals ?? true}
          setShowRomanNumerals={setShowRomanNumerals ?? (() => undefined)}
          refreshBackups={refreshBackups}
          restoreBackup={async (name) => {
            undoQueue.clearAll();
            await restoreBackup(name);
          }}
          exportVault={exportVault}
          importVault={async (path, mode) => {
            undoQueue.clearAll();
            return importVault(path, mode);
          }}
          setToast={setToast}
          copy={copy}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {pendingLiveMidiHistory ? (
        <LiveMidiImportDialog
          history={pendingLiveMidiHistory}
          ideas={visibleIdeas}
          copy={copy.liveMidi}
          onCancel={discardLiveMidiHistory}
          onSave={importLiveMidiHistory}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(pendingProgressionLeave)}
        title={progressionCopy.leaveUnsavedTitle}
        description={progressionCopy.leaveUnsavedDescription}
        confirmLabel={progressionCopy.discardAndLeave}
        cancelLabel={copy.common.cancel}
        onCancel={() => setPendingProgressionLeave(undefined)}
        onConfirm={() => {
          const action = pendingProgressionLeave;
          setPendingProgressionLeave(undefined);
          setProgressionDetailDirty(false);
          action?.();
        }}
        tone="danger"
      />
      <ConfirmDialog
        open={Boolean(startupRestoreName)}
        title={copy.startup.restoreBackupTitle}
        description={startupRestoreName ? copy.settings.restoreConfirm(startupRestoreName) : ""}
        confirmLabel={copy.common.restore}
        cancelLabel={copy.common.cancel}
        onCancel={() => setStartupRestoreName(undefined)}
        onConfirm={() => {
          if (!startupRestoreName) return;
          const name = startupRestoreName;
          setStartupRestoreName(undefined);
          undoQueue.clearAll();
          void restoreBackup(name);
        }}
        tone="danger"
      />
      <UndoToast
        actions={undoQueue.actions}
        undoLabel={copy.undo.action}
        onUndo={undoQueue.undo}
        fallbackFocusRef={undoFallbackFocusRef}
      />
      {toast ? (
        <Toast
          message={toast}
          dismissLabel={copy.common.close}
          onDismiss={() => setToast(undefined)}
        />
      ) : null}
      {webLiveMidiPreviewOpen ? (
        <div className="fixed bottom-4 right-4 z-50 h-[260px] w-[420px] max-w-[calc(100vw-2rem)] border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] shadow-xl">
          <LiveMidiMiniMode
            copy={copy.liveMidi}
            onShowMain={() => { void leaveLiveMidiMode(); }}
          />
        </div>
      ) : null}
      </AppShell>
    </PreviewSoundProvider>
  );
}

export function stopIdeaPlayback(
  ideaId: string,
  controller: Pick<PlaybackController, "getState" | "stop"> = playbackController,
): void {
  const playingSource = controller.getState().source;
  if (playingSource?.id.startsWith(`idea:${ideaId}:`)) {
    controller.stop();
  }
}

export function deleteIdeaForUndo({
  idea,
  ideas,
  vaultEpoch,
  label,
  deleteIdea,
  enqueueUndo,
  controller = playbackController,
}: {
  idea: SongIdea;
  ideas: SongIdea[];
  vaultEpoch: number;
  label: string;
  deleteIdea: (deletion: PendingIdeaDeletion) => boolean;
  enqueueUndo: (request: UndoRequest<PendingDeletion>) => string;
  controller?: Pick<PlaybackController, "getState" | "stop">;
}): boolean {
  stopIdeaPlayback(idea.id, controller);
  const snapshot = createUndoSnapshot(
    ideas,
    ideas.findIndex((entry) => entry.id === idea.id),
    "vault",
    ideaAnchor,
  );
  if (!snapshot) return false;
  const deletion: PendingIdeaDeletion = { kind: "idea", vaultEpoch, snapshot };
  enqueueUndo({
    label,
    payload: deletion,
    undo: () => true,
    commit: () => deleteIdea(deletion),
  });
  return true;
}












export function CreateDialog({
  onCreate,
  onClose,
  copy,
  language,
}: {
  onCreate: (title: string, status: Status) => void;
  onClose: () => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("idea");
  const titleRef = useRef<HTMLInputElement>(null);
  const dirty = title.length > 0 || status !== "idea";

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate(title, status);
  }

  return (
    <Modal
      ariaLabelledBy="create-idea-title"
      initialFocusRef={titleRef}
      onClose={onClose}
      closeOnBackdrop={!dirty}
      panelClassName="w-full max-w-md p-5"
    >
      <form
        onSubmit={submit}
        onKeyDown={(event) => {
          if (
            event.key === "Enter"
            && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
          ) event.preventDefault();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="create-idea-title" className="text-xl font-semibold">{copy.create.title}</h2>
          <button type="button" className="rounded px-2 py-1 text-[var(--lv-text-muted)]" onClick={onClose}>{copy.common.close}</button>
        </div>
        <label htmlFor="create-idea-name" className="mt-4 block text-sm font-medium text-[var(--lv-text-secondary)]">
          {copy.common.title}
        </label>
        <input
          id="create-idea-name"
          ref={titleRef}
          name="idea-title"
          autoComplete="off"
          className={`${inputClass} mt-1`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={copy.common.title}
        />
        <label htmlFor="create-idea-status" className="mt-3 block text-sm font-medium text-[var(--lv-text-secondary)]">
          {copy.library.status}
        </label>
        <select id="create-idea-status" name="idea-status" className={`${inputClass} mt-1`} value={status} onChange={(event) => setStatus(event.target.value as Status)}>
          {pipeline.map((entry) => <option key={entry} value={entry}>{labelStatus(entry, language)}</option>)}
        </select>
        <button className="mt-4 w-full rounded bg-[var(--lv-accent)] px-3 py-2 font-semibold text-stone-950" type="submit">{copy.create.submit}</button>
      </form>
    </Modal>
  );
}

function StartupState({
  loadStatus,
  recovery,
  readonly,
  error,
  requestRestoreBackup,
  copy,
}: {
  loadStatus: string;
  recovery: ReturnType<typeof defaultVaultStore.getState>["recovery"];
  readonly: ReturnType<typeof defaultVaultStore.getState>["readonly"];
  error?: string;
  requestRestoreBackup: (backupName: string) => void;
  copy: AppCopy;
}) {
  return (
    <div className="grid flex-1 place-items-center py-10">
      <Panel className="w-full max-w-2xl">
        {loadStatus === "loading" || loadStatus === "idle" ? <StatusPanel title={copy.startup.loadingTitle} body={copy.startup.loadingBody} /> : null}
        {loadStatus === "recovery" && recovery ? (
          <div>
            <StatusPanel title={copy.startup.recoveryTitle} body={copy.startup.recoveryBody} />
            {recovery.corruptPath ? <p className="mt-3 break-all text-sm text-[var(--lv-text-muted)]">{recovery.corruptPath}</p> : null}
            <div className="mt-5 space-y-2">
              {recovery.backups.length > 0 ? recovery.backups.map((backup) => (
                <button key={backup.name} className="block w-full rounded border border-[var(--lv-border-strong)] px-3 py-2 text-left text-sm hover:bg-[var(--lv-surface-raised)]" onClick={() => requestRestoreBackup(backup.name)}>
                  {copy.startup.restoreBackup(backup.name)}
                </button>
              )) : <p className="text-sm text-[var(--lv-text-muted)]">{copy.startup.noBackups}</p>}
            </div>
          </div>
        ) : null}
        {loadStatus === "readonly" && readonly ? <StatusPanel title={copy.startup.readonlyTitle} body={readonly.fileVersion ? copy.startup.newerVersion(readonly.fileVersion) : readonly.message} /> : null}
        {loadStatus === "error" ? <StatusPanel title={copy.startup.errorTitle} body={error ?? copy.startup.unknownError} /> : null}
      </Panel>
    </div>
  );
}

function QuarantineNotice({ count, copy }: { count: number; copy: AppCopy }) {
  if (count === 0) return null;
  return (
    <div className="mt-4 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      {copy.startup.quarantine(count)}
    </div>
  );
}

function EmptyState({ openCreate, copy }: { openCreate: () => void; copy: AppCopy }) {
  return (
    <div className="grid min-h-96 place-items-center py-10">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold">{copy.startup.emptyTitle}</h2>
        <button className="mt-5 rounded bg-[var(--lv-accent)] px-4 py-2 font-semibold text-stone-950" onClick={openCreate}>{copy.startup.emptyButton}</button>
      </div>
    </div>
  );
}

function StatusPanel({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-[var(--lv-text-secondary)]">{body}</p>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 ${className}`}>{children}</section>;
}

function labelStatus(status: Status, language: AppLanguage): string {
  return statusLabel(status, language);
}

function viewLabel(view: View, copy: AppCopy): string {
  if (view === "capture") return copy.nav.capture;
  if (view === "practice") return copy.nav.practice;
  if (view === "library" || view === "detail" || view === "progression-detail") {
    return copy.nav.library;
  }
  if (view === "history") return "History";
  return copy.nav.home;
}

function viewContext(view: View, language: AppLanguage): string {
  const ja = language === "ja";
  if (view === "capture") return ja ? "MIDIからコード進行を採集" : "Capture progressions from MIDI";
  if (view === "library") return ja ? "保存進行をすばやく取り出す" : "Find saved progressions";
  if (view === "detail") return ja ? "Ideaの情報と次の一手" : "Idea details and next action";
  if (view === "progression-detail") return ja ? "コード進行を試聴・修正" : "Preview and edit progression";
  if (view === "practice") return ja ? "保存進行を自分の手で覚える" : "Practice saved progressions";
  if (view === "history") return ja ? "採集・編集・練習の履歴" : "Capture, edit, and practice history";
  return ja ? "今日のLoopと最近の進行" : "Today’s loop and recent progressions";
}

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

export default App;
