import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readBoundedMidiPath } from "./storage/boundedMidiReader";
import {
  lazy,
  ReactNode,
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
import { DetailView } from "./views/DetailView";
import { HomeView } from "./views/HomeView";
import { formatHomeDate } from "./views/home/useHomeSummary";
import { SettingsDialog } from "./views/SettingsDialog";
import { VaultView } from "./views/VaultView";
import { ProgressionDetailView } from "./views/ProgressionDetailView";
import { PracticeView } from "./views/PracticeView";
import { ProgressionVoicingPracticeView } from "./views/ProgressionVoicingPracticeView";
import { progressionVoicingPracticeE2eFixture } from "./testing/progressionVoicingPracticeE2eFixture";
import { isBassPracticeBasslineEchoEnabled, isBassPracticeDegreeEchoEnabled, isBassPracticeRhythmEchoEnabled, isBassPracticeRootMotionEnabled } from "./features/bass-practice/application/featureFlag";
import { buildVaultPickerCandidateViews, buildVaultSourceBasslineCandidateViews, type VaultPickerCandidateView, type VaultSourceBasslineCandidateView } from "./features/bass-practice/application/vaultPickerCandidates";
import type { VaultChordContextSnapshot } from "./features/bass-practice/domain";
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
import { LiveMidiImportDialog, type LiveMidiImportRequest } from "./components/LiveMidiImportDialog";
import { createNotificationStore, NotificationProvider, useReserveBottomSpace } from "./components/notifications";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useMasterVolume } from "./hooks/useMasterVolume";
import { loadUseStandardTitleBar } from "./components/shell/shellPreferences";
import { prepareMainWindowFrame } from "./components/shell/windowControls";
import { parseMidi } from "./domain/midi";
import { canChooseSource, setAllEligibleCardsToSource } from "./domain/voicing";
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
  progressionDetailCopy,
  type AppCopy,
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
import { LiveMidiOpenGate, liveMidiActivation, type LiveMidiActivationLease } from "./liveMidi/activationLease";
import { createTauriMiniWindowAdapter, MiniWindowController } from "./liveMidi/miniWindowController";
import { recoverMainWindowIfOffscreen } from "./voicingPractice/mainWindowWorkArea";
import { loadLiveMidiPreferences, saveLiveMidiPreferences, type WindowBounds } from "./liveMidi/preferences";
import { historyToSavedProgressionBlock, type LiveChordHistoryEntry } from "./domain/liveMidi";
import {
  loadRecentVoicingLoopProgressions,
  recordRecentVoicingLoopProgression,
  saveRecentVoicingLoopProgressions,
} from "./voicingPractice/recentProgressions";
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
  releaseLease: () => void;
  closeWindow: () => Promise<WindowBounds | undefined>;
  saveBounds: (bounds: WindowBounds) => void;
  hidePreview: () => void;
  preserveHistory: (history: LiveChordHistoryEntry[]) => void;
  reportFailure: () => void;
}): Promise<void> {
  let released = false;
  let stateSettled = false;
  let history: LiveChordHistoryEntry[] = [];
  const releaseLease = () => {
    if (released) return;
    released = true;
    options.releaseLease();
  };
  const settleVisibleState = () => {
    if (stateSettled) return;
    stateSettled = true;
    options.hidePreview();
    if (history.length > 0) options.preserveHistory(history);
  };

  try {
    await options.gate.close(async () => {
      history = [...options.getHistory()];
      releaseLease();
      try {
        const bounds = await options.closeWindow();
        if (bounds) options.saveBounds(bounds);
      } finally {
        settleVisibleState();
      }
    });
  } catch {
    releaseLease();
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
    pendingProgressionLeave,
    setPendingProgressionLeave,
    requestProgressionLeave,
    navigateTo,
    openDetail,
    openProgression,
  } = useAppNavigation({
    onNavigate: (nextView, previousView) => {
      setChordContextSnapshot((snapshot) => clearTransientChordContextSnapshotForNavigation(snapshot, previousView, nextView));
      if (nextView === "capture") setCaptureInitialInputMode("midi");
    },
  });
  const [bassPracticeEnabled] = useState(() => isBassPracticeDegreeEchoEnabled() || isBassPracticeRhythmEchoEnabled() || isBassPracticeBasslineEchoEnabled() || isBassPracticeRootMotionEnabled());
  const practiceControllerRef = useRef<PracticeDataController>();
  const pendingPracticeSessionIdRef = useRef<string>();
  const [practiceSessionGeneration, setPracticeSessionGeneration] = useState(0);
  const [practiceData, setPracticeData] = useState<PracticeDataSnapshot>(DISABLED_PRACTICE_DATA);
  const [practiceMode, setPracticeMode] = useState<PracticeWorkspaceMode>("chord-dojo");
  const [captureInitialInputMode, setCaptureInitialInputMode] = useState<"midi" | "text">("midi");
  const [practiceTarget, setPracticeTarget] = useState<{ ideaId: string; blockId: string }>();
  const [chordContextSnapshot, setChordContextSnapshot] = useState<VaultChordContextSnapshot>();
  const [voicingPracticeHandoff, setVoicingPracticeHandoff] = useState<ProgressionVoicingPracticeHandoff>();
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [notifications] = useState(createNotificationStore);
  // P8.9: existing setToast(message) callers keep their shape; messages now go to
  // the unified bottom-right stack (4 s, pauses on hover/focus).
  const setToast = useCallback((message?: string) => {
    if (message) notifications.notify({ message });
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
  const liveMidiLeaseRef = useRef<LiveMidiActivationLease>();
  const liveMidiOpenGateRef = useRef<LiveMidiOpenGate>();
  if (!liveMidiOpenGateRef.current) liveMidiOpenGateRef.current = new LiveMidiOpenGate();
  const undoQueue = useUndoQueue();
  const undoEpochRef = useRef(vaultEpoch);
  useEffect(() => () => {
    void liveMidiOpenGateRef.current?.close(async () => {
      liveMidiLeaseRef.current?.release();
      liveMidiLeaseRef.current = undefined;
      await miniWindowControllerRef.current?.close().catch(() => undefined);
    }).catch(() => undefined);
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
        visibleIdeas,
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
    const cards = voicingLoopSourceBlock.chords;
    const changed = setAllEligibleCardsToSource(cards).changedCount;
    return {
      eligible: cards.filter(canChooseSource).length,
      changed,
      skippedCustom: cards.filter((card) => card.voicingMemory?.playbackChoice === "CUSTOM").length,
      skippedMissingSource: cards.filter((card) => !canChooseSource(card)).length,
    };
  })() : undefined;
  function applyBulkSource(): boolean {
    if (!voicingPracticeHandoff || !voicingLoopSourceBlock) return false;
    const result = setAllEligibleCardsToSource(voicingLoopSourceBlock.chords);
    if (result.changedCount === 0) return true;
    const reference = voicingPracticeHandoff.sourceReference;
    if (!updateProgressionBlock(reference.ideaId, reference.blockId, { chords: result.cards })) return false;
    const handoff = buildProgressionVoicingPracticeHandoffFromVault(defaultVaultStore.getState().ideas, reference);
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

  const progressionCopy = progressionDetailCopy.ja;

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
  }, []);

  function openDirectVoicingLoop() {
    requestProgressionLeave(() => {
      setVoicingPracticeHandoff(undefined);
      setPracticeTarget(undefined);
      setChordContextSnapshot(undefined);
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

  /** Receives a detached P5.18 snapshot only; raw Vault data never crosses this boundary. */
  function openPractice(snapshot: VaultChordContextSnapshot) {
    setPracticeTarget({
      ideaId: snapshot.source.reference.ideaId,
      blockId: snapshot.source.reference.blockId,
    });
    setChordContextSnapshot(snapshot);
    setPracticeMode(bassPracticeEnabled ? "bass-practice" : "chord-dojo");
    setView("practice");
  }

  function openChordDojo(target?: { ideaId: string; blockId: string }) {
    requestProgressionLeave(() => {
      setPracticeTarget(target);
      setChordContextSnapshot(undefined);
      setPracticeMode("chord-dojo");
      setView("practice");
    });
  }

  function openBassPractice() {
    if (!bassPracticeEnabled) return;
    setPracticeTarget(undefined);
    setChordContextSnapshot(undefined);
    setPracticeMode("bass-practice");
    setView("practice");
  }

  function openProgressionVoicingPractice(sourceReference: { ideaId: string; blockId: string }) {
    const result = buildProgressionVoicingPracticeHandoffFromVault(visibleIdeas, sourceReference);
    if (!result.ok) {
      setToast("保存済み進行を確認できないため、Voicing Loopを開始できません。");
      return false;
    }
    setPracticeTarget(undefined);
    setChordContextSnapshot(undefined);
    saveRecentVoicingLoopProgressions(recordRecentVoicingLoopProgression(
      loadRecentVoicingLoopProgressions(),
      sourceReference,
    ));
    setVoicingPracticeHandoff(result.handoff);
    setPracticeMode("voicing-loop");
    setView("practice");
    return true;
  }

  async function loadMidiSource(path: string) {
    return parseMidi(await readBoundedMidiPath(path));
  }

  async function enterLiveMidiMode() {
    if (liveMidiClosingRef.current || liveMidiLeaseRef.current) return;
    await liveMidiOpenGateRef.current!.enter(async (isCurrent) => {
      let modeLease: LiveMidiActivationLease | undefined;
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
        modeLease = liveMidiActivation.acquire();
        liveMidiLeaseRef.current = modeLease;
        await modeLease.ready;
        if (!isCurrent()) {
          modeLease.release();
          if (liveMidiLeaseRef.current === modeLease) liveMidiLeaseRef.current = undefined;
          return;
        }
        if (isTauri()) {
          await sendLiveMidiSnapshot(
            createLiveMidiWindowSnapshot(defaultLiveMidiStore.getState()),
          ).catch(() => undefined);
        }
      } catch (error) {
        modeLease?.release();
        if (liveMidiLeaseRef.current === modeLease) liveMidiLeaseRef.current = undefined;
        if (!isCurrent()) return;
        await miniWindowControllerRef.current?.close().catch(() => undefined);
        setToast(errorMessage(error, copy.liveMidi.miniModeFailed));
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
        releaseLease: () => {
          liveMidiLeaseRef.current?.release();
          liveMidiLeaseRef.current = undefined;
        },
        closeWindow: async () => miniWindowControllerRef.current?.close(),
        saveBounds: (miniBounds) => {
          saveLiveMidiPreferences({ ...defaultLiveMidiStore.getState().preferences, miniBounds });
        },
        hidePreview: () => setWebLiveMidiPreviewOpen(false),
        preserveHistory: (history) => setPendingLiveMidiHistory(history),
        reportFailure: () => setToast(copy.liveMidi.miniModeCloseFailed),
      });
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
    if (!ideaId || !block || appendBlockToIdea(ideaId, block, undefined, { userVerified: false }) !== true) {
      setToast(copy.liveMidi.importFailed);
      return;
    }
    discardLiveMidiHistory();
    setToast(copy.liveMidi.imported);
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

  return (
    <NotificationProvider
      store={notifications}
      closeLabel={copy.common.close}
      undo={{ actions: undoQueue.actions, onUndo: undoQueue.undo, label: copy.undo.action, fallbackFocusRef: undoFallbackFocusRef }}
    >
    <MetronomeProvider>
    <PreviewSoundProvider>
      <a className="lv-skip-link" href="#main-content">
        {copy.common.skipToContent}
      </a>
      <AppShell
        view={view}
        setView={navigateTo}
        openLiveMidi={() => requestProgressionLeave(() => { void enterLiveMidiMode(); })}
        openVoicingLoop={openDirectVoicingLoop}
        openChordDojo={() => { navigateTo("practice"); setPracticeMode("chord-dojo"); }}
        openBassPractice={() => { navigateTo("practice"); openBassPractice(); }}
        bassPracticeAvailable={bassPracticeEnabled}
        bassPracticeActive={view === "practice" && practiceMode === "bass-practice"}
        openSettings={() => {
          setSettingsOpen(true);
          void refreshBackups();
        }}
        settingsOpen={isSettingsOpen}
        voicingLoopActive={view === "practice" && practiceMode === "voicing-loop"}
        copy={copy}
        saveStatus={error && unsaved ? "error" : saving ? "saving" : unsaved ? "unsaved" : "saved"}
        standardTitleBar={standardTitleBar}
        onSearch={() => {
          const focusSearch = () => document.getElementById("vault-search")?.focus();
          if (view === "library") {
            focusSearch();
            return;
          }
          navigateTo("library");
          window.requestAnimationFrame(() => window.requestAnimationFrame(focusSearch));
        }}
        masterVolume={masterVolume}
        onMasterVolumeChange={changeMasterVolume}
        pageTitle={shellTitle(view, practiceMode)}
        pageSubtitle={view === "home" ? formatHomeDate(new Date()) : undefined}
        pageNavigation={view === "practice" ? (
          <PracticeModeTabs
            bassPracticeAvailable={bassPracticeEnabled}
            mode={practiceMode}
            onModeChange={setPracticeMode}
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
          className={`min-h-0 min-w-0 flex-1 px-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lv-accent)] lg:px-6 ${
            view === "practice" && practiceMode === "voicing-loop"
              ? "overflow-x-hidden overflow-y-auto py-2"
              : "overflow-y-auto py-5"
          }`}
        >
        <div className={`mx-auto flex w-full max-w-[1680px] min-w-0 flex-col ${
          view === "practice" && practiceMode === "voicing-loop" ? "h-full min-h-0" : "min-h-full"
        }`}>
        {loadStatus === "ready" ? (
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
                openVault={() => setView("library")}
                openChordDojo={openChordDojo}
                openBassPractice={openBassPractice}
                openVoicingLoop={openProgressionVoicingPractice}
                updateProgressionBlock={updateProgressionBlock}
              />
            ) : null}
            {view === "library" ? (
              <VaultView
                ideas={visibleIdeas}
                storedIdeas={ideas}
                openDetail={openDetail}
                openProgression={openProgression}
                openCapture={() => navigateTo("capture")}
                updateIdea={updateIdea}
                updateProgressionBlock={updateProgressionBlock}
                setToast={setToast}
                copy={copy}
                showRomanNumerals={settings.showRomanNumerals ?? true}
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
                  openSavedTextProgression={({ ideaId, blockId }) => {
                    if (visibleIdeas.some((idea) => idea.id === ideaId
                      && idea.progressionBlocks?.some((block) => block.id === blockId))) {
                      openProgression(ideaId, blockId);
                    } else {
                      setToast("保存済み進行を確認できません。");
                    }
                  }}
                  openSavedTextProgressionPractice={openProgressionVoicingPractice}
                  updateIdea={updateIdea}
                  setToast={setToast}
                  copy={copy}
                  showRomanNumerals={settings.showRomanNumerals ?? true}
                />
              </CaptureRenderBoundary>
            ) : null}
            {view === "detail" && selectedIdea ? (
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
                openIdea={openDetail}
                openVault={() => setView("library")}
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
                  onModeChange={setPracticeMode}
                  bassPracticeAvailable={bassPracticeEnabled}
                  bassPractice={(
                    <Suspense fallback={<p role="status" className="py-8 text-sm text-[var(--lv-text-secondary)]">Degree Echoを読み込んでいます…</p>}>
                      {practiceData.status === "ready" ? <BassPracticeView
                        key={practiceSession.id}
                        chordContextSnapshot={chordContextSnapshot}
                        chordContextSnapshots={chordContextSnapshots}
                        vaultPickerCandidates={vaultPickerCandidates}
                        vaultSourceBasslines={vaultSourceBasslines}
                        initialClaim={practiceClaim}
                        initialRound={practiceSession.round}
                        initialSettings={practiceData.file?.settings}
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
                    <PracticeView
                      ideas={visibleIdeas}
                      initialTarget={practiceTarget}
                      updateProgressionBlock={updateProgressionBlock}
                      openProgression={openProgression}
                      openSettings={() => {
                        setSettingsOpen(true);
                        void refreshBackups();
                      }}
                      setToast={setToast}
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
                      onEnterText={openTextProgressionInput}
                      openMidiSettings={() => {
                        setSettingsOpen(true);
                        void refreshBackups();
                      }}
                    />
                  )}
              />
            ) : null}
            {view === "detail" && !selectedIdea ? (
              <EmptyState openCapture={() => navigateTo("capture")} copy={copy} />
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
      {isSettingsOpen ? (
        <SettingsDialog
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
      {webLiveMidiPreviewOpen ? (
        <div ref={webLiveMidiPreviewRef} className="fixed bottom-4 right-4 z-50 h-[260px] w-[420px] max-w-[calc(100vw-2rem)] border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] shadow-xl">
          <LiveMidiMiniMode
            copy={copy.liveMidi}
            onShowMain={() => { void leaveLiveMidiMode(); }}
          />
        </div>
      ) : null}
      </AppShell>
    </PreviewSoundProvider>
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

function QuarantineNotice({ count, copy }: { count: number; copy: AppCopy;}) {
  if (count === 0) return null;
  return (
    <div className="mt-4 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <p>{copy.startup.quarantine(count)}</p>
      <p className="mt-1 text-xs">
        {"不完全な上書きを防ぐため現在は非書込みです。置換読み込みまたは正常なbackup復元で回復してください。"}
      </p>
    </div>
  );
}

function EmptyState({ openCapture, copy }: { openCapture: () => void; copy: AppCopy }) {
  return (
    <div className="grid min-h-96 place-items-center py-10">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold">{copy.startup.emptyTitle}</h2>
        <button className="mt-5 rounded bg-[var(--lv-accent)] px-4 py-2 font-semibold text-stone-950" onClick={openCapture}>{copy.library.capture}</button>
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

/** P8.9-02: header screen names follow the Japanese sidebar (proper names stay as they are). */
function shellTitle(view: View, practiceMode: PracticeWorkspaceMode): string {
  if (view === "capture") return "取り込む";
  if (view === "library" || view === "detail" || view === "progression-detail") return "Vault";
  if (view === "practice") {
    return practiceMode === "voicing-loop" ? "Voicing Loop" : practiceMode === "bass-practice" ? "Bass Practice" : "Chord Dojo";
  }
  return "ホーム";
}

export default App;
