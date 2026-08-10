// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import { playbackController } from "../audio/playbackController";
import type { VaultStoreState } from "./vaultStore";
import {
  isTauriRuntime,
  registerBrowserCloseGuard,
  registerTauriCloseGuard,
  shouldBlockClose,
} from "./closeGuard";
import { registerCloseBlocker } from "./closeBlocker";
import { registerClosePreparation } from "./closePreparation";

type CloseRequestHandler = (event: { preventDefault(): void }) => Promise<void> | void;

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
  ask: vi.fn(),
  message: vi.fn(),
  onCloseRequested: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMocks.invoke,
  isTauri: tauriMocks.isTauri,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: tauriMocks.onCloseRequested }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: tauriMocks.ask,
  message: tauriMocks.message,
}));

function state(overrides: Partial<VaultStoreState>): VaultStoreState {
  return {
    ideas: [],
    settings: { monthlyGoal: 1, language: "ja" },
    analysis: { status: "idle" },
    loadStatus: "ready",
    quarantine: [],
    unsaved: false,
    saving: false,
    backups: [],
    vaultEpoch: 0,
    initialize: async () => undefined,
    createIdea: () => undefined,
    createIdeaFromDraft: () => undefined,
    createIdeaFromTextProgression: () => undefined,
    appendTextProgressionToIdea: () => false,
    updateIdea: () => undefined,
    deleteIdea: () => false,
    appendBlockToIdea: () => false,
    updateProgressionBlock: () => false,
    duplicateProgressionBlock: () => undefined,
    removeProgressionBlock: () => false,
    removeReference: () => false,
    unlinkAsset: () => false,
    transitionIdea: () => ({
      ok: false,
      error: { code: "invalid-jump", message: "not used" },
    }),
    updateNextAction: () => undefined,
    analyzeMidiBytes: () => undefined,
    clearAnalysis: () => undefined,
    setMonthlyGoal: () => undefined,
    setLanguage: () => undefined,
    refreshBackups: async () => undefined,
    exportVault: async () => false,
    importVault: async () => false,
    restoreBackup: async () => undefined,
    flush: async () => undefined,
    ...overrides,
  };
}

function storeFrom(getState: () => VaultStoreState): StoreApi<VaultStoreState> {
  return { getState } as StoreApi<VaultStoreState>;
}

describe("close guards", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.isTauri.mockReset().mockReturnValue(false);
    tauriMocks.ask.mockReset();
    tauriMocks.message.mockReset();
    tauriMocks.onCloseRequested.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns on beforeunload without stopping playback before close is confirmed", () => {
    const stop = vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const cleanup = registerBrowserCloseGuard(storeFrom(() => state({ unsaved: true })));
    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(stop).not.toHaveBeenCalled();
    cleanup();
  });

  it("warns on beforeunload when an editor has unsaved local changes", () => {
    const cleanupBlocker = registerCloseBlocker({
      title: "Unsaved",
      message: "Discard changes?",
      confirmLabel: "Discard",
      cancelLabel: "Cancel",
    });
    const cleanup = registerBrowserCloseGuard(storeFrom(() => state({ unsaved: false })));
    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    cleanup();
    cleanupBlocker();
  });

  it("stops playback once page navigation is committed", () => {
    const stop = vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const cleanup = registerBrowserCloseGuard(storeFrom(() => state({ unsaved: false })));
    const pageHide = new Event("pagehide");
    Object.defineProperty(pageHide, "persisted", { value: false });

    window.dispatchEvent(pageHide);
    window.dispatchEvent(new Event("unload"));

    expect(stop).toHaveBeenCalledOnce();
    cleanup();
  });

  it("keeps playback running when a Tauri close is aborted after flush failure", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    let closeHandler: CloseRequestHandler | undefined;
    tauriMocks.onCloseRequested.mockImplementation(async (handler: CloseRequestHandler) => {
      closeHandler = handler;
      return () => undefined;
    });
    const stop = vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const flush = vi.fn(async () => undefined);
    const store = storeFrom(() => state({ unsaved: true, flush }));
    await registerTauriCloseGuard(store);
    const preventDefault = vi.fn();

    await closeHandler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(tauriMocks.message).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("stops playback after flush succeeds and immediately before Tauri exit", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    let closeHandler: CloseRequestHandler | undefined;
    tauriMocks.onCloseRequested.mockImplementation(async (handler: CloseRequestHandler) => {
      closeHandler = handler;
      return () => undefined;
    });
    const order: string[] = [];
    vi.spyOn(playbackController, "stop").mockImplementation(() => {
      order.push("stop");
    });
    tauriMocks.invoke.mockImplementation(async (command: string) => {
      order.push(command === "exit_app" ? "exit" : "midi-stop");
    });
    let currentState = state({ unsaved: true });
    const flush = vi.fn(async () => {
      currentState = state({ unsaved: false, flush });
    });
    currentState = state({ unsaved: true, flush });
    await registerTauriCloseGuard(storeFrom(() => currentState));

    await closeHandler?.({ preventDefault: vi.fn() });

    expect(flush).toHaveBeenCalledOnce();
    expect(order).toEqual(["stop", "midi-stop", "exit"]);
    expect(tauriMocks.invoke).toHaveBeenCalledWith("close_live_midi_input");
    expect(tauriMocks.invoke).toHaveBeenCalledWith("exit_app");
  });

  it("keeps the desktop app open when local edits are not discarded", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.ask.mockResolvedValue(false);
    let closeHandler: CloseRequestHandler | undefined;
    tauriMocks.onCloseRequested.mockImplementation(async (handler: CloseRequestHandler) => {
      closeHandler = handler;
      return () => undefined;
    });
    const cleanupBlocker = registerCloseBlocker({
      title: "Unsaved",
      message: "Discard changes?",
      confirmLabel: "Discard",
      cancelLabel: "Cancel",
    });
    await registerTauriCloseGuard(storeFrom(() => state({ unsaved: false })));

    await closeHandler?.({ preventDefault: vi.fn() });

    expect(tauriMocks.ask).toHaveBeenCalledWith("Discard changes?", {
      title: "Unsaved",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    });
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
    cleanupBlocker();
  });

  it("closes the desktop app after local edits are explicitly discarded", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.ask.mockResolvedValue(true);
    let closeHandler: CloseRequestHandler | undefined;
    tauriMocks.onCloseRequested.mockImplementation(async (handler: CloseRequestHandler) => {
      closeHandler = handler;
      return () => undefined;
    });
    vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const cleanupBlocker = registerCloseBlocker({
      title: "Unsaved",
      message: "Discard changes?",
      confirmLabel: "Discard",
      cancelLabel: "Cancel",
    });
    await registerTauriCloseGuard(storeFrom(() => state({ unsaved: false })));

    await closeHandler?.({ preventDefault: vi.fn() });

    expect(tauriMocks.invoke).toHaveBeenCalledWith("exit_app");
    cleanupBlocker();
  });

  it("commits mounted view changes before flushing and closing", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    let closeHandler: CloseRequestHandler | undefined;
    tauriMocks.onCloseRequested.mockImplementation(async (handler: CloseRequestHandler) => {
      closeHandler = handler;
      return () => undefined;
    });
    vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    const order: string[] = [];
    let currentState = state({ unsaved: false });
    const flush = vi.fn(async () => {
      order.push("flush");
      currentState = state({ unsaved: false, flush });
    });
    currentState = state({ unsaved: false, flush });
    const unregister = registerClosePreparation(() => {
      order.push("prepare");
      currentState = state({ unsaved: true, flush });
    });
    await registerTauriCloseGuard(storeFrom(() => currentState));

    await closeHandler?.({ preventDefault: vi.fn() });

    expect(order.slice(0, 2)).toEqual(["prepare", "flush"]);
    expect(flush).toHaveBeenCalledOnce();
    expect(tauriMocks.message).not.toHaveBeenCalled();
    expect(tauriMocks.invoke).toHaveBeenCalledWith("exit_app");
    unregister();
  });

  it("flushes one late revision instead of reporting a storage failure", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    let closeHandler: CloseRequestHandler | undefined;
    tauriMocks.onCloseRequested.mockImplementation(async (handler: CloseRequestHandler) => {
      closeHandler = handler;
      return () => undefined;
    });
    vi.spyOn(playbackController, "stop").mockImplementation(() => undefined);
    let flushCount = 0;
    let currentState = state({ unsaved: true });
    const flush = vi.fn(async () => {
      flushCount += 1;
      currentState = state({ unsaved: flushCount === 1, flush });
    });
    currentState = state({ unsaved: true, flush });
    await registerTauriCloseGuard(storeFrom(() => currentState));

    await closeHandler?.({ preventDefault: vi.fn() });

    expect(flush).toHaveBeenCalledTimes(2);
    expect(tauriMocks.message).not.toHaveBeenCalled();
    expect(tauriMocks.invoke).toHaveBeenCalledWith("exit_app");
  });
});

describe("shouldBlockClose", () => {
  it("blocks close when there are unsaved changes", () => {
    expect(shouldBlockClose(state({ unsaved: true }))).toBe(true);
  });

  it("does not block close for saving status alone", () => {
    expect(shouldBlockClose(state({ saving: true, unsaved: false }))).toBe(false);
  });
});

describe("isTauriRuntime", () => {
  it("uses the Tauri runtime predicate", () => {
    expect(isTauriRuntime(() => true)).toBe(true);
  });

  it("returns false when the Tauri predicate is false", () => {
    expect(isTauriRuntime(() => false)).toBe(false);
  });
});
