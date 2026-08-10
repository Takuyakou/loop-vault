// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { createLiveMidiStore, type LiveMidiServicePort } from "../liveMidi/liveMidiStore";
import type { LiveMidiDevice } from "../liveMidi/types";
import { SettingsDialog } from "./SettingsDialog";

const midiDevice: LiveMidiDevice = { backendId: "roland", name: "Roland Digital Piano", index: 2 };

const mocks = vi.hoisted(() => ({
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  appDataDir: vi.fn(async () => "C:/LoopVault/"),
  revealItemInDir: vi.fn(async () => undefined),
  deleteAnalysisFeedback: vi.fn(async () => undefined),
  exportAnalysisFeedback: vi.fn(async () => 2),
  deleteLabelCorrectionLog: vi.fn(async () => undefined),
  exportLabelCorrectionLog: vi.fn(async () => 3),
  deleteRoleCorrectionLog: vi.fn(async () => undefined),
  exportRoleCorrectionLog: vi.fn(async () => 4),
  deleteDifferenceReviews: vi.fn(async () => undefined),
  deletePromotedCorrections: vi.fn(async () => undefined),
  deleteRealEvaluationData: vi.fn(async () => undefined),
  openRealEvaluationFolder: vi.fn(async () => undefined),
  rebuildLocalMidiSourceIndex: vi.fn(async () => 0),
}));

vi.mock("@tauri-apps/api/path", () => ({ appDataDir: mocks.appDataDir }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.openFileDialog,
  save: mocks.saveFileDialog,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: mocks.revealItemInDir }));
vi.mock("../storage/analysisFeedbackStorage", () => ({
  deleteAnalysisFeedback: mocks.deleteAnalysisFeedback,
  exportAnalysisFeedback: mocks.exportAnalysisFeedback,
  isAnalysisFeedbackEnabled: () => true,
  setAnalysisFeedbackEnabled: vi.fn(),
}));
vi.mock("../storage/labelCorrectionLogStorage", () => ({
  deleteLabelCorrectionLog: mocks.deleteLabelCorrectionLog,
  exportLabelCorrectionLog: mocks.exportLabelCorrectionLog,
}));
vi.mock("../storage/roleCorrectionLogStorage", () => ({
  deleteRoleCorrectionLog: mocks.deleteRoleCorrectionLog,
  exportRoleCorrectionLog: mocks.exportRoleCorrectionLog,
}));
vi.mock("../storage/realEvaluationStorage", () => ({
  deleteDifferenceReviews: mocks.deleteDifferenceReviews,
  deletePromotedCorrections: mocks.deletePromotedCorrections,
  deleteRealEvaluationData: mocks.deleteRealEvaluationData,
  openRealEvaluationFolder: mocks.openRealEvaluationFolder,
  rebuildLocalMidiSourceIndex: mocks.rebuildLocalMidiSourceIndex,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("SettingsDialog sections", () => {
  it("shows the four Japanese sections and keeps developer analysis collapsed initially", async () => {
    const mounted = await renderSettings();
    const headings = [...dialogs()[0]!.querySelectorAll("h3")].map((heading) => heading.textContent);
    for (const heading of [
      appCopy.ja.settingsUi.general,
      appCopy.ja.settingsUi.liveMidiTitle,
      appCopy.ja.settingsUi.data,
      appCopy.ja.settingsUi.analysis,
    ]) {
      expect(headings.some((text) => text?.startsWith(heading))).toBe(true);
    }

    const disclosure = findButton(appCopy.ja.settingsUi.analysis, dialogs()[0]);
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(dialogs()[0]?.textContent).not.toContain(appCopy.ja.settingsUi.correctionTitle);
    await click(disclosure);
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(dialogs()[0]?.textContent).toContain(appCopy.ja.settingsUi.correctionTitle);
    const categoryNav = dialogs()[0]?.querySelector('nav[aria-label="設定カテゴリ"]');
    expect(categoryNav?.querySelector('a[href="#settings-general"]')).not.toBeNull();
    expect(categoryNav?.querySelector('a[href="#settings-audio-midi"]')).not.toBeNull();
    expect(categoryNav?.querySelector('a[href="#settings-analysis"]')).not.toBeNull();
    expect(categoryNav?.querySelector('a[href="#settings-about"]')).not.toBeNull();
    await mounted.unmount();
  });

  it("renders the same four-section hierarchy in English", async () => {
    const mounted = await renderSettings({ language: "en", copy: appCopy.en });
    const text = dialogs()[0]?.textContent;
    expect(text).toContain(appCopy.en.settingsUi.general);
    expect(text).toContain(appCopy.en.settingsUi.liveMidiTitle);
    expect(text).toContain(appCopy.en.settingsUi.data);
    expect(text).toContain(appCopy.en.settingsUi.analysis);
    expect(text).toContain(appCopy.en.settingsUi.monthlyGoal);
    expect(dialogs()[0]?.querySelector("[data-testid='piano-sample-attribution']")?.textContent)
      .toContain("Salamander Grand Piano V3 by Alexander Holm");
    await mounted.unmount();
  });

  it("switches Stable and Accuracy First feature sets without enabling A1 in Stable", async () => {
    const mounted = await renderSettings();
    await click(findButton(appCopy.ja.settingsUi.analysis, dialogs()[0]));
    const scope = dialogs()[0]!;
    const r2 = checkboxForLabel(appCopy.ja.settingsUi.melodyContaminationFilter, scope);
    const union = checkboxForLabel(appCopy.ja.settingsUi.accuracyCandidateUnion, scope);
    const e1 = checkboxForLabel(appCopy.ja.settingsUi.observedFlatNineCandidate, scope);

    expect(r2?.checked).toBe(false);
    expect(r2?.disabled).toBe(true);
    expect(union?.checked).toBe(false);
    expect(union?.disabled).toBe(true);
    expect(e1?.checked).toBe(true);

    await click(findButton(appCopy.ja.settingsUi.accuracyProfile, scope));
    expect(r2?.checked).toBe(true);
    expect(r2?.disabled).toBe(false);
    expect(union?.checked).toBe(true);
    expect(union?.disabled).toBe(false);

    await click(r2);
    expect(r2?.checked).toBe(false);
    await mounted.unmount();
  });

  it("selects and tests the default MIDI input from settings", async () => {
    const midi = settingsMidiStore();
    const mounted = await renderSettings({ liveMidiStore: midi.store });
    const select = document.querySelector<HTMLSelectElement>("#settings-live-midi-device");

    await changeSelect(select, midiDevice.backendId);
    expect(midi.saved).toHaveBeenCalledWith(expect.objectContaining({
      preferredInput: { backendId: "roland", name: "Roland Digital Piano", previousIndex: 2 },
    }));
    expect(midi.start).not.toHaveBeenCalled();

    await clickButton(appCopy.ja.settingsUi.liveMidiTest, dialogs()[0]);
    expect(midi.start).toHaveBeenCalledWith(midiDevice);
    expect(midi.stop).toHaveBeenCalled();
    expect(dialogs()[0]?.textContent).toContain(appCopy.ja.settingsUi.liveMidiTestSucceeded);
    await mounted.unmount();
  });

  it("keeps general setting callbacks connected", async () => {
    const setLanguage = vi.fn();
    const setMonthlyGoal = vi.fn();
    const setShowRomanNumerals = vi.fn();
    const mounted = await renderSettings({ setLanguage, setMonthlyGoal, setShowRomanNumerals });

    await changeSelect(document.querySelector<HTMLSelectElement>("#settings-language"), "en");
    await changeInput(document.querySelector<HTMLInputElement>("#settings-monthly-goal"), "4");
    const degreeToggle = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await click(degreeToggle);

    expect(setLanguage).toHaveBeenCalledWith("en");
    expect(setMonthlyGoal).toHaveBeenCalledWith(4);
    expect(setShowRomanNumerals).toHaveBeenCalledWith(false);
    await mounted.unmount();
  });

  it("shows build identity and the current pre-analysis rollback state", async () => {
    const mounted = await renderSettings();
    const buildInfo = document.querySelector("[data-testid='loop-vault-build-info']");

    expect(buildInfo?.textContent).toContain("アプリ版:");
    expect(buildInfo?.textContent).toContain("Build commit:");
    expect(buildInfo?.textContent).toContain("Build日時:");
    expect(buildInfo?.textContent).toContain("Pre-Analysis Part Selection: ON");

    await click(findButton(appCopy.ja.settingsUi.analysis, dialogs()[0]));
    await click(checkboxForLabel("解析前のパート選択を有効にする", dialogs()[0]!));
    expect(buildInfo?.textContent).toContain("Pre-Analysis Part Selection: OFF");

    await mounted.unmount();
  });

  it("shows only the latest five backups until all are requested", async () => {
    const backups = Array.from({ length: 6 }, (_, index) => ({
      name: `data-backup-${index + 1}.json`,
      path: `C:/LoopVault/data-backup-${index + 1}.json`,
      createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const mounted = await renderSettings({ backups });

    expect(dialogs()[0]?.textContent).not.toContain("data-backup-6.json");
    await clickButton(appCopy.ja.settingsUi.showAll, dialogs()[0]);
    expect(dialogs()[0]?.textContent).toContain("data-backup-6.json");
    await clickButton(appCopy.ja.settingsUi.showLatestFive, dialogs()[0]);
    expect(dialogs()[0]?.textContent).not.toContain("data-backup-6.json");
    await mounted.unmount();
  });

  it("exports and clears the local label correction log", async () => {
    mocks.saveFileDialog.mockResolvedValue("C:/exports/label-corrections.jsonl");
    const mounted = await renderSettings();
    await click(findButton(appCopy.ja.settingsUi.analysis, dialogs()[0]));

    await clickButton(appCopy.ja.settingsUi.exportAnalysisFeedback, dialogs()[0]);
    expect(mocks.exportAnalysisFeedback)
      .toHaveBeenCalledWith("C:/exports/label-corrections.jsonl");
    await clickButton(appCopy.ja.settingsUi.exportCorrectionLog, dialogs()[0]);
    expect(mocks.exportLabelCorrectionLog)
      .toHaveBeenCalledWith("C:/exports/label-corrections.jsonl");
    await clickButton("役割修正ログを書き出す", dialogs()[0]);
    expect(mocks.exportRoleCorrectionLog)
      .toHaveBeenCalledWith("C:/exports/label-corrections.jsonl");

    await clickButton(appCopy.ja.settingsUi.deleteCorrectionLog, dialogs()[0]);
    expect(mocks.deleteAnalysisFeedback).not.toHaveBeenCalled();
    expect(mocks.deleteLabelCorrectionLog).not.toHaveBeenCalled();
    expect(mocks.deleteRoleCorrectionLog).not.toHaveBeenCalled();
    await clickButton(appCopy.ja.settingsUi.delete, dialogs()[1]);
    expect(mocks.deleteAnalysisFeedback).toHaveBeenCalledTimes(1);
    expect(mocks.deleteLabelCorrectionLog).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRoleCorrectionLog).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });
});

describe("SettingsDialog confirmations", () => {
  it("shows import progress and ignores a second click while the file dialog is open", async () => {
    let finishDialog: ((value: null) => void) | undefined;
    mocks.openFileDialog.mockImplementation(() => new Promise<null>((resolve) => {
      finishDialog = resolve;
    }));
    const mounted = await renderSettings();
    const importButton = findButton(appCopy.ja.settingsUi.importButton, dialogs()[0])!;

    await act(async () => {
      importButton.click();
      importButton.click();
      await Promise.resolve();
    });

    expect(mocks.openFileDialog).toHaveBeenCalledOnce();
    expect(importButton.disabled).toBe(true);
    expect(importButton.getAttribute("aria-busy")).toBe("true");
    expect(importButton.textContent).toContain(appCopy.ja.settingsUi.processing);
    expect(dialogs()[0]?.querySelector('[role="status"]')?.textContent)
      .toBe(appCopy.ja.settingsUi.processing);

    await act(async () => {
      finishDialog?.(null);
      await Promise.resolve();
    });
    expect(importButton.disabled).toBe(false);
    await mounted.unmount();
  });

  it("does not replace the Vault until the shared confirmation is accepted", async () => {
    mocks.openFileDialog.mockResolvedValue("C:/backup.json");
    const importVault = vi.fn(async () => true);
    const mounted = await renderSettings({ importVault });
    const importMode = [...document.querySelectorAll<HTMLSelectElement>("select")]
      .find((select) => [...select.options].some((option) => option.value === "replace"));
    await changeSelect(importMode, "replace");

    await clickButton(appCopy.ja.settingsUi.importButton);
    expect(importVault).not.toHaveBeenCalled();
    expect(dialogs()[1]?.textContent).toContain(appCopy.ja.settingsUi.replaceTitle);

    await clickButton(appCopy.ja.settingsUi.replaceConfirm, dialogs()[1]);
    expect(importVault).toHaveBeenCalledWith("C:/backup.json", "replace");
    await mounted.unmount();
  });

  it("confirms backup restore and destructive evaluation deletion", async () => {
    const restoreBackup = vi.fn(async () => undefined);
    const refreshBackups = vi.fn(async () => undefined);
    const mounted = await renderSettings({ restoreBackup, refreshBackups });

    await clickButton(appCopy.ja.settingsUi.restore, dialogs()[0]);
    expect(restoreBackup).not.toHaveBeenCalled();
    await clickButton(appCopy.ja.settingsUi.restore, dialogs()[1]);
    expect(restoreBackup).toHaveBeenCalledWith("data-backup.json");
    expect(refreshBackups).toHaveBeenCalled();

    await click(findButton(appCopy.ja.settingsUi.analysis, dialogs()[0]));
    await clickButton(appCopy.ja.settingsUi.deleteEvaluation, dialogs()[0]);
    expect(mocks.deleteRealEvaluationData).not.toHaveBeenCalled();
    await clickButton(appCopy.ja.settingsUi.delete, dialogs()[1]);
    expect(mocks.deleteRealEvaluationData).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it("runs an async confirmation only once for consecutive clicks in one React batch", async () => {
    let finishRestore: (() => void) | undefined;
    const restoreBackup = vi.fn(() => new Promise<void>((resolve) => {
      finishRestore = resolve;
    }));
    const mounted = await renderSettings({ restoreBackup });

    await clickButton(appCopy.ja.settingsUi.restore, dialogs()[0]);
    const confirmButton = findButton(appCopy.ja.settingsUi.restore, dialogs()[1]);
    await act(async () => {
      confirmButton?.click();
      confirmButton?.click();
    });

    expect(restoreBackup).toHaveBeenCalledTimes(1);
    await act(async () => finishRestore?.());
    await mounted.unmount();
  });
});

async function renderSettings(overrides: Partial<React.ComponentProps<typeof SettingsDialog>> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const midi = settingsMidiStore();
  await act(async () => {
    root.render(
      <SettingsDialog
        monthlyGoal={1}
        language="ja"
        showRomanNumerals
        ideas={[]}
        backups={[{ name: "data-backup.json", path: "C:/LoopVault/data-backup.json", createdAt: "2026-07-15T00:00:00.000Z" }]}
        setMonthlyGoal={vi.fn()}
        setLanguage={vi.fn()}
        setShowRomanNumerals={vi.fn()}
        refreshBackups={vi.fn(async () => undefined)}
        restoreBackup={vi.fn(async () => undefined)}
        exportVault={vi.fn(async () => true)}
        importVault={vi.fn(async () => true)}
        setToast={vi.fn()}
        copy={appCopy.ja}
        onClose={vi.fn()}
        liveMidiStore={midi.store}
        {...overrides}
      />,
    );
    await Promise.resolve();
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function settingsMidiStore() {
  const start = vi.fn(async () => true);
  const stop = vi.fn(async () => undefined);
  const saved = vi.fn();
  const service: LiveMidiServicePort = {
    getSnapshot: () => ({ devices: [midiDevice], status: "idle" }),
    subscribe: () => () => undefined,
    subscribeBatches: () => () => undefined,
    refreshDevices: vi.fn(async () => [midiDevice]),
    start,
    stop,
  };
  return {
    store: createLiveMidiStore({ service, loadPreferences: () => ({}), savePreferences: saved }),
    start,
    stop,
    saved,
  };
}

function dialogs() {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
}

function findButton(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.includes(label));
}

function checkboxForLabel(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLLabelElement>("label")]
    .find((candidate) => candidate.textContent?.includes(label))
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
}

async function clickButton(label: string, scope: ParentNode = document) {
  const button = findButton(label, scope);
  expect(button).toBeDefined();
  await click(button);
}

async function click(element: HTMLElement | undefined | null) {
  expect(element).toBeDefined();
  await act(async () => element?.click());
}

async function changeSelect(select: HTMLSelectElement | undefined | null, value: string) {
  expect(select).toBeDefined();
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(select, value);
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInput(input: HTMLInputElement | undefined | null, value: string) {
  expect(input).toBeDefined();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
