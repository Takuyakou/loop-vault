// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { createLiveMidiStore, type LiveMidiServicePort } from "../liveMidi/liveMidiStore";
import { SettingsView, readableBackupDate } from "./SettingsView";

const mocks = vi.hoisted(() => ({
  appDataDir: vi.fn(async () => "C:/LoopVault/"),
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  revealItemInDir: vi.fn(async () => undefined),
  deleteAnalysisFeedback: vi.fn(async () => undefined),
  exportAnalysisFeedback: vi.fn(async () => 0),
  deleteLabelCorrectionLog: vi.fn(async () => undefined),
  exportLabelCorrectionLog: vi.fn(async () => 0),
  deleteRoleCorrectionLog: vi.fn(async () => undefined),
  exportRoleCorrectionLog: vi.fn(async () => 0),
  deleteDifferenceReviews: vi.fn(async () => undefined),
  deletePromotedCorrections: vi.fn(async () => undefined),
  deleteRealEvaluationData: vi.fn(async () => undefined),
  openRealEvaluationFolder: vi.fn(async () => undefined),
  rebuildLocalMidiSourceIndex: vi.fn(async () => 0),
}));

vi.mock("@tauri-apps/api/path", () => ({ appDataDir: mocks.appDataDir }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.openFileDialog, save: mocks.saveFileDialog }));
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
  localStorage.clear();
});

afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  document.body.replaceChildren();
});

describe("Settings P23-26 S6/C5: backup names read as dates", () => {
  it("C5: a data-… name becomes that PC's date and time, anything else is left alone", () => {
    expect(readableBackupDate("data-20261111-0930.json")).toBe("11月11日 9:30");
    expect(readableBackupDate("data-20260101-0005.json")).toBe("1月1日 0:05");
    expect(readableBackupDate("data-20261111-2359.json")).toBe("11月11日 23:59");
    // 名前の形に合わない物・古い取り込みの物は名前のまま(undefined は名前をそのまま出す合図)。
    expect(readableBackupDate("legacy-import.json")).toBeUndefined();
    expect(readableBackupDate("data-backup-1.json")).toBeUndefined();
    expect(readableBackupDate("data-20261332-2500.json")).toBeUndefined();
  });

  it("C5: the data section shows the readable date beside the file name", async () => {
    const mounted = await renderSettings({
      backups: [
        { name: "data-20261111-0930.json", path: "C:/LoopVault/data-20261111-0930.json", createdAt: "2026-11-11T00:30:00.000Z" },
        { name: "legacy-import.json", path: "C:/LoopVault/legacy-import.json", createdAt: "" },
      ],
    });
    const rows = [...document.querySelectorAll(".lv-settings-backup")];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("11月11日 9:30");
    expect(rows[0]?.textContent).toContain("data-20261111-0930.json");
    expect(rows[0]?.textContent).toContain("いちばん新しい");
    // 形に合わない名前は、日付の所にもその名前が出る(名前のまま)。
    expect(rows[1]?.textContent).toContain("legacy-import.json");
    await mounted.unmount();
  });
});

describe("Settings P23-26 S6/S8: where the Vault really is", () => {
  it("S8: the shown location is the txt-jazz-v3 file, the one the app writes", async () => {
    const mounted = await renderSettings();
    await act(async () => { await Promise.resolve(); });
    const shown = document.querySelector(".lv-settings-path-text code")?.textContent;
    expect(shown).toBe("C:/LoopVault/loopvault/txt-jazz-v3/data.json");
    expect(shown).not.toBe("C:/LoopVault/loopvault/data.json");
    // S6: the counts sit beside the location.
    expect(document.querySelector(".lv-settings-counts")?.textContent).toContain("進行");
    await mounted.unmount();
  });

  it("S6: the two write/read cards and the backup list are there", async () => {
    const mounted = await renderSettings();
    expect(document.querySelectorAll(".lv-settings-io-card")).toHaveLength(2);
    expect(document.querySelector("#settings-import-mode")).not.toBeNull();
    expect(document.querySelector(".lv-settings-backup-head")).not.toBeNull();
    await mounted.unmount();
  });
});

describe("Settings P23-26 C2: every setting that was there is still there", () => {
  it("C2: the items are all reachable after the regrouping", async () => {
    const mounted = await renderSettings();
    const text = () => document.body.textContent ?? "";
    const ids = [
      "settings-general",
      "settings-audio-midi",
      "settings-live-midi",
      "settings-data",
      "settings-about",
      "settings-developer",
    ];
    for (const id of ids) expect(document.querySelector(`#${id}`), id).not.toBeNull();

    // 表示: 度数の表示・標準のタイトルバー
    expect(document.querySelector("[data-testid='settings-show-degrees']")).not.toBeNull();
    expect(document.querySelector("[data-testid='settings-standard-title-bar']")).not.toBeNull();
    // MIDI 入力: 機器・接続テスト (+ この PC の設定である録音のチャンネル)
    expect(document.querySelector("#settings-live-midi-device")).not.toBeNull();
    expect(findButton(appCopy.ja.settingsUi.liveMidiTest)).toBeDefined();
    expect(document.querySelector("[data-testid='settings-record-channel']")).not.toBeNull();
    // データ: 場所・フォルダ・コピー・書き出し・読み込み・バックアップ
    expect(text()).toContain(appCopy.ja.settingsUi.openFolder);
    expect(text()).toContain(appCopy.ja.settingsUi.copyPath);
    expect(findButton(appCopy.ja.settingsUi.exportButton)).toBeDefined();
    expect(findButton(appCopy.ja.settingsUi.importButton)).toBeDefined();
    expect(findButton(appCopy.ja.settingsUi.refresh)).toBeDefined();
    // このアプリについて: 形式の情報とピアノの音の帰属
    expect(document.querySelector("#settings-about [data-testid='loop-vault-format-info']")).not.toBeNull();
    expect(document.querySelector("#settings-about [data-testid='piano-sample-attribution']")).not.toBeNull();
    // 開発者向け: 開くと今の項目がそのまま出る
    const developer = document.querySelector<HTMLButtonElement>("#settings-developer button[aria-expanded]")!;
    await act(async () => developer.click());
    expect(document.querySelector("[data-testid='loop-vault-build-info']")).not.toBeNull();
    expect(document.querySelector("[data-testid='stored-api-key-removal']")).not.toBeNull();
    expect(text()).toContain(appCopy.ja.settingsUi.analysis);
    await mounted.unmount();
  });
});

async function renderSettings(overrides: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const service: LiveMidiServicePort = {
    getSnapshot: () => ({ devices: [], status: "idle" }),
    subscribe: () => () => undefined,
    subscribeBatches: () => () => undefined,
    refreshDevices: vi.fn(async () => []),
    start: vi.fn(async () => true),
    stop: vi.fn(async () => undefined),
  };
  const store = createLiveMidiStore({ service, loadPreferences: () => ({}), savePreferences: vi.fn() });
  await act(async () => {
    root.render(
      <SettingsView
        showRomanNumerals
        ideas={[{ id: "idea", title: "曲", progressionBlocks: [{ id: "a" }, { id: "b" }] } as never]}
        backups={[{ name: "data-20261111-0930.json", path: "C:/LoopVault/data-20261111-0930.json", createdAt: "2026-11-11T00:30:00.000Z" }]}
        setShowRomanNumerals={vi.fn()}
        refreshBackups={vi.fn(async () => undefined)}
        restoreBackup={vi.fn(async () => undefined)}
        exportVault={vi.fn(async () => true)}
        importVault={vi.fn(async () => true)}
        setToast={vi.fn()}
        copy={appCopy.ja}
        liveMidiStore={store}
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

function findButton(label: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.includes(label));
}
