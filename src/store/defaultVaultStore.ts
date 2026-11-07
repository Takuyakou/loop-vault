import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { TauriVaultStorage } from "../storage/tauriVaultStorage";
import { JazzVaultRepository } from "../storage/jazzVaultStorage";
import { createVaultStore } from "./vaultStore";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export const defaultVaultStore = createVaultStore({
  repository: new JazzVaultRepository(
    isTauriRuntime() ? new TauriVaultStorage() : new BrowserMemoryVaultStorage(),
  ),
});
