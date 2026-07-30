import { appDataDir } from "@tauri-apps/api/path";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LiveMidiSettingsSection } from "../components/LiveMidiSettingsSection";
import { LlmSettingsSection } from "../components/progression-advisor/LlmSettingsSection";
import { Modal } from "../components/Modal";
import type { SongIdea } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";
import { defaultVaultStore } from "../store/defaultVaultStore";
import {
  deleteAnalysisFeedback,
  exportAnalysisFeedback,
  isAnalysisFeedbackEnabled,
  setAnalysisFeedbackEnabled,
} from "../storage/analysisFeedbackStorage";
import {
  deleteLabelCorrectionLog,
  exportLabelCorrectionLog,
} from "../storage/labelCorrectionLogStorage";
import {
  deleteRoleCorrectionLog,
  exportRoleCorrectionLog,
} from "../storage/roleCorrectionLogStorage";
import {
  deleteDifferenceReviews,
  deletePromotedCorrections,
  deleteRealEvaluationData,
  openRealEvaluationFolder,
  rebuildLocalMidiSourceIndex,
} from "../storage/realEvaluationStorage";
import {
  analysisProfileFeatureDefaults,
  getAccuracyFirstFeatureFlags,
  getAnalysisProfileSettings,
  setAccuracyFirstFeatureFlags,
  setAnalysisProfile,
  type AnalysisProfile,
} from "../storage/accuracyFirstSettings";
import {
  getPreAnalysisSourceSelectionSettings,
  setPreAnalysisSourceSelectionSettings,
} from "../storage/preAnalysisSettings";
import { Copy, Download, FolderOpen, RotateCcw, Trash2, Upload } from "lucide-react";
import type { StoreApi } from "zustand/vanilla";
import type { LiveMidiStoreState } from "../liveMidi/liveMidiStore";
import { loopVaultBuildInfo } from "../buildInfo";

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available.");
  await navigator.clipboard.writeText(text);
}

function timestampForFile(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

interface PendingConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<void>;
}

interface SettingsDialogProps {
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
  liveMidiStore?: StoreApi<LiveMidiStoreState>;
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
  liveMidiStore,
}: SettingsDialogProps) {
  const ui = copy.settingsUi;
  const [dataPath, setDataPath] = useState<string>(ui.dataPathFallback);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(isAnalysisFeedbackEnabled);
  const [analysisProfile, setAnalysisProfileState] = useState(
    () => getAnalysisProfileSettings().profile,
  );
  const [accuracyFirst, setAccuracyFirst] = useState(getAccuracyFirstFeatureFlags);
  const [preAnalysisSettings, setPreAnalysisSettings] = useState(
    getPreAnalysisSourceSelectionSettings,
  );
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>();
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [dataOperation, setDataOperation] = useState<"export" | "import">();
  const confirmationLockRef = useRef(false);
  const dataOperationLockRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setDataPath(ui.dataPathFallback);
      return;
    }
    void appDataDir().then((path) => setDataPath(`${path}loopvault/data.json`));
  }, [ui.dataPathFallback]);

  async function runDataOperation<T>(
    operation: "export" | "import",
    action: () => Promise<T>,
  ): Promise<T | undefined> {
    if (dataOperationLockRef.current) return undefined;
    dataOperationLockRef.current = true;
    setDataOperation(operation);
    try {
      return await action();
    } catch (operationError) {
      setToast(operationError instanceof Error ? operationError.message : ui.operationFailed);
      return undefined;
    } finally {
      dataOperationLockRef.current = false;
      setDataOperation(undefined);
    }
  }

  async function exportData() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(ui.exportDesktopOnly);
      return;
    }
    const ok = await runDataOperation("export", async () => {
      const target = await saveFileDialog({
        defaultPath: `loopvault-export-${timestampForFile(new Date())}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!target) return undefined;
      return exportVault(target);
    });
    if (ok === undefined) return;
    setToast(ok ? ui.exported : ui.exportFailed);
  }

  async function importData() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(ui.importDesktopOnly);
      return;
    }
    const target = await runDataOperation("import", () => openFileDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      }),
    );
    if (typeof target !== "string") return;
    const runImport = async () => {
      const ok = await runDataOperation(
        "import",
        () => importVault(target, importMode),
      );
      if (ok === undefined) return;
      setToast(ok ? ui.imported : ui.importFailed);
    };
    if (importMode === "replace") {
      setPendingConfirmation({
        title: ui.replaceTitle,
        description: ui.replaceDescription,
        confirmLabel: ui.replaceConfirm,
        action: runImport,
      });
      return;
    }
    await runImport();
  }

  async function openDataFolder() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(ui.folderDesktopOnly);
      return;
    }
    await revealItemInDir(await appDataDir());
  }

  async function copyDataPath() {
    try {
      await writeClipboardText(dataPath);
      setToast(ui.copiedPath);
    } catch {
      setToast(ui.copyPathFailed);
    }
  }

  function restore(name: string) {
    setPendingConfirmation({
      title: ui.restoreTitle,
      description: ui.restoreConfirm(name),
      confirmLabel: ui.restore,
      action: async () => {
        await restoreBackup(name);
        await refreshBackups();
        setToast(ui.restoreDone);
      },
    });
  }

  function updateFeedbackEnabled(enabled: boolean) {
    setFeedbackEnabled(enabled);
    setAnalysisFeedbackEnabled(enabled);
  }

  function updateAccuracyFirst(
    key: keyof typeof accuracyFirst,
    enabled: boolean,
  ) {
    if (!analysisProfileFeatureDefaults[analysisProfile][key]) return;
    setAccuracyFirst((current) => {
      const next = { ...current, [key]: enabled };
      setAccuracyFirstFeatureFlags(next);
      return next;
    });
  }

  function updateAnalysisProfile(profile: AnalysisProfile) {
    setAnalysisProfile(profile);
    setAnalysisProfileState(profile);
    setAccuracyFirst(getAnalysisProfileSettings().flags);
  }

  function updatePreAnalysisSetting(
    key: keyof typeof preAnalysisSettings,
    enabled: boolean,
  ) {
    setPreAnalysisSettings((current) => {
      const next = { ...current, [key]: enabled };
      setPreAnalysisSourceSelectionSettings(next);
      return next;
    });
  }

  function clearFeedback() {
    setPendingConfirmation({
      title: ui.deleteCorrectionTitle,
      description: ui.deleteCorrectionDescription,
      confirmLabel: ui.delete,
      action: async () => {
        await Promise.all([
          deleteAnalysisFeedback(),
          deleteLabelCorrectionLog(),
          deleteRoleCorrectionLog(),
        ]);
        setToast(ui.correctionDeleted);
      },
    });
  }

  async function exportCorrectionLog() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(ui.exportDesktopOnly);
      return;
    }
    const target = await saveFileDialog({
      defaultPath: `loopvault-label-corrections-${timestampForFile(new Date())}.jsonl`,
      filters: [{ name: "JSONL", extensions: ["jsonl"] }],
    });
    if (!target) return;
    try {
      const count = await exportLabelCorrectionLog(target);
      setToast(ui.correctionExported(count));
    } catch {
      setToast(ui.correctionExportFailed);
    }
  }

  async function exportProgressionFeedback() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(ui.exportDesktopOnly);
      return;
    }
    const target = await saveFileDialog({
      defaultPath: `loopvault-analysis-feedback-${timestampForFile(new Date())}.jsonl`,
      filters: [{ name: "JSONL", extensions: ["jsonl"] }],
    });
    if (!target) return;
    try {
      const count = await exportAnalysisFeedback(target);
      setToast(ui.feedbackExported(count));
    } catch {
      setToast(ui.correctionExportFailed);
    }
  }

  async function exportRoleCorrections() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(ui.exportDesktopOnly);
      return;
    }
    const target = await saveFileDialog({
      defaultPath: `loopvault-role-corrections-${timestampForFile(new Date())}.jsonl`,
      filters: [{ name: "JSONL", extensions: ["jsonl"] }],
    });
    if (!target) return;
    try {
      const count = await exportRoleCorrectionLog(target);
      setToast(language === "ja"
        ? `役割修正ログを${count}件書き出しました。`
        : `Exported ${count} role correction records.`);
    } catch {
      setToast(language === "ja"
        ? "役割修正ログを書き出せませんでした。"
        : "The role correction log could not be exported.");
    }
  }

  async function runEvaluationAction(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      setToast(successMessage);
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : ui.operationFailed);
    }
  }

  function confirmEvaluationDeletion(action: () => Promise<void>, title: string, successMessage: string) {
    setPendingConfirmation({
      title,
      description: ui.irreversibleConfirm(title),
      confirmLabel: ui.delete,
      action: () => runEvaluationAction(action, successMessage),
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
      setToast(actionError instanceof Error ? actionError.message : ui.operationFailed);
    } finally {
      confirmationLockRef.current = false;
      setConfirmationBusy(false);
    }
  }

  async function rebuildSourceIndex() {
    try {
      const count = await rebuildLocalMidiSourceIndex(ideas);
      setToast(ui.sourceIndexRebuilt(count));
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : ui.sourceIndexFailed);
    }
  }

  return (
    <>
      <Modal
        ariaLabelledBy="settings-dialog-title"
        initialFocusRef={closeRef}
        onClose={onClose}
        panelClassName="max-h-[90vh] w-full max-w-4xl overflow-y-auto p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="settings-dialog-title" className="text-xl font-semibold">{ui.title}</h2>
          <button ref={closeRef} className="rounded px-2 py-1 text-[var(--lv-text-muted)]" onClick={onClose}>{ui.close}</button>
        </div>

        <section aria-labelledby="settings-general-title" className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
          <h3 id="settings-general-title" className="text-sm font-semibold text-[var(--lv-accent)]">{ui.general}</h3>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <label className="font-semibold" htmlFor="settings-language">{ui.language}</label>
              <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{ui.languageHelp}</p>
              <select
                id="settings-language"
                className={`${inputClass} mt-3`}
                value={language}
                onChange={(event) => setLanguage(event.target.value as AppLanguage)}
              >
                <option value="ja">{ui.japanese}</option>
                <option value="en">{ui.english}</option>
              </select>
            </div>
            <div>
              <label className="font-semibold" htmlFor="settings-monthly-goal">{ui.monthlyGoal}</label>
              <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{ui.monthlyGoalHelp}</p>
              <input
                id="settings-monthly-goal"
                className={`${inputClass} mt-3`}
                min={1}
                type="number"
                value={monthlyGoal}
                onChange={(event) => setMonthlyGoal(Number(event.target.value))}
              />
            </div>
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-[var(--lv-border)] pt-4 text-sm">
            <input className="mt-1" type="checkbox" checked={showRomanNumerals} onChange={(event) => setShowRomanNumerals(event.target.checked)} />
            <span>
              <strong className="block text-[var(--lv-text-secondary)]">{ui.showDegrees}</strong>
              <span className="mt-1 block text-[var(--lv-text-muted)]">{ui.showDegreesHelp}</span>
            </span>
          </label>
          <div
            className="mt-4 grid gap-1 border-t border-[var(--lv-border)] pt-3 text-xs text-[var(--lv-text-muted)] sm:grid-cols-2"
            aria-label={ui.formatInfo}
            data-testid="loop-vault-build-info"
          >
            <span>{ui.appVersion(loopVaultBuildInfo.version)}</span>
            <span>{ui.buildCommit(loopVaultBuildInfo.commit)}</span>
            <span>{ui.buildDate(loopVaultBuildInfo.builtAt)}</span>
            <span>{ui.preAnalysisStatus(
              preAnalysisSettings.enablePreAnalysisSourceSelection,
            )}</span>
            <span>{ui.appFormat}</span>
            <span>{ui.dataFormat}</span>
          </div>
        </section>

        <LiveMidiSettingsSection copy={ui} store={liveMidiStore} />

        <LlmSettingsSection language={language} setToast={setToast} />

        <section aria-labelledby="settings-data-title" className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
          <h3 id="settings-data-title" className="text-sm font-semibold text-[var(--lv-accent)]">{ui.data}</h3>
          <div className="mt-4">
            <h4 className="font-semibold">{ui.dataLocation}</h4>
            <p className="mt-2 break-all text-sm text-[var(--lv-text-muted)]">{dataPath}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void openDataFolder()}><FolderOpen aria-hidden="true" size={16} />{ui.openFolder}</button>
              <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void copyDataPath()}><Copy aria-hidden="true" size={16} />{ui.copyPath}</button>
            </div>
          </div>
          <div className="mt-5 grid gap-5 border-t border-[var(--lv-border)] pt-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold">{ui.exportTitle}</h4>
              <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{ui.exportDescription}</p>
              <button
                className="mt-3 inline-flex items-center gap-2 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
                disabled={Boolean(dataOperation)}
                aria-busy={dataOperation === "export"}
                onClick={() => void exportData()}
              >
                <Download aria-hidden="true" size={16} />
                {dataOperation === "export" ? ui.processing : ui.exportButton}
              </button>
            </div>
            <div>
              <h4 className="font-semibold">{ui.importTitle}</h4>
              <p className="mt-1 text-sm text-[var(--lv-text-muted)]">{ui.importDescription}</p>
              <label className="sr-only" htmlFor="settings-import-mode">{ui.importTitle}</label>
              <select id="settings-import-mode" name="settings-import-mode" className={`${inputClass} mt-2`} disabled={Boolean(dataOperation)} value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
                <option value="merge">{ui.importMerge}</option>
                <option value="replace">{ui.importReplace}</option>
              </select>
              <button
                className="mt-3 inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-60"
                disabled={Boolean(dataOperation)}
                aria-busy={dataOperation === "import"}
                onClick={() => void importData()}
              >
                <Upload aria-hidden="true" size={16} />
                {dataOperation === "import" ? ui.processing : ui.importButton}
              </button>
              <p className="sr-only" role="status" aria-live="polite">
                {dataOperation ? ui.processing : ""}
              </p>
              {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
            </div>
          </div>
          <div className="mt-5 border-t border-[var(--lv-border)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold">{ui.backups}</h4>
              <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => void refreshBackups()}>{ui.refresh}</button>
            </div>
            <div className="mt-3 space-y-2">
              {backups.length === 0 ? <p className="text-sm text-[var(--lv-text-muted)]">{ui.noBackups}</p> : null}
              {(showAllBackups ? backups : backups.slice(0, 5)).map((backup) => (
                <div key={backup.name} className="flex flex-wrap items-center justify-between gap-3 border border-[var(--lv-border)] p-3 text-sm">
                  <div><p className="font-medium">{backup.name}</p><p className="text-[var(--lv-text-muted)]">{backup.createdAt}</p></div>
                  <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => restore(backup.name)}><RotateCcw aria-hidden="true" size={16} />{ui.restore}</button>
                </div>
              ))}
            </div>
            {backups.length > 5 ? (
              <button className="mt-3 text-sm text-teal-200 hover:underline" onClick={() => setShowAllBackups((value) => !value)}>
                {showAllBackups ? ui.showLatestFive : ui.showAll}
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-5 border border-amber-400/35 bg-amber-950/10">
          <h3>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-4 pt-4 text-left"
              aria-expanded={analysisExpanded}
              aria-controls="settings-analysis-content"
              aria-describedby="settings-analysis-help"
              onClick={() => setAnalysisExpanded((value) => !value)}
            >
              <span className="text-sm font-semibold text-amber-200">{ui.analysis}</span>
              <span aria-hidden="true" className="text-xl font-normal text-amber-200">{analysisExpanded ? "−" : "+"}</span>
            </button>
          </h3>
          <p id="settings-analysis-help" className="px-4 pb-4 text-sm text-[var(--lv-text-muted)]">{ui.analysisHelp}</p>
          {analysisExpanded ? (
            <div id="settings-analysis-content" className="border-t border-amber-400/25 p-4 text-sm">
              <div>
                <h4 className="font-semibold">{ui.accuracyFirstTitle}</h4>
                <p className="mt-1 text-[var(--lv-text-muted)]">{ui.accuracyFirstHelp}</p>
                <fieldset className="mt-4">
                  <legend className="text-xs font-semibold text-[var(--lv-text-secondary)]">
                    {ui.analysisProfile}
                  </legend>
                  <div className="mt-2 inline-flex border border-[var(--lv-border-strong)]">
                    {([
                      ["stable", ui.stableProfile],
                      ["accuracy-first", ui.accuracyProfile],
                    ] as const).map(([profile, label]) => (
                      <button
                        type="button"
                        key={profile}
                        className={`px-3 py-2 text-sm ${analysisProfile === profile ? "bg-[var(--lv-accent)] font-semibold text-stone-950" : "text-[var(--lv-text-secondary)]"}`}
                        aria-pressed={analysisProfile === profile}
                        onClick={() => updateAnalysisProfile(profile)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
                    {analysisProfile === "stable"
                      ? ui.stableProfileHelp
                      : ui.accuracyProfileHelp}
                  </p>
                </fieldset>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={accuracyFirst.bassCompanionCandidates}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].bassCompanionCandidates}
                    onChange={(event) => updateAccuracyFirst("bassCompanionCandidates", event.target.checked)}
                  />
                  <span>
                    <strong className="block text-[var(--lv-text-secondary)]">{ui.bassCompanionCandidates}</strong>
                    <span className="mt-1 block text-[var(--lv-text-muted)]">{ui.bassCompanionCandidatesHelp}</span>
                  </span>
                </label>
                <div className="mt-5 border-t border-amber-400/20 pt-4">
                  <h4 className="font-semibold">
                    {language === "ja" ? "MIDI解析前のパート選択" : "Pre-analysis part selection"}
                  </h4>
                  <label className="mt-3 flex cursor-pointer items-start gap-3">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={preAnalysisSettings.enablePreAnalysisSourceSelection}
                      onChange={(event) => updatePreAnalysisSetting(
                        "enablePreAnalysisSourceSelection",
                        event.target.checked,
                      )}
                    />
                    <span>
                      <strong className="block text-[var(--lv-text-secondary)]">
                        {language === "ja" ? "解析前のパート選択を有効にする" : "Enable pre-analysis part selection"}
                      </strong>
                      <span className="mt-1 block text-[var(--lv-text-muted)]">
                        {language === "ja"
                          ? "オフにすると従来のPhase 5解析経路へすぐ戻ります。"
                          : "Turn off to immediately restore the Phase 5 direct analysis path."}
                      </span>
                    </span>
                  </label>
                  <p className="mt-3 text-xs text-[var(--lv-text-muted)]">
                    {language === "ja"
                      ? "Stable / Accuracy Firstの両方で有効です。単純MIDIはcompact、複雑MIDIは自動展開します。"
                      : "Enabled for Stable and Accuracy First. Simple MIDI stays compact; complex MIDI expands automatically."}
                  </p>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={accuracyFirst.melodyContaminationFilter}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].melodyContaminationFilter}
                    onChange={(event) => updateAccuracyFirst("melodyContaminationFilter", event.target.checked)}
                  />
                  <span>
                    <strong className="block text-[var(--lv-text-secondary)]">{ui.melodyContaminationFilter}</strong>
                    <span className="mt-1 block text-[var(--lv-text-muted)]">{ui.melodyContaminationFilterHelp}</span>
                  </span>
                </label>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={accuracyFirst.enableObservedFlatNineDominantCandidate}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].enableObservedFlatNineDominantCandidate}
                    onChange={(event) => updateAccuracyFirst(
                      "enableObservedFlatNineDominantCandidate",
                      event.target.checked,
                    )}
                  />
                  <span>
                    <strong className="block text-[var(--lv-text-secondary)]">{ui.observedFlatNineCandidate}</strong>
                    <span className="mt-1 block text-[var(--lv-text-muted)]">{ui.observedFlatNineCandidateHelp}</span>
                  </span>
                </label>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={accuracyFirst.enableAccuracyCandidateUnion}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].enableAccuracyCandidateUnion}
                    onChange={(event) => updateAccuracyFirst(
                      "enableAccuracyCandidateUnion",
                      event.target.checked,
                    )}
                  />
                  <span>
                    <strong className="block text-[var(--lv-text-secondary)]">{ui.accuracyCandidateUnion}</strong>
                    <span className="mt-1 block text-[var(--lv-text-muted)]">{ui.accuracyCandidateUnionHelp}</span>
                  </span>
                </label>
              </div>
              <div className="mt-5 border-t border-amber-400/20 pt-4">
                <h4 className="font-semibold">{ui.correctionTitle}</h4>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input className="mt-1" type="checkbox" checked={feedbackEnabled} onChange={(event) => updateFeedbackEnabled(event.target.checked)} />
                  <span><strong className="block text-[var(--lv-text-secondary)]">{ui.correctionStore}</strong><span className="mt-1 block text-[var(--lv-text-muted)]">{ui.correctionStoreHelp}</span></span>
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void exportProgressionFeedback()}><Download aria-hidden="true" size={16} />{ui.exportAnalysisFeedback}</button>
                  <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void exportCorrectionLog()}><Download aria-hidden="true" size={16} />{ui.exportCorrectionLog}</button>
                  <button className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void exportRoleCorrections()}><Download aria-hidden="true" size={16} />{language === "ja" ? "役割修正ログを書き出す" : "Export role corrections"}</button>
                  <button className="inline-flex items-center gap-2 rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={clearFeedback}><Trash2 aria-hidden="true" size={16} />{ui.deleteCorrectionLog}</button>
                </div>
              </div>
              <div className="mt-5 border-t border-amber-400/20 pt-4">
                <h4 className="font-semibold">{ui.evaluationTitle}</h4>
                <p className="mt-1 text-[var(--lv-text-muted)]">{ui.evaluationDescription}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void runEvaluationAction(openRealEvaluationFolder, ui.evaluationFolderOpened)}>{ui.openEvaluationFolder}</button>
                  <button className="rounded border border-[var(--lv-border-strong)] px-3 py-2" onClick={() => void rebuildSourceIndex()}>{ui.rebuildSourceIndex}</button>
                  <button className="inline-flex items-center gap-2 rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={() => confirmEvaluationDeletion(deleteDifferenceReviews, ui.deleteReviewsTitle, ui.reviewsDeleted)}><Trash2 aria-hidden="true" size={16} />{ui.deleteReviews}</button>
                  <button className="inline-flex items-center gap-2 rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={() => confirmEvaluationDeletion(deletePromotedCorrections, ui.deletePromotedTitle, ui.promotedDeleted)}><Trash2 aria-hidden="true" size={16} />{ui.deletePromoted}</button>
                  <button className="inline-flex items-center gap-2 rounded border border-red-400/50 px-3 py-2 text-red-100" onClick={() => confirmEvaluationDeletion(deleteRealEvaluationData, ui.deleteEvaluationTitle, ui.evaluationDeleted)}><Trash2 aria-hidden="true" size={16} />{ui.deleteEvaluation}</button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title ?? ""}
        description={pendingConfirmation?.description ?? ""}
        confirmLabel={pendingConfirmation?.confirmLabel ?? ui.refresh}
        cancelLabel={ui.cancel}
        onCancel={() => setPendingConfirmation(undefined)}
        onConfirm={() => void confirmPendingAction()}
        tone="danger"
        busy={confirmationBusy}
      />
    </>
  );
}
