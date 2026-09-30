/**
 * P10.0-02 developer switch: show the new correction workspace (display only) after
 * a MIDI analysis. Device-local only; never written to the Vault. Off by default.
 */
const storageKey = "loop-vault:p10-workspace:v1";

export function getCorrectionWorkspaceEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(storageKey) === "on";
  } catch {
    return false;
  }
}

export function setCorrectionWorkspaceEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (enabled) localStorage.setItem(storageKey, "on");
    else localStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable (private mode); the switch then stays off.
  }
}
