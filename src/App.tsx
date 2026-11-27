import { resolveVaultSavedChordNotes } from './features/bass-practice/application/vaultSavedChordNotes';
import { progressionPracticeIdeas } from "./domain/progressionWorkspace/progressionPracticeProjection";
import { orderedProgressions } from "./domain/progressionWorkspace/progressionWorkspace";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readBoundedMidiPath } from "./storage/boundedMidiReader";
import {
  lazy,
  Suspense,
  useCallback,
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
import { AppShell, type AppView } from "./components/AppShell";
import { CaptureRenderBoundary } from "./components/CaptureRenderBoundary";
import { SizeRecoveryNotice } from "./components/SizeRecoveryNotice";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { CommandPalette } from "./components/CommandPalette";
import type { PaletteCommand } from "./features/command-palette/paletteModel";
import { buildVaultRows } from "./views/vault/vaultLibrary";
import { UNSAVED_TITLE, unsavedMessage } from "./components/correction-workspace/unsavedText";
import { CloseDialogHost } from "./components/shell/CloseDialogHost";
import { FirstCaptureGuide } from "./components/FirstCaptureGuide";
import { LiveMidiSettingsDialog } from "./components/LiveMidiSettingsDialog";
import { QuarantineNotice, StartupState } from "./components/StartupStates";
import { DetailView } from "./views/DetailView";
import { HomeView } from "./views/HomeView";
import { formatHomeDate } from "./views/home/useHomeSummary";
import { SettingsView } from "./views/SettingsView";
import { readableBackupDate } from "./views/SettingsView";
import { VaultView } from "./views/VaultView";
import { ProgressionDetailView } from "./views/ProgressionDetailView";
import { ChordDojoView } from "./views/chord-dojo/ChordDojoView";
import { ProgressionVoicingPracticeView } from "./views/ProgressionVoicingPracticeView";
import { progressionVoicingPracticeE2eFixture } from "./testing/progressionVoicingPracticeE2eFixture";
import { isBassPracticeBasslineEchoEnabled, isBassPracticeDegreeEchoEnabled, isBassPracticeRhythmEchoEnabled, isBassPracticeRootMotionEnabled, isBassPracticeMidiBasslineEnabled } from "./features/bass-practice/application/featureFlag";
import { buildVaultPickerCandidateViews, buildVaultSourceBasslineCandidateViews, type VaultPickerCandidateView, type VaultSourceBasslineCandidateView } from "./features/bass-practice/application/vaultPickerCandidates";
import { buildVaultChordContextSnapshot, type ChordContextSnapshot, type VaultChordContextSnapshot } from "./features/bass-practice/domain";
import {
  createPracticeControllerIfEnabled,
  PracticeDataController,
  restoreClaimedExercise,
  type PracticeDataSnapshot,
} from "./features/bass-practice/application/practiceData";
import { createRuntimePracticeStorage } from "./features/bass-practice/infra/repository";
import { PracticeRecoveryPanel } from "./features/bass-practice/ui/PracticeRecoveryPanel";
import {
  PracticeModeTabs,
  PracticeWorkspace,
  type PracticeWorkspaceMode,
} from "./features/bass-practice/ui/PracticeWorkspace";
import { LiveMidiMiniMode } from "./components/LiveMidiMiniMode";
import { PreviewSoundProvider } from "./components/PreviewSoundProvider";
import { MetronomeProvider } from "./components/MetronomeProvider";
import { GlobalBpmProvider } from "./components/GlobalBpmProvider";
import { LiveMidiImportDialog, type LiveMidiImportRequest } from "./components/LiveMidiImportDialog";
import { createNotificationStore, NotificationProvider, useReserveBottomSpace, type NotificationTone } from "./components/notifications";
import { SelectMenuHost } from "./components/ui/SelectMenuHost";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useMasterVolume } from "./hooks/useMasterVolume";
import { loadUseStandardTitleBar } from "./components/shell/shellPreferences";
import { prepareMainWindowFrame } from "./components/shell/windowControls";
import { parseMidi } from "./domain/midi";
import { restoreOriginalPlayback } from "./domain/voicing";
import type { SavedProgressionBlock, SongIdea } from "./domain/types";
import {
  buildVoicingLoopVaultCandidates,
  buildProgressionVoicingPracticeHandoffFromVault,
  type ProgressionVoicingPracticeHandoff,
  type VoicingLoopVaultCandidate,
} from "./domain/progressionVoicingPractice";
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
} from "./i18n";
import {
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
} from "./store/closeGuard";
import { defaultVaultStore } from "./store/defaultVaultStore";
import { CaptureView, type SavedTextProgressionTarget } from "./views/CaptureView";
import { useUndoQueue } from "./hooks/useUndoQueue";
import type { UndoRequest } from "./hooks/useUndoQueue";
import { defaultLiveMidiStore } from "./liveMidi/defaultLiveMidiStore";
import { LiveMidiOpenGate } from "./liveMidi/activationLease";
import { registerClosePreparation } from "./store/closePreparation";
import { connectionController } from "./liveMidi/connectionController";
import { createTauriMiniWindowAdapter, MiniWindowController } from "./liveMidi/miniWindowController";
import { recoverMainWindowIfOffscreen } from "./voicingPractice/mainWindowWorkArea";
import { loadLiveMidiPreferences, saveLiveMidiPreferences, type WindowBounds } from "./liveMidi/preferences";
import { historyToSavedProgressionBlock, type LiveChordHistoryEntry } from "./domain/liveMidi";
import {
  loadRecentVoicingLoopProgressions,
  recordRecentVoicingLoopProgression,
  saveRecentVoicingLoopProgressions,
} from "./voicingPractice/recentProgressions";
import { rememberLastVoicingPractice } from "./voicingPractice/lastPractice";
import { recordPracticeOpen } from "./views/home/practiceOpens";
import type { DojoRecentEntry } from "./views/chord-dojo/dojoRecent";
import type { BassPracticeMode } from "./views/home/practiceActivity";
import { fadeInView } from "./ui/motion";
import {
  createLiveMidiWindowSnapshot,
  LIVE_MIDI_COMMAND_EVENT,
  sendLiveMidiSnapshot,
  type LiveMidiWindowCommand,
} from "./liveMidi/windowProtocol";

type View = AppView;
const DISABLED_PRACTICE_DATA: PracticeDataSnapshot = { status: "disabled", quarantine: [] };
const EMPTY_VAULT_PICKER_CANDIDATES: readonly VaultPickerCandidateView[] = Object.freeze([]);
const EMPTY_VAULT_SOURCE_BASSLINES: readonly VaultSourceBasslineCandidateView[] = Object.freeze([]);
const EMPTY_VOICING_LOOP_VAULT_CANDIDATES: readonly VoicingLoopVaultCandidate[] = Object.freeze([]);
const P527_E2E_FIXTURE = import.meta.env.VITE_P527_E2E_FIXTURE === "1"
  && new URLSearchParams(window.location.search).get("p528Direct") !== "1"
  ? progressionVoicingPracticeE2eFixture(window.location.search)
  : undefined;
const BassPracticeView = lazy(async () => {
  const module = await import("./features/bass-practice/ui/BassPracticeModeView");
  return { default: module.BassPracticeModeView };
});

/**
 * Chord Context is a transient handoff only. Generic navigation never resumes it:
 * a fresh Vault handoff must create a new snapshot from the current source.
 */
export function clearTransientChordContextSnapshotForNavigation<T>(
  snapshot: T | undefined,
  currentView: AppView,
  nextView: AppView,
): T | undefined {
  return currentView === "practice" || nextView === "practice" ? undefined : snapshot;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function findSavedTextProgressionTarget(
  ideas: readonly SongIdea[],
  ideaId: string,
  excludedBlockIds: ReadonlySet<string> = new Set(),
): SavedTextProgressionTarget | undefined {
  const block = ideas.find((candidate) => candidate.id === ideaId)
    ?.progressionBlocks?.find((candidate) => !excludedBlockIds.has(candidate.id));
  return block ? { ideaId, blockId: block.id } : undefined;
}

export async function closeLiveMidiModeSafely(options: {
  gate: Pick<LiveMidiOpenGate, "close">;
  getHistory: () => readonly LiveChordHistoryEntry[];
  closeWindow: () => Promise<WindowBounds | undefined>;
  saveBounds: (bounds: WindowBounds) => void;
  hidePreview: () => void;
  preserveHistory: (history: LiveChordHistoryEntry[]) => void;
  reportFailure: () => void;
}): Promise<void> {
  let stateSettled = false;
  let history: LiveChordHistoryEntry[] = [];
  const settleVisibleState = () => {
    if (stateSettled) return;
    stateSettled = true;
    options.hidePreview();
    if (history.length > 0) options.preserveHistory(history);
  };

  try {
    await options.gate.close(async () => {
      history = [...options.getHistory()];
      try {
        const bounds = await options.closeWindow();
        if (bounds) options.saveBounds(bounds);
      } finally {
        settleVisibleState();
      }
    });
  } catch {
    settleVisibleState();
    options.reportFailure();
  }
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
  const sizeRecovery = useStore(defaultVaultStore, (state) => state.sizeRecovery);
  const unsaved = useStore(defaultVaultStore, (state) => state.unsaved);
  const saving = useStore(defaultVaultStore, (state) => state.saving);
  const error = useStore(defaultVaultStore, (state) => state.error);
  const vaultEpoch = useStore(defaultVaultStore, (state) => state.vaultEpoch);
  const analysis = useStore(defaultVaultStore, (state) => state.analysis);
  const initialize = useStore(defaultVaultStore, (state) => state.initialize);
  const restoreBackup = useStore(defaultVaultStore, (state) => state.restoreBackup);
  const backups = useStore(defaultVaultStore, (state) => state.backups);
  const setShowRomanNumerals = useStore(defaultVaultStore, (state) => state.setShowRomanNumerals);
  const refreshBackups = useStore(defaultVaultStore, (state) => state.refreshBackups);
  const exportVault = useStore(defaultVaultStore, (state) => state.exportVault);
  const importVault = useStore(defaultVaultStore, (state) => state.importVault);
  const createIdeaFromDraft = useStore(defaultVaultStore, (state) => state.createIdeaFromDraft);
  const createIdeaFromTextProgression = useStore(defaultVaultStore, (state) => state.createIdeaFromTextProgression);
  const updateIdea = useStore(defaultVaultStore, (state) => state.updateIdea);
  const deleteIdea = useStore(defaultVaultStore, (state) => state.deleteIdea);
  const appendBlockToIdea = useStore(defaultVaultStore, (state) => state.appendBlockToIdea);
  const appendTextProgressionToIdea = useStore(defaultVaultStore, (state) => state.appendTextProgressionToIdea);
  const updateProgressionBlock = useStore(defaultVaultStore, (state) => state.updateProgressionBlock);
  const duplicateProgressionBlock = useStore(defaultVaultStore, (state) => state.duplicateProgressionBlock);
  const removeProgressionBlock = useStore(defaultVaultStore, (state) => state.removeProgressionBlock);
  const analyzeMidiBytes = useStore(defaultVaultStore, (state) => state.analyzeMidiBytes);
  const clearAnalysis = useStore(defaultVaultStore, (state) => state.clearAnalysis);

  const {
    view,
    setView,
    selectedId,
    setSelectedId,
    selectedProgression,
    setSelectedProgression,
    setProgressionDetailDirty,
    captureWorkspaceDirty,
    setCaptureWorkspaceDirty,
    saveProgression,
    setProgressionSave,
    pendingProgressionLeave,
    setPendingProgressionLeave,
    requestProgressionLeave,
    navigateTo,
    openDetail: openIdeaDetail,
    openProgression,
  } = useAppNavigation({
    onNavigate: (nextView, previousView) => {
      setChordContextSnapshot((snapshot) => clearTransientChordContextSnapshotForNavigation(snapshot, previousView, nextView));
      if (nextView === "capture") setCaptureInitialInputMode("midi");
    },
  });
  const [bassPracticeEnabled] = useState(() => isBassPracticeDegreeEchoEnabled() || isBassPracticeRhythmEchoEnabled() || isBassPracticeBasslineEchoEnabled() || isBassPracticeRootMotionEnabled() || isBassPracticeMidiBasslineEnabled());
  const practiceControllerRef = useRef<PracticeDataController>();
  const pendingPracticeSessionIdRef = useRef<string>();
  const [practiceSessionGeneration, setPracticeSessionGeneration] = useState(0);
  const [practiceData, setPracticeData] = useState<PracticeDataSnapshot>(DISABLED_PRACTICE_DATA);
  const [practiceMode, setPracticeMode] = useState<PracticeWorkspaceMode>("chord-dojo");
  const [captureInitialInputMode, setCaptureInitialInputMode] = useState<"midi" | "text">("midi");
  const [liveMidiSettingsOpen, setLiveMidiSettingsOpen] = useState(false);
  const [practiceTarget, setPracticeTarget] = useState<{ ideaId: string; blockId: string }>();
  /** P22-03 §1: the Chord Dojo practice the Home resumes, and the Bass Practice tab it opens. */
  const [dojoRecentResume, setDojoRecentResume] = useState<DojoRecentEntry>();
  const [bassPracticeInitialMode, setBassPracticeInitialMode] = useState<BassPracticeMode>();
  /** P23-28 F8-1: counts the left menu's Bass Practice opens that name no practice, so the picker comes back. */
  const [bassHomeRequest, setBassHomeRequest] = useState(0);
  const [chordContextSnapshot, setChordContextSnapshot] = useState<VaultChordContextSnapshot>();
  const resolveSavedChordNotes = useCallback((snapshot: ChordContextSnapshot) => resolveVaultSavedChordNotes(defaultVaultStore.getState().ideas, snapshot), []);
  const [voicingPracticeHandoff, setVoicingPracticeHandoff] = useState<ProgressionVoicingPracticeHandoff>();
  const [notifications] = useState(createNotificationStore);
  // P8.9: existing setToast(message) callers keep their shape; messages now go to
  // the unified bottom-right stack (4 s, pauses on hover/focus).
  const setToast = useCallback((message?: string, tone?: NotificationTone) => {
    if (message) notifications.notify({ message, tone });
  }, [notifications]);
  const [webLiveMidiPreviewOpen, setWebLiveMidiPreviewOpen] = useState(false);
  const { masterVolume, changeMasterVolume } = useMasterVolume();
  const [pendingLiveMidiHistory, setPendingLiveMidiHistory] = useState<LiveChordHistoryEntry[]>();
  const [startupRestoreName, setStartupRestoreName] = useState<string>();
  const undoFallbackFocusRef = useRef<HTMLHeadingElement>(null);
  const webLiveMidiPreviewRef = useRef<HTMLDivElement>(null);
  useReserveBottomSpace(webLiveMidiPreviewRef, webLiveMidiPreviewOpen);
  const mainContentRef = useRef<HTMLElement>(null);
  const previousViewRef = useRef(view);
  const miniWindowControllerRef = useRef<MiniWindowController | undefined>(undefined);
  const [standardTitleBar] = useState(() => loadUseStandardTitleBar());
  useEffect(() => {
    void prepareMainWindowFrame(standardTitleBar)
      .then(() => recoverMainWindowIfOffscreen())
      .catch(() => undefined);
  }, [standardTitleBar]);
  const liveMidiClosingRef = useRef(false);
  const liveMidiModeOpenRef = useRef(false);
  const liveMidiOpenGateRef = useRef<LiveMidiOpenGate>();
  if (!liveMidiOpenGateRef.current) liveMidiOpenGateRef.current = new LiveMidiOpenGate();
  const undoQueue = useUndoQueue();
  const undoEpochRef = useRef(vaultEpoch);
  useEffect(() => () => {
    void liveMidiOpenGateRef.current?.close(async () => {
      liveMidiModeOpenRef.current = false;
      await miniWindowControllerRef.current?.close().catch(() => undefined);
    }).catch(() => undefined);
  }, []);
  // P14 §2: the app owns one MIDI connection. It starts here and closes with the app.
  useEffect(() => {
    void connectionController.initOnAppStart();
    return registerClosePreparation(() => { void connectionController.shutdown(); });
  }, []);
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
  const vaultProgressionCount = useMemo(
    () => visibleIdeas.reduce((total, idea) => total + (idea.progressionBlocks?.length ?? 0), 0),
    [visibleIdeas],
  );
  // P23-07: the search palette (Ctrl+K). The rows are built only while it is open.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRows = useMemo(
    () => (paletteOpen ? buildVaultRows(visibleIdeas) : []),
    [paletteOpen, visibleIdeas],
  );

  // Stable between renders: Chord Dojo re-plans when this array's identity changes, which would replace a practice in progress.
  const chordDojoIdeas = useMemo(() => progressionPracticeIdeas(visibleIdeas), [visibleIdeas]);

  const vaultPickerCandidates = useMemo(
    () => view === "practice" && practiceMode === "bass-practice"
      ? buildVaultPickerCandidateViews(
        visibleIdeas,
        "\u7121\u984c\u306e\u9032\u884c",
      )
      : EMPTY_VAULT_PICKER_CANDIDATES,
    [practiceMode, view, visibleIdeas],
  );
  const vaultSourceBasslines = useMemo(
    () => view === "practice" && practiceMode === "bass-practice"
      ? buildVaultSourceBasslineCandidateViews(
        visibleIdeas,
        "\u7121\u984c\u306e\u9032\u884c",
      )
      : EMPTY_VAULT_SOURCE_BASSLINES,
    [practiceMode, view, visibleIdeas],
  );
  const voicingLoopVaultCandidates = useMemo(
    () => view === "practice" && practiceMode === "voicing-loop"
      ? buildVoicingLoopVaultCandidates(
        progressionPracticeIdeas(visibleIdeas),
        "無題の進行",
      )
      : EMPTY_VOICING_LOOP_VAULT_CANDIDATES,
    [practiceMode, view, visibleIdeas],
  );
  const chordContextSnapshots = useMemo(
    () => Object.freeze(vaultPickerCandidates.map((candidate) => candidate.safeSnapshot)),
    [vaultPickerCandidates],
  );
  const voicingLoopSourceBlock = voicingPracticeHandoff
    ? visibleIdeas.find((idea) => idea.id === voicingPracticeHandoff.sourceReference.ideaId)
      ?.progressionBlocks?.find((block) => block.id === voicingPracticeHandoff.sourceReference.blockId)
    : undefined;
  const bulkSourcePreview = voicingLoopSourceBlock ? (() => {
    const preview = restoreOriginalPlayback(voicingLoopSourceBlock.chords);
    return { changed: preview.changedCount, keptCustom: preview.keptCustomCount };
  })() : undefined;
  function applyBulkSource(): boolean {
    if (!voicingPracticeHandoff || !voicingLoopSourceBlock) return false;
    const result = restoreOriginalPlayback(voicingLoopSourceBlock.chords);
    if (result.changedCount === 0) return true;
    const reference = voicingPracticeHandoff.sourceReference;
    if (!updateProgressionBlock(reference.ideaId, reference.blockId, { chords: result.cards })) return false;
    const handoff = buildProgressionVoicingPracticeHandoffFromVault(progressionPracticeIdeas(defaultVaultStore.getState().ideas), reference);
    if (handoff.ok) setVoicingPracticeHandoff(handoff.handoff);
    return handoff.ok;
  }

  const selectedIdea = visibleIdeas.find((idea) => idea.id === selectedId) ?? visibleIdeas[0];
  const progressionIdea = selectedProgression
    ? visibleIdeas.find((idea) => idea.id === selectedProgression.ideaId)
    : undefined;
  const progressionBlock = progressionIdea?.progressionBlocks?.find(
    (block) => block.id === selectedProgression?.blockId,
  );
  const copy = appCopy.ja;

  // P8.9-02: a failed save is announced once as a sticky error toast (the header also marks it).
  useEffect(() => {
    if (error && loadStatus === "ready") notifications.notify({ tone: "error", message: error });
  }, [error, loadStatus, notifications]);

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
    if (undoEpochRef.current !== vaultEpoch) undoQueue.clearAll();
    undoEpochRef.current = vaultEpoch;
  }, [undoQueue.clearAll, vaultEpoch]);

  useEffect(() => {
    if (view === "progression-detail" && (!progressionIdea || !progressionBlock)) {
      setView("library");
    }
  }, [progressionBlock, progressionIdea, view]);

  useEffect(() => {
    if (view !== "practice") setChordContextSnapshot(undefined);
  }, [view]);

  useEffect(() => {
    if (view !== "practice") setVoicingPracticeHandoff(undefined);
  }, [view]);

  useEffect(() => {
    if (previousViewRef.current === view) return undefined;
    previousViewRef.current = view;
    const frame = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: 0, left: 0 });
      mainContentRef.current?.focus({ preventScroll: true });
      fadeInView(mainContentRef.current);
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
        createLiveMidiWindowSnapshot(defaultLiveMidiStore.getState()),
      ).catch(() => undefined);
    };
    const unsubscribeStore = defaultLiveMidiStore.subscribe(sendSnapshot);
    // The mini window shows the shared state, which also depends on the controller (intent, last input).
    const unsubscribeController = connectionController.state.subscribe(sendSnapshot);

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
            void connectionController.refreshDevices();
          } else if (command.type === "select-device") {
            void connectionController.chooseDevice(command.backendId);
          } else if (command.type === "set-show-history") {
            defaultLiveMidiStore.getState().setShowHistory(command.show);
          } else if (command.type === "clear-history") {
            defaultLiveMidiStore.getState().clearSession();
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
      unsubscribeController();
      unlistenCommand?.();
    };
  }, []);

  function openDirectVoicingLoop() {
    requestProgressionLeave(() => {
      setVoicingPracticeHandoff(undefined);
      setPracticeTarget(undefined);
      setChordContextSnapshot(undefined);
      setDojoRecentResume(undefined);
      setBassPracticeInitialMode(undefined);
      setPracticeMode("voicing-loop");
      setView("practice");
    });
  }

  function openTextProgressionInput() {
    requestProgressionLeave(() => {
      setCaptureInitialInputMode("text");
      setView("capture");
    });
  }

  /** P24-03: the empty-Vault guide's 「サンプル進行を 3 件入れて試す」. The Vault is not left. */
  function addSampleProgressions() {
    defaultVaultStore.getState().addSampleProgressions();
  }

  /** Receives a detached P5.18 snapshot only; raw Vault data never crosses this boundary. */
  function openPractice(snapshot: VaultChordContextSnapshot) {
    const reference = snapshot.source.reference;
    const block = defaultVaultStore.getState().ideas.find(idea => idea.id === reference.ideaId)?.progressionBlocks?.find(block => block.id === reference.blockId);
    if (!block) { setToast("保存元の進行は利用できません。", "error"); return; }
    const current = buildVaultChordContextSnapshot({sourceReference: reference, block, sectionId: snapshot.section.id});
    if (!current.ok) { setToast("保存済み進行を確認できないため、Bass Practiceを開始できません。", "error"); return; }
    snapshot = current.snapshot;
    setPracticeTarget({
      ideaId: snapshot.source.reference.ideaId,
      blockId: snapshot.source.reference.blockId,
    });
    setChordContextSnapshot(snapshot);
    setDojoRecentResume(undefined);
    setBassPracticeInitialMode(undefined);
    setPracticeMode(bassPracticeEnabled ? "bass-practice" : "chord-dojo");
    setView("practice");
  }

  function openBassPracticeFromVault(reference: { ideaId: string; blockId: string }) {
    const block = defaultVaultStore.getState().ideas.find((idea) => idea.id === reference.ideaId)?.progressionBlocks?.find((entry) => entry.id === reference.blockId);
    if (!block) { setToast("保存元の進行は利用できません。", "error"); return; }
    const built = buildVaultChordContextSnapshot({ sourceReference: reference, block });
    if (!built.ok) { setToast("この進行は Bass Practice で使えません。", "error"); return; }
    openPractice(built.snapshot);
  }

  function openSettings() {
    navigateTo("settings");
    void refreshBackups();
  }

  const p104Seeded=useRef(false);
  useEffect(()=>{
    if(import.meta.env.VITE_P527_E2E_FIXTURE!=="1" || loadStatus!=="ready" || p104Seeded.current || !new URLSearchParams(window.location.search).has("p104"))return;
    p104Seeded.current=true;
    void import("./testing/p104ProgressionE2eFixture").then(({p104Ideas})=>{defaultVaultStore.setState({ideas:p104Ideas(new URLSearchParams(window.location.search).get("p104")==="long",new URLSearchParams(window.location.search).get("p104")==="text")});});
  },[loadStatus]);
  function openDetail(id:string) {
    const idea=ideas.find(entry=>entry.id===id);
    const first=orderedProgressions(idea?.progressionBlocks??[])[0];
    if(first)openProgression(id,first.id);else openIdeaDetail(id);
  }

  function openChordDojo(target?: { ideaId: string; blockId: string }) {
    requestProgressionLeave(() => {
      // P23-08 §1: opened for practice from a progression (the 自分の進行 list notes its own opens).
      if (target) recordPracticeOpen(target, "chord-dojo");
      setPracticeTarget(target);
      setChordContextSnapshot(undefined);
      setDojoRecentResume(undefined);
      setBassPracticeInitialMode(undefined);
      setPracticeMode("chord-dojo");
      setView("practice");
    });
  }

  /** P22-03 §1: the Home's 「続きから」 for a Chord Dojo practice resumes it the same way the Dojo home does. */
  function openChordDojoRecent(entry: DojoRecentEntry) {
    requestProgressionLeave(() => {
      setPracticeTarget(undefined);
      setChordContextSnapshot(undefined);
      setDojoRecentResume(entry);
      setBassPracticeInitialMode(undefined);
      setPracticeMode("chord-dojo");
      setView("practice");
    });
  }

  function openBassPractice(mode?: BassPracticeMode) {
    if (!bassPracticeEnabled) return;
    if (!mode) setBassHomeRequest((count) => count + 1);
    setBassPracticeInitialMode(mode);
    setDojoRecentResume(undefined);
    setPracticeTarget(undefined);
    setChordContextSnapshot(undefined);
    setPracticeMode("bass-practice");
    setView("practice");
  }

  // P23-10 V12: the Home's key drawer opens the Vault on one key; the Vault clears the request once it has used it.
  const [vaultKeyRequest, setVaultKeyRequest] = useState<string>();
  const clearVaultKeyRequest = useCallback(() => setVaultKeyRequest(undefined), []);

  function openProgressionVoicingPractice(sourceReference: { ideaId: string; blockId: string }) {
    const result = buildProgressionVoicingPracticeHandoffFromVault(progressionPracticeIdeas(defaultVaultStore.getState().ideas), sourceReference);
    if (!result.ok) {
      setToast("保存済み進行を確認できないため、Voicing Loopを開始できません。", "error");
      return false;
    }
    setPracticeTarget(undefined);
    setChordContextSnapshot(undefined);
    saveRecentVoicingLoopProgressions(recordRecentVoicingLoopProgression(
      loadRecentVoicingLoopProgressions(),
      sourceReference,
    ));
    // P22-03 §1: the same moment, the small note of this PC the Home reads (never a practice record).
    rememberLastVoicingPractice(sourceReference);
    recordPracticeOpen(sourceReference, "voicing-loop");
    setVoicingPracticeHandoff(result.handoff);
    setDojoRecentResume(undefined);
    setBassPracticeInitialMode(undefined);
    setPracticeMode("voicing-loop");
    setView("practice");
    return true;
  }

  async function loadMidiSource(path: string) {
    return parseMidi(await readBoundedMidiPath(path));
  }

  async function enterLiveMidiMode() {
    if (liveMidiClosingRef.current || liveMidiModeOpenRef.current) return;
    await liveMidiOpenGateRef.current!.enter(async (isCurrent) => {
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
        if (!isCurrent()) return;
        liveMidiModeOpenRef.current = true;
        // The mini mode shows the shared connection; it only asks for one when the user had turned it off.
        if (connectionController.state.getState().intent === "off") await connectionController.connect();
        if (!isCurrent()) return;
        if (isTauri()) {
          await sendLiveMidiSnapshot(
            createLiveMidiWindowSnapshot(defaultLiveMidiStore.getState()),
          ).catch(() => undefined);
        }
      } catch (error) {
        liveMidiModeOpenRef.current = false;
        if (!isCurrent()) return;
        await miniWindowControllerRef.current?.close().catch(() => undefined);
        setToast(errorMessage(error, copy.liveMidi.miniModeFailed), "error");
        setWebLiveMidiPreviewOpen(false);
      }
    });
  }

  async function leaveLiveMidiMode() {
    if (liveMidiClosingRef.current) return;
    liveMidiClosingRef.current = true;
    try {
      await closeLiveMidiModeSafely({
        gate: liveMidiOpenGateRef.current!,
        getHistory: () => defaultLiveMidiStore.getState().history,
        closeWindow: async () => {
          liveMidiModeOpenRef.current = false;
          return miniWindowControllerRef.current?.close();
        },
        saveBounds: (miniBounds) => {
          saveLiveMidiPreferences({ ...defaultLiveMidiStore.getState().preferences, miniBounds });
        },
        hidePreview: () => setWebLiveMidiPreviewOpen(false),
        preserveHistory: (history) => setPendingLiveMidiHistory(history),
        reportFailure: () => setToast(copy.liveMidi.miniModeCloseFailed, "error"),
      });
    } finally {
      liveMidiClosingRef.current = false;
    }
  }

  // P23-19 続けて弾く: the save dialog closes, the played chords stay, the small window comes back.
  function continueLiveMidi() {
    setPendingLiveMidiHistory(undefined);
    void enterLiveMidiMode();
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
    if (!ideaId || !block || appendBlockToIdea(ideaId, block, undefined, { userVerified: false }) !== true) {
      setToast(copy.liveMidi.importFailed, "error");
      return;
    }
    discardLiveMidiHistory();
    setToast(copy.liveMidi.imported, "success");
    openDetail(ideaId);
  }

  function requestDelete(idea: SongIdea) {
    if (sizeRecovery) {
      const snapshot = createUndoSnapshot(
        ideas,
        ideas.findIndex((entry) => entry.id === idea.id),
        "vault",
        ideaAnchor,
      );
      if (!snapshot) return;
      deleteIdea({ kind: "idea", vaultEpoch, snapshot });
      return;
    }
    const deleted = deleteIdeaForUndo({
      idea,
      ideas,
      vaultEpoch,
      label: copy.undo.ideaDeleted(idea.title),
      deleteIdea: (deletion) => deleteIdea(deletion) === true,
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
    if (sizeRecovery) {
      removeProgressionBlock(deletion);
      return;
    }
    undoQueue.enqueue({
      label: copy.undo.blockDeleted,
      payload: deletion,
      undo: () => true,
      commit: () => removeProgressionBlock(deletion) === true,
    });
    setSelectedProgression(undefined);
    setView("library");
  }

  // P23-07: what the search palette can open besides progressions.
  const focusVaultSearch = () => {
    const focus = () => document.getElementById("vault-search")?.focus();
    if (view === "library") {
      window.requestAnimationFrame(focus);
      return;
    }
    navigateTo("library");
    window.requestAnimationFrame(() => window.requestAnimationFrame(focus));
  };
  const paletteCommands: PaletteCommand[] = [
    { id: "home", group: "screen", title: "ホーム", keywords: "home", run: () => navigateTo("home") },
    { id: "vault", group: "screen", title: "Vault", keywords: "ボルト 一覧 進行", run: () => navigateTo("library") },
    { id: "capture", group: "screen", title: "取り込む", keywords: "capture import", run: () => navigateTo("capture") },
    { id: "voicing-loop", group: "screen", title: "Voicing Loop", keywords: "ボイシング ループ 練習 vl", frequent: true, run: () => openDirectVoicingLoop() },
    { id: "chord-dojo", group: "screen", title: "Chord Dojo", keywords: "コード 道場 練習 cd", frequent: true, run: () => openChordDojo() },
    ...(bassPracticeEnabled
      ? [{ id: "bass-practice", group: "screen" as const, title: "Bass Practice", keywords: "ベース 練習 bp", run: () => { navigateTo("practice"); openBassPractice(); } }]
      : []),
    { id: "settings", group: "screen", title: "設定", keywords: "settings せってい", run: () => openSettings() },
    { id: "import-midi", group: "action", title: "MIDI を取り込む", keywords: "midi import 取り込み ファイル", frequent: true, run: () => navigateTo("capture") },
    { id: "import-text", group: "action", title: "コード譜のテキストを貼り付け", keywords: "text テキスト 取り込み 貼る", frequent: true, run: () => openTextProgressionInput() },
    { id: "live-midi", group: "action", title: "Live MIDI を開く", keywords: "live midi ライブ 鍵盤 弾いて拾う", run: () => requestProgressionLeave(() => { void enterLiveMidiMode(); }) },
    { id: "vault-search", group: "action", title: "Vault で探す", keywords: "検索 search 絞り込み", frequent: true, run: focusVaultSearch },
  ];

  return (
    <NotificationProvider
      store={notifications}
      closeLabel={copy.common.close}
      undo={{ actions: undoQueue.actions, onUndo: undoQueue.undo, label: copy.undo.action, fallbackFocusRef: undoFallbackFocusRef }}
    >
    {/* P25 V34: one host draws the opened list of every <select> in the app's look. */}
    <SelectMenuHost />
    <MetronomeProvider>
    <GlobalBpmProvider>
    <PreviewSoundProvider>
      <a className="lv-skip-link" href="#main-content">
        {copy.common.skipToContent}
      </a>
      <AppShell
        view={view}
        vaultCount={vaultProgressionCount}
        setView={navigateTo}
        openLiveMidi={() => requestProgressionLeave(() => { void enterLiveMidiMode(); })}
        openMidiSettings={() => setLiveMidiSettingsOpen(true)}
        openVoicingLoop={openDirectVoicingLoop}
        openChordDojo={() => openChordDojo()}
        openBassPractice={() => { navigateTo("practice"); openBassPractice(); }}
        bassPracticeAvailable={bassPracticeEnabled}
        bassPracticeActive={view === "practice" && practiceMode === "bass-practice"}
        openSettings={openSettings}
        settingsOpen={view === "settings"}
        voicingLoopActive={view === "practice" && practiceMode === "voicing-loop"}
        copy={copy}
        saveStatus={error && unsaved ? "error" : saving ? "saving" : unsaved ? "unsaved" : "saved"}
        standardTitleBar={standardTitleBar}
        onSearch={() => {
          if (paletteOpen) {
            setPaletteOpen(false);
            return;
          }
          // Another dialog is open (a confirmation, a save dialog): Ctrl+K does nothing behind it.
          if (document.querySelector("[data-modal-backdrop]")) return;
          setPaletteOpen(true);
        }}
        masterVolume={masterVolume}
        onMasterVolumeChange={changeMasterVolume}
        pageTitle={shellTitle(view, practiceMode)}
        pageSubtitle={view === "home" ? formatHomeDate(new Date()) : undefined}
        pageNavigation={view === "practice" ? (
          <PracticeModeTabs
            bassPracticeAvailable={bassPracticeEnabled}
            mode={practiceMode}
            onModeChange={mode=>{if(mode==='chord-dojo')setPracticeTarget(undefined);setDojoRecentResume(undefined);setBassPracticeInitialMode(undefined);setPracticeMode(mode);}}
          />
        ) : undefined}
      >
        <h1 ref={undoFallbackFocusRef} tabIndex={-1} className="sr-only">
          Loop Vault
        </h1>
        <main
          id="main-content"
          ref={mainContentRef}
          tabIndex={-1}
          aria-label={shellTitle(view, practiceMode)}
          className={`min-h-0 min-w-0 flex-1 outline-none ${view === "practice" && practiceMode === "chord-dojo" ? "" : "px-4 lg:px-6"} ${
            view === "practice" && practiceMode === "chord-dojo" ? "overflow-y-auto" : view === "practice" && (practiceMode === "voicing-loop" || practiceMode === "bass-practice")
              ? "overflow-x-hidden overflow-y-auto py-2"
              : "overflow-y-auto py-5"
          }`}
        >
        <div className={`mx-auto flex w-full min-w-0 flex-col ${view === "practice" && practiceMode === "chord-dojo" ? "max-w-none" : "max-w-[1680px]"} ${
          view === "practice" ? "h-full min-h-0" : "min-h-full"
        }`}>
        {view === "settings" ? (
          <SettingsView
            ideas={visibleIdeas}
            backups={backups}
            error={error}
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
          />
        ) : loadStatus === "ready" ? (
          <>
            <QuarantineNotice count={quarantine.length} copy={copy} />
            {sizeRecovery ? (
              <SizeRecoveryNotice
                saving={saving}
                error={error}
                onOpenVault={() => navigateTo("library")}
              />
            ) : null}
            {view === "home" ? (
              <HomeView
                ideas={visibleIdeas}
                storedIdeas={ideas}
                practiceFile={practiceData.file}
                bassPracticeAvailable={bassPracticeEnabled}
                showRomanNumerals={settings.showRomanNumerals ?? true}
                openProgression={openProgression}
                openCapture={(mode) => (mode === "text" ? openTextProgressionInput() : navigateTo("capture"))}
                openVault={(keyCell) => { setVaultKeyRequest(keyCell); setView("library"); }}
                openChordDojo={openChordDojo}
                openBassPractice={openBassPractice}
                openVoicingLoop={openProgressionVoicingPractice}
                openVoicingLoopHome={openDirectVoicingLoop}
                resumeChordDojo={openChordDojoRecent}
                updateProgressionBlock={updateProgressionBlock}
                onAddSamples={addSampleProgressions}
              />
            ) : null}
            {view === "library" ? (
              <VaultView
                ideas={visibleIdeas}
                storedIdeas={ideas}
                openDetail={openDetail}
                openProgression={openProgression}
                openCapture={() => navigateTo("capture")}
                openTextCapture={openTextProgressionInput}
                updateIdea={updateIdea}
                updateProgressionBlock={updateProgressionBlock}
                setToast={setToast}
                copy={copy}
                showRomanNumerals={settings.showRomanNumerals ?? true}
                openVoicingLoop={openProgressionVoicingPractice}
                openChordDojo={openChordDojo}
                openBassPractice={bassPracticeEnabled ? openBassPracticeFromVault : undefined}
                keyRequest={vaultKeyRequest}
                onKeyRequestDone={clearVaultKeyRequest}
                onAddSamples={addSampleProgressions}
              />
            ) : null}
            {view === "capture" ? (
              <CaptureRenderBoundary
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
                  initialInputMode={captureInitialInputMode}
                  onOpenLiveMidi={() => requestProgressionLeave(() => { void enterLiveMidiMode(); })}
                  ideas={visibleIdeas}
                  analysis={analysis}
                  analyzeMidiBytes={analyzeMidiBytes}
                  clearAnalysis={clearAnalysis}
                  createIdeaFromDraft={(draft, options) => {
                    const id = createIdeaFromDraft(draft);
                    if (id && !options?.stayOnCapture) {
                      openDetail(id);
                    }
                    return id;
                  }}
                  onWorkspaceDirtyChange={setCaptureWorkspaceDirty}
                  createIdeaFromTextProgression={(draft) => {
                    const id = createIdeaFromTextProgression(draft);
                    if (!id) return undefined;
                    return findSavedTextProgressionTarget(defaultVaultStore.getState().ideas, id);
                  }}
                  appendBlockToIdea={appendBlockToIdea}
                  appendTextProgressionToIdea={(ideaId, draft) => {
                    const previousIds = new Set(
                      defaultVaultStore.getState().ideas
                        .find((candidate) => candidate.id === ideaId)
                        ?.progressionBlocks?.map((block) => block.id) ?? [],
                    );
                    if (!appendTextProgressionToIdea(ideaId, draft)) return false;
                    return findSavedTextProgressionTarget(
                      defaultVaultStore.getState().ideas,
                      ideaId,
                      previousIds,
                    ) ?? false;
                  }}
                  openSavedTextProgressionPractice={openProgressionVoicingPractice}
                  updateIdea={updateIdea}
                  setToast={setToast}
                  copy={copy}
                  showRomanNumerals={settings.showRomanNumerals ?? true}
                />
              </CaptureRenderBoundary>
            ) : null}
            {view === "detail" && selectedIdea && !selectedIdea.progressionBlocks?.length ? (
              <DetailView
                idea={selectedIdea}
                updateIdea={updateIdea}
                removeProgressionBlock={removeProgressionBlock}
                openProgression={openProgression}
                enqueueUndo={undoQueue.enqueue}
                vaultEpoch={vaultEpoch}
                requestDelete={requestDelete}
                setToast={setToast}
                copy={copy}
                recoveryPending={Boolean(sizeRecovery)}
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
                openProgression={openProgression}
                onSaveReady={setProgressionSave}
                updateIdea={updateIdea}
                requestIdeaDelete={requestDelete}
                openChordDojo={(ideaId,blockId)=>openChordDojo({ideaId,blockId})}
                openIdea={openDetail}
                openVault={() => setView("library")}
                showRomanNumerals={settings.showRomanNumerals ?? true}
                requestDelete={requestProgressionDelete}
                openPractice={openPractice}
                openVoicingPractice={(ideaId, blockId) => openProgressionVoicingPractice({ ideaId, blockId })}
                requestLeave={requestProgressionLeave}
                onDirtyChange={setProgressionDetailDirty}
                setToast={setToast}
                copy={copy}
                loadMidiSource={loadMidiSource}
              />
            ) : null}
            {view === "practice" ? (
              <PracticeWorkspace
                  mode={practiceMode}
                  onModeChange={mode=>{if(mode==='chord-dojo')setPracticeTarget(undefined);setDojoRecentResume(undefined);setBassPracticeInitialMode(undefined);setPracticeMode(mode);}}
                  bassPracticeAvailable={bassPracticeEnabled}
                  bassPractice={(
                    <Suspense fallback={<p role="status" className="py-8 text-sm text-[var(--lv-text-secondary)]">Degree Echoを読み込んでいます…</p>}>
                      {practiceData.status === "ready" ? <BassPracticeView
                        key={practiceSession.id}
                        {...(bassPracticeInitialMode ? { initialMode: bassPracticeInitialMode } : {})}
                        homeRequest={bassHomeRequest}
                        chordContextSnapshot={chordContextSnapshot}
                        resolveSavedChordNotes={resolveSavedChordNotes}
                        chordContextSnapshots={chordContextSnapshots}
                        vaultPickerCandidates={vaultPickerCandidates}
                        vaultSourceBasslines={vaultSourceBasslines}
                        initialClaim={practiceClaim}
                        initialRound={practiceSession.round}
                        initialSettings={practiceData.file?.settings}
                        practiceFile={practiceData.file}
                        notice={practiceData.error}
                        onRhythmAttemptCompleted={(attempt) => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.recordRhythmAttempt(attempt) : Promise.reject(new Error("Practice progress is not ready."));
                        }}
                        sourceBasslineHistory={practiceData.file?.sourceBasslineHistory}
                        onSourceBasslineHistoryRecorded={(entry) => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.recordSourceBasslineHistory(entry) : Promise.reject(new Error("Practice progress is not ready."));
                        }}                        onChordContextHistoryRecorded={(entry) => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.recordChordContextHistory(entry) : Promise.reject(new Error("Practice progress is not ready."));
                        }}
                        onRootMotionHistoryRecorded={(entry) => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.recordRootMotionHistory(entry) : Promise.reject(new Error("Practice progress is not ready."));
                        }}
                        onRootMotionNoteCountChange={(rootMotionNoteCount) => {
                          const controller = practiceControllerRef.current;
                          return controller
                            ? controller.patchSettings({ rootMotionNoteCount })
                            : Promise.reject(new Error("Practice settings are not ready."));
                        }}
                        onSourceBasslineWindowBarsChange={(sourceBasslineWindowBars) => {
                          const controller = practiceControllerRef.current;
                          return controller
                            ? controller.patchSettings({ sourceBasslineWindowBars })
                            : Promise.reject(new Error("Practice settings are not ready."));
                        }}
                        onAttemptCompleted={(attempt) => {
                          const controller = practiceControllerRef.current;
                          return controller ? controller.recordAttempt(attempt) : Promise.reject(new Error("Practice progress is not ready."));
                        }}
                        onSettingsChange={(next) => {
                          const controller = practiceControllerRef.current;
                          return controller
                            ? controller.patchSettings(next)
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
                    <ChordDojoView
                      ideas={chordDojoIdeas}
                      initialTarget={practiceTarget}
                      {...(dojoRecentResume ? { initialRecent: dojoRecentResume } : {})}
                    />
                  )}
                  voicingLoop={(
                    <ProgressionVoicingPracticeView
                      key={voicingPracticeHandoff?.snapshots[voicingPracticeHandoff.initialSelection]?.fingerprint
                        ?? P527_E2E_FIXTURE?.snapshots[P527_E2E_FIXTURE.initialSelection]?.fingerprint
                        ?? "empty-voicing-loop"}
                      snapshots={voicingPracticeHandoff?.snapshots ?? P527_E2E_FIXTURE?.snapshots}
                      initialSelection={voicingPracticeHandoff?.initialSelection ?? P527_E2E_FIXTURE?.initialSelection}
                      resolutionOptions={P527_E2E_FIXTURE?.resolutionOptions}
                      vaultProgressions={P527_E2E_FIXTURE?.vaultProgressions ?? voicingLoopVaultCandidates}
                      bulkSourcePreview={bulkSourcePreview}
                      onBulkSourceApply={applyBulkSource}
                      onSelectProgression={openProgressionVoicingPractice}
                      onToggleFavorite={(reference, pinned) => {
                        // VL-15: the Voicing Loop star writes the same Vault flag the library row writes.
                        const saved = updateProgressionBlock(reference.ideaId, reference.blockId, { pinned });
                        return saved === "pending" ? true : saved;
                      }}
                      onEnterText={openTextProgressionInput}
                      onImportMidi={() => navigateTo("capture")}
                      showDegrees={settings.showRomanNumerals ?? true}
                      onOpenInVault={(reference) => openProgression(reference.ideaId, reference.blockId)}
                      onBackToPicker={() => setVoicingPracticeHandoff(undefined)}
                    />
                  )}
              />
            ) : null}
            {view === "detail" && !selectedIdea ? (
              <FirstCaptureGuide className="mx-auto mt-6 w-full max-w-2xl" onMidi={() => navigateTo("capture")} onText={openTextProgressionInput} onSamples={addSampleProgressions} />
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
      {liveMidiSettingsOpen ? (
        <LiveMidiSettingsDialog copy={copy.settingsUi} onClose={() => setLiveMidiSettingsOpen(false)} />
      ) : null}
      {pendingLiveMidiHistory ? (
        <LiveMidiImportDialog
          history={pendingLiveMidiHistory}
          ideas={visibleIdeas}
          copy={copy.liveMidi}
          onCancel={discardLiveMidiHistory}
          onContinue={continueLiveMidi}
          onSave={importLiveMidiHistory}
        />
      ) : null}
      <CloseDialogHost />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        rows={paletteRows}
        commands={paletteCommands}
        onOpenProgression={(ideaId, blockId) => openProgression(ideaId, blockId)}
        onPracticeProgression={(ideaId, blockId) => { openProgressionVoicingPractice({ ideaId, blockId }); }}
      />
      <ConfirmDialog
        open={Boolean(pendingProgressionLeave)}
        title={view === "capture" ? UNSAVED_TITLE : "変更を保存しますか？"}
        description={view === "capture"
          ? unsavedMessage(captureWorkspaceDirty, "移る")
          : "この進行には、まだ保存していない変更があります。保存せずに移ると、その変更は消えます。"}
        confirmLabel={view === "capture" ? "保存せずに移る" : "保存して移る"}
        secondaryLabel={view === "progression-detail" ? "保存せずに移る" : undefined}
        onSecondary={view === "progression-detail" ? () => { const action=pendingProgressionLeave;setPendingProgressionLeave(undefined);setProgressionDetailDirty(false);action?.(); } : undefined}
        secondaryTone="danger"
        cancelLabel="戻る"
        {...(view === "capture" ? { changeCount: captureWorkspaceDirty } : {})}
        onCancel={() => setPendingProgressionLeave(undefined)}
        onConfirm={() => {
          if(view === "progression-detail" && !saveProgression())return;
          const action = pendingProgressionLeave;
          setPendingProgressionLeave(undefined);
          setProgressionDetailDirty(false);
          setCaptureWorkspaceDirty(0);
          action?.();
        }}
        tone={view === "capture" ? "danger" : "default"}
      />
      <ConfirmDialog
        open={Boolean(startupRestoreName)}
        title={startupRestoreName && readableBackupDate(startupRestoreName)
          ? `${readableBackupDate(startupRestoreName)} のバックアップに戻しますか？`
          : copy.startup.restoreBackupTitle}
        description="今のデータは、このバックアップの中身に置き換わります。"
        confirmLabel="戻す"
        cancelLabel="やめる"
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
      {webLiveMidiPreviewOpen ? (
        <div ref={webLiveMidiPreviewRef} className="lv-live-mini-web fixed bottom-4 right-4 z-50 h-[260px] w-[420px] max-w-[calc(100vw-2rem)]" data-testid="live-midi-web-preview">
          <LiveMidiMiniMode
            copy={copy.liveMidi}
            onShowMain={() => { void leaveLiveMidiMode(); }}
            onSave={() => { void leaveLiveMidiMode(); }}
          />
        </div>
      ) : null}
      </AppShell>
    </PreviewSoundProvider>
    </GlobalBpmProvider>
    </MetronomeProvider>
    </NotificationProvider>
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












/** P8.9-02: header screen names follow the Japanese sidebar (proper names stay as they are). */
function shellTitle(view: View, practiceMode: PracticeWorkspaceMode): string {
  if (view === "capture") return "取り込む";
  if (view === "settings") return "設定";
  if (view === "library" || view === "detail" || view === "progression-detail") return "Vault";
  if (view === "practice") {
    return practiceMode === "voicing-loop" ? "Voicing Loop" : practiceMode === "bass-practice" ? "Bass Practice" : "Chord Dojo";
  }
  return "ホーム";
}

export default App;
