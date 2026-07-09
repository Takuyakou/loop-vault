import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import type { StoreApi } from "zustand/vanilla";
import type { VaultStoreState } from "./vaultStore";

export function shouldBlockClose(state: VaultStoreState): boolean {
  return state.unsaved;
}

export function isTauriRuntime(checkRuntime: () => boolean = isTauri): boolean {
  return checkRuntime();
}

export function registerBrowserCloseGuard(
  store: StoreApi<VaultStoreState>,
): () => void {
  if (isTauriRuntime()) {
    return () => undefined;
  }

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
  if (!isTauriRuntime()) {
    return () => undefined;
  }

  let closeInProgress = false;

  return getCurrentWindow().onCloseRequested(async (event) => {
    event.preventDefault();

    if (closeInProgress) {
      return;
    }

    closeInProgress = true;

    if (shouldBlockClose(store.getState())) {
      await store.getState().flush();

      if (store.getState().unsaved) {
        closeInProgress = false;
        await message(
          "変更を保存できなかったため、Loop Vaultを閉じませんでした。保存先や権限を確認してください。",
          { title: "Loop Vault", kind: "error" },
        );
        return;
      }
    }

    await exitDesktopApp();
  });
}

export async function exitDesktopApp(): Promise<void> {
  await invoke("exit_app");
}
