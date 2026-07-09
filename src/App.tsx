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
import { parseChordLabel } from "./domain/chords";
import { filterAndSortIdeas, type IdeaFilters } from "./domain/libraryFilters";
import { monthlyStats } from "./domain/monthlyStats";
import { pickFocus } from "./domain/focus";
import type { TransitionResult } from "./domain/transition";
import type {
  AssetType,
  ChordSymbol,
  ChordTimelineItem,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
  SavedProgressionBlock,
  SongIdea,
  Status,
} from "./domain/types";
import {
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
} from "./store/closeGuard";
import { defaultVaultStore } from "./store/defaultVaultStore";

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
      setToast("MIDI解析はデスクトップ版で使えます。");
      return;
    }

    try {
      const bytes = await readFile(path);
      const result = analyzeMidiBytes(bytes, { fileName: fileNameFromPath(path) });
      setView("capture");
      setToast(result ? "MIDIを解析しました。" : "MIDI解析に失敗しました。");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "MIDIファイルを読み込めませんでした。");
    }
  }

  function requestDelete(idea: SongIdea) {
    if (!window.confirm(`「${idea.title}」を削除しますか？`)) {
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
      saveLabel={saving ? "保存中" : unsaved ? "未保存" : "保存済み"}
    />
  );

  return (
    <main className="min-h-screen bg-stone-950 text-stone-50">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6">
        {shell}
        {loadStatus === "ready" ? (
          <>
            <QuarantineNotice count={quarantine.length} />
            {view === "home" ? (
              <HomeView
                ideas={ideas}
                monthlyGoal={settings.monthlyGoal}
                openDetail={openDetail}
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
              />
            ) : null}
            {view === "detail" && !selectedIdea ? (
              <EmptyState openCreate={() => setCreateOpen(true)} />
            ) : null}
          </>
        ) : (
          <StartupState
            loadStatus={loadStatus}
            recovery={recovery}
            readonly={readonly}
            error={error}
            restoreBackup={restoreBackup}
          />
        )}
      </section>
      {isCreateOpen ? (
        <CreateDialog
          onCreate={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {isSettingsOpen ? (
        <SettingsDialog
          monthlyGoal={settings.monthlyGoal}
          backups={backups}
          error={error}
          setMonthlyGoal={setMonthlyGoal}
          refreshBackups={refreshBackups}
          restoreBackup={restoreBackup}
          exportVault={exportVault}
          importVault={importVault}
          setToast={setToast}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {pendingDelete ? (
        <div className="fixed bottom-4 left-1/2 z-40 w-[min(92vw,440px)] -translate-x-1/2 border border-stone-700 bg-stone-900 p-3 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-200">「{pendingDelete.title}」を削除します</p>
            <button className="rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-stone-950" onClick={undoDelete}>
              元に戻す
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
  saveLabel,
}: {
  view: View;
  setView: (view: View) => void;
  openCreate: () => void;
  openSettings: () => void;
  saveLabel: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-stone-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-teal-300">Loop Vault</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">次に鳴らすLoopを選ぶ。</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className={tabClass(view === "home")} onClick={() => setView("home")}>ホーム</button>
        <button className={tabClass(view === "capture")} onClick={() => setView("capture")}>MIDI解析</button>
        <button className={tabClass(view === "library")} onClick={() => setView("library")}>ライブラリ</button>
        <button className="rounded border border-stone-700 px-3 py-2 text-stone-300 hover:bg-stone-900" onClick={openSettings}>設定</button>
        <button className="rounded bg-teal-400 px-3 py-2 font-semibold text-stone-950" onClick={openCreate}>新規</button>
        <span className="min-w-20 rounded border border-stone-800 px-3 py-2 text-center text-stone-300">{saveLabel}</span>
      </div>
    </header>
  );
}

function SettingsDialog({
  monthlyGoal,
  backups,
  error,
  setMonthlyGoal,
  refreshBackups,
  restoreBackup,
  exportVault,
  importVault,
  setToast,
  onClose,
}: {
  monthlyGoal: number;
  backups: ReturnType<typeof defaultVaultStore.getState>["backups"];
  error?: string;
  setMonthlyGoal: (goal: number) => void;
  refreshBackups: () => Promise<void>;
  restoreBackup: (backupName: string) => Promise<void>;
  exportVault: (path: string) => Promise<boolean>;
  importVault: (path: string, mode: "replace" | "merge") => Promise<boolean>;
  setToast: (toast: string) => void;
  onClose: () => void;
}) {
  const [dataPath, setDataPath] = useState("デスクトップアプリのデータ保存場所");
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void appDataDir().then((path) => setDataPath(`${path}loopvault/data.json`));
  }, []);

  async function exportData() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("Exportはデスクトップ版で使えます。");
      return;
    }
    const target = await saveFileDialog({
      defaultPath: `loopvault-export-${timestampForFile(new Date())}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!target) return;
    const ok = await exportVault(target);
    setToast(ok ? "Exportしました。" : "Exportに失敗しました。");
  }

  async function importData() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("Importはデスクトップ版で使えます。");
      return;
    }
    const target = await openFileDialog({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof target !== "string") return;
    const ok = await importVault(target, importMode);
    setToast(ok ? "Importしました。" : "Importに失敗しました。");
  }

  async function openDataFolder() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("Folder reveal is available in the Tauri desktop app.");
      return;
    }
    await revealItemInDir(await appDataDir());
  }

  async function restore(name: string) {
    if (!window.confirm(`${name} を復元しますか？現在のデータは置き換わります。`)) return;
    await restoreBackup(name);
    await refreshBackups();
    setToast("バックアップを復元しました。");
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl border border-stone-700 bg-stone-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">設定</h2>
          <button className="rounded px-2 py-1 text-stone-400" onClick={onClose}>閉じる</button>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section>
            <h3 className="font-semibold">データ</h3>
            <p className="mt-2 break-all text-sm text-stone-400">{dataPath}</p>
            <button className="mt-3 rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void openDataFolder()}>フォルダを開く</button>
          </section>
          <section>
            <h3 className="font-semibold">月間ゴール</h3>
            <input
              className={`${inputClass} mt-2`}
              min={1}
              type="number"
              value={monthlyGoal}
              onChange={(event) => setMonthlyGoal(Number(event.target.value))}
            />
          </section>
          <section>
            <h3 className="font-semibold">Export</h3>
            <p className="mt-2 text-sm text-stone-400">検証済みJSONを指定した場所へ書き出します。</p>
            <button className="mt-3 rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void exportData()}>JSONを書き出す</button>
          </section>
          <section>
            <h3 className="font-semibold">Import</h3>
            <select className={`${inputClass} mt-2`} value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
              <option value="merge">マージする（新しい更新を優先）</option>
              <option value="replace">すべて置き換える</option>
            </select>
            <button className="mt-3 rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void importData()}>JSONを読み込む</button>
            {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
          </section>
        </div>
        <section className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">バックアップ</h3>
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void refreshBackups()}>更新</button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {backups.length === 0 ? <p className="text-sm text-stone-400">まだバックアップはありません。</p> : null}
            {backups.map((backup) => (
              <div key={backup.name} className="flex flex-wrap items-center justify-between gap-3 border border-stone-800 p-3 text-sm">
                <div>
                  <p className="font-medium">{backup.name}</p>
                  <p className="text-stone-500">{backup.createdAt}</p>
                </div>
                <button className="rounded border border-stone-700 px-3 py-2" onClick={() => void restore(backup.name)}>復元</button>
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
  openDetail,
  updateNextAction,
  transitionIdea,
  setToast,
}: {
  ideas: SongIdea[];
  monthlyGoal: number;
  openDetail: (id: string) => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  setToast: (toast: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const focus = pickFocus(ideas, now);
  const stats = monthlyStats(ideas, now, monthlyGoal);
  const progress = Math.min(100, (stats.doneCount / stats.goal) * 100);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function completeNext(idea: SongIdea) {
    updateNextAction(idea.id, "", new Date());
    setToast("Next Actionを完了しました。Detailで次の一手を入れられます。");
  }

  return (
    <div className="grid gap-5 py-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5">
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-stone-400">{stats.year}-{stats.month.toString().padStart(2, "0")}</p>
              <h2 className="mt-1 text-2xl font-semibold">今月の完成数</h2>
            </div>
            <p className="text-2xl font-semibold">{stats.doneCount}/{stats.goal}</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded bg-stone-800">
            <div className="h-full bg-teal-400" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm text-stone-400">残り {stats.remainingDays} 日</p>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">今日のLoop</h2>
          {focus.focus ? (
            <div className="mt-4 border border-stone-800 bg-stone-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{focus.focus.title}</p>
                  <p className="mt-1 text-sm text-stone-400">
                    {labelStatus(focus.focus.status)} {focus.focus.bpm ? ` · ${focus.focus.bpm} bpm` : ""} {focus.focus.key ? ` · ${focus.focus.key}` : ""}
                  </p>
                </div>
                <StatusBadge status={focus.focus.status} />
              </div>
              <p className="mt-4 text-sm text-stone-300">Next: {focus.focus.nextAction.text}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="rounded bg-stone-800 px-3 py-2 text-sm" onClick={() => openDetail(focus.focus!.id)}>Detailを開く</button>
                <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => completeNext(focus.focus!)}>Next完了</button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-stone-400">まだFocus候補がありません。動いているIdeaにNext Actionを入れてください。</p>
          )}
        </Panel>
      </section>

      <aside className="space-y-5">
        <Panel>
          <h2 className="text-lg font-semibold">パイプライン</h2>
          <div className="mt-4 space-y-3">
            {pipeline.map((status) => (
              <div key={status}>
                <div className="flex justify-between text-sm">
                  <span>{labelStatus(status)}</span>
                  <span className="text-stone-400">{stats.pipelineCounts[status]}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-stone-800">
                  <div className="h-2 rounded bg-cyan-400" style={{ width: `${Math.min(100, stats.pipelineCounts[status] * 18)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="text-lg font-semibold">Next Action待ち</h2>
          <IdeaList ideas={focus.needsNextAction} openDetail={openDetail} empty="動いているIdeaにはすべて次の一手があります。" />
        </Panel>
        <Panel>
          <h2 className="text-lg font-semibold">停滞中</h2>
          <div className="mt-3 space-y-2">
            {focus.stale.length === 0 ? <p className="text-sm text-stone-400">7日以上止まっているIdeaはありません。</p> : null}
            {focus.stale.map((entry) => (
              <div key={entry.idea.id} className="border border-stone-800 p-3">
                <button className="text-left font-medium" onClick={() => openDetail(entry.idea.id)}>{entry.idea.title}</button>
                <p className="mt-1 text-sm text-stone-400">{entry.idleDays}日停止 {entry.suggestHold ? " · Hold推奨" : ""}</p>
                {entry.suggestHold ? (
                  <button className="mt-2 rounded border border-stone-700 px-2 py-1 text-xs" onClick={() => {
                    const result = transitionIdea(entry.idea.id, "hold", new Date());
                    if (!result.ok) setToast(result.error.message);
                  }}>
                    Holdへ移動
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function LibraryView({
  ideas,
  openDetail,
  openCreate,
}: {
  ideas: SongIdea[];
  openDetail: (id: string) => void;
  openCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const filters: IdeaFilters = {
    query,
    statuses: status === "all" ? [] : [status],
    genres: genre ? [genre] : [],
    moods: mood ? [mood] : [],
  };
  const visible = filterAndSortIdeas(ideas, filters, { field: sort, direction: sort === "bpm" ? "asc" : "desc" });

  return (
    <div className="py-5">
      <div className="grid gap-2 border-b border-stone-800 pb-4 md:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr]">
        <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タイトル・コード・Next Actionを検索" />
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as Status | "all")}>
          <option value="all">すべてのStatus</option>
          {statuses.map((entry) => <option key={entry} value={entry}>{labelStatus(entry)}</option>)}
        </select>
        <input className={inputClass} value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Genre" />
        <input className={inputClass} value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Mood" />
        <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="updatedAt">更新日</option>
          <option value="createdAt">作成日</option>
          <option value="bpm">BPM</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState openCreate={openCreate} />
      ) : (
        <div className="grid gap-3 py-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((idea) => (
            <button key={idea.id} className="border border-stone-800 bg-stone-900 p-4 text-left hover:border-teal-400" onClick={() => openDetail(idea.id)}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{idea.title}</h2>
                <StatusBadge status={idea.status} />
              </div>
              <p className="mt-2 text-sm text-stone-400">{idea.bpm ? `${idea.bpm} bpm` : "BPM未設定"} {idea.key ? ` · ${idea.key}` : ""}</p>
              <p className="mt-4 line-clamp-2 text-sm text-stone-300">{idea.nextAction.text || "Next Action待ち"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!idea.nextAction.text.trim() ? <span className="inline-block rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-stone-950">Next待ち</span> : null}
                {(idea.progressionBlocks ?? []).length > 0 ? (
                  <span className="inline-block rounded bg-cyan-400 px-2 py-1 text-xs font-semibold text-stone-950">
                    {(idea.progressionBlocks ?? []).length} block
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-xs text-stone-500">更新 {formatDate(idea.updatedAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CaptureView({
  ideas,
  analysis,
  analyzeMidiBytes,
  clearAnalysis,
  createIdeaFromDraft,
  appendBlockToIdea,
  updateIdea,
  setToast,
}: {
  ideas: SongIdea[];
  analysis: ReturnType<typeof defaultVaultStore.getState>["analysis"];
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
  }) => string | undefined;
  appendBlockToIdea: (
    ideaId: string,
    block: ProgressionBlockCandidate,
    analysis?: MidiProgressionAnalysis,
  ) => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  setToast: (toast: string) => void;
}) {
  const [selectedIdeaId, setSelectedIdeaId] = useState("");

  async function chooseMidi() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("MIDI解析はデスクトップ版で使えます。");
      return;
    }

    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
    });
    if (typeof path !== "string") {
      return;
    }

    try {
      const bytes = await readFile(path);
      const result = analyzeMidiBytes(bytes, { fileName: fileNameFromPath(path) });
      setToast(result ? "MIDIを解析しました。" : "MIDI解析に失敗しました。");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "MIDIファイルを読み込めませんでした。");
    }
  }

  function saveNew(candidate: ProgressionBlockCandidate, title: string) {
    const id = createIdeaFromDraft({
      title,
      status: "idea",
      bpm: analysis.result?.bpm,
      key: analysis.result?.detectedKey,
      chordMemo: candidate.summaryText,
      nextAction: "Build a loop from the captured progression",
      progressionBlock: candidate,
      progressionAnalysis: analysis.result,
    });
    setToast(id ? "コード進行からIdeaを作成しました。" : "Ideaを作成できませんでした。");
  }

  function appendExisting(candidate: ProgressionBlockCandidate) {
    if (!selectedIdeaId) {
      setToast("先にIdeaを選んでください。");
      return;
    }

    appendBlockToIdea(selectedIdeaId, candidate, analysis.result);
    setToast("コード進行ブロックをIdeaへ保存しました。");
  }

  function copyMemo(candidate: ProgressionBlockCandidate) {
    if (!selectedIdeaId) {
      setToast("先にIdeaを選んでください。");
      return;
    }

    updateIdea(selectedIdeaId, { chordMemo: candidate.summaryText });
    setToast("コード進行をChord Memoへコピーしました。");
  }

  async function previewCandidate(candidate: ProgressionBlockCandidate) {
    try {
      await previewTimeline(candidate.chords, analysis.result?.bpm);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "コードを再生できませんでした。");
    }
  }

  async function previewCandidateChord(candidate: ProgressionBlockCandidate, chordIndex: number) {
    try {
      const chord = candidate.chords[chordIndex]?.chord;
      if (chord) {
        await previewSingleChord(chord);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "コードを再生できませんでした。");
    }
  }

  return (
    <div className="grid gap-5 py-5 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="space-y-5">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">MIDI解析</h2>
              <p className="mt-2 text-sm text-stone-400">
                MIDIからコードタイムラインと再利用できる候補ブロックを作ります。
              </p>
            </div>
            <div className="flex gap-2">
              <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void chooseMidi()}>
                MIDIを開く
              </button>
              <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={clearAnalysis}>
                クリア
              </button>
            </div>
          </div>
          {analysis.status === "analyzing" ? <p className="mt-4 text-sm text-stone-300">Analyzing...</p> : null}
          {analysis.status === "error" ? <p className="mt-4 text-sm text-red-200">{analysis.error}</p> : null}
          {analysis.result ? (
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
              <Metric label="ファイル" value={analysis.result.fileName ?? "MIDI"} />
              <Metric label="小節数" value={analysis.result.totalBars.toString()} />
              <Metric label="BPM" value={analysis.result.bpm ? Math.round(analysis.result.bpm).toString() : "Unknown"} />
              <Metric label="拍子" value={analysis.result.timeSignature ?? "不明"} />
            </div>
          ) : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">コードタイムライン</h2>
          {analysis.result ? (
            <div className="mt-4 max-h-[30rem] overflow-y-auto pr-1">
              <div className="grid gap-2">
                {analysis.result.fullTimeline.map((item, index) => (
                  <div key={`${item.bar}-${item.beat}-${index}`} className="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-3 border border-stone-800 p-2 text-sm">
                    <span className="text-stone-400">{item.bar}小節.{formatBeat(item.beat)}</span>
                    <span className="font-semibold text-stone-100">{item.chord.label}</span>
                    <span className="text-right text-stone-400">{Math.round(item.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-400">MIDIを開くと、全体のコードタイムラインが表示されます。</p>
          )}
        </Panel>
      </section>

      <section className="space-y-5">
        <Panel>
          <h2 className="text-xl font-semibold">保存先</h2>
          <select className={`${inputClass} mt-3`} value={selectedIdeaId} onChange={(event) => setSelectedIdeaId(event.target.value)}>
            <option value="">既存Ideaを選ぶ</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>{idea.title}</option>
            ))}
          </select>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">候補ブロック</h2>
            {analysis.result ? <span className="text-sm text-stone-400">{analysis.result.blockCandidates.length}件</span> : null}
          </div>
          {analysis.result ? (
            <div className="mt-4 space-y-3">
              {analysis.result.blockCandidates.map((candidate) => (
                <ProgressionCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  onCreate={saveNew}
                  onAppend={appendExisting}
                  onCopyMemo={copyMemo}
                  onPreview={previewCandidate}
                  onPreviewChord={previewCandidateChord}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-stone-400">4/8/16小節の候補がここに表示されます。</p>
          )}
        </Panel>
      </section>
    </div>
  );
}

function ProgressionCandidateCard({
  candidate,
  onCreate,
  onAppend,
  onCopyMemo,
  onPreview,
  onPreviewChord,
}: {
  candidate: ProgressionBlockCandidate;
  onCreate: (candidate: ProgressionBlockCandidate, title: string) => void;
  onAppend: (candidate: ProgressionBlockCandidate) => void;
  onCopyMemo: (candidate: ProgressionBlockCandidate) => void;
  onPreview: (candidate: ProgressionBlockCandidate) => void | Promise<void>;
  onPreviewChord: (
    candidate: ProgressionBlockCandidate,
    chordIndex: number,
  ) => void | Promise<void>;
}) {
  const [summary, setSummary] = useState(candidate.summaryText);
  const [title, setTitle] = useState(`コード進行 ${candidate.labels.slice(0, 4).join(" - ")}`);
  const [chords, setChords] = useState(candidate.chords);
  const [labelError, setLabelError] = useState<string>();
  const editedCandidate = {
    ...candidate,
    summaryText: summary,
    chords,
    labels: [...new Set(chords.map((item) => item.chord.label))],
  };

  useEffect(() => {
    setSummary(candidate.summaryText);
    setTitle(`コード進行 ${candidate.labels.slice(0, 4).join(" - ")}`);
    setChords(candidate.chords);
    setLabelError(undefined);
  }, [candidate]);

  function updateChordLabel(index: number, label: string) {
    const parsed = parseChordLabel(label);
    if (!parsed) {
      setLabelError(`未対応のコード表記です: ${label}`);
      return;
    }

    setLabelError(undefined);
    setChords((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, chord: parsed } : item,
      ),
    );
  }

  return (
    <div className="border border-stone-800 bg-stone-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{candidate.startBar}-{candidate.endBar}小節 ({candidate.lengthBars})</p>
          <p className="mt-1 text-sm text-stone-400">信頼度 {Math.round(candidate.confidence * 100)}%</p>
        </div>
        <span className="rounded bg-stone-800 px-2 py-1 text-xs text-teal-200">{candidate.labels.join(" - ")}</span>
      </div>
      <textarea className={`${inputClass} mt-3 min-h-20`} value={summary} onChange={(event) => setSummary(event.target.value)} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {chords.map((item, index) => (
          <div key={`${item.bar}-${item.beat}-${index}`} className="grid grid-cols-[1fr_auto] gap-2">
            <input
              className={inputClass}
              defaultValue={item.chord.label}
              onBlur={(event) => updateChordLabel(index, event.target.value)}
              aria-label={`Bar ${item.bar} のコード`}
            />
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void onPreviewChord(editedCandidate, index)}>
              ▶
            </button>
          </div>
        ))}
      </div>
      {labelError ? <p className="mt-2 text-xs text-red-200">{labelError}</p> : null}
      <input className={`${inputClass} mt-2`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="新規Ideaのタイトル" />
      {candidate.warnings.length > 0 ? (
        <p className="mt-2 text-xs text-amber-200">{candidate.warnings.join("; ")}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void onPreview(editedCandidate)}>
          試聴
        </button>
        <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => onCreate(editedCandidate, title)}>
          新規Idea
        </button>
        <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => onAppend(editedCandidate)}>
          選択中に追加
        </button>
        <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => onCopyMemo(editedCandidate)}>
          メモへコピー
        </button>
      </div>
    </div>
  );
}

function ProgressionBlockCard({
  block,
  onPreview,
  onRemove,
}: {
  block: SavedProgressionBlock;
  onPreview: () => void;
  onRemove: () => void;
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
          試聴
        </button>
        <button className="rounded border border-stone-700 px-2 py-1 text-stone-300" onClick={onRemove}>
          削除
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {block.chords.map((item, index) => (
          <span key={`${item.bar}-${item.beat}-${index}`} className="rounded bg-stone-800 px-2 py-1 text-xs text-stone-200">
            {item.chord.label}
          </span>
        ))}
      </div>
      {block.memo ? <p className="mt-3 text-xs text-amber-200">{block.memo}</p> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-800 bg-stone-950 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-stone-100">{value}</p>
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
}: {
  idea: SongIdea;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  removeProgressionBlock: (ideaId: string, blockId: string) => void;
  analyzeMidiPath: (path: string) => Promise<void>;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  requestDelete: (idea: SongIdea) => void;
  setToast: (toast: string) => void;
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
    setToast("Next Actionを完了しました。次が見えたらまた追加できます。");
  }

  function updateMeta(changes: Partial<SongIdea>) {
    updateIdea(idea.id, changes);
  }

  function moveStatus(to: Status) {
    if (to === "abandoned" && !window.confirm("このIdeaを破棄しますか？")) return;
    if (to === "hold") window.prompt("Hold理由（任意）");
    if (pipeline.includes(to) && idea.nextAction.text.trim() && to !== idea.status) {
      const keep = window.confirm("現在のNext Actionを次のステージへ持ち越しますか？");
      if (!keep) {
        updateNextAction(idea.id, "", new Date());
      }
    }
    const result = transitionIdea(idea.id, to, new Date());
    if (!result.ok) setToast(result.error.message);
    if (result.ok && to === "done") setToast("Done。完成として記録しました。");
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
      setToast("ファイル選択はデスクトップ版で使えます。");
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
      setToast("この拡張子は直接開けません。フォルダ表示を使ってください。");
      return;
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("ファイルを開く操作はデスクトップ版で使えます。");
      return;
    }
    try {
      await openPath(asset.path);
    } catch {
      updateMeta({ assets: idea.assets.map((entry) => entry.id === asset.id ? { ...entry, missing: true } : entry) });
      setToast("ファイルを開けませんでした。missingとして記録しました。");
    }
  }

  async function showAsset(asset: Asset) {
    if (!asset.path) return;
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("フォルダ表示はデスクトップ版で使えます。");
      return;
    }
    await revealItemInDir(asset.path);
  }

  async function replaceAssetPath(asset: Asset) {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast("ファイル選択はデスクトップ版で使えます。");
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
      setToast("Assetのパスを更新しました。");
    }
  }

  async function previewSavedBlock(block: SavedProgressionBlock) {
    try {
      await previewTimeline(block.chords, block.bpm ?? idea.bpm);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "コードを再生できませんでした。");
    }
  }

  return (
    <div className="grid gap-5 py-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-5">
        <Panel>
          <div className="flex items-start justify-between gap-4">
            <input className="w-full bg-transparent text-2xl font-semibold outline-none" value={idea.title} onChange={(event) => updateMeta({ title: event.target.value.slice(0, 80) })} />
            <StatusBadge status={idea.status} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button key={status} className={statusButtonClass(status === idea.status)} onClick={() => moveStatus(status)}>
                {labelStatus(status)}
              </button>
            ))}
          </div>
          <button className="mt-5 rounded border border-red-500/50 px-3 py-2 text-sm text-red-200" onClick={() => requestDelete(idea)}>削除</button>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">Next Action</h2>
          <textarea className={`${inputClass} mt-3 min-h-28`} value={nextDraft} onChange={(event) => setNextDraft(event.target.value)} onBlur={saveNext} placeholder={placeholder} />
          <div className="mt-3 flex gap-2">
            <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={saveNext}>更新</button>
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={completeNext}>完了</button>
          </div>
          {!idea.nextAction.text.trim() ? <p className="mt-3 text-sm text-amber-200">次にやることを1つだけ入れてください。</p> : null}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">メタ情報</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={inputClass} type="number" min={40} max={300} value={idea.bpm ?? ""} onChange={(event) => updateMeta({ bpm: event.target.value ? Number(event.target.value) : undefined })} placeholder="BPM" />
            <input className={inputClass} list="key-options" value={idea.key ?? ""} onChange={(event) => updateMeta({ key: event.target.value || undefined })} placeholder="Key" />
            <datalist id="key-options">{keySuggestions.map((key) => <option key={key} value={key} />)}</datalist>
            <input className={inputClass} value={idea.genre ?? ""} onChange={(event) => updateMeta({ genre: event.target.value || undefined })} placeholder="Genre" />
            <input className={inputClass} value={idea.moods.join(", ")} onChange={(event) => updateMeta({ moods: splitList(event.target.value) })} placeholder="Mood（カンマ区切り）" />
          </div>
          <textarea className={`${inputClass} mt-3 min-h-28`} value={idea.chordMemo} onChange={(event) => updateMeta({ chordMemo: event.target.value })} placeholder="コード進行メモ" />
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">保存したコード進行</h2>
          {(idea.progressionBlocks ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">まだMIDIから保存したコード進行はありません。</p>
          ) : (
            <div className="mt-4 space-y-3">
              {(idea.progressionBlocks ?? []).map((block) => (
                <ProgressionBlockCard
                  key={block.id}
                  block={block}
                  onPreview={() => void previewSavedBlock(block)}
                  onRemove={() => removeProgressionBlock(idea.id, block.id)}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="space-y-5">
        <Panel>
          <h2 className="text-xl font-semibold">参考曲・参照</h2>
          <form className="mt-3 grid gap-2" onSubmit={addReference}>
            <input className={inputClass} value={referenceDraft.title} onChange={(event) => setReferenceDraft({ ...referenceDraft, title: event.target.value })} placeholder="Title" />
            <input className={inputClass} value={referenceDraft.url ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, url: event.target.value })} placeholder="URL" />
            <input className={inputClass} value={referenceDraft.memo ?? ""} onChange={(event) => setReferenceDraft({ ...referenceDraft, memo: event.target.value })} placeholder="Memo" />
            <button className="rounded bg-stone-800 px-3 py-2 text-sm" type="submit">参考を追加</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.references.map((reference, index) => (
              <div key={`${reference.title}-${index}`} className="border border-stone-800 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{reference.title}</p>
                  <button className="text-stone-400" onClick={() => removeReference(index)}>削除</button>
                </div>
                {reference.url ? <p className="mt-1 break-all text-stone-400">{reference.url}</p> : null}
                {reference.memo ? <p className="mt-1 text-stone-300">{reference.memo}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">Assets</h2>
          <form className="mt-3 grid gap-2" onSubmit={addAsset}>
            <div className="grid gap-2 sm:grid-cols-[0.4fr_1fr_auto]">
              <select className={inputClass} value={assetDraft.type} onChange={(event) => setAssetDraft({ ...assetDraft, type: event.target.value as AssetType })}>
                <option value="flp">FLP</option>
                <option value="midi">MIDI</option>
                <option value="audio">Audio</option>
                <option value="other">Other</option>
              </select>
              <input className={inputClass} value={assetDraft.path ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, path: event.target.value })} placeholder="絶対パス" />
              <button className="rounded border border-stone-700 px-3 py-2 text-sm" type="button" onClick={() => void chooseAssetPath()}>選択</button>
            </div>
            <input className={inputClass} value={assetDraft.memo ?? ""} onChange={(event) => setAssetDraft({ ...assetDraft, memo: event.target.value })} placeholder="Memo" />
            <button className="rounded bg-stone-800 px-3 py-2 text-sm" type="submit">Assetを追加</button>
          </form>
          <div className="mt-4 space-y-2">
            {idea.assets.map((asset) => (
              <div key={asset.id} className={`border p-3 text-sm ${asset.missing ? "border-red-500/60 bg-red-950/20" : "border-stone-800"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium uppercase text-stone-300">{asset.type}</p>
                  <div className="flex gap-2">
                    {asset.type === "midi" && asset.path ? (
                      <button className="rounded border border-cyan-500/60 px-2 py-1 text-cyan-100" onClick={() => void analyzeMidiPath(asset.path!)}>
                        解析
                      </button>
                    ) : null}
                    <button
                      className="rounded border border-stone-700 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canOpenAssetPath(asset.path)}
                      onClick={() => void openAsset(asset)}
                    >
                      開く
                    </button>
                    <button className="rounded border border-stone-700 px-2 py-1" onClick={() => void showAsset(asset)}>フォルダ</button>
                    {asset.missing ? (
                      <button className="rounded border border-amber-500/60 px-2 py-1 text-amber-100" onClick={() => void replaceAssetPath(asset)}>
                        パス修正
                      </button>
                    ) : null}
                    <button className="rounded border border-stone-700 px-2 py-1" onClick={() => removeAsset(asset.id)}>削除</button>
                  </div>
                </div>
                <p className="mt-2 break-all text-stone-400">{asset.path || "パス未設定"}</p>
                {!canOpenAssetPath(asset.path) && asset.path ? <p className="mt-2 text-xs text-amber-200">この拡張子は直接Openできません。フォルダから確認してください。</p> : null}
                {asset.missing ? <p className="mt-2 text-xs text-red-200">ファイルを開けませんでした。パスを修正するか削除してください。</p> : null}
                {asset.memo ? <p className="mt-2 text-stone-300">{asset.memo}</p> : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold">履歴</h2>
          <div className="mt-3 space-y-2">
            {idea.statusHistory.map((entry, index) => (
              <div key={`${entry.status}-${entry.at}-${index}`} className="flex justify-between border-b border-stone-800 pb-2 text-sm">
                <span>{labelStatus(entry.status)}</span>
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
}: {
  onCreate: (title: string, status: Status) => void;
  onClose: () => void;
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
          <h2 className="text-xl font-semibold">新規Idea</h2>
          <button type="button" className="rounded px-2 py-1 text-stone-400" onClick={onClose}>閉じる</button>
        </div>
        <input autoFocus className={`${inputClass} mt-4`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="タイトル" />
        <select className={`${inputClass} mt-3`} value={status} onChange={(event) => setStatus(event.target.value as Status)}>
          {pipeline.map((entry) => <option key={entry} value={entry}>{labelStatus(entry)}</option>)}
        </select>
        <button className="mt-4 w-full rounded bg-teal-400 px-3 py-2 font-semibold text-stone-950" type="submit">作成</button>
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
}: {
  loadStatus: string;
  recovery: ReturnType<typeof defaultVaultStore.getState>["recovery"];
  readonly: ReturnType<typeof defaultVaultStore.getState>["readonly"];
  error?: string;
  restoreBackup: (backupName: string) => Promise<void>;
}) {
  return (
    <div className="grid flex-1 place-items-center py-10">
      <Panel className="w-full max-w-2xl">
        {loadStatus === "loading" || loadStatus === "idle" ? <StatusPanel title="Vaultを読み込み中" body="ローカルのdata.jsonを確認しています。" /> : null}
        {loadStatus === "recovery" && recovery ? (
          <div>
            <StatusPanel title="データ復旧が必要です" body="壊れたファイルは退避しました。空データで上書きしていません。" />
            {recovery.corruptPath ? <p className="mt-3 break-all text-sm text-stone-400">{recovery.corruptPath}</p> : null}
            <div className="mt-5 space-y-2">
              {recovery.backups.length > 0 ? recovery.backups.map((backup) => (
                <button key={backup.name} className="block w-full rounded border border-stone-700 px-3 py-2 text-left text-sm hover:bg-stone-800" onClick={() => void restoreBackup(backup.name)}>
                  {backup.name} を復元
                </button>
              )) : <p className="text-sm text-stone-400">利用できるバックアップはまだありません。</p>}
            </div>
          </div>
        ) : null}
        {loadStatus === "readonly" && readonly ? <StatusPanel title="Loop Vaultを更新してください" body={readonly.fileVersion ? `このdata.jsonは fileVersion ${readonly.fileVersion} です。このアプリより新しい形式です。` : readonly.message} /> : null}
        {loadStatus === "error" ? <StatusPanel title="Vaultを読み込めませんでした" body={error ?? "不明な起動エラーです。"} /> : null}
      </Panel>
    </div>
  );
}

function QuarantineNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="mt-4 border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      不正なレコード {count} 件を隔離しました。正常なIdeaは読み込まれています。
    </div>
  );
}

function EmptyState({ openCreate }: { openCreate: () => void }) {
  return (
    <div className="grid min-h-96 place-items-center py-10">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold">まだIdeaがありません</h2>
        <button className="mt-5 rounded bg-teal-400 px-4 py-2 font-semibold text-stone-950" onClick={openCreate}>Ideaを作成</button>
      </div>
    </div>
  );
}

function IdeaList({ ideas, openDetail, empty }: { ideas: SongIdea[]; openDetail: (id: string) => void; empty: string }) {
  if (ideas.length === 0) return <p className="mt-3 text-sm text-stone-400">{empty}</p>;
  return (
    <div className="mt-3 space-y-2">
      {ideas.map((idea) => (
        <button key={idea.id} className="block w-full border border-stone-800 p-3 text-left hover:border-teal-400" onClick={() => openDetail(idea.id)}>
          <span className="font-medium">{idea.title}</span>
          <span className="ml-2 text-sm text-stone-400">{labelStatus(idea.status)}</span>
        </button>
      ))}
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

function StatusBadge({ status }: { status: Status }) {
  return <span className="shrink-0 rounded bg-stone-800 px-2 py-1 text-xs font-semibold uppercase text-teal-200">{labelStatus(status)}</span>;
}

function labelStatus(status: Status): string {
  const labels: Record<Status, string> = {
    idea: "Idea",
    loop: "Loop",
    arrange: "Arrange",
    mix: "Mix",
    done: "Done",
    hold: "保留",
    abandoned: "破棄",
  };
  return labels[status];
}

function tabClass(active: boolean): string {
  return active ? "rounded bg-stone-800 px-3 py-2 text-stone-50" : "rounded px-3 py-2 text-stone-300 hover:bg-stone-900";
}

function statusButtonClass(active: boolean): string {
  return active ? "rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" : "rounded border border-stone-700 px-3 py-2 text-sm text-stone-300";
}

const inputClass = "w-full rounded border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus:border-teal-400";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function formatBeat(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

async function previewSingleChord(chord: ChordSymbol): Promise<void> {
  const { previewChord } = await import("./audio/chordPreview");
  await previewChord(chord);
}

async function previewTimeline(
  chords: readonly ChordTimelineItem[],
  bpm?: number,
): Promise<void> {
  const { previewChordTimeline } = await import("./audio/chordPreview");
  await previewChordTimeline(chords, bpm);
}

function splitList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
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
