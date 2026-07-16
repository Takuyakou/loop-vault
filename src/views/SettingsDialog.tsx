import { appDataDir } from "@tauri-apps/api/path";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import type { AppCopy, AppLanguage } from "../i18n";
import { defaultVaultStore } from "../store/defaultVaultStore";
import {
  deleteAnalysisFeedback,
  isAnalysisFeedbackEnabled,
  setAnalysisFeedbackEnabled,
} from "../storage/analysisFeedbackStorage";
import type { SongIdea } from "../domain/types";
import {
  deleteDifferenceReviews,
  deletePromotedCorrections,
  deleteRealEvaluationData,
  openRealEvaluationFolder,
  rebuildLocalMidiSourceIndex,
} from "../storage/realEvaluationStorage";

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";
async function writeClipboardText(text: string): Promise<void> { if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available."); await navigator.clipboard.writeText(text); }
function timestampForFile(date: Date): string { const year = date.getFullYear(); const month = (date.getMonth() + 1).toString().padStart(2, "0"); const day = date.getDate().toString().padStart(2, "0"); const hour = date.getHours().toString().padStart(2, "0"); const minute = date.getMinutes().toString().padStart(2, "0"); return year + month + day + "-" + hour + minute; }

interface PendingConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
}

export function SettingsDialog({
  monthlyGoal,
  language,
  showRomanNumerals,
  ideas,
  backups,
  error,
  setMonthlyGoal,
  setLanguage,
  setShowRomanNumerals,
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
  showRomanNumerals: boolean;
  ideas: SongIdea[];
  backups: ReturnType<typeof defaultVaultStore.getState>["backups"];
  error?: string;
  setMonthlyGoal: (goal: number) => void;
  setLanguage: (language: AppLanguage) => void;
  setShowRomanNumerals: (show: boolean) => void;
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
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(isAnalysisFeedbackEnabled);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>();
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const confirmationLockRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

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
    const runImport = async () => {
      const ok = await importVault(target, importMode);
      setToast(ok ? copy.toast.imported : copy.toast.importFailed);
    };
    if (importMode === "replace") {
      setPendingConfirmation({
        title: language === "ja" ? "Vaultを置き換え" : "Replace Vault",
        description: language === "ja"
          ? "現在のVaultを選択したファイルの内容で置き換えます。この操作を続けますか？"
          : "Replace the current Vault with the selected file?",
        confirmLabel: language === "ja" ? "置き換える" : "Replace",
        action: runImport,
      });
      return;
    }
    await runImport();
  }

  async function openDataFolder() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.folderDesktopOnly);
      return;
    }
    await revealItemInDir(await appDataDir());
  }

  async function copyDataPath() {
    try {
      await writeClipboardText(dataPath);
      setToast(language === "ja" ? "データ保存先をコピーしました。" : "Copied the data location.");
    } catch (copyError) {
      setToast(copyError instanceof Error ? copyError.message : (language === "ja" ? "保存先をコピーできませんでした。" : "Could not copy the data location."));
    }
  }

  function restore(name: string) {
    setPendingConfirmation({
      title: language === "ja" ? "バックアップを復元" : "Restore backup",
      description: copy.settings.restoreConfirm(name),
      confirmLabel: copy.common.restore,
      action: async () => {
        await restoreBackup(name);
        await refreshBackups();
        setToast(copy.toast.restoreDone);
      },
    });
  }

  function updateFeedbackEnabled(enabled: boolean) {
    setFeedbackEnabled(enabled);
    setAnalysisFeedbackEnabled(enabled);
  }

  function clearFeedback() {
    setPendingConfirmation({
      title: language === "ja" ? "修正ログを削除" : "Delete correction log",
      description: language === "ja" ? "このPCに保存した解析修正ログを削除しますか？" : "Delete the analysis correction log stored on this PC?",
      confirmLabel: copy.common.delete,
      action: async () => {
        await deleteAnalysisFeedback();
        setToast(language === "ja" ? "解析修正ログを削除しました。" : "Deleted the analysis correction log.");
      },
    });
  }

  async function runEvaluationAction(action: () => Promise<void>, successJa: string, successEn: string) {
    try {
      await action();
      setToast(language === "ja" ? successJa : successEn);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : (language === "ja" ? "操作に失敗しました。" : "The operation failed."));
    }
  }

  function confirmEvaluationDeletion(
    action: () => Promise<void>,
    titleJa: string,
    titleEn: string,
    successJa: string,
    successEn: string,
  ) {
    const title = language === "ja" ? titleJa : titleEn;
    setPendingConfirmation({
      title,
      description: language === "ja" ? `${title}。この操作は元に戻せません。続けますか？` : `${title}. This cannot be undone. Continue?`,
      confirmLabel: copy.common.delete,
      action: () => runEvaluationAction(action, successJa, successEn),
    });
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation || confirmationLockRef.current) return;
    confirmationLockRef.current = true;
    setConfirmationBusy(true);
    try {
      await pendingConfirmation.action();
      setPendingConfirmation(undefined);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : (language === "ja" ? "操作に失敗しました。" : "The operation failed."));
    } finally {
      confirmationLockRef.current = false;
      setConfirmationBusy(false);
    }
  }

  async function rebuildSourceIndex() {
    try {
      const count = await rebuildLocalMidiSourceIndex(ideas);
      setToast(language === "ja" ? `source indexを再構築しました（${count}件）。` : `Rebuilt the source index (${count} entries).`);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : (language === "ja" ? "source indexを再構築できませんでした。" : "Could not rebuild the source index."));
    }
  }

  return (
    <>
      <Modal
        ariaLabelledBy="settings-dialog-title"
        initialFocusRef={closeRef}
        onClose={onClose}
        panelClassName="w-full max-w-4xl p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="settings-dialog-title" className="text-xl font-semibold">{copy.settings.title}</h2>
          <button ref={closeRef} className="rounded px-2 py-1 text-[var(--lv-text-muted)]" onClick={onClose}>{copy.common.close}</button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">{language === "ja" ? "一般" : "General"}</p>
            <h3 className="mt-2 font-semibold">{copy.settings.language}</h3>
            <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{copy.settings.languageHelp}</p>
            <select
              className={`${inputClass} mt-3`}
              value={language}
              onChange={(event) => setLanguage(event.target.value as AppLanguage)}
            >
              <option value="ja">{copy.settings.japanese}</option>
              <option value="en">{copy.settings.english}</option>
            </select>
          </section>
          <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">{language === "ja" ? "制作" : "Creation"}</p>
            <h3 className="font-semibold">{copy.settings.monthlyGoal}</h3>
            <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{language === "ja" ? "ステータスを「完成」にしたネタを月ごとにカウントします。" : "Counts ideas moved to Done each month."}</p>
            <input
              className={`${inputClass} mt-2`}
              min={1}
              type="number"
              value={monthlyGoal}
              onChange={(event) => setMonthlyGoal(Number(event.target.value))}
            />
            <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-[var(--lv-border)] pt-4 text-sm">
              <input className="mt-1" type="checkbox" checked={showRomanNumerals} onChange={(event) => setShowRomanNumerals(event.target.checked)} />
              <span><strong className="block text-[var(--lv-text-secondary)]">{language === "ja" ? "コードカードに度数を表示" : "Show degrees on chord cards"}</strong><span className="mt-1 block text-[var(--lv-text-muted)]">{language === "ja" ? "キーが分かる場合、コード名の下に I / ii / V などの相対度数を表示します。" : "When a key is available, show relative degrees such as I, ii, and V."}</span></span>
            </label>
          </section>
          <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">{copy.settings.data}</p>
            <h3 className="mt-2 font-semibold">{language === "ja" ? "データ保存先" : "Data location"}</h3>
            <p className="mt-2 break-all text-sm text-[var(--lv-text-muted)]">{dataPath}</p>
            <div className="mt-3 flex flex-wrap gap-2"><button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void openDataFolder()}>{copy.settings.openFolder}</button><button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void copyDataPath()}>{language === "ja" ? "パスをコピー" : "Copy path"}</button></div>
            <div className="mt-5 border-t border-[var(--lv-border)] pt-4"><h4 className="font-medium">{copy.settings.exportTitle}</h4><p className="mt-1 text-sm text-[var(--lv-text-muted)]">{copy.settings.exportDescription}</p><button className="mt-3 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void exportData()}>{copy.settings.exportButton}</button></div>
          </section>
          <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
            <h3 className="font-semibold">{copy.settings.importTitle}</h3>
            <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{language === "ja" ? "バックアップファイルを読み込みます。置き換えは現在のデータをすべて入れ替えます。" : "Load a backup file. Replace swaps out the current vault."}</p>
            <select className={`${inputClass} mt-2`} value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
              <option value="merge">{copy.settings.importMerge}</option>
              <option value="replace">{copy.settings.importReplace}</option>
            </select>
            <button className="mt-3 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void importData()}>{copy.settings.importButton}</button>
            {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
          </section>
        </div>
        <section className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{copy.settings.backups}</h3>
            <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void refreshBackups()}>{copy.common.update}</button>
          </div>
          <div className="mt-3 space-y-2">
            {backups.length === 0 ? <p className="text-sm text-[var(--lv-text-muted)]">{copy.settings.noBackups}</p> : null}
            {(showAllBackups ? backups : backups.slice(0, 5)).map((backup) => (
              <div key={backup.name} className="flex flex-wrap items-center justify-between gap-3 border border-[var(--lv-border)] p-3 text-sm">
                <div>
                  <p className="font-medium">{backup.name}</p>
                  <p className="text-[var(--lv-text-muted)]">{backup.createdAt}</p>
                </div>
                <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void restore(backup.name)}>{copy.common.restore}</button>
              </div>
            ))}
          </div>
          {backups.length > 5 ? <button className="mt-3 text-sm text-teal-200 hover:underline" onClick={() => setShowAllBackups((value) => !value)}>{showAllBackups ? (language === "ja" ? "最新5件のみ表示" : "Show latest 5") : (language === "ja" ? "すべて表示" : "Show all")}</button> : null}
        </section>
        <section className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
            {language === "ja" ? "MIDI解析" : "MIDI analysis"}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input
              className="mt-1"
              type="checkbox"
              checked={feedbackEnabled}
              onChange={(event) => updateFeedbackEnabled(event.target.checked)}
            />
            <span>
              <strong className="block text-[var(--lv-text-secondary)]">
                {language === "ja" ? "解析修正ログをローカル保存" : "Store analysis corrections locally"}
              </strong>
              <span className="mt-1 block text-[var(--lv-text-muted)]">
                {language === "ja"
                  ? "コード検出を直した履歴だけをこのPC内に保存します。MIDI本体、ファイルパス、アイデア名、メモは保存しません。"
                  : "Stores only explicit chord corrections on this PC. MIDI data, file paths, idea titles, and notes are not stored."}
              </span>
            </span>
          </label>
          <button
            className="mt-4 rounded border border-red-400/50 px-3 py-2 text-red-100"
            onClick={() => void clearFeedback()}
          >
            {language === "ja" ? "修正ログを削除" : "Delete correction log"}
          </button>
        </section>
        <section className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
            {language === "ja" ? "実MIDI評価（開発用）" : "Real MIDI evaluation (developer)"}
          </p>
          <p className="mt-2 text-[var(--lv-text-muted)]">
            {language === "ja" ? "評価ケースとレビュー履歴はVault本体とは別のローカル領域に保存されます。" : "Evaluation cases and review history are stored locally, separately from the Vault."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void runEvaluationAction(openRealEvaluationFolder, "評価データの保存先を開きました。", "Opened the evaluation data folder.")}>{language === "ja" ? "保存先を開く" : "Open folder"}</button>
            <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void rebuildSourceIndex()}>{language === "ja" ? "source indexを再構築" : "Rebuild source index"}</button>
            <button className="rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={() => confirmEvaluationDeletion(deleteDifferenceReviews, "差分レビュー履歴を削除", "Delete difference reviews", "差分レビュー履歴を削除しました。", "Deleted difference review history.")}>{language === "ja" ? "レビュー履歴を削除" : "Delete reviews"}</button>
            <button className="rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={() => confirmEvaluationDeletion(deletePromotedCorrections, "修正ログ昇格データを削除", "Delete promoted corrections", "修正ログ昇格データを削除しました。", "Deleted promoted correction data.")}>{language === "ja" ? "昇格データを削除" : "Delete promoted data"}</button>
            <button className="rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={() => confirmEvaluationDeletion(deleteRealEvaluationData, "実MIDI評価データを削除", "Delete real MIDI evaluation data", "実MIDI評価データを削除しました。", "Deleted real MIDI evaluation data.")}>{language === "ja" ? "評価データを削除" : "Delete evaluation data"}</button>
          </div>
        </section>
        <section className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">{language === "ja" ? "情報" : "Info"}</p>
          <div className="mt-3 grid gap-2 text-[var(--lv-text-muted)] sm:grid-cols-3"><p>Loop Vault</p><p>{language === "ja" ? "アプリ形式: 1" : "App format: 1"}</p><p>{language === "ja" ? "データ形式: 1" : "Data format: 1"}</p></div>
        </section>
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title ?? ""}
        description={pendingConfirmation?.description ?? ""}
        confirmLabel={pendingConfirmation?.confirmLabel ?? copy.common.update}
        cancelLabel={copy.common.cancel}
        onCancel={() => setPendingConfirmation(undefined)}
        onConfirm={() => void confirmPendingAction()}
        tone="danger"
        busy={confirmationBusy}
      />
    </>
  );
}
