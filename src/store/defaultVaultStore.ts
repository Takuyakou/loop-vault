import { JsonVaultRepository } from "../domain/repository";
import { BrowserMemoryVaultStorage } from "../storage/browserMemoryVaultStorage";
import { TauriVaultStorage } from "../storage/tauriVaultStorage";
import { createVaultStore } from "./vaultStore";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export const defaultVaultStore = createVaultStore({
  repository: new JsonVaultRepository(
    isTauriRuntime() ? new TauriVaultStorage() : new BrowserMemoryVaultStorage(),
  ),
});
