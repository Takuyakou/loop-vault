import { FingeringRankerComparisonSettings } from "../voicingPractice/FingeringRankerComparisonSettings";
import { appDataDir } from "@tauri-apps/api/path";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CorrectionMetricsSettings } from "../components/CorrectionMetricsSettings";
import { LiveMidiSettingsSection } from "../components/LiveMidiSettingsSection";
import { SettingsRow } from "../components/SettingsRow";
import { BassPracticeRecordingSettingsSection } from "../features/bass-practice/recording/ui/BassPracticeRecordingSettingsSection";
import { deleteOpenAiApiKey, getOpenAiApiKeyStatus, isLlmDesktopAvailable } from "../llm/bridge";
import { loadUseStandardTitleBar, saveUseStandardTitleBar } from "../components/shell/shellPreferences";
import { ChevronDownIcon } from "../components/icons";
import { Button, Select, StatusMessage, Switch } from "../components/ui";
import { useMidiConnection } from "../liveMidi/useMidiConnection";
import { JAZZ_VAULT_DATA_PATH } from "../storage/jazzVaultStorage";
import type { SongIdea } from "../domain/types";
import type { AppCopy } from "../i18n";
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

/**
 * Scrolls only the app's content area (#main-content) to a section. `scrollIntoView` would also
 * scroll the fixed app frame, which clips the title bar and header.
 */
function scrollToSection(id: string) {
  const section = document.getElementById(id);
  const main = document.getElementById("main-content");
  if (!section || !main) return;
  main.scrollTop += section.getBoundingClientRect().top - main.getBoundingClientRect().top - 12;
}

/** Left list of the settings screen: [section id, label]. P23-26 S1: five groups, the MIDI one merged. */
const settingsSections = [
  ["settings-general", "表示"],
  ["settings-audio-midi", "MIDI 入力"],
  ["settings-data", "データ"],
  ["settings-about", "このアプリについて"],
  ["settings-developer", "開発者向け"],
] as const;

/** P23-26 S6: `data-20261111-0930.json` → 「11月11日 9:30」 in this PC's own clock. */
const BACKUP_NAME_PATTERN = /^data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.json$/;

export function readableBackupDate(name: string): string | undefined {
  const match = BACKUP_NAME_PATTERN.exec(name);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match as unknown as [string, string, string, string, string, string];
  const at = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(at.getTime())) return undefined;
  // A name that only looks like a date (month 13, hour 25) is not one: leave it as the file name.
  if (at.getFullYear() !== Number(year) || at.getMonth() !== Number(month) - 1 || at.getDate() !== Number(day)
    || at.getHours() !== Number(hour) || at.getMinutes() !== Number(minute)) return undefined;
  return `${at.getMonth() + 1}月${at.getDate()}日 ${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`;
}

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

interface SettingsViewProps {
  showRomanNumerals: boolean;
  ideas: SongIdea[];
  backups: ReturnType<typeof defaultVaultStore.getState>["backups"];
  error?: string;
  setShowRomanNumerals: (show: boolean) => void;
  refreshBackups: () => Promise<void>;
  restoreBackup: (backupName: string) => Promise<void>;
  exportVault: (path: string) => Promise<boolean>;
  importVault: (path: string, mode: "replace" | "merge") => Promise<boolean>;
  setToast: (toast: string) => void;
  copy: AppCopy;
  liveMidiStore?: StoreApi<LiveMidiStoreState>;
}

/** P8.9-08: Settings is a screen (view "settings"), no longer a dialog. Same settings, same behavior. */
export function SettingsView({
  showRomanNumerals,
  ideas,
  backups,
  error,
  setShowRomanNumerals,
  refreshBackups,
  restoreBackup,
  exportVault,
  importVault,
  setToast,
  copy,
  liveMidiStore,
}: SettingsViewProps) {
  const ui = copy.settingsUi;
  const [dataPath, setDataPath] = useState<string>(ui.dataPathFallback);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(isAnalysisFeedbackEnabled);
  const [standardTitleBar, setStandardTitleBar] = useState(loadUseStandardTitleBar);
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
  const [currentSection, setCurrentSection] = useState<string>(settingsSections[0][0]);
  const confirmationLockRef = useRef(false);
  const dataOperationLockRef = useRef(false);
  const midiView = useMidiConnection();
  // P23-26 S6: the counts the adopted design shows beside the location (both come from the loaded Vault).
  const progressionCount = ideas.reduce((total, idea) => total + (idea.progressionBlocks?.length ?? 0), 0);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setDataPath(ui.dataPathFallback);
      return;
    }
    // P23-26 S8: the Vault really lives one level down (the txt-jazz-v3 folder), not at loopvault/data.json.
    void appDataDir().then((path) => setDataPath(`${path}${JAZZ_VAULT_DATA_PATH}`));
  }, [ui.dataPathFallback]);

  // P23-26 S3: the left list lights the section the reader is in.
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    const update = () => {
      const top = main.getBoundingClientRect().top + 90;
      let current = settingsSections[0][0] as string;
      for (const [id] of settingsSections) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= top) current = id;
      }
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = settingsSections[settingsSections.length - 1][0];
      setCurrentSection(current);
    };
    update();
    main.addEventListener("scroll", update, { passive: true });
    return () => main.removeEventListener("scroll", update);
  }, []);

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
      setToast(`役割修正ログを${count}件書き出しました。`);
    } catch {
      setToast("役割修正ログを書き出せませんでした。");
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
    <div className="lv-settings-host" data-testid="settings-view">
    <div className="lv-settings">
      <nav className="lv-settings-nav" aria-label="設定の欄">
        {settingsSections.map(([target, label]) => (
          <button
            key={target}
            type="button"
            className="lv-settings-nav-item"
            data-current={currentSection === target || undefined}
            aria-current={currentSection === target ? "true" : undefined}
            onClick={() => {
              if (target === "settings-developer") setAnalysisExpanded(true);
              setCurrentSection(target);
              window.requestAnimationFrame(() => scrollToSection(target));
            }}
          >
            <span>{label}</span>
            {target === "settings-audio-midi" ? (
              <span className="lv-midi-dot" data-midi-kind={midiView.kind} aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="lv-settings-content">
        <section id="settings-general" aria-labelledby="settings-general-title" className="lv-settings-card">
          <h2 id="settings-general-title" className="lv-settings-card-title">表示</h2>
          <p className="lv-settings-lead">変えると、すぐに反映されます。</p>
          <div className="lv-settings-rows">
            <SettingsRow
              title={ui.showDegrees}
              description={ui.showDegreesHelp}
              control={(
                <Switch
                  label={ui.showDegrees}
                  data-testid="settings-show-degrees"
                  checked={showRomanNumerals}
                  onChange={setShowRomanNumerals}
                />
              )}
            />
            <SettingsRow
              title="標準のタイトルバーを使う"
              description="アプリのタイトルバーの代わりに Windows の標準のバーを使います。次の起動から変わります。この端末だけに保存します。"
              control={(
                <Switch
                  label="標準のタイトルバーを使う"
                  data-testid="settings-standard-title-bar"
                  checked={standardTitleBar}
                  onChange={(next) => {
                    setStandardTitleBar(next);
                    saveUseStandardTitleBar(next);
                  }}
                />
              )}
            />
          </div>
        </section>

        {/* P23-26 S1: 「音と MIDI」 and 「Live MIDI」 are one section. `settings-live-midi` stays inside it. */}
        <section id="settings-audio-midi" aria-labelledby="settings-audio-midi-title" className="lv-settings-card">
          <h2 id="settings-audio-midi-title" className="lv-settings-card-title">MIDI 入力</h2>
          <p className="lv-settings-lead">練習と Live MIDI で使う鍵盤です。アプリ全体で 1 つの接続を使います。</p>
          <LiveMidiSettingsSection copy={ui} store={liveMidiStore}>
            <BassPracticeRecordingSettingsSection />
          </LiveMidiSettingsSection>
          <p className="lv-settings-foot">試聴の音色・メトロノーム・音量は、画面の上の帯でいつでも変えられます。</p>
        </section>

        <section id="settings-data" aria-labelledby="settings-data-title" className="lv-settings-card">
          <h2 id="settings-data-title" className="lv-settings-card-title">{ui.data}</h2>
          <p className="lv-settings-lead">Vault は、この PC の中の 1 つのファイルに保存しています。</p>
          <div className="lv-settings-path">
            <div className="lv-settings-path-text">
              <b>
                {ui.dataLocation}
                <span className="lv-settings-counts">
                  <span>進行 <b>{progressionCount}</b></span>
                  <span>曲 <b>{ideas.length}</b></span>
                </span>
              </b>
              <code title={dataPath}>{dataPath}</code>
            </div>
            <Button variant="neutral" size="sm" onClick={() => void openDataFolder()}><FolderOpen aria-hidden="true" size={16} />{ui.openFolder}</Button>
            <Button variant="neutral" size="sm" onClick={() => void copyDataPath()}><Copy aria-hidden="true" size={16} />{ui.copyPath}</Button>
          </div>
          <div className="lv-settings-io">
            <div className="lv-settings-io-card">
              <h3 className="lv-settings-subtitle"><Download aria-hidden="true" size={16} />{ui.exportTitle}</h3>
              <p>{ui.exportDescription}</p>
              <Button
                variant="neutral"
                disabled={Boolean(dataOperation)}
                aria-busy={dataOperation === "export"}
                onClick={() => void exportData()}
              >
                <Download aria-hidden="true" size={16} />
                {dataOperation === "export" ? ui.processing : ui.exportButton}
              </Button>
            </div>
            <div className="lv-settings-io-card" data-import-mode={importMode}>
              <h3 className="lv-settings-subtitle"><Upload aria-hidden="true" size={16} />{ui.importTitle}</h3>
              <label className="sr-only" htmlFor="settings-import-mode">{ui.importTitle}</label>
              <Select id="settings-import-mode" name="settings-import-mode" wrapperClassName="w-full" className="w-full" disabled={Boolean(dataOperation)} value={importMode} onChange={(event) => setImportMode(event.target.value as "replace" | "merge")}>
                <option value="merge">{ui.importMerge}</option>
                <option value="replace">{ui.importReplace}</option>
              </Select>
              <p>{ui.importDescription}</p>
              <Button
                variant="neutral"
                disabled={Boolean(dataOperation)}
                aria-busy={dataOperation === "import"}
                onClick={() => void importData()}
              >
                <Upload aria-hidden="true" size={16} />
                {dataOperation === "import" ? ui.processing : ui.importButton}
              </Button>
              <p className="sr-only" role="status" aria-live="polite">
                {dataOperation ? ui.processing : ""}
              </p>
              {error ? <StatusMessage className="mt-3" tone="error" title={error} /> : null}
            </div>
          </div>
          <div className="lv-settings-backups">
            <div className="lv-settings-backup-head">
              <b>{ui.backups}</b>
              <span>アプリが自動で残した控えです。戻すと、今の Vault と入れ替わります。</span>
              <Button variant="neutral" size="sm" onClick={() => void refreshBackups()}>{ui.refresh}</Button>
            </div>
            <div>
              {backups.length === 0 ? <p className="lv-settings-backup-empty">{ui.noBackups}</p> : null}
              {(showAllBackups ? backups : backups.slice(0, 5)).map((backup, index) => (
                <div key={backup.name} className="lv-settings-backup">
                  <span className="lv-settings-backup-date">
                    {readableBackupDate(backup.name) ?? backup.name}
                    {index === 0 ? <small>いちばん新しい</small> : null}
                  </span>
                  <code title={backup.name}>{backup.name}</code>
                  <Button variant="neutral" size="sm" onClick={() => restore(backup.name)}><RotateCcw aria-hidden="true" size={16} />{ui.restore}</Button>
                </div>
              ))}
            </div>
            {backups.length > 5 ? (
              <Button variant="ghost" size="sm" className="lv-settings-more" onClick={() => setShowAllBackups((value) => !value)}>
                {showAllBackups ? ui.showLatestFive : ui.showAll}
              </Button>
            ) : null}
          </div>
        </section>

        <section id="settings-about" aria-labelledby="settings-about-title" className="lv-settings-card">
          <h2 id="settings-about-title" className="lv-settings-card-title">このアプリについて</h2>
          <div className="lv-settings-about">
            <span className="lv-settings-about-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            </span>
            <div className="lv-settings-about-text">
              <b>Loop Vault<small>{loopVaultBuildInfo.version}</small></b>
              <span>作曲の引き出しを、自分の耳で集める。</span>
            </div>
          </div>
          <div className="lv-settings-about-facts" aria-label={ui.formatInfo} data-testid="loop-vault-format-info">
            <div className="lv-settings-about-fact"><b>{ui.appVersion(loopVaultBuildInfo.version)}</b></div>
            <div className="lv-settings-about-fact"><b>{ui.appFormat}</b></div>
            <div className="lv-settings-about-fact"><b>{ui.dataFormat}</b></div>
            <div className="lv-settings-about-fact"><b>{ui.formatInfo}</b></div>
            <p className="lv-settings-about-attribution" data-testid="piano-sample-attribution">
              Salamander Grand Piano V3 by Alexander Holm · CC BY 3.0 · https://creativecommons.org/licenses/by/3.0/
            </p>
          </div>
        </section>

        <section id="settings-developer" className="lv-settings-card" aria-labelledby="settings-developer-title">
          <h2 id="settings-developer-title">
            <button
              type="button"
              className="lv-settings-disclosure"
              aria-expanded={analysisExpanded}
              aria-controls="settings-analysis-content"
              aria-describedby="settings-analysis-help"
              onClick={() => setAnalysisExpanded((value) => !value)}
            >
              <span className="lv-settings-card-title">開発者向け</span>
              <ChevronDownIcon size={16} className={analysisExpanded ? "rotate-180" : ""} />
            </button>
          </h2>
          <p id="settings-analysis-help" className="lv-settings-help">{ui.analysisHelp}</p>
          {analysisExpanded ? (
            <div id="settings-analysis-content" className="text-sm">
              <FingeringRankerComparisonSettings />
              <CorrectionMetricsSettings />
              <div className="lv-settings-divider">
                <h3 className="lv-settings-subtitle">{ui.analysis}</h3>
                <h4 className="mt-3 font-semibold">{ui.accuracyFirstTitle}</h4>
                <p className="mt-1 text-[var(--lv-text-muted)]">{ui.accuracyFirstHelp}</p>
                <fieldset className="mt-4">
                  <legend className="text-xs font-semibold text-[var(--lv-text-secondary)]">
                    {ui.analysisProfile}
                  </legend>
                  <div className="lv-segmented mt-2" role="group" aria-label={ui.analysisProfile}>
                    {([
                      ["stable", ui.stableProfile],
                      ["accuracy-first", ui.accuracyProfile],
                    ] as const).map(([profile, label]) => (
                      <button
                        type="button"
                        key={profile}
                        className="lv-segment"
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
                <label className="lv-settings-check">
                  <input
                    type="checkbox"
                    checked={accuracyFirst.bassCompanionCandidates}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].bassCompanionCandidates}
                    onChange={(event) => updateAccuracyFirst("bassCompanionCandidates", event.target.checked)}
                  />
                  <span>
                    <strong>{ui.bassCompanionCandidates}</strong>
                    <span>{ui.bassCompanionCandidatesHelp}</span>
                  </span>
                </label>
                <div className="lv-settings-divider">
                  <h4 className="font-semibold">
                    {"MIDI解析前のパート選択"}
                  </h4>
                  <label className="lv-settings-check">
                    <input
                      type="checkbox"
                      checked={preAnalysisSettings.enablePreAnalysisSourceSelection}
                      onChange={(event) => updatePreAnalysisSetting(
                        "enablePreAnalysisSourceSelection",
                        event.target.checked,
                      )}
                    />
                    <span>
                      <strong>{"解析前のパート選択を有効にする"}</strong>
                      <span>{"オフにすると、以前の解析の流れ（Phase 5）へすぐ戻ります。"}</span>
                    </span>
                  </label>
                  <p className="mt-3 text-xs text-[var(--lv-text-muted)]">
                    {"安定・精度優先のどちらでも有効です。単純な MIDI は簡単な表示、複雑な MIDI は自動で広げて表示します。"}
                  </p>
                </div>
                <label className="lv-settings-check">
                  <input
                    type="checkbox"
                    checked={accuracyFirst.melodyContaminationFilter}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].melodyContaminationFilter}
                    onChange={(event) => updateAccuracyFirst("melodyContaminationFilter", event.target.checked)}
                  />
                  <span>
                    <strong>{ui.melodyContaminationFilter}</strong>
                    <span>{ui.melodyContaminationFilterHelp}</span>
                  </span>
                </label>
                <label className="lv-settings-check">
                  <input
                    type="checkbox"
                    checked={accuracyFirst.enableObservedFlatNineDominantCandidate}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].enableObservedFlatNineDominantCandidate}
                    onChange={(event) => updateAccuracyFirst(
                      "enableObservedFlatNineDominantCandidate",
                      event.target.checked,
                    )}
                  />
                  <span>
                    <strong>{ui.observedFlatNineCandidate}</strong>
                    <span>{ui.observedFlatNineCandidateHelp}</span>
                  </span>
                </label>
                <label className="lv-settings-check">
                  <input
                    type="checkbox"
                    checked={accuracyFirst.enableAccuracyCandidateUnion}
                    disabled={!analysisProfileFeatureDefaults[analysisProfile].enableAccuracyCandidateUnion}
                    onChange={(event) => updateAccuracyFirst(
                      "enableAccuracyCandidateUnion",
                      event.target.checked,
                    )}
                  />
                  <span>
                    <strong>{ui.accuracyCandidateUnion}</strong>
                    <span>{ui.accuracyCandidateUnionHelp}</span>
                  </span>
                </label>
              </div>
              <div className="lv-settings-divider">
                <h3 className="lv-settings-subtitle">{ui.correctionTitle}</h3>
                <label className="lv-settings-check">
                  <input type="checkbox" checked={feedbackEnabled} onChange={(event) => updateFeedbackEnabled(event.target.checked)} />
                  <span><strong>{ui.correctionStore}</strong><span>{ui.correctionStoreHelp}</span></span>
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="neutral" onClick={() => void exportProgressionFeedback()}><Download aria-hidden="true" size={16} />{ui.exportAnalysisFeedback}</Button>
                  <Button variant="neutral" onClick={() => void exportCorrectionLog()}><Download aria-hidden="true" size={16} />{ui.exportCorrectionLog}</Button>
                  <Button variant="neutral" onClick={() => void exportRoleCorrections()}><Download aria-hidden="true" size={16} />{"役割修正ログを書き出す"}</Button>
                  <Button variant="neutral" className="lv-settings-destructive" onClick={clearFeedback}><Trash2 aria-hidden="true" size={16} />{ui.deleteCorrectionLog}</Button>
                </div>
              </div>
              <div className="lv-settings-divider">
                <h3 className="lv-settings-subtitle">{ui.evaluationTitle}</h3>
                <p className="mt-1 text-[var(--lv-text-muted)]">{ui.evaluationDescription}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="neutral" onClick={() => void runEvaluationAction(openRealEvaluationFolder, ui.evaluationFolderOpened)}>{ui.openEvaluationFolder}</Button>
                  <Button variant="neutral" onClick={() => void rebuildSourceIndex()}>{ui.rebuildSourceIndex}</Button>
                  <Button variant="neutral" className="lv-settings-destructive" onClick={() => confirmEvaluationDeletion(deleteDifferenceReviews, ui.deleteReviewsTitle, ui.reviewsDeleted)}><Trash2 aria-hidden="true" size={16} />{ui.deleteReviews}</Button>
                  <Button variant="neutral" className="lv-settings-destructive" onClick={() => confirmEvaluationDeletion(deletePromotedCorrections, ui.deletePromotedTitle, ui.promotedDeleted)}><Trash2 aria-hidden="true" size={16} />{ui.deletePromoted}</Button>
                  <Button variant="neutral" className="lv-settings-destructive" onClick={() => confirmEvaluationDeletion(deleteRealEvaluationData, ui.deleteEvaluationTitle, ui.evaluationDeleted)}><Trash2 aria-hidden="true" size={16} />{ui.deleteEvaluation}</Button>
                </div>
              </div>
              <div
                className="lv-settings-divider grid gap-1 text-xs text-[var(--lv-text-muted)] sm:grid-cols-2"
                aria-label="ビルドの情報"
                data-testid="loop-vault-build-info"
              >
                <h3 className="lv-settings-subtitle sm:col-span-2">ビルドの情報</h3>
                <span>{ui.appVersion(loopVaultBuildInfo.version)}</span>
                <span>{ui.buildCommit(loopVaultBuildInfo.commit)}</span>
                <span>{ui.buildDate(loopVaultBuildInfo.builtAt)}</span>
                <span>{ui.preAnalysisStatus(
                  preAnalysisSettings.enablePreAnalysisSourceSelection,
                )}</span>
              </div>
              <StoredApiKeyRemoval setToast={setToast} />
            </div>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title ?? ""}
        description={pendingConfirmation?.description ?? ""}
        confirmLabel={pendingConfirmation?.confirmLabel ?? ui.refresh}
        cancelLabel="戻る"
        onCancel={() => setPendingConfirmation(undefined)}
        onConfirm={() => void confirmPendingAction()}
        tone="danger"
        busy={confirmationBusy}
      />
    </div>
    </div>
  );
}

/** P8.9-03: the AI settings are gone; removing an API key saved for them stays reachable here. */
function StoredApiKeyRemoval({ setToast }: { setToast: (message: string) => void }) {
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLlmDesktopAvailable()) return;
    void getOpenAiApiKeyStatus().then((status) => setRegistered(status.registered)).catch(() => undefined);
  }, []);

  async function remove() {
    setBusy(true);
    try {
      const status = await deleteOpenAiApiKey();
      setRegistered(status.registered);
      setToast(status.registered ? "API キーを削除できませんでした。" : "保存した API キーを削除しました。");
    } catch {
      setToast("API キーを削除できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lv-settings-divider" data-testid="stored-api-key-removal">
      <h3 className="lv-settings-subtitle">保存した API キー</h3>
      <p className="mt-1 text-[var(--lv-text-muted)]">
        {registered ? "以前の AI 展開案のために保存した OpenAI の API キーがあります。" : "保存されている API キーはありません。"}
      </p>
      <Button
        variant="neutral"
        disabled={busy || !registered}
        className="lv-settings-destructive mt-3"
        onClick={() => void remove()}
      >
        <Trash2 aria-hidden="true" size={16} />
        保存した API キーを削除
      </Button>
    </div>
  );
}
