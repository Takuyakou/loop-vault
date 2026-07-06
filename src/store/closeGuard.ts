import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { StoreApi } from "zustand/vanilla";
import type { VaultStoreState } from "./vaultStore";

export function shouldBlockClose(state: VaultStoreState): boolean {
  return state.unsaved || state.saving;
}

export function registerBrowserCloseGuard(
  store: StoreApi<VaultStoreState>,
): () => void {
  const handler = (event: BeforeUnloadEvent) => {
    if (!shouldBlockClose(store.getState())) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  };

  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}

export async function registerTauriCloseGuard(
  store: StoreApi<VaultStoreState>,
): Promise<() => void> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return () => undefined;
  }

  return getCurrentWindow().onCloseRequested(async (event) => {
    const state = store.getState();
    if (!shouldBlockClose(state)) {
      return;
    }

    event.preventDefault();
    const shouldClose = await confirm(
      "未保存の変更があります。保存して終了しますか？",
      { title: "Loop Vault", kind: "warning" },
    );

    if (!shouldClose) {
      return;
    }

    await store.getState().flush();
    await getCurrentWindow().close();
  });
}
