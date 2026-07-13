import { appDataDir } from "@tauri-apps/api/path";
import {
  open as openFileDialog,
  save as saveFileDialog,
} from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  canOpenAssetPath,
  openableAssetExtensions,
} from "./domain/assetSecurity";
import { displayKey, statusLabel } from "./domain/displayLabels";
import { filterAndSortIdeas, type IdeaFilters } from "./domain/libraryFilters";
import { monthlyStats } from "./domain/monthlyStats";
import { pickFocus } from "./domain/focus";
import { formatProgressionText } from "./domain/progressionText";
import type { TransitionResult } from "./domain/transition";
import type {
  AssetType,
  ChordTimelineItem,
  SavedProgressionBlock,
  SongIdea,
  Status,
} from "./domain/types";
import { appCopy, type AppCopy, type AppLanguage } from "./i18n";
import {
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
} from "./store/closeGuard";
import { defaultVaultStore } from "./store/defaultVaultStore";
import { ProgressionGrid } from "./ui/ProgressionGrid";
import { CaptureView } from "./views/CaptureView";

type View = "home" | "capture" | "library" | "detail";
type SortKey = "updatedAt" | "createdAt" | "bpm";
type Reference = SongIdea["references"][number];
type Asset = SongIdea["assets"][number];

const statuses: Status[] = [
  "idea",
  "loop",
  "arrange",
  "mix",
  "done",
  "hold",
  "abandoned",
];
const pipeline: Status[] = ["idea", "loop", "arrange", "mix", "done"];
const nextPlaceholders = [
  "Replace the bass",
  "Try the B section chords",
  "Make two drum variations",
  "Bounce a rough hook",
];
const keySuggestions = ["C", "Cm", "D", "Dm", "E", "Em", "F", "Fm", "G", "Gm", "A", "Am", "B", "Bm"];
const defaultAssetId = () => crypto.randomUUID();

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
  const analysis = useStore(defaultVaultStore, (state) => state.analysis);
  const initialize = useStore(defaultVaultStore, (state) => state.initialize);
  const restoreBackup = useStore(defaultVaultStore, (state) => state.restoreBackup);
  const backups = useStore(defaultVaultStore, (state) => state.backups);
  const setMonthlyGoal = useStore(defaultVaultStore, (state) => state.setMonthlyGoal);
  const setLanguage = useStore(defaultVaultStore, (state) => state.setLanguage);
  const refreshBackups = useStore(defaultVaultStore, (state) => state.refreshBackups);
  const exportVault = useStore(defaultVaultStore, (state) => state.exportVault);
  const importVault = useStore(defaultVaultStore, (state) => state.importVault);
  const createIdea = useStore(defaultVaultStore, (state) => state.createIdea);
  const createIdeaFromDraft = useStore(defaultVaultStore, (state) => state.createIdeaFromDraft);
  const updateIdea = useStore(defaultVaultStore, (state) => state.updateIdea);
  const deleteIdea = useStore(defaultVaultStore, (state) => state.deleteIdea);
  const appendBlockToIdea = useStore(defaultVaultStore, (state) => state.appendBlockToIdea);
  const removeProgressionBlock = useStore(defaultVaultStore, (state) => state.removeProgressionBlock);
  const transitionIdea = useStore(defaultVaultStore, (state) => state.transitionIdea);
  const updateNextAction = useStore(defaultVaultStore, (state) => state.updateNextAction);
  const analyzeMidiBytes = useStore(defaultVaultStore, (state) => state.analyzeMidiBytes);
  const clearAnalysis = useStore(defaultVaultStore, (state) => state.clearAnalysis);

  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string>();
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<SongIdea>();
  const deleteTimer = useRef<ReturnType<typeof setTimeout>>();

  const selectedIdea = ideas.find((idea) => idea.id === selectedId) ?? ideas[0];
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
      if (deleteTimer.current) {
        clearTimeout(deleteTimer.current);
      }
    };
  }, [initialize]);

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
    if (!window.confirm(language === "ja" ? `「${idea.title}」を削除しますか？` : `Delete "${idea.title}"?`)) {
      return;
    }

    setPendingDelete(idea);
    setSelectedId(undefined);
    setView("library");
    deleteTimer.current = setTimeout(() => {
      deleteIdea(idea.id);
      setPendingDelete(undefined);
    }, 5000);
  }

  function undoDelete() {
    if (deleteTimer.current) {
      clearTimeout(deleteTimer.current);
    }
    setPendingDelete(undefined);
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
    <main className="min-h-screen bg-stone-950 text-stone-50">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6">
        {shell}
        {loadStatus === "ready" ? (
          <>
            <QuarantineNotice count={quarantine.length} copy={copy} />
            {view === "home" ? (
              <HomeView
                ideas={ideas}
                monthlyGoal={settings.monthlyGoal}
                copy={copy}
                language={language}
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
              <LibraryView
                ideas={pendingDelete ? ideas.filter((idea) => idea.id !== pendingDelete.id) : ideas}
                openDetail={openDetail}
                openCreate={() => setCreateOpen(true)}
                openCapture={() => setView("capture")}
                setToast={setToast}
                copy={copy}
                language={language}
              />
            ) : null}
            {view === "capture" ? (
              <CaptureView
                ideas={ideas}
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
              />
            ) : null}
            {view === "detail" && selectedIdea ? (
              <DetailView
                idea={selectedIdea}
                updateIdea={updateIdea}
                updateNextAction={updateNextAction}
                removeProgressionBlock={removeProgressionBlock}
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
            restoreBackup={restoreBackup}
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
          monthlyGoal={settings.monthlyGoal}
          language={language}
          backups={backups}
          error={error}
          setMonthlyGoal={setMonthlyGoal}
          setLanguage={setLanguage}
          refreshBackups={refreshBackups}
          restoreBackup={restoreBackup}
          exportVault={exportVault}
          importVault={importVault}
          setToast={setToast}
          copy={copy}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {pendingDelete ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(92vw,440px)] -translate-x-1/2 border border-stone-700 bg-stone-900 p-3 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-200">{language === "ja" ? `「${pendingDelete.title}」を削除します` : `Deleting "${pendingDelete.title}"`}</p>
            <button className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-stone-950" onClick={undoDelete}>
              {language === "ja" ? "元に戻す" : "Undo"}
            </button>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed right-4 top-4 z-50 max-w-sm border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-100 shadow-xl">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function AppShell({
  view,
  setView,
  openCreate,
  openSettings,
  copy,
  saveLabel,
}: {
  view: View;
  setView: (view: View) => void;
  openCreate: () => void;
  openSettings: () => void;
  copy: AppCopy;
  saveLabel: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-stone-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-teal-300">Loop Vault</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">{copy.hero}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className={tabClass(view === "home")} onClick={() => setView("home")}>{copy.nav.home}</button>
        <button className={tabClass(view === "capture")} onClick={() => setView("capture")}>{copy.nav.capture}</button>
        <button className={tabClass(view === "library")} onClick={() => setView("library")}>{copy.nav.library}</button>
        <button className="rounded bg-teal-400 px-3 py-2 font-semibold text-stone-950" onClick={openCreate}>{copy.nav.new}</button>
        <span className="min-w-20 px-2 py-2 text-center text-xs text-stone-400" aria-live="polite">{saveLabel}</span>
        <button
          className="grid h-9 w-9 place-items-center rounded border border-stone-700 text-lg text-stone-300 hover:border-teal-300 hover:bg-stone-900"
          onClick={openSettings}
          aria-label={copy.nav.settings}
          title={copy.nav.settings}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}

function SettingsDialog({
  monthlyGoal,
  language,
  backups,
  error,
  setMonthlyGoal,
  setLanguage,
  refreshBackups,
  restoreBackup,
  exportVault,
  importVault,
  setToast,
  copy,
  onClose,
}: {
  monthlyGoal: number;
  language: AppLanguage;
  backups: ReturnType<typeof defaultVaultStore.getState>["backups"];
  error?: string;
  setMonthlyGoal: (goal: number) => void;
  setLanguage: (language: AppLanguage) => void;
  refreshBackups: () => Promise<void>;
  restoreBackup: (backupName: string) => Promise<void>;
  exportVault: (path: string) => Promise<boolean>;
  importVault: (path: string, mode: "replace" | "merge") => Promise<boolean>;
  setToast: (toast: string) => void;
  copy: AppCopy;
  onClose: () => void;
}) {
  const [dataPath, setDataPath] = useState<string>(copy.settings.dataPathFallback);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setDataPath(copy.settings.dataPathFallback);
      return;
    }
    void appDataDir().then((path) => setDataPath(`${path}loopvault/data.json`));
  }, [copy.settings.dataPathFallback]);

  async function exportData() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.exportDesktopOnly);
      return;
    }
    const target = await saveFileDialog({
      defaultPath: `loopvault-export-${timestampForFile(new Date())}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!target) return;
    const ok = await exportVault(target);
    setToast(ok ? copy.toast.exported : copy.toast.exportFailed);
  }

  async function importData() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.importDesktopOnly);
      return;
    }
    const target = await openFileDialog({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof target !== "string") return;
    const ok = await importVault(target, importMode);
    setToast(ok ? copy.toast.imported : copy.toast.importFailed);
  }

  async function openDataFolder() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.folderDesktopOnly);
      return;
    }
    await revealItemInDir(await appDataDir());
  }

  async function restore(name: string) {
    if (!window.confirm(copy.settings.restoreConfirm(name))) return;
    await restoreBackup(name);
    await refreshBackups();
    setToast(copy.toast.restoreDone);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl border border-stone-700 bg-stone-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{copy.settings.title}</h2>
          <button className="rounded px-2 py-1 text-stone-400" onClick={onClose}>{copy.common.close}</button>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section>
            <h3 className="font-semibold">{copy.settings.language}</h3>
            <p className="mt-2 text-sm text-stone-400">{copy.settings.languageHelp}</p>
            <select
              className={`${inputClass} mt-3`}
              value={language}
              onChange={(event) => setLanguage(event.target.value as AppLanguage)}
            >
              <option value="ja">{copy.settings.japanese}</option>
              <option value="en">{copy.settings.english}</option>
            </select>
          </section>
          <section>
            <h3 className="font-semibold">{copy.settings.data}</h3>
            <p className="mt-2 break-all text-sm text-stone-400">{dataPath}</p>
            <button className="mt-3 rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void openDataFolder()}>{copy.settings.openFolder}</button>
          </section>
          <section>
            <h3 className="font-semibold">{copy.settings.monthlyGoal}</h3>
            <input
              className={`${inputClass} mt-2`}
              min={1}
              type="number"
              value={monthlyGoal}
              onChange={(event) => setMonthlyGoal(Number(event.target.value))}
            />
          </section>
          <section>
            <h3 className="font-semibold">{copy.settings.exportTitle}</h3>
            <p className="mt-2 text-sm text-stone-400">{copy.settings.exportDescription}</p>
            <button className="mt-3 rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void exportData()}>{copy.settings.exportButton}</button>
          </section>
          <section>
            <h3 className="font-semibold">{copy.settings.importTitle}</h3>
            <select className={`${inputClass} mt-2`} value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
              <option value="merge">{copy.settings.importMerge}</option>
              <option value="replace">{copy.settings.importReplace}</option>
            </select>
            <button className="mt-3 rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void importData()}>{copy.settings.importButton}</button>
            {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
          </section>
        </div>
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{copy.settings.backups}</h3>
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void refreshBackups()}>{copy.common.update}</button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {backups.length === 0 ? <p className="text-sm text-stone-400">{copy.settings.noBackups}</p> : null}
            {backups.map((backup) => (
              <div key={backup.name} className="flex flex-wrap items-center justify-between gap-3 border border-stone-800 p-3 text-sm">
                <div>
                  <p className="font-medium">{backup.name}</p>
                  <p className="text-stone-500">{backup.createdAt}</p>
                </div>
                <button className="rounded border border-stone-700 px-3 py-2" onClick={() => void restore(backup.name)}>{copy.common.restore}</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function HomeView({
  ideas,
  monthlyGoal,
  copy,
  language,
  openDetail,
  openCapture,
  openCreate,
  openVault,
  updateNextAction,
  transitionIdea,
  setToast,
}: {
  ideas: SongIdea[];
  monthlyGoal: number;
  copy: AppCopy;
  language: AppLanguage;
  openDetail: (id: string) => void;
  openCapture: () => void;
  openCreate: () => void;
  openVault: () => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  setToast: (toast: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const focus = pickFocus(ideas, now);
  const stats = monthlyStats(ideas, now, monthlyGoal);
  const progress = Math.min(100, (stats.doneCount / stats.goal) * 100);
  const focusBlock = focus.focus?.progressionBlocks?.[0];
  const focusPreview = focusBlock
    ? formatProgressionText(focusBlock.chords).split("\n")[0]
    : focus.focus?.chordMemo.split("\n").find((line) => line.trim());
  const recentProgressions = ideas
    .flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .sort((left, right) => new Date(right.block.capturedAt).getTime() - new Date(left.block.capturedAt).getTime())
    .slice(0, 3);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function completeNext(idea: SongIdea) {
    updateNextAction(idea.id, "", new Date());
    setToast(copy.toast.nextCompleted);
  }

  return (
    <div className="space-y-5 py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Home</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{language === "ja" ? "次に鳴らすLoopを選ぶ。" : "Choose the loop to play next."}</h2>
      </div>

      <Panel className="border-teal-400/30 bg-[linear-gradient(135deg,rgba(20,23,21,0.96),rgba(8,10,9,0.96))] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">{copy.home.today}</p>
        {focus.focus ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold">{focus.focus.title}</h3>
                <p className="mt-2 text-sm text-stone-400">
                  {focus.focus.bpm ? `${focus.focus.bpm} BPM` : language === "ja" ? "BPM未設定" : "BPM unset"}
                  {focus.focus.key ? ` · ${displayKey(focus.focus.key, language)}` : ""}
                  {` · ${labelStatus(focus.focus.status, language)}`}
                </p>
              </div>
              <StatusBadge status={focus.focus.status} language={language} />
            </div>
            {focusPreview ? <p className="mt-5 overflow-x-auto border-y border-stone-800 py-4 font-mono text-sm text-teal-100">{focusPreview}</p> : null}
            <p className="mt-5 text-sm text-stone-200"><span className="text-stone-500">{copy.home.nextAction}：</span>{focus.focus.nextAction.text}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {focusBlock ? (
                <button className="grid h-10 w-10 place-items-center rounded bg-cyan-400 font-semibold text-stone-950" onClick={() => void previewTimeline(focusBlock.chords, focusBlock.bpm ?? focus.focus!.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button>
              ) : null}
              <button className="rounded border border-stone-700 px-4 py-2 text-sm font-medium hover:border-teal-300" onClick={() => openDetail(focus.focus!.id)}>{language === "ja" ? "詳細を開く" : "Open details"}</button>
              <button className="rounded bg-teal-400 px-4 py-2 text-sm font-semibold text-stone-950" onClick={() => completeNext(focus.focus!)}>{language === "ja" ? "次の一手を完了" : "Complete next step"}</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 max-w-xl">
            <p className="text-stone-300">{copy.home.noFocus}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="rounded bg-teal-400 px-4 py-2 text-sm font-semibold text-stone-950" onClick={openCapture}>{language === "ja" ? "コード採集を始める" : "Start capture"}</button>
              <button className="rounded border border-stone-700 px-4 py-2 text-sm" onClick={openCreate}>{language === "ja" ? "新しいIdea" : "New Idea"}</button>
              <button className="rounded border border-stone-700 px-4 py-2 text-sm" onClick={openVault}>{language === "ja" ? "Vaultを開く" : "Open Vault"}</button>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel>
          <p className="text-sm text-stone-400">{copy.home.monthlyFinish}</p>
          <p className="mt-2 text-3xl font-semibold">{stats.doneCount} <span className="text-lg text-stone-500">/ {stats.goal}</span></p>
          <div className="mt-4 h-2 overflow-hidden rounded bg-stone-800"><div className="h-full bg-teal-400" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs text-stone-400">{language === "ja" ? `完成にしたネタ：${stats.doneCount}件 · 月間ゴール：${stats.goal}件 · ${copy.home.daysLeft(stats.remainingDays)}` : `${stats.doneCount} completed · Goal ${stats.goal} · ${copy.home.daysLeft(stats.remainingDays)}`}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-stone-400">{copy.home.needsNextAction}</p>
          <p className="mt-2 text-3xl font-semibold">{focus.needsNextAction.length}<span className="ml-1 text-sm text-stone-500">{language === "ja" ? "件" : "items"}</span></p>
          <p className="mt-3 text-xs text-stone-400">{focus.needsNextAction.length ? (language === "ja" ? "次の一手を追加できます" : "Add the next step") : copy.home.allHaveNextAction}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-stone-400">{copy.home.stale}</p>
          <p className="mt-2 text-3xl font-semibold">{focus.stale.length}<span className="ml-1 text-sm text-stone-500">{language === "ja" ? "件" : "items"}</span></p>
          <p className="mt-3 text-xs text-stone-400">{focus.stale.length ? (language === "ja" ? "7日以上動きがないネタ" : "No activity for 7+ days") : copy.home.noStale}</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h3 className="text-lg font-semibold">{language === "ja" ? "最近採集した進行" : "Recently captured progressions"}</h3>
          {recentProgressions.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentProgressions.map(({ idea, block }) => (
                <article key={block.id} className="border border-stone-800 bg-stone-950 p-4">
                  <p className="line-clamp-1 font-medium">{block.summaryText || (language === "ja" ? "保存したコード進行" : "Saved progression")}</p>
                  <p className="mt-1 text-xs text-stone-500">{idea.title}</p>
                  <p className="mt-4 line-clamp-2 font-mono text-xs text-teal-100">{formatProgressionText(block.chords).split("\n")[0]}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="grid h-8 w-8 place-items-center rounded border border-cyan-400/60 text-cyan-100" onClick={() => void previewTimeline(block.chords, block.bpm ?? idea.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button>
                    <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => openDetail(idea.id)}>{language === "ja" ? "Vaultで開く" : "Open in Vault"}</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-stone-400">{language === "ja" ? "保存済みの進行はまだありません。" : "No saved progressions yet."}</p>}
        </section>
        <aside className="space-y-4">
          <Panel>
            <h3 className="font-semibold">{copy.home.pipeline}</h3>
            <div className="mt-4 space-y-3">
              {pipeline.map((status) => <div key={status}><div className="flex justify-between text-sm"><span>{labelStatus(status, language)}</span><span className="text-stone-400">{stats.pipelineCounts[status]}</span></div><div className="mt-1 h-1.5 rounded bg-stone-800"><div className="h-full rounded bg-cyan-400" style={{ width: `${Math.min(100, stats.pipelineCounts[status] * 18)}%` }} /></div></div>)}
            </div>
          </Panel>
          {focus.stale.length ? <Panel><h3 className="font-semibold">{copy.home.stale}</h3><div className="mt-3 space-y-2">{focus.stale.map((entry) => <div key={entry.idea.id} className="flex items-center justify-between gap-3 border-t border-stone-800 pt-2"><button className="text-left text-sm font-medium" onClick={() => openDetail(entry.idea.id)}>{entry.idea.title}</button>{entry.suggestHold ? <button className="rounded border border-stone-700 px-2 py-1 text-xs" onClick={() => { const result = transitionIdea(entry.idea.id, "hold", new Date()); if (!result.ok) setToast(result.error.message); }}>{copy.home.suggestHold}</button> : null}</div>)}</div></Panel> : null}
        </aside>
      </div>
    </div>
  );
}

function LibraryView({
  ideas,
  openDetail,
  openCreate,
  openCapture,
  setToast,
  copy,
  language,
}: {
  ideas: SongIdea[];
  openDetail: (id: string) => void;
  openCreate: () => void;
  openCapture: () => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const [mode, setMode] = useState<"idea" | "progression">("idea");
  const [quickFilter, setQuickFilter] = useState<"all" | "with-progression" | "without-progression" | "no-next" | "recent">("all");
  const filters: IdeaFilters = {
    query: "",
    statuses: status === "all" ? [] : [status],
    genres: genre ? [genre] : [],
    moods: mood ? [mood] : [],
  };
  const visible = filterAndSortIdeas(ideas, filters, { field: sort, direction: sort === "bpm" ? "asc" : "desc" })
    .filter((idea) => !query.trim() || matchesProgressionQuery(idea, query))
    .filter((idea) => {
      const blocks = idea.progressionBlocks ?? [];
      if (quickFilter === "with-progression") return blocks.length > 0;
      if (quickFilter === "without-progression") return blocks.length === 0;
      if (quickFilter === "no-next") return !idea.nextAction.text.trim();
      if (quickFilter === "recent") return blocks.some((block) => Date.now() - new Date(block.capturedAt).getTime() < 30 * 24 * 60 * 60 * 1000);
      return true;
    });
  const progressions = visible
    .flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .sort((left, right) => new Date(right.block.capturedAt).getTime() - new Date(left.block.capturedAt).getTime());

  async function copyProgression(block: SavedProgressionBlock) {
    try {
      await writeClipboardText(formatProgressionText(block.chords));
      setToast(language === "ja" ? "Chord Dripで使えるコード進行をコピーしました。" : "Copied progression text.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : (language === "ja" ? "コピーできませんでした。" : "Could not copy progression."));
    }
  }

  return (
    <div className="py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Vault</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{language === "ja" ? "採集した進行を探す" : "Find captured progressions"}</h2>
        </div>
        <div className="flex rounded border border-stone-700 p-1 text-sm">
          <button className={mode === "idea" ? "rounded bg-teal-400 px-3 py-1.5 font-semibold text-stone-950" : "rounded px-3 py-1.5 text-stone-300"} onClick={() => setMode("idea")}>Idea</button>
          <button className={mode === "progression" ? "rounded bg-teal-400 px-3 py-1.5 font-semibold text-stone-950" : "rounded px-3 py-1.5 text-stone-300"} onClick={() => setMode("progression")}>Progression</button>
        </div>
      </div>
      <div className="grid gap-2 border-b border-stone-800 pb-4 md:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr]">
        <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "ja" ? "タイトル・コード進行・次の一手を検索" : "Search titles, progressions, or next steps"} />
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as Status | "all")}>
          <option value="all">{language === "ja" ? "すべてのStatus" : "All statuses"}</option>
          {statuses.map((entry) => <option key={entry} value={entry}>{labelStatus(entry, language)}</option>)}
        </select>
        <input className={inputClass} value={genre} onChange={(event) => setGenre(event.target.value)} placeholder={copy.library.genre} />
        <input className={inputClass} value={mood} onChange={(event) => setMood(event.target.value)} placeholder={copy.library.mood} />
        <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="updatedAt">{copy.library.updated}</option>
          <option value="createdAt">{copy.library.created}</option>
          <option value="bpm">{copy.library.bpm}</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["all", "with-progression", "without-progression", "no-next", "recent"] as const).map((entry) => (
          <button key={entry} className={quickFilter === entry ? "rounded bg-stone-700 px-3 py-1.5 text-xs text-stone-50" : "rounded border border-stone-800 px-3 py-1.5 text-xs text-stone-400"} onClick={() => setQuickFilter(entry)}>
            {language === "ja" ? ({ all: "すべて", "with-progression": "進行あり", "without-progression": "進行なし", "no-next": "次の一手なし", recent: "最近採集" }[entry]) : ({ all: "All", "with-progression": "With progression", "without-progression": "No progression", "no-next": "No next step", recent: "Recently captured" }[entry])}
          </button>
        ))}
      </div>
      {mode === "idea" && visible.length === 0 ? (
        <EmptyState openCreate={openCreate} copy={copy} />
      ) : null}
      {mode === "idea" && visible.length > 0 ? (
        <div className="grid gap-3 py-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((idea) => {
            const progressionBlocks = idea.progressionBlocks ?? [];
            const firstBlock = progressionBlocks[0];
            const extraBlockCount = Math.max(0, progressionBlocks.length - 1);
            const progressionPreview = firstBlock
              ? formatProgressionText(firstBlock.chords).split("\n")[0]
              : "";

            return (
              <article key={idea.id} className="border border-stone-800 bg-stone-900 p-4 hover:border-teal-400">
                <div className="flex items-start justify-between gap-3">
                  <button className="text-left text-lg font-semibold" onClick={() => openDetail(idea.id)}>{idea.title}</button>
                  <StatusBadge status={idea.status} language={language} />
                </div>
                <p className="mt-2 text-sm text-stone-400">{idea.bpm ? `${idea.bpm} BPM` : copy.library.bpmUnset} {idea.key ? ` · ${displayKey(idea.key, language)}` : ""}</p>
                {firstBlock ? (
                  <div className="mt-4 border border-stone-800 bg-stone-950 p-3">
                    <p className="line-clamp-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">
                      {firstBlock.summaryText || (language === "ja" ? "保存したコード進行" : "Saved progression")}
                    </p>
                    <p className="mt-2 line-clamp-2 font-mono text-sm text-stone-200">{progressionPreview}</p>
                  </div>
                ) : <div className="mt-4 border border-dashed border-stone-700 p-3 text-sm text-stone-400">{language === "ja" ? "コード進行はまだありません" : "No progression yet"}</div>}
                <p className="mt-4 line-clamp-2 text-sm text-stone-300">{idea.nextAction.text ? `${copy.home.nextAction}：${idea.nextAction.text}` : copy.library.noNextAction}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {progressionBlocks.length > 0 ? (
                    <span className="inline-block rounded bg-cyan-400 px-2 py-1 text-xs font-semibold text-stone-950">
                      {language === "ja" ? `進行 ${progressionBlocks.length}件` : `${progressionBlocks.length} progression${progressionBlocks.length === 1 ? "" : "s"}`}{extraBlockCount > 0 ? ` · +${extraBlockCount}` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {firstBlock ? <button className="grid h-8 w-8 place-items-center rounded border border-cyan-400/60 text-cyan-100" onClick={() => void previewTimeline(firstBlock.chords, firstBlock.bpm ?? idea.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button> : <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={openCapture}>{language === "ja" ? "MIDIから追加" : "Add from MIDI"}</button>}
                  <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => openDetail(idea.id)}>{copy.common.open}</button>
                  {firstBlock ? <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => void copyProgression(firstBlock)}>{copy.capture.copyProgression}</button> : null}
                </div>
                <p className="mt-4 text-xs text-stone-500">{language === "ja" ? "更新" : "Updated"} {formatDate(idea.updatedAt)}</p>
              </article>
            );
          })}
        </div>
      ) : null}
      {mode === "progression" ? (
        progressions.length ? <div className="grid gap-3 py-5 md:grid-cols-2 xl:grid-cols-3">{progressions.map(({ idea, block }) => <article key={block.id} className="border border-stone-800 bg-stone-900 p-4"><p className="font-semibold">{block.summaryText || (language === "ja" ? "保存したコード進行" : "Saved progression")}</p><button className="mt-1 text-left text-xs text-teal-200 hover:underline" onClick={() => openDetail(idea.id)}>{idea.title}</button><p className="mt-3 font-mono text-sm text-stone-100">{formatProgressionText(block.chords).split("\n")[0]}</p><p className="mt-2 text-xs text-stone-500">{idea.bpm ? `${idea.bpm} BPM` : copy.library.bpmUnset}{idea.key ? ` · ${displayKey(idea.key, language)}` : ""}{block.startBar ? ` · ${language === "ja" ? `${block.startBar}-${block.endBar}小節` : `Bars ${block.startBar}-${block.endBar}`}` : ""}</p><div className="mt-4 flex gap-2"><button className="grid h-8 w-8 place-items-center rounded border border-cyan-400/60 text-cyan-100" onClick={() => void previewTimeline(block.chords, block.bpm ?? idea.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button><button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => openDetail(idea.id)}>{language === "ja" ? "親Ideaを開く" : "Open parent Idea"}</button><button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => void copyProgression(block)}>{copy.capture.copyProgression}</button></div></article>)}</div> : <div className="py-14 text-center"><p className="text-stone-400">{language === "ja" ? "保存済みの進行はまだありません。" : "No saved progressions yet."}</p><button className="mt-4 rounded bg-teal-400 px-4 py-2 text-sm font-semibold text-stone-950" onClick={openCapture}>{language === "ja" ? "コード採集を始める" : "Start capture"}</button></div>
      ) : null}
    </div>
  );
}

function ProgressionBlockCard({
  block,
  onPreview,
  onRemove,
  onCopyProgression,
  copy,
}: {
  block: SavedProgressionBlock;
  onPreview: () => void;
  onRemove: () => void;
  onCopyProgression: () => void;
  copy: AppCopy;
}) {
  return (
    <div className="border border-stone-800 bg-stone-950 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{block.summaryText || block.chords.map((item) => item.chord.label).join(" - ")}</p>
          <p className="mt-1 text-stone-500">
            {block.sourceFileName ?? "Captured MIDI"} {block.startBar ? `Bar ${block.startBar}-${block.endBar}` : ""}
          </p>
        </div>
        <button className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onClick={onPreview}>
          {copy.common.preview}
        </button>
        <button className="rounded border border-teal-500/60 px-2 py-1 text-teal-100" onClick={onCopyProgression}>
          {copy.capture.copyProgression}
        </button>
        <button className="rounded border border-stone-700 px-2 py-1 text-stone-300" onClick={onRemove}>
          {copy.common.delete}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ProgressionGrid
          chords={block.chords}
          currentBar={null}
          selectedChordIndex={undefined}
          playingChordIndex={null}
        />
      </div>
      {block.memo ? <p className="mt-3 text-xs text-amber-200">{block.memo}</p> : null}
    </div>
  );
}

function DetailView({
  idea,
  updateIdea,
  updateNextAction,
  removeProgressionBlock,
  analyzeMidiPath,
  transitionIdea,
  requestDelete,
  setToast,
  copy,
  language,
}: {
  idea: SongIdea;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  removeProgressionBlock: (ideaId: string, blockId: string) => void;
  analyzeMidiPath: (path: string) => Promise<void>;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  requestDelete: (idea: SongIdea) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  const [nextDraft, setNextDraft] = useState(idea.nextAction.text);
  const [referenceDraft, setReferenceDraft] = useState<Reference>({ title: "", url: "", memo: "" });
  const [assetDraft, setAssetDraft] = useState<Asset>({ id: "", type: "flp", path: "", memo: "" });
  const placeholder = nextPlaceholders[Math.abs(hashString(idea.id)) % nextPlaceholders.length];

  useEffect(() => setNextDraft(idea.nextAction.text), [idea.id, idea.nextAction.text]);

  function saveNext() {
    updateNextAction(idea.id, nextDraft, new Date());
  }

  function completeNext() {
    updateNextAction(idea.id, "", new Date());
    setNextDraft("");
    setToast(copy.toast.nextCompleted);
  }

  function updateMeta(changes: Partial<SongIdea>) {
    updateIdea(idea.id, changes);
  }

  function moveStatus(to: Status) {
    if (to === "abandoned" && !window.confirm(language === "ja" ? "このIdeaを破棄しますか？" : "Abandon this idea?")) return;
    if (to === "hold") window.prompt(language === "ja" ? "Hold理由（任意）" : "Hold reason (optional)");
    if (pipeline.includes(to) && idea.nextAction.text.trim() && to !== idea.status) {
      const keep = window.confirm(language === "ja" ? "現在のNext Actionを次のステージへ持ち越しますか？" : "Carry the current Next Action into the next stage?");
      if (!keep) {
        updateNextAction(idea.id, "", new Date());
      }
    }
    const result = transitionIdea(idea.id, to, new Date());
    if (!result.ok) setToast(result.error.message);
    if (result.ok && to === "done") setToast(language === "ja" ? "Done。完成として記録しました。" : "Done. Marked as finished.");
  }

  function addReference(event: FormEvent) {
    event.preventDefault();
    if (!referenceDraft.title.trim()) return;
    updateMeta({ references: [...idea.references, { ...referenceDraft, title: referenceDraft.title.trim() }] });
    setReferenceDraft({ title: "", url: "", memo: "" });
  }

  function removeReference(index: number) {
    updateMeta({ references: idea.references.filter((_, itemIndex) => itemIndex !== index) });
  }

  async function chooseAssetPath() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.fileChooseDesktopOnly);
      return;
    }
    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "Music assets", extensions: openableAssetExtensions().map((extension) => extension.slice(1)) }],
    });
    if (typeof path === "string") setAssetDraft((draft) => ({ ...draft, path }));
  }

  function addAsset(event: FormEvent) {
    event.preventDefault();
    const asset: Asset = {
      ...assetDraft,
      id: defaultAssetId(),
      path: assetDraft.path?.trim() || undefined,
      memo: assetDraft.memo?.trim() || undefined,
    };
    updateMeta({ assets: [...idea.assets, asset] });
    setAssetDraft({ id: "", type: "flp", path: "", memo: "" });
  }

  function removeAsset(id: string) {
    updateMeta({ assets: idea.assets.filter((asset) => asset.id !== id) });
  }

  function updateAsset(assetId: string, changes: Partial<Asset>) {
    updateMeta({
      assets: idea.assets.map((entry) =>
        entry.id === assetId ? { ...entry, ...changes } : entry,
      ),
    });
  }

  async function openAsset(asset: Asset) {
    if (!asset.path) return;
    if (!canOpenAssetPath(asset.path)) {
      setToast(copy.detail.unsupportedExtension);
      return;
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.fileOpenDesktopOnly);
      return;
    }
    try {
      await openPath(asset.path);
    } catch {
      updateMeta({ assets: idea.assets.map((entry) => entry.id === asset.id ? { ...entry, missing: true } : entry) });
      setToast(copy.toast.assetMissing);
    }
  }

  async function showAsset(asset: Asset) {
    if (!asset.path) return;
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.folderDesktopOnly);
      return;
    }
    await revealItemInDir(asset.path);
  }

  async function replaceAssetPath(asset: Asset) {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.fileChooseDesktopOnly);
      return;
    }

    const path = await openFileDialog({
      multiple: false,
      filters: [
        {
          name: "Music assets",
          extensions: openableAssetExtensions().map((extension) =>
            extension.slice(1),
          ),
        },
      ],
    });
    if (typeof path === "string") {
      updateAsset(asset.id, { path, missing: false });
      setToast(copy.toast.assetPathUpdated);
    }
  }

  async function previewSavedBlock(block: SavedProgressionBlock) {
    try {
      await previewTimeline(block.chords, block.bpm ?? idea.bpm);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function copySavedBlock(block: SavedProgressionBlock) {
    try {
      await writeClipboardText(formatProgressionText(block.chords));
      setToast(language === "ja" ? "Chord Drip形式でコピーしました。" : "Copied progression text.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : (language === "ja" ? "コピーできませんでした。" : "Could not copy progression."));
    }
  }

  return (
    <div className="grid gap-5 py-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-5">
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <input className="w-full bg-transparent text-2xl font-semibold outline-none" value={idea.title} onChange={(event) => updateMeta({ title: event.target.value.slice(0, 80) })} />
            <StatusBadge status={idea.status} language={language} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button key={status} className={statusButtonClass(status === idea.status)} onClick={() => moveStatus(status)}>
                {labelStatus(status, language)}
              </button>
            ))}
          </div>
          <button className="mt-5 rounded border border-red-500/50 px-3 py-2 text-sm text-red-200" onClick={() => requestDelete(idea)}>{copy.common.delete}</button>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.nextAction}</h2>
          <textarea className={`${inputClass} mt-3 min-h-28`} value={nextDraft} onChange={(event) => setNextDraft(event.target.value)} onBlur={saveNext} placeholder={placeholder} />
          <div className="mt-3 flex gap-2">
            <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={saveNext}>{copy.common.update}</button>
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={completeNext}>{copy.common.done}</button>
          </div>
          {!idea.nextAction.text.trim() ? <p className="mt-3 text-sm text-amber-200">{copy.detail.nextActionHint}</p> : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.metadata}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={inputClass} type="number" min={40} max={300} value={idea.bpm ?? ""} onChange={(event) => updateMeta({ bpm: event.target.value ? Number(event.target.value) : undefined })} placeholder="BPM" />
            <input className={inputClass} list="key-options" value={idea.key ?? ""} onChange={(event) => updateMeta({ key: event.target.value || undefined })} placeholder="Key" />
            <datalist id="key-options">{keySuggestions.map((key) => <option key={key} value={key} />)}</datalist>
            <input className={inputClass} value={idea.genre ?? ""} onChange={(event) => updateMeta({ genre: event.target.value || undefined })} placeholder="Genre" />
            <input className={inputClass} value={idea.moods.join(", ")} onChange={(event) => updateMeta({ moods: splitList(event.target.value) })} placeholder={language === "ja" ? "Mood（カンマ区切り）" : "Mood (comma separated)"} />
          </div>
          <textarea className={`${inputClass} mt-3 min-h-28`} value={idea.chordMemo} onChange={(event) => updateMeta({ chordMemo: event.target.value })} placeholder={language === "ja" ? "コード進行メモ" : "Chord progression memo"} />
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.progressionBlocks}</h2>
          {(idea.progressionBlocks ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">{copy.detail.noProgressionBlocks}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {(idea.progressionBlocks ?? []).map((block) => (
                <ProgressionBlockCard
                  key={block.id}
                  block={block}
                  onPreview={() => void previewSavedBlock(block)}
                  onCopyProgression={() => void copySavedBlock(block)}
                  onRemove={() => removeProgressionBlock(idea.id, block.id)}
                  copy={copy}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="space-y-5">
        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.references}</h2>
          <form className="mt-3 grid gap-2" onSubmit={addReference}>
            <input className={inputClass} value={referenceDraft.title} onChange={(event) => setReferenceDraft({ ...referenceDraft, title: event.target.value })} placeholder="Title" />
            <input className={inputClass} value={referenceDraft.url ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, url: event.target.value })} placeholder="URL" />
            <input className={inputClass} value={referenceDraft.memo ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, memo: event.target.value })} placeholder="Memo" />
            <button className="rounded bg-stone-800 px-3 py-2 text-sm" type="submit">{copy.detail.addReference}</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.references.map((reference, index) => (
              <div key={`${reference.title}-${index}`} className="border border-stone-800 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{reference.title}</p>
                  <button className="text-stone-400" onClick={() => removeReference(index)}>{copy.common.delete}</button>
                </div>
                {reference.url ? <p className="mt-1 break-all text-stone-400">{reference.url}</p> : null}
                {reference.memo ? <p className="mt-1 text-stone-300">{reference.memo}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.assets}</h2>
          <form className="mt-3 grid gap-2" onSubmit={addAsset}>
            <div className="grid gap-2 sm:grid-cols-[0.4fr_1fr_auto]">
              <select className={inputClass} value={assetDraft.type} onChange={(event) => setAssetDraft({ ...assetDraft, type: event.target.value as AssetType })}>
                <option value="flp">FLP</option>
                <option value="midi">MIDI</option>
                <option value="audio">Audio</option>
                <option value="other">Other</option>
              </select>
              <input className={inputClass} value={assetDraft.path ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, path: event.target.value })} placeholder={copy.detail.absolutePath} />
              <button className="rounded border border-stone-700 px-3 py-2 text-sm" type="button" onClick={() => void chooseAssetPath()}>{copy.common.choose}</button>
            </div>
            <input className={inputClass} value={assetDraft.memo ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, memo: event.target.value })} placeholder="Memo" />
            <button className="rounded bg-stone-800 px-3 py-2 text-sm" type="submit">{copy.detail.addAsset}</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.assets.map((asset) => (
              <div key={asset.id} className={`border p-3 text-sm ${asset.missing ? "border-red-500/60 bg-red-950/20" : "border-stone-800"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium uppercase text-stone-300">{asset.type}</p>
                  <div className="flex gap-2">
                    {asset.type === "midi" && asset.path ? (
                      <button className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onClick={() => void analyzeMidiPath(asset.path!)}>
                        {copy.common.analyze}
                      </button>
                    ) : null}
                    <button
                      className="rounded border border-stone-700 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canOpenAssetPath(asset.path)}
                      onClick={() => void openAsset(asset)}
                    >
                      {copy.common.open}
                    </button>
                    <button className="rounded border border-stone-700 px-2 py-1" onClick={() => void showAsset(asset)}>{copy.common.folder}</button>
                    {asset.missing ? (
                      <button className="rounded border border-amber-500/60 px-2 py-1 text-amber-100" onClick={() => void replaceAssetPath(asset)}>
                        {copy.detail.fixPath}
                      </button>
                    ) : null}
                    <button className="rounded border border-stone-700 px-2 py-1" onClick={() => removeAsset(asset.id)}>{copy.common.delete}</button>
                  </div>
                </div>
                <p className="mt-2 break-all text-stone-400">{asset.path || copy.common.pathUnset}</p>
                {!canOpenAssetPath(asset.path) && asset.path ? <p className="mt-2 text-xs text-amber-200">{copy.detail.unsupportedExtension}</p> : null}
                {asset.missing ? <p className="mt-2 text-xs text-red-200">{copy.detail.missingAsset}</p> : null}
                {asset.memo ? <p className="mt-2 text-stone-300">{asset.memo}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">{copy.detail.history}</h2>
          <div className="mt-3 space-y-2">
            {idea.statusHistory.map((entry, index) => (
              <div key={`${entry.status}-${entry.at}-${index}`} className="flex justify-between border-b border-stone-800 pb-2 text-sm">
                <span>{labelStatus(entry.status, language)}</span>
                <span className="text-stone-400">{formatDate(entry.at)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
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

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate(title, status);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
      <form className="w-full max-w-md border border-stone-700 bg-stone-900 p-5 shadow-2xl" onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{copy.create.title}</h2>
          <button type="button" className="rounded px-2 py-1 text-stone-400" onClick={onClose}>{copy.common.close}</button>
        </div>
        <input autoFocus className={`${inputClass} mt-4`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.common.title} />
        <select className={`${inputClass} mt-3`} value={status} onChange={(event) => setStatus(event.target.value as Status)}>
          {pipeline.map((entry) => <option key={entry} value={entry}>{labelStatus(entry, language)}</option>)}
        </select>
        <button className="mt-4 w-full rounded bg-teal-400 px-3 py-2 font-semibold text-stone-950" type="submit">{copy.create.submit}</button>
      </form>
    </div>
  );
}

function StartupState({
  loadStatus,
  recovery,
  readonly,
  error,
  restoreBackup,
  copy,
  language,
}: {
  loadStatus: string;
  recovery: ReturnType<typeof defaultVaultStore.getState>["recovery"];
  readonly: ReturnType<typeof defaultVaultStore.getState>["readonly"];
  error?: string;
  restoreBackup: (backupName: string) => Promise<void>;
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
            {recovery.corruptPath ? <p className="mt-3 break-all text-sm text-stone-400">{recovery.corruptPath}</p> : null}
            <div className="mt-5 space-y-2">
              {recovery.backups.length > 0 ? recovery.backups.map((backup) => (
                <button key={backup.name} className="block w-full rounded border border-stone-700 px-3 py-2 text-left text-sm hover:bg-stone-800" onClick={() => void restoreBackup(backup.name)}>
                  {language === "ja" ? `${backup.name} を復元` : `Restore ${backup.name}`}
                </button>
              )) : <p className="text-sm text-stone-400">{copy.startup.noBackups}</p>}
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
        <button className="mt-5 rounded bg-teal-400 px-4 py-2 font-semibold text-stone-950" onClick={openCreate}>{copy.startup.emptyButton}</button>
      </div>
    </div>
  );
}

function StatusPanel({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-stone-300">{body}</p>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-stone-800 bg-stone-900 p-4 ${className}`}>{children}</section>;
}

function StatusBadge({ status, language }: { status: Status; language: AppLanguage }) {
  return <span className="shrink-0 rounded bg-stone-800 px-2 py-1 text-xs font-semibold uppercase text-teal-200">{labelStatus(status, language)}</span>;
}

function labelStatus(status: Status, language: AppLanguage): string {
  return statusLabel(status, language);
}

function tabClass(active: boolean): string {
  return active
    ? "border-b-2 border-teal-300 px-3 py-2 text-stone-50"
    : "border-b-2 border-transparent px-3 py-2 text-stone-300 hover:border-stone-600 hover:text-stone-50";
}

function statusButtonClass(active: boolean): string {
  return active ? "rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" : "rounded border border-stone-700 px-3 py-2 text-sm text-stone-300";
}

const inputClass = "w-full rounded border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus:border-teal-400";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

async function previewTimeline(
  chords: readonly ChordTimelineItem[],
  bpm?: number,
): Promise<void> {
  const { previewChordTimeline } = await import("./audio/chordPreview");
  await previewChordTimeline(chords, bpm);
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available.");
  }
  await navigator.clipboard.writeText(text);
}

function splitList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function matchesProgressionQuery(idea: SongIdea, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;

  return [idea.title, idea.chordMemo, idea.nextAction.text].some((value) => value.toLocaleLowerCase().includes(needle))
    || (idea.progressionBlocks ?? []).some((block) => [
    block.summaryText,
    block.tags.join(" "),
    block.chords.map((item) => item.chord.label).join(" "),
  ].some((value) => value.toLocaleLowerCase().includes(needle)));
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash;
}

function timestampForFile(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

export default App;
