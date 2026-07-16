// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { SettingsDialog } from "./SettingsDialog";

const mocks = vi.hoisted(() => ({
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  appDataDir: vi.fn(async () => "C:/LoopVault/"),
  deleteAnalysisFeedback: vi.fn(async () => undefined),
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
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("../storage/analysisFeedbackStorage", () => ({
  deleteAnalysisFeedback: mocks.deleteAnalysisFeedback,
  isAnalysisFeedbackEnabled: () => true,
  setAnalysisFeedbackEnabled: vi.fn(),
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
  vi.clearAllMocks();
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("SettingsDialog confirmations", () => {
  it("does not replace the Vault until the shared confirmation is accepted", async () => {
    mocks.openFileDialog.mockResolvedValue("C:/backup.json");
    const importVault = vi.fn(async () => true);
    const mounted = await renderSettings({ importVault });
    const selects = [...document.querySelectorAll<HTMLSelectElement>('select')];
    const importMode = selects.find((select) => [...select.options].some((option) => option.value === "replace"));
    expect(importMode).toBeDefined();
    await changeSelect(importMode, "replace");

    await clickButton(appCopy.ja.settings.importButton);
    expect(importVault).not.toHaveBeenCalled();
    expect(dialogs()[1]?.textContent).toContain("Vaultを置き換え");

    await clickButton("置き換える", dialogs()[1]);
    expect(importVault).toHaveBeenCalledWith("C:/backup.json", "replace");
    await mounted.unmount();
  });

  it("confirms backup restore and destructive evaluation deletion", async () => {
    const restoreBackup = vi.fn(async () => undefined);
    const refreshBackups = vi.fn(async () => undefined);
    const mounted = await renderSettings({ restoreBackup, refreshBackups });

    await clickButton(appCopy.ja.common.restore, dialogs()[0]);
    expect(restoreBackup).not.toHaveBeenCalled();
    await clickButton(appCopy.ja.common.restore, dialogs()[1]);
    expect(restoreBackup).toHaveBeenCalledWith("data-backup.json");
    expect(refreshBackups).toHaveBeenCalled();

    await clickButton("評価データを削除", dialogs()[0]);
    expect(mocks.deleteRealEvaluationData).not.toHaveBeenCalled();
    await clickButton(appCopy.ja.common.delete, dialogs()[1]);
    expect(mocks.deleteRealEvaluationData).toHaveBeenCalledTimes(1);
    await mounted.unmount();
  });

  it("runs an async confirmation only once for consecutive clicks in one React batch", async () => {
    let finishRestore: (() => void) | undefined;
    const restoreBackup = vi.fn(() => new Promise<void>((resolve) => {
      finishRestore = resolve;
    }));
    const mounted = await renderSettings({ restoreBackup });

    await clickButton(appCopy.ja.common.restore, dialogs()[0]);
    const confirmButton = [...dialogs()[1]!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === appCopy.ja.common.restore);
    expect(confirmButton).toBeDefined();

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
        {...overrides}
      />,
    );
  });
  return {
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function dialogs() {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
}

async function clickButton(label: string, scope: ParentNode = document) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

async function changeSelect(select: HTMLSelectElement | undefined, value: string) {
  expect(select).toBeDefined();
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(select, value);
    select?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
