import { readFile } from "@tauri-apps/plugin-fs";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  playbackController,
  type PlaybackController,
} from "./audio/playbackController";
import { AppShell, type AppView } from "./components/AppShell";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Modal } from "./components/Modal";
import { DetailView } from "./views/DetailView";
import { HomeView } from "./views/HomeView";
import { SettingsDialog } from "./views/SettingsDialog";
import { VaultView } from "./views/VaultView";
import { Toast } from "./components/Toast";
import { UndoToast } from "./components/UndoToast";
import { statusLabel } from "./domain/displayLabels";
import type { SongIdea, Status } from "./domain/types";
import {
  applyPendingDeletions,
  createUndoSnapshot,
  ideaAnchor,
  isPendingDeletion,
  type PendingDeletion,
  type PendingIdeaDeletion,
} from "./domain/undoDeletion";
import { appCopy, type AppCopy, type AppLanguage } from "./i18n";
import {
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
} from "./store/closeGuard";
import { defaultVaultStore } from "./store/defaultVaultStore";
import { CaptureView } from "./views/CaptureView";
import { useUndoQueue } from "./hooks/useUndoQueue";
import type { UndoRequest } from "./hooks/useUndoQueue";

type View = AppView;
const pipeline: Status[] = ["idea", "loop", "arrange", "mix", "done"];

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
  const removeProgressionBlock = useStore(defaultVaultStore, (state) => state.removeProgressionBlock);
  const removeReference = useStore(defaultVaultStore, (state) => state.removeReference);
  const unlinkAsset = useStore(defaultVaultStore, (state) => state.unlinkAsset);
  const transitionIdea = useStore(defaultVaultStore, (state) => state.transitionIdea);
  const updateNextAction = useStore(defaultVaultStore, (state) => state.updateNextAction);
  const analyzeMidiBytes = useStore(defaultVaultStore, (state) => state.analyzeMidiBytes);
  const clearAnalysis = useStore(defaultVaultStore, (state) => state.clearAnalysis);

  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string>();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [startupRestoreName, setStartupRestoreName] = useState<string>();
  const undoFallbackFocusRef = useRef<HTMLHeadingElement>(null);
  const undoQueue = useUndoQueue();
  const undoEpochRef = useRef(vaultEpoch);
  const pendingDeletions = useMemo(
    () => undoQueue.actions
      .map((action) => action.payload)
      .filter(isPendingDeletion),
    [undoQueue.actions],
  );
  const visibleIdeas = useMemo(
    () => applyPendingDeletions(ideas, pendingDeletions, vaultEpoch),
    [ideas, pendingDeletions, vaultEpoch],
  );

  const selectedIdea = visibleIdeas.find((idea) => idea.id === selectedId) ?? visibleIdeas[0];
  const storedSelectedIdea = ideas.find((idea) => idea.id === selectedIdea?.id);
  const language = settings.language;
  const copy = appCopy[language];

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
    if (toast) {
      const timer = setTimeout(() => setToast(undefined), 3200);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [toast]);

  function openDetail(id: string) {
    setSelectedId(id);
    setView("detail");
  }

  function handleCreate(title: string, status: Status) {
    const id = createIdea(title, status);
    if (!id) {
      return;
    }

    setCreateOpen(false);
    openDetail(id);
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

  const shell = (
    <AppShell
      view={view}
      setView={setView}
      openCreate={() => setCreateOpen(true)}
      openSettings={() => {
        setSettingsOpen(true);
        void refreshBackups();
      }}
      copy={copy}
      saveLabel={saving ? copy.save.saving : unsaved ? copy.save.unsaved : copy.save.saved}
    />
  );

  return (
    <main className="min-h-screen bg-[var(--lv-bg)] text-[var(--lv-text)]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6">
        <h1 ref={undoFallbackFocusRef} tabIndex={-1} className="sr-only">
          Loop Vault
        </h1>
        {shell}
        {loadStatus === "ready" ? (
          <>
            <QuarantineNotice count={quarantine.length} copy={copy} />
            {view === "home" ? (
              <HomeView
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
            ) : null}
            {view === "detail" && selectedIdea ? (
              <DetailView
                idea={selectedIdea}
                storedIdea={storedSelectedIdea}
                updateIdea={updateIdea}
                updateNextAction={updateNextAction}
                removeProgressionBlock={removeProgressionBlock}
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
            language={language}
            requestRestoreBackup={setStartupRestoreName}
            copy={copy}
          />
        )}
      </section>
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
      <ConfirmDialog
        open={Boolean(startupRestoreName)}
        title={language === "ja" ? "バックアップを復元" : "Restore backup"}
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
        <Toast message={toast} />
      ) : null}
    </main>
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












function CreateDialog({
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
      <form onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 id="create-idea-title" className="text-xl font-semibold">{copy.create.title}</h2>
          <button type="button" className="rounded px-2 py-1 text-[var(--lv-text-muted)]" onClick={onClose}>{copy.common.close}</button>
        </div>
        <input ref={titleRef} className={`${inputClass} mt-4`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.common.title} />
        <select className={`${inputClass} mt-3`} value={status} onChange={(event) => setStatus(event.target.value as Status)}>
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
  language,
}: {
  loadStatus: string;
  recovery: ReturnType<typeof defaultVaultStore.getState>["recovery"];
  readonly: ReturnType<typeof defaultVaultStore.getState>["readonly"];
  error?: string;
  requestRestoreBackup: (backupName: string) => void;
  copy: AppCopy;
  language: AppLanguage;
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
                  {language === "ja" ? `${backup.name} を復元` : `Restore ${backup.name}`}
                </button>
              )) : <p className="text-sm text-[var(--lv-text-muted)]">{copy.startup.noBackups}</p>}
            </div>
          </div>
        ) : null}
        {loadStatus === "readonly" && readonly ? <StatusPanel title={copy.startup.readonlyTitle} body={readonly.fileVersion ? (language === "ja" ? `このdata.jsonは fileVersion ${readonly.fileVersion} です。このアプリより新しい形式です。` : `This data.json is fileVersion ${readonly.fileVersion}, newer than this app supports.`) : readonly.message} /> : null}
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

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

export default App;
