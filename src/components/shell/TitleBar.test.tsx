// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import type { VaultStoreState } from "../../store/vaultStore";
import { registerTauriCloseGuard } from "../../store/closeGuard";
import { TitleBar } from "./TitleBar";
import { fitWithinWorkArea } from "./windowControls";
import { loadSidebarCollapsed, loadUseStandardTitleBar, saveSidebarCollapsed, saveUseStandardTitleBar } from "./shellPreferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type CloseRequestHandler = (event: { preventDefault(): void }) => Promise<void> | void;

const tauri = vi.hoisted(() => {
  const state: { closeHandler?: CloseRequestHandler } = {};
  return {
    state,
    isTauri: vi.fn(() => true),
    invoke: vi.fn(),
    ask: vi.fn(),
    message: vi.fn(),
    minimize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => undefined),
    // Tauri's window.close() emits the close request that onCloseRequested intercepts.
    close: vi.fn(async () => { await state.closeHandler?.({ preventDefault: () => undefined }); }),
    onCloseRequested: vi.fn(async (handler: CloseRequestHandler) => { state.closeHandler = handler; return () => undefined; }),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ isTauri: tauri.isTauri, invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: tauri.minimize,
    toggleMaximize: tauri.toggleMaximize,
    isMaximized: tauri.isMaximized,
    onResized: tauri.onResized,
    close: tauri.close,
    onCloseRequested: tauri.onCloseRequested,
  }),
  currentMonitor: vi.fn(),
  PhysicalSize: class {},
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: tauri.ask, message: tauri.message }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  tauri.isTauri.mockReturnValue(true);
  tauri.state.closeHandler = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

describe("TitleBar", () => {
  it("draws the brand, search and window buttons with drag regions only on empty areas", async () => {
    await act(async () => root.render(<TitleBar onSearch={vi.fn()} />));
    const bar = container.querySelector("[data-titlebar]")!;
    expect(bar.hasAttribute("data-tauri-drag-region")).toBe(true);
    expect(bar.textContent).toContain("Loop Vault");
    for (const control of container.querySelectorAll("button")) {
      expect(control.hasAttribute("data-tauri-drag-region")).toBe(false);
    }
    await act(async () => button("最小化").click());
    await act(async () => button("最大化").click());
    expect(tauri.minimize).toHaveBeenCalledOnce();
    expect(tauri.toggleMaximize).toHaveBeenCalledOnce();
  });

  it("shows the restore icon while maximized", async () => {
    tauri.isMaximized.mockResolvedValue(true);
    await act(async () => root.render(<TitleBar onSearch={vi.fn()} />));
    expect(button("元に戻す").dataset.titlebarMaximize).toBe("restore");
    tauri.isMaximized.mockResolvedValue(false);
  });

  it("closes through the window close request, so the close guard keeps unsaved changes", async () => {
    const flush = vi.fn(async () => { throw new Error("disk full"); });
    const store = { getState: () => ({ unsaved: true, flush }) as unknown as VaultStoreState } as StoreApi<VaultStoreState>;
    await registerTauriCloseGuard(store);
    await act(async () => root.render(<TitleBar onSearch={vi.fn()} />));

    await act(async () => button("閉じる").click());

    expect(tauri.close).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalled();
    expect(tauri.message).toHaveBeenCalledOnce();
    expect(tauri.invoke).not.toHaveBeenCalledWith("exit_app");
  });

  it("keeps the same look in the browser but disables the window buttons", async () => {
    tauri.isTauri.mockReturnValue(false);
    await act(async () => root.render(<TitleBar onSearch={vi.fn()} />));
    for (const label of ["最小化", "最大化", "閉じる"]) {
      expect(button(label).disabled).toBe(true);
      expect(button(label).title).toBe("デスクトップ版で使えます");
    }
    expect(container.querySelector<HTMLButtonElement>("[data-titlebar-search]")?.disabled).toBe(false);
  });
});

describe("window frame helpers", () => {
  it("shrinks the start size only when the work area is smaller", () => {
    expect(fitWithinWorkArea({ width: 1440, height: 900 }, { width: 1920, height: 1040 })).toBeUndefined();
    expect(fitWithinWorkArea({ width: 1440, height: 900 }, { width: 1366, height: 728 })).toEqual({ width: 1366, height: 728 });
    expect(fitWithinWorkArea({ width: 1440, height: 900 }, { width: 1600, height: 860 })).toEqual({ width: 1440, height: 860 });
  });

  it("stores the title bar choice and the sidebar toggle on this device only", () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) };
    expect(loadUseStandardTitleBar(storage)).toBe(false);
    expect(loadSidebarCollapsed(storage)).toBeUndefined();
    saveUseStandardTitleBar(true, storage);
    saveSidebarCollapsed(true, storage);
    expect(loadUseStandardTitleBar(storage)).toBe(true);
    expect(loadSidebarCollapsed(storage)).toBe(true);
    expect([...memory.keys()].every((key) => key.startsWith("loop-vault:"))).toBe(true);
  });
});
