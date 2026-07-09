import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { StoreApi } from "zustand/vanilla";
import type { VaultStoreState } from "./vaultStore";

export function shouldBlockClose(state: VaultStoreState): boolean {
  return state.unsaved;
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

  let closeInProgress = false;

  return getCurrentWindow().onCloseRequested(async (event) => {
    if (closeInProgress) {
      return;
    }

    if (!shouldBlockClose(store.getState())) {
      return;
    }

    event.preventDefault();
    const shouldClose = await confirm(
      "未保存の変更があります。保存して閉じますか？",
      { title: "Loop Vault", kind: "warning" },
    );

    if (!shouldClose) {
      return;
    }

    closeInProgress = true;
    await store.getState().flush();

    if (store.getState().unsaved) {
      closeInProgress = false;
      return;
    }

    await getCurrentWindow().destroy();
  });
}
