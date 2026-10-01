import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message } from "@tauri-apps/plugin-dialog";
import type { StoreApi } from "zustand/vanilla";
import type { VaultStoreState } from "./vaultStore";
import { playbackController } from "../audio/playbackController";
import { liveMidiService } from "../liveMidi/liveMidiService";
import { runClosePreparations } from "./closePreparation";
import { firstCloseBlocker, hasCloseBlockers, showCloseDialogInApp } from "./closeBlocker";

const MAX_CLOSE_FLUSH_ATTEMPTS = 2;

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

  const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
    try {
      runClosePreparations();
    } catch {
      event.preventDefault();
      event.returnValue = "";
      return;
    }
    if (!shouldBlockClose(store.getState()) && !hasCloseBlockers()) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  };

  let playbackStopped = false;
  const stopPlaybackOnce = () => {
    if (playbackStopped) return;
    playbackStopped = true;
    playbackController.stop();
  };
  const pageHideHandler = (event: PageTransitionEvent) => {
    if (!event.persisted) stopPlaybackOnce();
  };
  const unloadHandler = () => stopPlaybackOnce();

  window.addEventListener("beforeunload", beforeUnloadHandler);
  window.addEventListener("pagehide", pageHideHandler);
  window.addEventListener("unload", unloadHandler);
  return () => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    window.removeEventListener("pagehide", pageHideHandler);
    window.removeEventListener("unload", unloadHandler);
  };
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

    try {
      runClosePreparations();
      await flushPendingChangesBeforeClose(store);
    } catch {
      closeInProgress = false;
      await showCloseSaveError();
      return;
    }

    if (store.getState().unsaved) {
      closeInProgress = false;
      await showCloseSaveError();
      return;
    }

    const blocker = firstCloseBlocker();
    if (blocker) {
      // P10.0-07: inside the app when the App's host is mounted; the OS dialog otherwise.
      const inApp = showCloseDialogInApp({ kind: "confirm", blocker });
      if (inApp) await bringWindowToFront();
      const discardAndClose = inApp
        ? await inApp
        : await ask(blocker.message, {
          title: blocker.title,
          kind: "warning",
          okLabel: blocker.confirmLabel,
          cancelLabel: blocker.cancelLabel,
        });
      if (!discardAndClose) {
        closeInProgress = false;
        return;
      }
    }

    await exitDesktopApp();
  });
}

async function flushPendingChangesBeforeClose(
  store: StoreApi<VaultStoreState>,
): Promise<void> {
  let attempt = 0;
  while (shouldBlockClose(store.getState()) && attempt < MAX_CLOSE_FLUSH_ATTEMPTS) {
    attempt += 1;
    await store.getState().flush();
    await Promise.resolve();
  }
}

const CLOSE_SAVE_ERROR = "変更を保存できなかったため、Loop Vaultを閉じませんでした。保存先や権限を確認してください。";

async function showCloseSaveError(): Promise<void> {
  const inApp = showCloseDialogInApp({ kind: "error", message: CLOSE_SAVE_ERROR });
  if (inApp) {
    await bringWindowToFront();
    await inApp;
    return;
  }
  await message(CLOSE_SAVE_ERROR, { title: "Loop Vault", kind: "error" });
}

/** Best effort: the dialog is inside the window, so the window comes to the front. */
async function bringWindowToFront(): Promise<void> {
  try {
    const current = getCurrentWindow() as Partial<ReturnType<typeof getCurrentWindow>>;
    await current.unminimize?.();
    await current.setFocus?.();
  } catch {
    // A window that cannot be focused still shows the dialog.
  }
}

export async function exitDesktopApp(): Promise<void> {
  playbackController.stop();
  await liveMidiService.stop();
  await invoke("exit_app");
}
